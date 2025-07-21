import { log } from "../utils/log";
import * as JSON5 from 'json5';
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
        let buffer = "";
        let usageMetadata: any = null;
        let hasInjectedThinking = false;
        let hasProducedContent = false; // <-- 添加内容追踪标志
        let blockCounter = 0; // 🔍 添加数据块计数器
        let accumulatedLogContent = ""; // 用于打字机效果的内容累积

        // SSE 解析状态机
        let state = 'WAITING_DATA'; // WAITING_DATA, IN_DATA, WAITING_END
        let currentData = "";
        let dataLines: string[] = [];

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // 流结束，处理最后的缓冲区
              if (buffer.trim()) {
                log.warn('⚠️ [GEMINI_STREAM_WARN] 流结束时缓冲区中仍有未处理数据:', buffer.substring(0, 200) + '...');
                await processBuffer(buffer, true); // 强制处理
              }
              // <-- 在这里注入空内容块
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

            // 将新数据追加到缓冲区
            const newData = decoder.decode(value, { stream: true });
            // console.log("Gemini Raw Stream Data:", newData);
            buffer += newData;
            
            // 🔍 只记录包含思考token的数据块
            // if (newData.includes('thoughtsTokenCount') && newData.includes('"thoughtsTokenCount":')) {
            //   log.info('🔍 [GEMINI_RAW_STREAM] 收到包含思考token的数据');
            // }
            
            // 处理缓冲区
            await processBuffer(buffer, false);
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

        // 处理缓冲区的函数
        async function processBuffer(bufferData: string, isEnd: boolean) {
          // 🔍 只记录包含思考token的缓冲区
          // if (bufferData.includes('thoughtsTokenCount') && bufferData.includes('"thoughtsTokenCount":')) {
          //   log.info('🔍 [GEMINI_BUFFER_PROCESS] 处理包含思考token的缓冲区');
          // }
          const lines = bufferData.split('\n');
          let remainingBuffer = "";
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            switch (state) {
              case 'WAITING_DATA':
                if (line.startsWith('data: ')) {
                  // 开始新的data块
                  currentData = line.slice(6); // 移除 'data: ' 前缀
                  dataLines = [currentData];
                  state = 'IN_DATA';
                  // 🔍 只记录包含思考token的数据块开始
                  // if (currentData.includes('thoughtsTokenCount')) {
                  //   log.info('🔍 [GEMINI_DATA_START] 开始包含思考token的数据块');
                  // }
                } else if (line.trim() !== '') {
                  // 非空行但不是data开头，可能是其他SSE字段，忽略
                  log.warn('⚠️ [GEMINI_UNKNOWN_LINE] 未知行:', line.substring(0, 100) + '...');
                }
                break;
                
              case 'IN_DATA':
                if (line.startsWith('data: ')) {
                  // 遇到新的data块，先处理当前块
                  await processCompleteDataBlock();
                  
                  // 开始新的data块
                  currentData = line.slice(6);
                  dataLines = [currentData];
                } else if (line.trim() === '') {
                  // 空行表示data块结束
                  // 🔍 只记录包含思考token的数据块结束
                  // if (dataLines.some(line => line.includes('thoughtsTokenCount'))) {
                  //   log.info('🔍 [GEMINI_DATA_END] 包含思考token的数据块结束，准备处理');
                  // }
                  await processCompleteDataBlock();
                  state = 'WAITING_DATA';
                } else {
                  // 继续当前data块
                  dataLines.push(line);
                }
                break;
            }
          }
          
          // 如果不是流结束，保留最后一行作为缓冲区（可能不完整）
          if (!isEnd && lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            if (state === 'IN_DATA' && !lastLine.startsWith('data: ') && lastLine.trim() !== '') {
              // 当前在data块中，最后一行可能不完整，保留在缓冲区
              remainingBuffer = lastLine;
            } else if (state === 'WAITING_DATA' && lastLine.startsWith('data: ')) {
              // 最后一行是data开头，但可能不完整
              remainingBuffer = lastLine;
            }
          }
          
          // 更新缓冲区
          buffer = remainingBuffer;
        }
        
        // 处理完整的data块
        async function processCompleteDataBlock() {
          
          if (dataLines.length === 0) return;
          
          // 合并所有行
          const jsonStr = dataLines.join('\n').trim();
          // log.info(`RAW_GEMINI_CHUNK: ${jsonStr}`);
          if (!jsonStr) return;
          
          blockCounter++; // 🔍 增加数据块计数器
          // log.info('🔍 [GEMINI_PROCESSING_BLOCK] 处理第' + blockCounter + '个data块，长度:', jsonStr.length);
          
          let chunk: any;
          try {
            chunk = JSON5.parse(jsonStr);
            
                      // 🔍 只记录包含思考token的数据块
          // if (chunk.usageMetadata && chunk.usageMetadata.thoughtsTokenCount > 0) {
          //   log.info('🧠 [GEMINI_THINKING_DETECTED] 第' + blockCounter + '块: 思考token=' + chunk.usageMetadata.thoughtsTokenCount + ', parts=' + (chunk.candidates?.[0]?.content?.parts?.length || 0));
          // }
          
          if (chunk.usageMetadata) {
            usageMetadata = chunk.usageMetadata;
          }
          } catch (parseError: any) {
            log.error('❌ [GEMINI_JSON_PARSE_ERROR] JSON解析失败:', parseError);
            log.error('❌ [GEMINI_JSON_CONTENT] 内容:', jsonStr.substring(0, 300) + '...');
            return; // 跳过这个块
          }

          if (!hasInjectedThinking && (chunk.candidates?.[0]?.content?.parts || chunk.usageMetadata)) {
            hasInjectedThinking = true;
            const thinkingRes = {
              choices: [
                {
                  delta: {
                    role: "assistant",
                    thinking: true,
                  },
                  finish_reason: null,
                  index: 0,
                },
              ],
              created: parseInt(new Date().getTime() / 1000 + "", 10),
              id: (chunk as any).responseId || "thinking_id",
              model: (chunk as any).modelVersion || "gemini-pro",
              object: "chat.completion.chunk",
              system_fingerprint: "fp_a49d71b8a1",
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingRes)}\n\n`));
            // log.info('✨ [THINKING_EVENT] 注入 "思考中" 事件');
          }

          // 检查是否有 MALFORMED_FUNCTION_CALL 错误
          if ((chunk as any).candidates?.[0]?.finishReason === "MALFORMED_FUNCTION_CALL") {
            log.warn('⚠️ [GEMINI_MALFORMED_FUNCTION_STREAM] 检测到流式响应中的工具调用格式错误');
            const errorRes = {
              choices: [
                {
                  delta: {
                    role: "assistant",
                    content: "抱歉，工具调用格式有误，无法执行。",
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
            return;
          }

          let content = "";
          const tool_calls: any[] = [];
          const parts = (chunk as any).candidates?.[0]?.content?.parts || [];

          // 🔍 只记录包含思考内容的关键信息
          const hasThinkingParts = parts.some((part: any) => part.thought === true);
          if (hasThinkingParts) {
            // log.info('🧠 [GEMINI_THINKING_PARTS] 第' + blockCounter + '块包含思考内容!');
            parts.forEach((part: any, index: number) => {
              // if (part.thought === true) {
              //   log.info('🧠 [GEMINI_THINKING_TEXT] Part ' + index + ':', '"' + part.text + '"');
              // }
            });
          }

          for (const part of parts) {
            // 优先判断思考块
            if (part.thought === true) {
              // log.info(`🧠 [GEMINI_THOUGHT] 捕获并转换思考块: "${part.text}"`);

              // 1. 构建一个下游 anthropic.transformer 能理解的 "thinking" chunk
              const thinkingChunk = {
                choices: [
                  {
                    delta: {
                      // 2. 核心：创建一个 thinking 对象，并将思考内容放入
                      thinking: {
                        content: part.text || ""
                      }
                    },
                    index: 0,
                    finish_reason: null,
                  },
                ],
                // 补全其他字段，使其成为一个合法的流式块
                id: chunk.responseId ? `${chunk.responseId}-th` : `chatcmpl-th-${Date.now()}`,
                model: chunk.modelVersion || "gemini-pro",
                object: "chat.completion.chunk",
              };

              // 3. 将这个新构建的 chunk 发送到流中，给下游的转换器处理
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingChunk)}\n\n`));

              // 4. 跳过这个 part 的后续处理
              continue;
            }
            if (part.text) {
              content += part.text;
            } else if (part.functionCall) {
              let args = part.functionCall.args || {};
              let argsString = "";
              try {
                argsString = typeof args === "string" ? args : JSON.stringify(args);
              } catch (error) {
                log.warn('⚠️ [GEMINI_TOOL_ARGS_ERROR] 工具参数序列化失败:', error);
                argsString = "{}";
              }
              log.info('🔧 [GEMINI_TOOL_CALL] 工具:', part.functionCall.name, ', 参数长度:', argsString.length);
              tool_calls.push({
                id: part.functionCall.id || `tool_${Math.random().toString(36).substring(2, 15)}`,
                type: "function",
                function: {
                  name: part.functionCall.name,
                  arguments: argsString,
                },
              });
            }
          }

          // 只记录非空内容，每块输出一行日志
          if (content && content.trim()) {
            log.info('📝 [GEMINI_CONTENT] 第' + blockCounter + '块内容:', '"' + content + '"');
          }

          if (tool_calls.length > 0) {
            log.info('🔧 [GEMINI_TOOL_CALLS] 工具调用数量:', tool_calls.length);
          }

          if (content || tool_calls.length > 0) { // <-- 有内容时设置标志
            hasProducedContent = true;
          }

          const res: any = {
            choices: [
              {
                delta: {
                  role: "assistant",
                  content: content || null,
                  tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
                },
                finish_reason: null,
                index: (chunk as any).candidates[0].index || tool_calls.length > 0 ? 1 : 0,
                logprobs: null,
              },
            ],
            created: parseInt(new Date().getTime() / 1000 + "", 10),
            id: (chunk as any).responseId || "",
            model: (chunk as any).modelVersion || "",
            object: "chat.completion.chunk",
            system_fingerprint: "fp_a49d71b8a1",
          };

          if ((chunk as any).usageMetadata) {
            res.usage = {
              completion_tokens: (chunk as any).usageMetadata.candidatesTokenCount,
              prompt_tokens: (chunk as any).usageMetadata.promptTokenCount,
              total_tokens: (chunk as any).usageMetadata.totalTokenCount,
            };
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(res)}\n\n`));
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