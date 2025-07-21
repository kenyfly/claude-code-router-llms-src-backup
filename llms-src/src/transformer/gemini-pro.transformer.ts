import { log } from "../utils/log";
import * as JSON5 from 'json5';
import { createParser } from 'eventsource-parser';
import { LLMProvider, UnifiedChatRequest, UnifiedMessage, UnifiedTool } from "../types/llm";
import { Transformer } from "../types/transformer";

// vvvvvvvvvvvv NEW HELPER FUNCTION vvvvvvvvvvvv
/**
 * Recursively cleans the properties of a JSON schema to keep only fields supported by Gemini.
 * @param properties The properties object to clean.
 * @returns A new, cleaned properties object.
 */
function cleanSchemaProperties(properties: Record<string, any>): Record<string, any> {
  const cleanedProperties: Record<string, any> = {};

  Object.keys(properties).forEach((key) => {
    const prop = properties[key];
    const cleanedProp: any = {};

    // Strict whitelist of supported fields
    cleanedProp.type = prop.type;
    if (prop.description) cleanedProp.description = prop.description;
    if (prop.enum) cleanedProp.enum = prop.enum;

    // Recursive cleaning for array items
    if (prop.type === 'array' && prop.items && typeof prop.items === 'object') {
      cleanedProp.items = {
        type: prop.items.type,
      };
      if (prop.items.description) {
        cleanedProp.items.description = prop.items.description;
      }
      // *** THIS IS THE KEY RECURSIVE FIX ***
      if (prop.items.properties) {
        cleanedProp.items.properties = cleanSchemaProperties(prop.items.properties);
      }
       if (prop.items.required) {
        cleanedProp.items.required = prop.items.required;
      }
    }

    // Recursive cleaning for object properties
    if (prop.type === 'object' && prop.properties) {
        cleanedProp.properties = cleanSchemaProperties(prop.properties);
    }

    cleanedProperties[key] = cleanedProp;
  });

  return cleanedProperties;
}
// ^^^^^^^^^^^^ END OF HELPER FUNCTION ^^^^^^^^^^^^

// Gemini API 类型定义
interface GeminiPart {
  text?: string;
  thought?: boolean; // 添加思考块标志
  functionCall?: {
    id?: string;
    name?: string;
    args?: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: {
      name: string;
      content: any;
    };
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}



interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[];
}

export class GeminiProTransformer implements Transformer {
  name = "gemini-pro";

//   endPoint = "/v1beta/models/:modelAndAction";

  transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Record<string, any> {
    return {
      body: {
        contents: request.messages.map((message: UnifiedMessage) => {
          let role: "user" | "model";
          const parts: GeminiPart[] = [];

          if (message.role === "assistant") {
            role = "model";

            // 处理 assistant 的文本内容
            if (typeof message.content === "string") {
              parts.push({ text: message.content });
            } else if (Array.isArray(message.content)) {
              parts.push(
                ...message.content.map((content) => {
                  if (content.type === "text") {
                    return {
                      text: content.text || "",
                    };
                  }
                  return { text: "" };
                }).filter(part => part.text !== "")
              );
            }

            // 处理 assistant 发起的工具调用
            if (Array.isArray(message.tool_calls)) {
              parts.push(
                ...message.tool_calls.map((toolCall) => {
                  // 安全处理 arguments
                  let args = {};
                  try {
                    if (typeof toolCall.function.arguments === "string") {
                      args = JSON5.parse(toolCall.function.arguments || "{}");
                    } else if (typeof toolCall.function.arguments === "object") {
                      args = toolCall.function.arguments || {};
                    }
                  } catch (error) {
                    log.warn('⚠️ [GEMINI_TOOL_ARGS_PARSE_ERROR] 工具参数解析失败:', error);
                    args = {};
                  }
                  
                  return {
                    functionCall: {
                      id: toolCall.id || `tool_${Math.random().toString(36).substring(2, 15)}`,
                      name: toolCall.function.name,
                      args: args,
                    },
                  };
                })
              );
            }

          } else if (message.role === "tool") {
            role = "user"; // 角色映射保持不变

            const toolCallId = message.tool_call_id;
            let functionName: string | undefined;

            // 关键修正：在整个消息历史中向后查找，根据 tool_call_id 找回函数名
            if (toolCallId) {
              for (const prevMessage of request.messages) {
                if (prevMessage.role === "assistant" && Array.isArray(prevMessage.tool_calls)) {
                  const originalToolCall = prevMessage.tool_calls.find(tc => tc.id === toolCallId);
                  if (originalToolCall) {
                    functionName = originalToolCall.function.name;
                    break; // 找到后立即退出循环
                  }
                }
              }
            }

            if (functionName) {
              // ---- 理想情况：成功找回函数名，构建标准的 functionResponse ----
              let toolResponseContent;
              try {
                toolResponseContent = typeof message.content === 'string'
                  ? JSON5.parse(message.content)
                  : message.content;
              } catch (e) {
                toolResponseContent = { result: message.content };
              }

              parts.push({
                functionResponse: {
                  name: functionName,
                  response: {
                    name: functionName,
                    content: toolResponseContent,
                  },
                },
              });
            } else {
              // ---- 降级策略：没能找回函数名，作为纯文本发送以保证流程不中断 ----
              log.warn(`⚠️ [GEMINI_TOOL_RESCUE] Could not find function name for tool_call_id '${toolCallId}'. Sending as plain text.`);
              parts.push({
                text: typeof message.content === 'string' ? message.content :
                  JSON.stringify(message.content)
              });
            }
          } else { // 包括 "user" 和 "system"
            role = "user";

            // 处理 user 或 system 的文本内容
            if (typeof message.content === "string") {
              parts.push({ text: message.content });
            } else if (Array.isArray(message.content)) {
              parts.push(
                ...message.content.map((content) => {
                  if (content.type === "text") {
                    return {
                      text: content.text || "",
                    };
                  }
                  return { text: "" };
                }).filter(part => part.text !== "")
              );
            }
          }
          
          return {
            role,
            parts,
          };
        }),
        tools: request.tools && request.tools.length > 0 ? [
          {
            functionDeclarations:
              request.tools.map((tool: UnifiedTool) => {
                const cleanedParameters: any = {
                  type: "object",
                };

                if (tool.function.parameters) {
                  if (tool.function.parameters.properties) {
                    // Use the new recursive helper function
                    cleanedParameters.properties = cleanSchemaProperties(tool.function.parameters.properties);
                  }
                  if (Array.isArray(tool.function.parameters.required) &&
                      tool.function.parameters.required.length > 0) {
                    cleanedParameters.required = tool.function.parameters.required;
                  }
                }

                return {
                  name: tool.function.name,
                  description: tool.function.description,
                  parameters: cleanedParameters,
                };
              }) || [],
          },
        ] : undefined, // 如果没有工具，则不发送该字段
        generationConfig: {
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 10000
          },
          ...(request.max_tokens && { maxOutputTokens: request.max_tokens }),
          ...(request.temperature && { temperature: request.temperature })
        },
      },
      config: {
        url: new URL(
          `./${request.model}:${
            request.stream ? "streamGenerateContent?alt=sse" : "generateContent"
          }`,
          provider.baseUrl
        ),
        headers: {
          "x-goog-api-key": provider.apiKey,
          Authorization: undefined,
        },
      },
      stream: request.stream, // <-- 补充这一行
    };
  }

  transformRequestOut(request: Record<string, any>): UnifiedChatRequest {
    const contents: GeminiContent[] = request.contents || [];
    const tools: GeminiTool[] = request.tools || [];
    const model: string = request.model;
    const max_tokens: number | undefined = request.max_tokens;
    const temperature: number | undefined = request.temperature;
    const stream: boolean | undefined = request.stream;
    const tool_choice = request.tool_choice;

    const unifiedChatRequest: UnifiedChatRequest = {
      messages: [],
      model,
      max_tokens,
      temperature,
      stream,
      tool_choice,
    };

    contents.forEach((content) => {
      const message: UnifiedMessage = {
        role: content.role === "model" ? "assistant" : "user",
        content: content.parts
          .filter(part => part.text)
          .map(part => ({
            type: "text" as const,
            text: part.text || "",
          })),
      };
      
      // 处理工具调用
      const toolCalls = content.parts
        .filter(part => part.functionCall)
        .map(part => ({
          id: part.functionCall?.id || `tool_${Math.random().toString(36).substring(2, 15)}`,
          type: "function" as const,
          function: {
            name: part.functionCall?.name || "",
            arguments: JSON.stringify(part.functionCall?.args || {}),
          },
        }));
      
      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }
      
      unifiedChatRequest.messages.push(message);
    });

    if (tools.length > 0) {
      unifiedChatRequest.tools = [];
      tools.forEach((tool) => {
        if (tool.functionDeclarations) {
          tool.functionDeclarations.forEach((funcDecl) => {
            unifiedChatRequest.tools!.push({
              type: "function",
              function: {
                name: funcDecl.name,
                description: funcDecl.description,
                parameters: {
                  type: "object",
                  properties: funcDecl.parameters.properties || {},
                  required: funcDecl.parameters.required || [],
                  additionalProperties: funcDecl.parameters.additionalProperties
                },
              },
            });
          });
        }
      });
    }

    return unifiedChatRequest;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      return this.handleNonStreamResponse(response);
    } else if (response.headers.get("Content-Type")?.includes("stream")) {
      return this.handleStreamResponse(response);
    }
    return response;
  }

  private async handleNonStreamResponse(response: Response): Promise<Response> {
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      log.error('❌ [GEMINI_ERROR] Gemini API 错误响应:', response.status, response.statusText);
      log.error('❌ [GEMINI_ERROR] 错误详情:', errorText);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    // 记录原始响应内容
    const responseClone = response.clone();
    const rawResponseText = await responseClone.text();
    log.info('🔍 [GEMINI_RAW_RESPONSE] 服务器原始响应:', rawResponseText);
    
    const jsonResponse: any = JSON5.parse(rawResponseText);
    
    // 检查是否有错误信息
    if (jsonResponse.error) {
      log.error('❌ [GEMINI_ERROR] Gemini API 返回错误:', jsonResponse.error);
      throw new Error(`Gemini API error: ${jsonResponse.error.message || 'Unknown error'}`);
    }
    
    if (!jsonResponse.candidates || !jsonResponse.candidates[0]) {
      throw new Error("Invalid Gemini response format");
    }
    
    // 检查 finishReason 是否为错误状态
    const candidate = jsonResponse.candidates[0];
    if (candidate.finishReason === "MALFORMED_FUNCTION_CALL") {
      log.warn('⚠️ [GEMINI_MALFORMED_FUNCTION] 检测到工具调用格式错误');
      // 返回一个空的成功响应，而不是抛出错误
      const errorRes = {
        id: jsonResponse.responseId || `chatcmpl-${Date.now()}`,
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: {
              content: "抱歉，工具调用格式有误，无法执行。",
              role: "assistant" as const,
            },
          },
        ],
        created: Math.floor(Date.now() / 1000),
        model: jsonResponse.modelVersion || "gemini-pro",
        object: "chat.completion" as const,
        usage: jsonResponse.usageMetadata ? {
          completion_tokens: jsonResponse.usageMetadata.candidatesTokenCount,
          prompt_tokens: jsonResponse.usageMetadata.promptTokenCount,
          total_tokens: jsonResponse.usageMetadata.totalTokenCount,
        } : undefined,
      };
      
      return new Response(JSON.stringify(errorRes), {
        status: 200, // 返回200而不是错误状态
        statusText: "OK",
        headers: response.headers,
      });
    }
    const tool_calls = candidate.content.parts
      .filter((part: GeminiPart) => part.functionCall)
      .map((part: GeminiPart) => {
        // 安全处理 arguments
        let args = part.functionCall?.args || {};
        let argsString = "";
        
        try {
          if (typeof args === "string") {
            // 如果已经是字符串，直接使用
            argsString = args;
          } else {
            // 如果是对象，序列化为字符串
            argsString = JSON.stringify(args);
          }
        } catch (error) {
          log.warn('⚠️ [GEMINI_TOOL_ARGS_ERROR] 工具参数序列化失败:', error);
          argsString = "{}";
        }
        
        return {
          id: part.functionCall?.id || `tool_${Math.random().toString(36).substring(2, 15)}`,
          type: "function" as const,
          function: {
            name: part.functionCall?.name || "",
            arguments: argsString,
          },
        };
      });

    const res = {
      id: jsonResponse.responseId || `chatcmpl-${Date.now()}`,
      choices: [
        {
          finish_reason: candidate.finishReason?.toLowerCase() || null,
          index: 0,
          message: {
            content: candidate.content.parts
              .filter((part: GeminiPart) => {
                // 过滤思考块，只做日志
                if (part.thought === true) {
                  log.info(`🧠 [GEMINI_THOUGHT] 捕获到思考块 (非流式): "${part.text}"`);
                  return false;
                }
                return !!part.text;
              })
              .map((part: GeminiPart) => part.text)
              .join(""),
            role: "assistant" as const,
            tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
          },
        },
      ],
      created: Math.floor(Date.now() / 1000),
      model: jsonResponse.modelVersion || "gemini-pro",
      object: "chat.completion" as const,
      usage: jsonResponse.usageMetadata ? {
        completion_tokens: jsonResponse.usageMetadata.candidatesTokenCount,
        prompt_tokens: jsonResponse.usageMetadata.promptTokenCount,
        total_tokens: jsonResponse.usageMetadata.totalTokenCount,
      } : undefined,
    };

    return new Response(JSON.stringify(res), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  private handleStreamResponse(response: Response): Response {
    if (!response.body) {
      return response;
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        let usageMetadata: any = null;
        let hasInjectedThinking = false;
        let hasProducedContent = false;
        let blockCounter = 0;
        let accumulatedLogContent = "";

        // 创建 eventsource-parser 解析器
        const parser = createParser({
          onEvent: (event: import('eventsource-parser').EventSourceMessage) => {
            processCompleteDataBlock(event.data);
          }
        });

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // 在这里注入空内容块
              if (!hasProducedContent) {
                log.info('🟡 [GEMINI_EMPTY_STREAM] 为保证消息合法，注入一个空内容块');
                const emptyContentChunk = {
                  choices: [{
                    delta: { role: "assistant", content: "" },
                    index: 0,
                    finish_reason: null,
                  }],
                  created: parseInt(String(Date.now() / 1000)),
                  id: "empty_content_fix",
                  model: "gemini-pro",
                  object: "chat.completion.chunk",
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(emptyContentChunk)}\n\n`));
              }
              
              // 打字机效果：流结束后输出换行
              if (accumulatedLogContent) {
                process.stdout.write('\n');
                log.info('📝 [GEMINI_FINAL_CONTENT]', `"${accumulatedLogContent}"`);
              }
              
              // 发送最终的结束块
              log.info('🏁 [GEMINI_STREAM_END] 流真正结束，发送最终块');
              const finalRes: any = {
                choices: [
                  {
                    delta: {
                      role: "assistant",
                      content: null,
                    },
                    finish_reason: "stop",
                    index: 0,
                    logprobs: null,
                  },
                ],
                created: parseInt(new Date().getTime() / 1000 + "", 10),
                id: "final",
                model: "gemini-pro",
                object: "chat.completion.chunk",
                system_fingerprint: "fp_a49d71b8a1",
              };
              if (usageMetadata) {
                finalRes.usage = {
                  completion_tokens: usageMetadata.candidatesTokenCount || 0,
                  prompt_tokens: usageMetadata.promptTokenCount || 0,
                  total_tokens: usageMetadata.totalTokenCount || 0,
                };
              }
              const finalChunk = `data: ${JSON.stringify(finalRes)}\n\n`;
              log.info('🏁 [GEMINI_FINAL_CHUNK] 最终块内容:', finalChunk);
              controller.enqueue(encoder.encode(finalChunk));
              break;
            }

            // 将新数据解码并喂给解析器
            const newData = decoder.decode(value, { stream: true });
            parser.feed(newData);
          }
        } catch (error) {
          log.error('❌ [GEMINI_STREAM_ERROR] 流处理错误:', error);
          // 发送错误消息给客户端
          try {
            const errorRes = {
              choices: [
                {
                  delta: {
                    role: "assistant",
                    content: "抱歉，处理响应时出现错误。",
                  },
                  finish_reason: "stop",
                  index: 0,
                  logprobs: null,
                },
              ],
              created: parseInt(new Date().getTime() / 1000 + "", 10),
              id: "",
              model: "",
              object: "chat.completion.chunk",
              system_fingerprint: "fp_a49d71b8a1",
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorRes)}\n\n`));
          } catch (finalError) {
            log.error('❌ [GEMINI_FINAL_ERROR] 发送错误消息失败:', finalError);
          }
        } finally {
          controller.close();
        }
        
        // 处理完整的data块
        async function processCompleteDataBlock(jsonStr: string) {
          if (!jsonStr || !jsonStr.trim()) {
            log.info('⚪️ [GEMINI_EMPTY_DATA]', '收到空的 data 块，已跳过');
            return;
          }

          blockCounter++;
          // log.info(`➡️ [GEMINI_BLOCK_START] 开始处理第 ${blockCounter} 个数据块`, `内容预览: ${jsonStr.substring(0, 80)}...`);

          let chunk: any;
          try {
            chunk = JSON5.parse(jsonStr);
            if (chunk.usageMetadata) {
              usageMetadata = chunk.usageMetadata;
              // log.info('📊 [GEMINI_USAGE_METADATA] 收到用量元数据:', JSON.stringify(usageMetadata));
            }
          } catch (parseError: any) {
            log.error('❌ [GEMINI_JSON_PARSE_ERROR] JSON解析失败:', parseError);
            log.error('    [GEMINI_JSON_CONTENT] 失败内容:', jsonStr.substring(0, 300) + '...');
            return;
          }

          // 首次收到有效数据时，注入 thinking 块 (如果下游需要)
          if (!hasInjectedThinking && (chunk.candidates?.[0]?.content?.parts || chunk.usageMetadata)) {
            hasInjectedThinking = true;
            const thinkingRes = {
              choices: [{ delta: { role: "assistant", thinking: true }, finish_reason: null, index: 0 }],
              created: parseInt(String(Date.now() / 1000)),
              id: (chunk as any).responseId || "thinking_id",
              model: (chunk as any).modelVersion || "gemini-pro",
              object: "chat.completion.chunk",
            };
            log.info('✨ [GEMINI_THINKING_INJECT] 注入初始 "思考中" 事件');
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingRes)}\n\n`));
          }

          // 处理 MALFORMED_FUNCTION_CALL 错误
          if (chunk.candidates?.[0]?.finishReason === "MALFORMED_FUNCTION_CALL") {
            log.warn('⚠️ [GEMINI_MALFORMED_FUNCTION_STREAM] 检测到流式响应中的工具调用格式错误');
            const errorRes = {
              choices: [{ delta: { role: "assistant", content: "抱歉，工具调用格式有误，无法执行。" }, finish_reason: "stop", index: 0 }],
              created: parseInt(String(Date.now() / 1000)),
              id: "malformed_fn_call_error", model: "gemini-pro", object: "chat.completion.chunk",
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorRes)}\n\n`));
            return;
          }

          const parts = chunk.candidates?.[0]?.content?.parts || [];
          // if (parts.length > 0) {
          //    log.info(`📑 [GEMINI_PARTS_RECEIVED] 第 ${blockCounter} 块包含 ${parts.length} 个 part`);
          // }

          // **核心逻辑：遍历 parts 并为每个 part 单独创建和发送消息**
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const partIdentifier = `块 ${blockCounter}, Part ${i+1}/${parts.length}`;

            // 1. 处理思考块 (Thought Part)
            if (part.thought === true) {
              log.info(`🧠 [GEMINI_THOUGHT_PART] ${partIdentifier}: 捕获到思考块`, `内容: "${part.text || ''}"`);
              const thinkingChunk = {
                choices: [{
                  delta: { thinking: { content: part.text || "" } },
                  index: 0,
                  finish_reason: null,
                }],
                id: `${chunk.responseId || 'thinking'}-th-${blockCounter}-${i}`,
                model: chunk.modelVersion || "gemini-pro",
                object: "chat.completion.chunk",
              };
              // log.info(`    [GEMINI_THOUGHT_SEND] ${partIdentifier}: 正在向下游发送 "thinking_delta"`);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));
              continue; // 处理完这个 part，继续下一个
            }

            // 2. 处理文本块 (Text Part)
            if (part.text) {
              log.info(`📝 [GEMINI_TEXT_PART] ${partIdentifier}: 捕获到文本块`, `内容: "${part.text}"`);
              accumulatedLogContent += part.text;
              hasProducedContent = true;
              const textChunk = {
                choices: [{
                  delta: { role: "assistant", content: part.text },
                  index: 0,
                  finish_reason: null,
                }],
                id: `${chunk.responseId || 'text'}-${blockCounter}-${i}`,
                model: chunk.modelVersion || "gemini-pro",
                object: "chat.completion.chunk",
              };
              // log.info(`    [GEMINI_TEXT_SEND] ${partIdentifier}: 正在向下游发送 "text_delta"`);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(textChunk)}\n\n`));
            }

            // 3. 处理工具调用块 (Function Call Part)
            if (part.functionCall) {
              log.info(`🔧 [GEMINI_TOOL_PART] ${partIdentifier}: 捕获到工具调用块`, `名称: ${part.functionCall.name}`);
              hasProducedContent = true; // 工具调用也算有效内容
              let argsString = "{}";
              try {
                argsString = typeof part.functionCall.args === "string" 
                  ? part.functionCall.args 
                  : JSON.stringify(part.functionCall.args || {});
              } catch (error) {
                log.warn(`⚠️ [GEMINI_TOOL_ARGS_ERROR] ${partIdentifier}: 工具参数序列化失败`, error);
              }
              log.info(`    [GEMINI_TOOL_ARGS] ${partIdentifier}: 参数长度: ${argsString.length}`);

              const toolCallChunk = {
                choices: [{
                  delta: {
                    role: "assistant",
                    tool_calls: [{
                      id: part.functionCall.id || `tool_${Date.now()}`,
                      type: "function",
                      function: {
                        name: part.functionCall.name,
                        arguments: argsString,
                      },
                    }],
                  },
                  index: 1, // 工具调用通常用 index 1
                  finish_reason: null,
                }],
                id: `${chunk.responseId || 'tool'}-${blockCounter}-${i}`,
                model: chunk.modelVersion || "gemini-pro",
                object: "chat.completion.chunk",
              };
              log.info(`    [GEMINI_TOOL_SEND] ${partIdentifier}: 正在向下游发送 "tool_calls_delta"`);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolCallChunk)}\n\n`));
            }
          }
          //  log.info(`⬅️ [GEMINI_BLOCK_END] 第 ${blockCounter} 个数据块处理完毕`);
        }
      },
    });

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
} 