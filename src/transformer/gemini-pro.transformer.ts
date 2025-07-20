import { log } from "../utils/log";
import { LLMProvider, UnifiedChatRequest, UnifiedMessage, UnifiedTool } from "../types/llm";
import { Transformer } from "../types/transformer";

// Gemini API 类型定义
interface GeminiPart {
  text?: string;
  functionCall?: {
    id?: string;
    name?: string;
    args?: Record<string, any>;
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
          if (message.role === "assistant") {
            role = "model";
          } else if (["user", "system", "tool"].includes(message.role)) {
            role = "user";
          } else {
            role = "user"; // Default to user if role is not recognized
          }
          
          const parts: GeminiPart[] = [];
          
          if (typeof message.content === "string") {
            parts.push({
              text: message.content,
            });
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

          if (Array.isArray(message.tool_calls)) {
            parts.push(
              ...message.tool_calls.map((toolCall) => {
                // 安全处理 arguments
                let args = {};
                try {
                  if (typeof toolCall.function.arguments === "string") {
                    args = JSON.parse(toolCall.function.arguments || "{}");
                  } else if (typeof toolCall.function.arguments === "object") {
                    args = toolCall.function.arguments || {};
                  }
                } catch (error) {
                  log(`⚠️ [GEMINI_TOOL_ARGS_PARSE_ERROR] 工具参数解析失败: ${error}`);
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
          
          return {
            role,
            parts,
          };
        }),
        tools: request.tools && request.tools.length > 0 ? [
          {
            functionDeclarations:
              request.tools.map((tool: UnifiedTool) => {
                // 严格按照Gemini文档格式清理工具定义
                const cleanedTool: any = {
                  name: tool.function.name,
                  description: tool.function.description,
                };
                
                // 只有当有参数时才添加 parameters 字段
                if (tool.function.parameters && 
                    (tool.function.parameters.properties || tool.function.parameters.required)) {
                  
                  cleanedTool.parameters = {
                    type: "object",
                    properties: {} as Record<string, any>,
                  };
                  
                  // 复制并清理 properties
                  if (tool.function.parameters.properties) {
                    Object.keys(tool.function.parameters.properties).forEach((key) => {
                      const prop = tool.function.parameters.properties[key];
                      const cleanedProp: any = {
                        type: prop.type,
                      };
                      
                      // 只保留Gemini文档中明确支持的字段
                      if (prop.description) cleanedProp.description = prop.description;
                      if (prop.enum) cleanedProp.enum = prop.enum;
                      
                      // 处理 items（数组类型）
                      if (prop.items && typeof prop.items === "object") {
                        cleanedProp.items = {
                          type: prop.items.type,
                        };
                        if (prop.items.description) cleanedProp.items.description = prop.items.description;
                      }
                      
                      cleanedTool.parameters.properties[key] = cleanedProp;
                    });
                  }
                  
                  // 复制 required 字段
                  if (tool.function.parameters.required && 
                      Array.isArray(tool.function.parameters.required) && 
                      tool.function.parameters.required.length > 0) {
                    cleanedTool.parameters.required = tool.function.parameters.required;
                  }
                }
                
                const paramCount = cleanedTool.parameters ? Object.keys(cleanedTool.parameters.properties || {}).length : 0;
                log(`🔧 [GEMINI_TOOL_DEF] 工具定义: ${cleanedTool.name}, 参数数量: ${paramCount}, 格式: ${JSON.stringify(cleanedTool).substring(0, 200)}...`);
                
                return cleanedTool;
              }) || [],
          },
        ] : [],
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
      log(`❌ [GEMINI_ERROR] Gemini API 错误响应: ${response.status} ${response.statusText}`);
      log(`❌ [GEMINI_ERROR] 错误详情: ${errorText}`);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    // 记录原始响应内容
    const responseClone = response.clone();
    const rawResponseText = await responseClone.text();
    log(`🔍 [GEMINI_RAW_RESPONSE] 服务器原始响应: ${rawResponseText}`);
    
    const jsonResponse: any = JSON.parse(rawResponseText);
    
    // 检查是否有错误信息
    if (jsonResponse.error) {
      log(`❌ [GEMINI_ERROR] Gemini API 返回错误: ${JSON.stringify(jsonResponse.error)}`);
      throw new Error(`Gemini API error: ${jsonResponse.error.message || 'Unknown error'}`);
    }
    
    if (!jsonResponse.candidates || !jsonResponse.candidates[0]) {
      throw new Error("Invalid Gemini response format");
    }
    
    // 检查 finishReason 是否为错误状态
    const candidate = jsonResponse.candidates[0];
    if (candidate.finishReason === "MALFORMED_FUNCTION_CALL") {
      log(`⚠️ [GEMINI_MALFORMED_FUNCTION] 检测到工具调用格式错误`);
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
          log(`⚠️ [GEMINI_TOOL_ARGS_ERROR] 工具参数序列化失败: ${error}`);
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
              .filter((part: GeminiPart) => part.text)
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
        let buffer = ""; // 引入缓冲区
        let usageMetadata: any = null;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // 处理缓冲区中可能残留的最后一点数据
              if (buffer.trim()) {
                log(`⚠️ [GEMINI_STREAM_WARN] 流结束时缓冲区中仍有未处理数据: ${buffer.substring(0, 200)}...`);
              }

              // 发送最终的结束块
              log(`🏁 [GEMINI_STREAM_END] 流真正结束，发送最终块`);
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
              log(`🏁 [GEMINI_FINAL_CHUNK] 最终块内容: ${finalChunk}`);
              
              controller.enqueue(
                encoder.encode(finalChunk)
              );
              break;
            }

            // 将新读取的数据追加到缓冲区
            buffer += decoder.decode(value, { stream: true });

            // 处理缓冲区中所有完整的消息
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
              const messageString = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2); // 从缓冲区移除已处理的消息

              if (!messageString.startsWith("data: ")) {
                continue;
              }

              const jsonStr = messageString.slice(6).trim();
              if (!jsonStr) {
                continue;
              }

              let chunk: any;
              try {
                chunk = JSON.parse(jsonStr);
                if (chunk.usageMetadata) {
                  usageMetadata = chunk.usageMetadata;
                }
              } catch (parseError: any) {
                log(`⚠️ [GEMINI_CHUNK_PARSE_ERROR] 块解析失败: ${parseError}, 块内容: ${jsonStr.substring(0, 200)}...`);
                // 这里不再尝试修复，因为不完整的块无法修复，直接跳过等下一个块
                continue;
              }

              // 检查是否有 MALFORMED_FUNCTION_CALL 错误
              if ((chunk as any).candidates?.[0]?.finishReason === "MALFORMED_FUNCTION_CALL") {
                log(`⚠️ [GEMINI_MALFORMED_FUNCTION_STREAM] 检测到流式响应中的工具调用格式错误`);
                // 发送错误消息给客户端
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
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(errorRes)}\n\n`)
                );
                break; // 结束流
              }

              const tool_calls = (chunk as any).candidates[0].content.parts
                .filter((part: any) => part.functionCall)
                .map((part: any) => {
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
                    log(`⚠️ [GEMINI_TOOL_ARGS_ERROR] 工具参数序列化失败: ${error}`);
                    argsString = "{}";
                  }
                  
                  // 记录工具调用信息
                  log(`🔧 [GEMINI_TOOL_CALL] 工具: ${part.functionCall?.name}, 参数长度: ${argsString.length}`);
                  
                  return {
                    id:
                      part.functionCall?.id ||
                      `tool_${Math.random().toString(36).substring(2, 15)}`,
                    type: "function",
                    function: {
                      name: part.functionCall?.name,
                      arguments: argsString,
                    },
                  };
                });

              // 提取 content
              const content = (chunk as any).candidates[0].content.parts
                .filter((part: any) => part.text)
                .map((part: any) => part.text)
                .join("");

              if (content) {
                log(`📝 [GEMINI_CONTENT] content:"${content}"`);
              }

              if (tool_calls.length > 0) {
                log(`🔧 [GEMINI_TOOL_CALLS] 工具调用数量: ${tool_calls.length}`);
              }

              // 流进行中，所有块都设置 finish_reason: null
              // 忽略 Gemini 的 finishReason，因为它只是中间信号
              const res: any = {
                choices: [
                  {
                    delta: {
                      role: "assistant",
                      content: content || null,
                      tool_calls:
                        tool_calls.length > 0 ? tool_calls : undefined,
                    },
                    finish_reason: null, // 流进行中，始终为 null
                    index:
                      (chunk as any).candidates[0].index || tool_calls.length > 0
                        ? 1
                        : 0,
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

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(res)}\n\n`)
              );
            }
          }
        } catch (error) {
          log(`❌ [GEMINI_STREAM_ERROR] 流处理错误: ${error}`);
          // 发送错误消息给客户端而不是直接错误
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
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(errorRes)}\n\n`)
            );
          } catch (finalError) {
            log(`❌ [GEMINI_FINAL_ERROR] 发送错误消息失败: ${finalError}`);
          }
        } finally {
          controller.close();
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