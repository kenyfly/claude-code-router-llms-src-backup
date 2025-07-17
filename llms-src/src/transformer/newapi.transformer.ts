/// <reference lib="DOM" />
import { LLMProvider, UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";
import { log } from "../utils/log";
import { NewAPIToolCleaner } from "../utils/tool-cleaner";

// 版本号常量定义
const NEWAPI_VERSION = "v18.1"; // 🎯 精简稳定版本

// 🔧 安全与调试配置
const SAFE_CONFIG = {
  // 安全阈值
  MAX_REASONING_LENGTH: 50000,    // 推理内容最大长度
  MAX_CHUNKS_PER_REQUEST: 1000,   // 每请求最大chunk数
  
  // 调试模式
  DEBUG_MODE: process.env.NEWAPI_DEBUG === 'true',
  LOG_RAW_DATA: process.env.NEWAPI_LOG_RAW === 'true'
};

// 🔍 增强日志系统 - 结构化标识符 (保持不变)
const LOG_PREFIX = `[NewAPI-${NEWAPI_VERSION}]`;
const LOG_MARKERS = {
  ENTRY: `${LOG_PREFIX} 📥 [ENTRY]`,
  EXIT: `${LOG_PREFIX} 📤 [EXIT]`,
  PROCESSING: `${LOG_PREFIX} ⚙️ [PROCESSING]`,
  MODEL_DETECT: `${LOG_PREFIX} 🔍 [MODEL-DETECT]`,
  MODEL_THINKING: `${LOG_PREFIX} 🧠 [MODEL-THINKING]`,
  MSG_ANALYSIS: `${LOG_PREFIX} 📊 [MSG-ANALYSIS]`,
  MSG_TRANSFORM: `${LOG_PREFIX} 🔄 [MSG-TRANSFORM]`,
  MSG_FIX: `${LOG_PREFIX} 🔧 [MSG-FIX]`,
  MSG_VALIDATE: `${LOG_PREFIX} ✅ [MSG-VALIDATE]`,
  DEBUG_DETAIL: `${LOG_PREFIX} 🔍 [DEBUG]`,
  DEBUG_CONTENT: `${LOG_PREFIX} 📝 [DEBUG-CONTENT]`,
  DEBUG_STRUCTURE: `${LOG_PREFIX} 🏗️ [DEBUG-STRUCTURE]`,
  SUCCESS: `${LOG_PREFIX} ✅ [SUCCESS]`,
  WARNING: `${LOG_PREFIX} ⚠️ [WARNING]`,
  ERROR: `${LOG_PREFIX} ❌ [ERROR]`,
  INFO: `${LOG_PREFIX} ℹ️ [INFO]`,
  TOOL_CLEAN: `${LOG_PREFIX} 🧹 [TOOL-CLEAN]`,
  TOOL_CHOICE: `${LOG_PREFIX} 🎯 [TOOL-CHOICE]`,
  STATS: `${LOG_PREFIX} 📈 [STATS]`,
  SUMMARY: `${LOG_PREFIX} 📋 [SUMMARY]`,
  RESPONSE_IN: `${LOG_PREFIX} 📨 [RESPONSE-IN]`,
  RESPONSE_OUT: `${LOG_PREFIX} 📤 [RESPONSE-OUT]`,
  STREAM_PROCESSING: `${LOG_PREFIX} 🌊 [STREAM]`,
  REASONING_CONVERT: `${LOG_PREFIX} 🧠 [REASONING-CONVERT]`,
  SAFETY_CHECK: `${LOG_PREFIX} 🛡️ [SAFETY]`,
  DATA_FLOW: `${LOG_PREFIX} 📊 [DATA-FLOW]`,
  COMPLETION_DETECT: `${LOG_PREFIX} 🎯 [COMPLETION-DETECT]`,
  SIGNATURE_GEN: `${LOG_PREFIX} 🔐 [SIGNATURE]`,
  INDEX_HANDLE: `${LOG_PREFIX} 📍 [INDEX]`,
  CONTENT_TRACK: `${LOG_PREFIX} 📝 [CONTENT-TRACK]`,
  THINKING_TRACK: `${LOG_PREFIX} 🧠 [THINKING-TRACK]`,
  TEXT_TRACK: `${LOG_PREFIX} 📄 [TEXT-TRACK]`
};

/**
 * NewAPI Transformer - 精简稳定版 v18.1
 * 
 * 🎯 核心原则：
 * 1. 专注核心转换逻辑：处理thinking模式的请求和响应。
 * 2. 保留详细日志：提供完整的可观测性。
 * 3. 移除复杂设计：去除A/B测试开关和冗余的辅助方法，使代码更易维护。
 */
export class NewAPITransformer implements Transformer {
  name = "newapi";
  version = `${NEWAPI_VERSION} - 精简稳定版`;
  /**
   * 处理发送给NewAPI的请求
   */
  transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Record<string, any> {
    log(`${LOG_MARKERS.ENTRY} 开始处理请求 - 模型: ${request.model}`);
    
    if (request.messages) {
      log(`${LOG_MARKERS.MSG_ANALYSIS} 分析消息结构 - 消息数量: ${request.messages.length}`);
    }
    let transformedRequest = { ...request };

    log(`${LOG_MARKERS.PROCESSING} 开始模型检测和参数修复`);
    if (this.isThinkingModel(transformedRequest.model)) {
      transformedRequest = this.fixThinkingModeParameters(transformedRequest);
    }

    if (transformedRequest.tools && transformedRequest.tools.length > 0) {
      log(`${LOG_MARKERS.TOOL_CLEAN} 开始清理工具定义 - 工具数量: ${transformedRequest.tools.length}`);
      transformedRequest.tools = NewAPIToolCleaner.cleanTools(transformedRequest.tools);
      log(`${LOG_MARKERS.TOOL_CLEAN} 工具清理完成`);
    }

    const hasThinking = (transformedRequest as any).thinking ? 'Yes' : 'No';
    const toolCount = transformedRequest.tools ? transformedRequest.tools.length : 0;
    log(`${LOG_MARKERS.SUMMARY} 转换完成 - thinking模式: ${hasThinking}, 工具数量: ${toolCount}`);
    log(`${LOG_MARKERS.EXIT} 请求处理完成`);

    return transformedRequest;
  }

  /**
   * 处理从NewAPI返回的响应（精简版）
   */
  async transformResponseOut(response: Response): Promise<Response> {
    log(`${LOG_MARKERS.RESPONSE_IN} 开始处理响应转换`);
    if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
      log(`${LOG_MARKERS.STREAM_PROCESSING} 处理流式响应`);
      
      if (!response.body) {
        log(`${LOG_MARKERS.WARNING} 响应体为空，直接返回`);
        return response;
      }

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          // 每个流独立的状态变量，避免并发问题
          let chunkCounter = 0;
          let reasoningAccumulator = "";
          let isReasoningCompleted = false;
          let hasTextContent = false;

          const reader = response.body!.getReader();
          
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                log(`${LOG_MARKERS.DATA_FLOW} 流式响应完成 - 总chunks: ${chunkCounter}, reasoning: ${reasoningAccumulator.length > 0 ? 'Yes' : 'No'}, text: ${hasTextContent ? 'Yes' : 'No'}`);
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split("\n");

              for (const line of lines) {
                if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
                  try {
                    let data = JSON.parse(line.slice(6));
                    chunkCounter++;

                    // 🛡️ 安全检查
                    if (chunkCounter > SAFE_CONFIG.MAX_CHUNKS_PER_REQUEST) {
                      log(`${LOG_MARKERS.WARNING} chunk数量超限，跳过`);
                      continue;
                    }

                    const delta = data.choices?.[0]?.delta;
                    if (delta) {
                      // 追踪推理内容
                      if (delta.reasoning_content) {
                        reasoningAccumulator += delta.reasoning_content;
                        log(`${LOG_MARKERS.THINKING_TRACK} 推理内容累积 - 当前长度: ${reasoningAccumulator.length}, 新增: ${delta.reasoning_content.length}`);
                      }

                      // 追踪正文内容
                      if (delta.content && !hasTextContent) {
                        hasTextContent = true;
                      }

                      // 🔧 关键转换：将reasoning_content转换为thinking
    if (delta.reasoning_content) {
                        log(`${LOG_MARKERS.REASONING_CONVERT} 转换reasoning_content → delta.thinking`);
                        delta.thinking = { content: delta.reasoning_content };
                        delete delta.reasoning_content;
    }
                    }

                    // 构建回复行
                    const finalLine = `data: ${JSON.stringify(data)}\n\n`;
                    controller.enqueue(encoder.encode(finalLine));
    } catch (e: any) {
                    log(`${LOG_MARKERS.ERROR} JSON解析失败: ${e.message}`);
                    // 安全回退：透传原始行
                    controller.enqueue(encoder.encode(line + "\n"));
    }
                } else {
                  // 透传非数据行
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }
          } catch (error: any) {
            log(`${LOG_MARKERS.ERROR} 流式响应处理错误: ${error.message}`);
    try {
              controller.error(error);
            } catch (e) {
              controller.close();
    }
          } finally {
    try {
              reader.releaseLock();
              controller.close();
    } catch (e: any) {
              log(`${LOG_MARKERS.WARNING} 清理时出错: ${e.message}`);
    }
  }
        },
      });

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else {
      log(`${LOG_MARKERS.RESPONSE_IN} 处理非流式响应`);
      const jsonResponse = await response.json();

      if (jsonResponse.choices?.[0]?.message?.reasoning_content) {
        log(`${LOG_MARKERS.REASONING_CONVERT} 检测到reasoning_content，转换为thinking格式`);
        const reasoning = jsonResponse.choices[0].message.reasoning_content;
        jsonResponse.choices[0].message.thinking = { content: reasoning };
      }

      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
  }

  /**
   * 修复Claude thinking模式的参数格式
   */
  private fixThinkingModeParameters(request: UnifiedChatRequest): UnifiedChatRequest {
    log(`${LOG_MARKERS.MODEL_THINKING} 开始修复thinking模式参数`);
    const fixedRequest = { ...request };

    (fixedRequest as any).thinking = {
      type: "enabled",
      budget_tokens: 10000
    };
    log(`${LOG_MARKERS.MODEL_THINKING} 已添加thinking参数: type=enabled, budget_tokens=10000`);

    if (fixedRequest.messages && fixedRequest.messages.length > 0) {
      fixedRequest.messages = this.fixMessagesForThinking(fixedRequest.messages);
  }

    if (fixedRequest.tool_choice && typeof fixedRequest.tool_choice === 'object') {
      if (fixedRequest.tool_choice.type === "any" || fixedRequest.tool_choice.type === "tool") {
        log(`${LOG_MARKERS.TOOL_CHOICE} 修正tool_choice: 不支持thinking模式的'${fixedRequest.tool_choice.type}'，改为'auto'`);
        fixedRequest.tool_choice = "auto";
} 
    }

    log(`${LOG_MARKERS.MODEL_THINKING} thinking模式参数修复完成`);
    return fixedRequest;
  }

  private fixMessagesForThinking(messages: any[]): any[] {
    log(`${LOG_MARKERS.MSG_ANALYSIS} 开始分析消息格式 - 总消息数: ${messages.length}`);
    const messageStats: { [key: string]: number } = {};
    messages.forEach((msg, i) => {
      messageStats[msg.role] = (messageStats[msg.role] || 0) + 1;
    });

    log(`${LOG_MARKERS.STATS} 消息统计: ${Object.entries(messageStats).map(([role, count]) => `${role}=${count}`).join(', ')}`);

    const assistantIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'assistant') {
        assistantIndices.push(i);
      }
    }

    if (assistantIndices.length === 0) {
      log(`${LOG_MARKERS.INFO} 未找到assistant消息，无需修复thinking块`);
      return messages;
    }

    log(`${LOG_MARKERS.MSG_FIX} 找到${assistantIndices.length}个assistant消息，处理中`);
    let fixedCount = 0;

    for (const index of assistantIndices) {
      const original = messages[index];
      const fixed = this.ensureThinkingBlock(original.content, index);

      if (fixed !== original.content) {
        messages[index] = { ...original, content: fixed };
        fixedCount++;
      }
    }

    log(`${LOG_MARKERS.SUMMARY} thinking块修复完成: 修复了${fixedCount}个assistant消息`);
    return messages;
  }

  private ensureThinkingBlock(content: any, messageIndex: number): any {
    if (!content || (Array.isArray(content) && content.length === 0)) {
      log(`${LOG_MARKERS.WARNING} assistant消息[${messageIndex}] content为空，仅添加thinking块`);
      return [
        { type: 'thinking', text: '我正在处理这个请求。' }
      ];
    }

    if (typeof content === 'string') {
      log(`${LOG_MARKERS.MSG_TRANSFORM} assistant消息[${messageIndex}] 字符串content转换为数组并添加thinking块`);
      return [
        { type: 'thinking', text: '让我分析这个请求。' },
        { type: 'text', text: content }
      ];
    }

    if (Array.isArray(content)) {
      const hasThinking = content.length > 0 && ["thinking", "redacted_thinking"].includes(content[0]?.type);
      if (hasThinking) return content;

      log(`${LOG_MARKERS.MSG_FIX} assistant消息[${messageIndex}] 缺少thinking块，添加到开头`);
      const hasToolUse = content.some((block: any) => block.type === "tool_use");
      const thinkingText = hasToolUse ? "我需要使用工具来完成这个请求。" : "我正在分析这个请求并准备回应。";
      return [
        { type: 'thinking', text: thinkingText },
        ...content
      ];
    }

    return content;
  }

  /**
   * 检测是否为thinking模式模型
   */
  private isThinkingModel(model: string): boolean {
    // 检测模型名中是否包含"thinking"
    const hasThinkingInName = model.includes("thinking");

    // 检测是否为支持thinking的特定Claude模型
    const isClaude4ThinkingModel =
      model.includes("claude-sonnet-4-20250514") ||
      model.includes("claude-opus-4-20250514") ||
      model.includes("claude-3-7-sonnet");

    // 🆕 新增：检测是否为需要启用thinking模式的Gemini模型
    const isGeminiProThinkingModel = model.includes("gemini-2.5-pro");

    const isThinking = hasThinkingInName || isClaude4ThinkingModel || isGeminiProThinkingModel;

    log(`${LOG_MARKERS.MODEL_DETECT} 模型检测: "${model}"`);
    log(`${LOG_MARKERS.MODEL_DETECT}   - 名称包含thinking: ${hasThinkingInName}`);
    log(`${LOG_MARKERS.MODEL_DETECT}   - 是Claude4模型: ${isClaude4ThinkingModel}`);
    log(`${LOG_MARKERS.MODEL_DETECT}   - 是Gemini 2.5 Pro模型: ${isGeminiProThinkingModel}`); // 🆕 新增日志
    log(`${LOG_MARKERS.MODEL_DETECT}   - 最终判断: ${isThinking ? '启用thinking模式' : '不启用thinking模式'}`);

    return isThinking;
  }
  transformRequestOut(request: Record<string, any>): UnifiedChatRequest {
    return request as UnifiedChatRequest;
  }
}
