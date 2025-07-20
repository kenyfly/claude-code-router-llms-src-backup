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
    log(`${LOG_MARKERS.RES_TRANSFORM} 开始转换来自 Gemini 的响应 (强制非流式)`);
    if (!response.body) {
        log(`${LOG_MARKERS.ERROR} 响应体为空`);
        return new Response(JSON.stringify({ error: "Empty response body" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

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
        const responseText = await response.text(); // 尝试读取原始文本
        log(`${LOG_MARKERS.ERROR} 原始响应文本: ${responseText}`);
        return new Response(JSON.stringify({ 
            error: `Failed to parse non-streaming response: ${e.message}`,
            original_response: responseText
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
  }

  // 辅助方法：将统一消息转换为 Gemini 格式
  private convertMessagesToGemini(messages: any[]): any[] {
    const geminiMessages: any[] = [];
    let systemContent = '';

    // 1. 提取系统提示内容并过滤掉 system 消息
    const otherMessages = messages.filter(msg => {
        if (msg.role === 'system') {
            if (typeof msg.content === 'string') {
                systemContent += `${msg.content}\n\n`;
            } else if (Array.isArray(msg.content)) {
                msg.content.forEach((c: any) => {
                    if (c.type === 'text' && c.text) {
                        systemContent += `${c.text}\n\n`;
                    }
                });
            }
            return false; // 从消息列表中移除 system 消息
        }
        return true;
    });

    if (systemContent) {
        log(`${LOG_MARKERS.DEBUG} 提取到系统提示内容，将合并到首个用户消息中。`);
    }

    // 2. 处理剩余的消息
    otherMessages.forEach((msg, index) => {
        let role: string;
        let parts: any[] = [];
        let isFirstUserMessage = false;

        if (msg.role === 'user') {
            role = 'user';
            let userContent = '';
            
            // 查找这是不是处理列表中的第一条用户消息
            if (otherMessages.findIndex(m => m.role === 'user') === index) {
                isFirstUserMessage = true;
            }

            if (typeof msg.content === 'string') {
                userContent = msg.content;
            } else if (Array.isArray(msg.content)) {
                msg.content.forEach((c: any) => {
                    if (c && c.type === 'text' && c.text) {
                        userContent += c.text;
                    }
                    // 注意: 此处简化了处理，未包含图片等其他内容类型
                });
            }
            
            // 将系统提示内容前置到第一条用户消息
            if (isFirstUserMessage && systemContent) {
                userContent = systemContent + userContent;
                log(`${LOG_MARKERS.DEBUG} 已将系统提示合并到用户消息。`);
            }
            parts.push({ text: userContent });

        } else if (msg.role === 'assistant') {
            role = 'model';
            if (typeof msg.content === 'string' && msg.content) {
                parts.push({ text: msg.content });
            }
            if (msg.tool_calls) {
                msg.tool_calls.forEach((toolCall: any) => {
                    try {
                        parts.push({
                            functionCall: {
                                name: toolCall.function.name,
                                args: JSON.parse(toolCall.function.arguments || '{}'),
                            },
                        });
                    } catch (e: any) {
                         log(`${LOG_MARKERS.ERROR} 解析工具调用参数失败: ${e.message}`);
                    }
                });
            }
        } else if (msg.role === 'tool' || msg.role === 'function') {
            role = 'function';
            const toolName = msg.name;
            if (!toolName) {
                log(`${LOG_MARKERS.ERROR} tool/function 消息缺少 'name' 字段，已跳过: ${JSON.stringify(msg)}`);
                return;
            }
            let responseContent = {};
            try {
                // Gemini 需要一个 JSON 对象作为 response
                responseContent = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
            } catch(e) {
                responseContent = { content: msg.content };
            }

            parts.push({
                functionResponse: {
                    name: toolName,
                    response: responseContent,
                },
            });
        } else {
            // 忽略任何其他未知角色
            return; 
        }

        if (parts.length > 0 || (role === 'model' && msg.tool_calls)) {
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

    return new ReadableStream({
        start: async (controller) => {
            const reader = responseBody.getReader();

            const processBuffer = () => {
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim().length === 0) continue;

                    log(`${LOG_MARKERS.DEBUG} Processing line: ${line}`);

                    if (line.startsWith('data:')) {
                        const jsonStr = line.substring(5).trim();
                        if (jsonStr === '[DONE]') {
                            log(`${LOG_MARKERS.DEBUG} Received [DONE] marker.`);
                            continue;
                        }
                        try {
                            const geminiChunk = JSON.parse(jsonStr);
                            const unifiedChunk = this.convertGeminiChunkToUnified(geminiChunk, "STREAM");
                            if (unifiedChunk) {
                                const message = `data: ${JSON.stringify(unifiedChunk)}\n\n`;
                                controller.enqueue(encoder.encode(message));
                                log(`${LOG_MARKERS.STREAM_PROCESSING} Enqueued chunk.`);
                            }
                        } catch (e: any) {
                            log(`${LOG_MARKERS.ERROR} JSON parse failed: ${e.message} - on line: ${jsonStr}`);
                        }
                    }
                }
            };

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        log(`${LOG_MARKERS.STREAM_PROCESSING} Reader is done.`);
                        if (buffer.length > 0) {
                            processBuffer();
                        }
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    processBuffer();
                }
            } catch (e: any) {
                log(`${LOG_MARKERS.ERROR} Stream reading failed: ${e.message}`);
                controller.error(e);
            } finally {
                log(`${LOG_MARKERS.STREAM_PROCESSING} Closing controller.`);
                controller.close();
            }
        },
        cancel: () => {
            log(`${LOG_MARKERS.INFO} Stream was cancelled.`);
        },
    });
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
        const finishReason = candidate.finishReason || null;
        return {
            id: geminiChunk.responseId || `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: geminiChunk.modelVersion || 'gemini-native',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    ...delta,
                },
                finish_reason: finishReason ? finishReason.toLowerCase() : null,
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
