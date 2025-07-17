import { LLMProvider, UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";
import { log } from "../utils/log";

// 版本号
const GEMINI_NATIVE_VERSION = "v1.0";

// 日志标识符
const LOG_PREFIX = `[Gemini-Native-${GEMINI_NATIVE_VERSION}]`;
const LOG_MARKERS = {
  ENTRY: `${LOG_PREFIX} 📥 [入口]`,
  EXIT: `${LOG_PREFIX} 📤 [出口]`,
  REQ_TRANSFORM: `${LOG_PREFIX} 🔄 [请求转换]`,
  RES_TRANSFORM: `${LOG_PREFIX} 🔄 [响应转换]`,
  STREAM_PROCESSING: `${LOG_PREFIX} 🌊 [流式处理]`,
  TOOL_CONVERT: `${LOG_PREFIX} 🛠️ [工具转换]`,
  MESSAGE_CONVERT: `${LOG_PREFIX} 💬 [消息转换]`,
  ERROR: `${LOG_PREFIX} ❌ [错误]`,
  INFO: `${LOG_PREFIX} ℹ️ [信息]`,
  DEBUG: `${LOG_PREFIX} 🔍 [调试]`,
};

/**
 * GeminiNativeTransformer
 *
 * 负责在统一聊天格式 (UnifiedChatRequest) 和 Google Gemini 原生 API 格式之间进行双向转换。
 *
 * 主要功能:
 * 1.  **请求转换**: 将传入的统一请求转换为 Gemini API 所需的 `generateContent` 格式。
 *     - 转换 `messages` 数组，处理 `user`, `assistant`, `tool` 等角色。
 *     - 转换 `tools` 数组为 Gemini 的 `tools` 和 `tool_config` 格式。
 * 2.  **响应转换**: 将 Gemini API 的响应（包括流式和非流式）转换回统一格式。
 *     - 将 Gemini 的 `functionCall` 转换回 `tool_calls`。
 *     - 处理流式响应中的文本和工具调用增量。
 */
export class GeminiNativeTransformer implements Transformer {
  name = "gemini-native";
  version = `${GEMINI_NATIVE_VERSION} - 初始版本`;

  /**
   * 将统一请求转换为 Gemini 原生格式
   */
  transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Record<string, any> {
    log(`${LOG_MARKERS.ENTRY} 开始转换发往 Gemini 的请求`);

    const geminiRequest: Record<string, any> = {};

    // 1. 转换消息 (contents)
    geminiRequest.contents = this.convertMessagesToGemini(request.messages || []);
    log(`${LOG_MARKERS.MESSAGE_CONVERT} 消息转换完成，共 ${geminiRequest.contents.length} 条`);

    // 2. 转换工具 (tools & tool_config)
    if (request.tools && request.tools.length > 0) {
      // 递归清理每个 tool 的参数
      request.tools.forEach(t => {
        if (t.function && t.function.parameters) {
          removeSchema(t.function.parameters);
        }
      });
      geminiRequest.tools = [{ functionDeclarations: request.tools.map(t => t.function) }];
      log(`${LOG_MARKERS.TOOL_CONVERT} 工具定义转换完成，共 ${request.tools.length} 个工具`);

      // 设置 tool_config
      if (request.tool_choice) {
        if (typeof request.tool_choice === 'string' && ['auto', 'any', 'none'].includes(request.tool_choice)) {
          geminiRequest.tool_config = { function_calling_config: { mode: request.tool_choice.toUpperCase() } };
        } else if (typeof request.tool_choice === 'object' && request.tool_choice.type === 'tool') {
          geminiRequest.tool_config = {
            function_calling_config: {
              mode: "ANY",
              allowed_function_names: [request.tool_choice.name]
            }
          };
        }
        log(`${LOG_MARKERS.TOOL_CONVERT} 工具选择模式设置为: ${JSON.stringify(geminiRequest.tool_config)}`);
      } else {
        // 默认行为
        geminiRequest.tool_config = { function_calling_config: { mode: "AUTO" } };
      }
    }

    // 3. 转换其他参数 (generationConfig)
    geminiRequest.generationConfig = {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
        ...(typeof (request as any).top_p !== 'undefined' ? { topP: (request as any).top_p } : {}),
        ...(typeof (request as any).stop !== 'undefined' ? { stopSequences: (request as any).stop } : {}),
    };

    log(`${LOG_MARKERS.EXIT} Gemini 请求转换完成`);
    if (process.env.GEMINI_LOG_RAW_REQ === 'true') {
        log(`${LOG_MARKERS.DEBUG} 转换后的请求: ${JSON.stringify(geminiRequest, null, 2)}`);
    }

    return geminiRequest;
  }

  /**
   * 将 Gemini 原生响应转换为统一格式
   */
  async transformResponseOut(response: Response): Promise<Response> {
    log(`${LOG_MARKERS.RES_TRANSFORM} 开始转换来自 Gemini 的响应`);
    if (!response.body) {
        log(`${LOG_MARKERS.ERROR} 响应体为空`);
        return new Response(JSON.stringify({ error: "Empty response body" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const contentType = response.headers.get("Content-Type") || "";

    // 只要不是客户端明确要求流式，就直接用非流式
    if (contentType.includes("application/json")) {
        log(`${LOG_MARKERS.INFO} 处理非流式响应`);
        try {
            const geminiJson = await response.json();
            if (process.env.GEMINI_LOG_RAW_RES === 'true') {
                log(`${LOG_MARKERS.DEBUG} 原始 Gemini 响应: ${JSON.stringify(geminiJson, null, 2)}`);
            }
            const unifiedJson = this.convertGeminiChunkToUnified(geminiJson, "NON_STREAM");
            log(`${LOG_MARKERS.RES_TRANSFORM} 非流式响应转换完成`);
            return new Response(JSON.stringify(unifiedJson), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e: any) {
            log(`${LOG_MARKERS.ERROR} 解析非流式响应失败: ${e.message}`);
            return new Response(JSON.stringify({ error: `Failed to parse non-streaming response: ${e.message}` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    // 流式响应处理
    log(`${LOG_MARKERS.STREAM_PROCESSING} 检测到流式响应`);
    const stream = this.createUnifiedStream(response.body);
    return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    });
  }

  // 辅助方法：将统一消息转换为 Gemini 格式
  private convertMessagesToGemini(messages: any[]): any[] {
    const geminiMessages: any[] = [];
    messages.forEach(msg => {
        let role: string;
        let parts: any[] = [];

        if (msg.role === 'user') {
            role = 'user';
            if (typeof msg.content === 'string') {
                parts.push({ text: msg.content });
            } else if (Array.isArray(msg.content)) {
                msg.content.forEach((c: any) => {
                    if (typeof c === 'string') {
                        parts.push({ text: c });
                    } else if (c && c.type === 'text' && typeof c.text === 'string') {
                        parts.push({ text: c.text });
                    } else if (c && c.type === 'image' && c.data) {
                        // 可扩展支持 inlineData
                        parts.push({ inline_data: c.data });
                    }
                });
            }
        } else if (msg.role === 'assistant') {
            role = 'model';
            if (typeof msg.content === 'string') {
                parts.push({ text: msg.content });
            } else if (Array.isArray(msg.content)) {
                msg.content.forEach((c: any) => {
                    if (typeof c === 'string') {
                        parts.push({ text: c });
                    } else if (c && c.type === 'text' && typeof c.text === 'string') {
                        parts.push({ text: c.text });
                    }
                });
            }
            if (msg.tool_calls) {
                msg.tool_calls.forEach((toolCall: any) => {
                    parts.push({
                        functionCall: {
                            name: toolCall.function.name,
                            args: JSON.parse(toolCall.function.arguments),
                        },
                    });
                });
            }
        } else if (msg.role === 'tool' || msg.role === 'function') {
            role = 'function';
            // name 必须有，否则丢弃
            const toolName = msg.name || (msg.tool_call_id && msg.tool_call_id.name) || (msg.tool_calls && msg.tool_calls[0]?.function?.name);
            if (!toolName) {
                log(`${LOG_MARKERS.ERROR} tool/function 响应缺少 name 字段，内容: ${JSON.stringify(msg)}`);
                return;
            }
            parts.push({
                functionResponse: {
                    name: toolName,
                    response: typeof msg.content === 'object' ? msg.content : { content: msg.content },
                },
            });
        } else {
            return;
        }

        if (parts.length > 0) {
            geminiMessages.push({ role, parts });
        }
    });
    return geminiMessages;
  }

  // 辅助方法：创建统一格式的流
  private createUnifiedStream(responseBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = '';

      const stream = new ReadableStream({
          start: async (controller) => {
              const reader = responseBody.getReader();

              const processText = (text: string) => {
                  buffer += text;
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                      const trimmed = line.trim();
                      if (!trimmed) continue;
                      log(`${LOG_MARKERS.DEBUG} Gemini流响应原始行: ${trimmed}`);
                      if (trimmed.startsWith('data:')) {
                          let jsonStr = trimmed.slice(5).trim();
                          if (jsonStr === '[DONE]') {
                              log(`${LOG_MARKERS.DEBUG} 收到 [DONE]，关闭流`);
                              controller.close();
                              return;
                          }
                          if (!jsonStr || !jsonStr.startsWith('{')) {
                              log(`${LOG_MARKERS.DEBUG} 跳过非JSON data行: ${jsonStr}`);
                              continue;
                          }
                          try {
                              log(`${LOG_MARKERS.DEBUG} 尝试解析JSON: ${jsonStr}`);
                              const geminiChunk = JSON.parse(jsonStr);
                              log(`${LOG_MARKERS.DEBUG} 解析后Gemini JSON: ${JSON.stringify(geminiChunk)}`);
                              const unifiedChunk = this.convertGeminiChunkToUnified(geminiChunk, "STREAM");
                              controller.enqueue(encoder.encode(`data: ${JSON.stringify(unifiedChunk)}\n\n`));
                          } catch (e: any) {
                              log(`${LOG_MARKERS.ERROR} 解析流式 JSON 失败: ${e.message} - on line: ${jsonStr}`);
                          }
                      }
                      // 其它行全部跳过
                  }
              };

              try {
                  while (true) {
                      const { done, value } = await reader.read();
                      if (done) {
                          if (buffer.trim()) {
                             processText('\n');
                          }
                          // 不再 enqueue [DONE]，只关闭流
                          break;
                      }
                      processText(decoder.decode(value, { stream: true }));
                  }
              } catch (e: any) {
                  log(`${LOG_MARKERS.ERROR} 处理流时出错: ${e.message}`);
                  controller.error(e);
              } finally {
                  controller.close();
              }
          },
          cancel: () => {
            log(`${LOG_MARKERS.INFO} 流被客户端取消`);
          },
      });
      // Manually bind 'this' context for methods used inside the stream
      (stream as any).convertGeminiChunkToUnified = this.convertGeminiChunkToUnified.bind(this);
      return stream;
  }


  // 核心转换逻辑：将单个 Gemini 块（流式或非流式）转换为统一格式
  private convertGeminiChunkToUnified(geminiChunk: any, context: "STREAM" | "NON_STREAM"): any {
    const candidate = geminiChunk.candidates?.[0];
    if (!candidate) {
        return context === "STREAM" ? { id: 'unknown', choices: [{ delta: {} }] } : { id: 'unknown', choices: [{ message: {} }] };
    }

    const delta: Record<string, any> = {};
    const parts = candidate.content?.parts || [];
    const toolCalls: any[] = [];
    let textContent = '';

    parts.forEach((part: any, index: number) => {
        if (part.text) {
            textContent += part.text;
        }
        if (part.functionCall) {
            toolCalls.push({
                index: index,
                id: part.functionCall.name, // Gemini 不提供 ID，暂用 name
                type: 'function',
                function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args || {}),
                },
            });
        }
    });
    
    if (textContent) {
        delta.content = textContent;
    }
    
    if (toolCalls.length > 0) {
        delta.tool_calls = toolCalls;
    }

    // 根据上下文构建不同的响应结构
    if (context === "STREAM") {
        return {
            id: geminiChunk.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'gemini-native', // or a more specific model from request
            choices: [{
                index: 0,
                delta: delta,
                finish_reason: candidate.finishReason || null,
            }],
        };
    } else { // NON_STREAM
        return {
            id: geminiChunk.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'gemini-native',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    ...delta,
                },
                finish_reason: candidate.finishReason || null,
            }],
            usage: this.convertUsage(geminiChunk.usageMetadata),
        };
    }
  }

  // 辅助方法：转换 token 统计
  private convertUsage(usageMetadata?: any): Record<string, number> {
      return {
          completion_tokens: usageMetadata?.candidatesTokenCount || 0,
          prompt_tokens: usageMetadata?.promptTokenCount || 0,
          total_tokens: usageMetadata?.totalTokenCount || 0,
      };
  }
  
  // 用于适配 Transformer 接口，此处请求出站无需转换
  transformRequestOut(request: Record<string, any>): UnifiedChatRequest {
    return request as UnifiedChatRequest;
  }
}

// 递归删除 $schema 和 additionalProperties 字段
function removeSchema(obj: any) {
  if (Array.isArray(obj)) {
    obj.forEach(removeSchema);
  } else if (obj && typeof obj === 'object') {
    delete obj.$schema;
    delete obj.additionalProperties;
    Object.values(obj).forEach(removeSchema);
  }
}
