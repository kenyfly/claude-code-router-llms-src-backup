/// <reference lib="DOM" />
import { LLMProvider, UnifiedChatRequest, UnifiedTool } from "../types/llm";
import { Transformer } from "../types/transformer";
import { log } from "../utils/log";
import { NewAPIToolCleaner } from "../utils/tool-cleaner";

// 版本号常量定义
const NEWAPI_VERSION = "v18.0"; // 🎯 安全渐进版本：A/B测试 + 完善日志 + 回滚机制

// 🔧 安全开关配置
const SAFE_CONFIG = {
  // A/B测试开关
  ENABLE_SIGNATURE_FIX: process.env.NEWAPI_ENABLE_SIGNATURE !== 'false', // 默认开启，除非明确设置为false
  ENABLE_INDEX_FIX: process.env.NEWAPI_ENABLE_INDEX === 'true',         // 默认关闭
  
  // 安全阈值
  MAX_REASONING_LENGTH: 50000,    // 推理内容最大长度
  MAX_CHUNKS_PER_REQUEST: 1000,   // 每请求最大chunk数
  
  // 调试模式
  DEBUG_MODE: process.env.NEWAPI_DEBUG === 'true',
  LOG_RAW_DATA: process.env.NEWAPI_LOG_RAW === 'true'
};

// 🔍 增强日志系统 - 结构化标识符
const LOG_PREFIX = `[NewAPI-${NEWAPI_VERSION}]`;
const LOG_MARKERS = {
  // 主要流程标志
  ENTRY: `${LOG_PREFIX} 📥 [ENTRY]`,
  EXIT: `${LOG_PREFIX} 📤 [EXIT]`,
  PROCESSING: `${LOG_PREFIX} ⚙️ [PROCESSING]`,
  
  // 模型检测标志
  MODEL_DETECT: `${LOG_PREFIX} 🔍 [MODEL-DETECT]`,
  MODEL_THINKING: `${LOG_PREFIX} 🧠 [MODEL-THINKING]`,
  
  // 消息处理标志
  MSG_ANALYSIS: `${LOG_PREFIX} 📊 [MSG-ANALYSIS]`,
  MSG_TRANSFORM: `${LOG_PREFIX} 🔄 [MSG-TRANSFORM]`,
  MSG_FIX: `${LOG_PREFIX} 🔧 [MSG-FIX]`,
  MSG_VALIDATE: `${LOG_PREFIX} ✅ [MSG-VALIDATE]`,
  
  // 调试标志
  DEBUG_DETAIL: `${LOG_PREFIX} 🔍 [DEBUG]`,
  DEBUG_CONTENT: `${LOG_PREFIX} 📝 [DEBUG-CONTENT]`,
  DEBUG_STRUCTURE: `${LOG_PREFIX} 🏗️ [DEBUG-STRUCTURE]`,
  
  // 状态标志
  SUCCESS: `${LOG_PREFIX} ✅ [SUCCESS]`,
  WARNING: `${LOG_PREFIX} ⚠️ [WARNING]`,
  ERROR: `${LOG_PREFIX} ❌ [ERROR]`,
  INFO: `${LOG_PREFIX} ℹ️ [INFO]`,
  
  // 工具相关标志
  TOOL_CLEAN: `${LOG_PREFIX} 🧹 [TOOL-CLEAN]`,
  TOOL_CHOICE: `${LOG_PREFIX} 🎯 [TOOL-CHOICE]`,
  
  // 统计标志
  STATS: `${LOG_PREFIX} 📈 [STATS]`,
  SUMMARY: `${LOG_PREFIX} 📋 [SUMMARY]`,
  
  // 响应处理标志
  RESPONSE_IN: `${LOG_PREFIX} 📨 [RESPONSE-IN]`,
  RESPONSE_OUT: `${LOG_PREFIX} 📤 [RESPONSE-OUT]`,
  STREAM_PROCESSING: `${LOG_PREFIX} 🌊 [STREAM]`,
  REASONING_CONVERT: `${LOG_PREFIX} 🧠 [REASONING-CONVERT]`,
  
  // 🆕 安全检查标志
  SAFETY_CHECK: `${LOG_PREFIX} 🛡️ [SAFETY]`,
  AB_TEST: `${LOG_PREFIX} 🧪 [A/B-TEST]`,
  ROLLBACK: `${LOG_PREFIX} 🔄 [ROLLBACK]`,
  DATA_FLOW: `${LOG_PREFIX} 📊 [DATA-FLOW]`,
  
  // 🆕 完成信号相关
  COMPLETION_DETECT: `${LOG_PREFIX} 🎯 [COMPLETION-DETECT]`,
  SIGNATURE_GEN: `${LOG_PREFIX} 🔐 [SIGNATURE]`,
  INDEX_HANDLE: `${LOG_PREFIX} 📍 [INDEX]`,
  
  // 🆕 内容追踪标志
  CONTENT_TRACK: `${LOG_PREFIX} 📝 [CONTENT-TRACK]`,
  THINKING_TRACK: `${LOG_PREFIX} 🧠 [THINKING-TRACK]`,
  TEXT_TRACK: `${LOG_PREFIX} 📄 [TEXT-TRACK]`
};

/**
 * NewAPI Transformer - 安全渐进版本v18.0
 * 
 * 🛡️ 安全特性：
 * 1. A/B测试开关：通过环境变量控制新功能
 * 2. 完整数据流追踪：详细记录每个步骤
 * 3. 安全检查：防止历史问题重现
 * 4. 回滚机制：出问题时快速恢复
 * 
 * 🎯 核心原则：安全第一，渐进改进
 */
export class NewAPITransformer implements Transformer {
  name = "newapi";
  version = `${NEWAPI_VERSION} - 安全渐进：A/B测试 + 完善日志 + 回滚机制`; // 🎯 版本标识

  // 🔍 数据流追踪器
  private chunkCounter = 0;
  private reasoningAccumulator = "";
  private isReasoningCompleted = false;
  private hasTextContent = false;
  
  /**
   * 处理发送给NewAPI的请求（继承v8.0的完整逻辑）
   */
  transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Record<string, any> {
    log(`${LOG_MARKERS.ENTRY} 开始处理请求 - 模型: ${request.model}`);
    
    // 📊 消息分析阶段
    if (request.messages) {
      log(`${LOG_MARKERS.MSG_ANALYSIS} 分析消息结构 - 消息数量: ${request.messages.length}`);
      request.messages.forEach((msg, i) => {
        log(`${LOG_MARKERS.DEBUG_DETAIL}   消息[${i}]: role="${msg.role}"`);
        // 详细调试每个消息的content结构
        if (msg.content) {
          if (Array.isArray(msg.content)) {
            log(`${LOG_MARKERS.DEBUG_CONTENT}     content数组长度: ${msg.content.length}`);
            msg.content.forEach((block, j) => {
              log(`${LOG_MARKERS.DEBUG_STRUCTURE}       content[${j}].type: ${block.type || 'undefined'}`);
            });
          } else {
            log(`${LOG_MARKERS.DEBUG_CONTENT}     content类型: ${typeof msg.content}`);
          }
        } else {
          log(`${LOG_MARKERS.DEBUG_CONTENT}     content: null/undefined`);
        }
      });
    }
    
    let transformedRequest = { ...request };

    // 🧠 模型检测和thinking模式处理
    log(`${LOG_MARKERS.PROCESSING} 开始模型检测和参数修复`);
    if (this.isThinkingModel(transformedRequest.model)) {
      transformedRequest = this.fixThinkingModeParameters(transformedRequest);
    }

    // 🧹 工具清理处理
    if (transformedRequest.tools && transformedRequest.tools.length > 0) {
      log(`${LOG_MARKERS.TOOL_CLEAN} 开始清理工具定义 - 工具数量: ${transformedRequest.tools.length}`);
      transformedRequest.tools = NewAPIToolCleaner.cleanTools(transformedRequest.tools);
      log(`${LOG_MARKERS.TOOL_CLEAN} 工具清理完成`);
    }

    // 📋 转换完成总结
    const hasThinking = transformedRequest.thinking ? 'Yes' : 'No';
    const toolCount = transformedRequest.tools ? transformedRequest.tools.length : 0;
    log(`${LOG_MARKERS.SUMMARY} 转换完成 - thinking模式: ${hasThinking}, 工具数量: ${toolCount}`);
    log(`${LOG_MARKERS.EXIT} 请求处理完成`);

    return transformedRequest;
  }

  /**
   * 处理从NewAPI返回的响应（安全增强版）
   */
  async transformResponseOut(response: Response): Promise<Response> {
    log(`${LOG_MARKERS.RESPONSE_IN} 开始处理响应转换`);
    log(`${LOG_MARKERS.AB_TEST} A/B测试状态 - SIGNATURE_FIX: ${SAFE_CONFIG.ENABLE_SIGNATURE_FIX}, INDEX_FIX: ${SAFE_CONFIG.ENABLE_INDEX_FIX}`);
    
    if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
      log(`${LOG_MARKERS.STREAM_PROCESSING} 处理流式响应`);
      
      if (!response.body) {
        log(`${LOG_MARKERS.WARNING} 响应体为空，直接返回`);
        return response;
      }

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      // 🔍 重置数据流追踪器
      this.resetTracker();

      // 保存this上下文的方法引用
      const safetyCheck = this.safetyCheck.bind(this);
      const trackDataFlow = this.trackDataFlow.bind(this);
      const processReasoningContent = this.processReasoningContent.bind(this);
      const detectCompletion = this.detectCompletion.bind(this);
      const handleCompletion = this.handleCompletion.bind(this);
      const shouldAdjustIndex = this.shouldAdjustIndex.bind(this);
      const adjustIndex = this.adjustIndex.bind(this);
      const handleRollback = this.handleRollback.bind(this);
      const safeCleanup = this.safeCleanup.bind(this);
      const handleStreamError = this.handleStreamError.bind(this);

      // 保存追踪器的引用
      let chunkCounter = 0;
      let reasoningAccumulator = "";
      let isReasoningCompleted = false;
      let hasTextContent = false;

      const stream = new ReadableStream({
        async start(controller) {
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
                    const data = JSON.parse(line.slice(6));
                    chunkCounter++;

                    // 🛡️ 安全检查
                    if (!safetyCheck(data)) {
                      log(`${LOG_MARKERS.ROLLBACK} 安全检查失败，使用回滚逻辑`);
                      handleRollback(controller, encoder, data);
                      continue;
                    }

                    // 🔍 数据流追踪 - 内联实现
                    const choice = data.choices?.[0];
                    if (choice?.delta) {
                      const delta = choice.delta;
                      
                      // 追踪推理内容
                      if (delta.reasoning_content) {
                        reasoningAccumulator += delta.reasoning_content;
                        log(`${LOG_MARKERS.THINKING_TRACK} 推理内容累积 - 当前长度: ${reasoningAccumulator.length}, 新增: ${delta.reasoning_content.length}`);
                      }

                      // 追踪正文内容
                      if (delta.content && !hasTextContent) {
                        hasTextContent = true;
                        log(`${LOG_MARKERS.TEXT_TRACK} 检测到正文内容开始 - index: ${choice.index}, content: "${delta.content.substring(0, 20)}..."`);
                      }

                      // 原始数据日志（调试模式）
                      if (SAFE_CONFIG.LOG_RAW_DATA) {
                        log(`${LOG_MARKERS.DEBUG_DETAIL} 原始数据[${chunkCounter}]: ${JSON.stringify(data).substring(0, 200)}...`);
                      }
                    }

                    // 🧠 关键：reasoning_content处理 - 直接修改原数据
                    if (data.choices?.[0]?.delta?.reasoning_content) {
                      const reasoningContent = data.choices[0].delta.reasoning_content;
                      log(`${LOG_MARKERS.REASONING_CONVERT} 检测到reasoning_content - 长度: ${reasoningContent.length}`);
                      
                      // 直接在原数据上添加thinking字段，保持流式特性
                      data.choices[0].delta.thinking = {
                        content: reasoningContent,
                      };
                      log(`${LOG_MARKERS.SAFETY_CHECK} 安全策略：reasoning内容已转换为thinking格式`);
                    }

                    // 🎯 完成信号检测（A/B测试）
                    if (SAFE_CONFIG.ENABLE_SIGNATURE_FIX) {
                      const delta = data.choices?.[0]?.delta;
                      if (delta) {
                        // 内联完成检测
                        const hasContent = Boolean(delta.content);
                        const hasAccumulatedReasoning = reasoningAccumulator.length > 0;
                        const reasoningNotComplete = !isReasoningCompleted;
                        
                        if (hasContent && hasAccumulatedReasoning && reasoningNotComplete) {
                          log(`${LOG_MARKERS.COMPLETION_DETECT} 检测到完成条件 - content: ${Boolean(delta.content)}, reasoning: ${reasoningAccumulator.length}chars, completed: ${isReasoningCompleted}`);
                          
                          // 内联完成处理
                          isReasoningCompleted = true;
                          const signature = Date.now().toString();

                          const completionData = {
                            ...data,
                            choices: [
                              {
                                ...data.choices[0],
                                delta: {
                                  thinking: {
                                    content: reasoningAccumulator,
                                    signature: signature,
                                  },
                                },
                              },
                            ],
                          };

                          log(`${LOG_MARKERS.SIGNATURE_GEN} 生成完成信号 - signature: ${signature}, reasoning长度: ${reasoningAccumulator.length}`);
                          const completionLine = `data: ${JSON.stringify(completionData)}\n\n`;
                          controller.enqueue(encoder.encode(completionLine));
                        }
                      }
                    }

                    // 📍 Index处理（A/B测试）
                    if (SAFE_CONFIG.ENABLE_INDEX_FIX && isReasoningCompleted && data.choices?.[0]?.delta?.content) {
                      if (data.choices?.[0]) {
                        const originalIndex = data.choices[0].index;
                        data.choices[0].index++;
                        log(`${LOG_MARKERS.INDEX_HANDLE} Index调整 - ${originalIndex} → ${data.choices[0].index}`);
                      }
                    }

                    // 🔧 最终数据发送
                    const finalLine = `data: ${JSON.stringify(data)}\n\n`;
                    controller.enqueue(encoder.encode(finalLine));
                    
                    // 🔍 流式调试：记录每个chunk的内容
                    const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.delta?.thinking?.content;
                    if (content) {
                      log(`${LOG_MARKERS.DEBUG_DETAIL} 流式输出[${chunkCounter}]: "${content.substring(0, 50)}..." (长度: ${content.length})`);
                    }

                  } catch (e: any) {
                    log(`${LOG_MARKERS.ERROR} JSON解析失败: ${e.message}`);
                    // 🛡️ 安全回滚：透传原始行
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
            log(`${LOG_MARKERS.ROLLBACK} 激活错误回滚机制`);
            handleStreamError(controller, error);
          } finally {
            safeCleanup(reader, controller);
          }
        },
      });

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else {
      // 处理非流式响应
      const jsonResponse = await response.json();
      
      // 简单的reasoning_content转换
      if (jsonResponse.choices?.[0]?.message?.reasoning_content) {
        log(`${LOG_MARKERS.REASONING_CONVERT} 检测到reasoning_content，转换为thinking格式`);
        
        const thinkingContent = jsonResponse.choices[0].message.reasoning_content;
        jsonResponse.choices[0].message.thinking = {
          content: thinkingContent
        };
        // 🔧 关键：保留reasoning_content，不删除
      }
      
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
  }

  /**
   * 修复Claude thinking模式的参数格式（继承v8.0逻辑）
   */
  private fixThinkingModeParameters(request: UnifiedChatRequest): UnifiedChatRequest {
    log(`${LOG_MARKERS.MODEL_THINKING} 开始修复thinking模式参数`);
    
    const fixedRequest = { ...request };
    
    // 根据Anthropic官方文档添加thinking参数
    (fixedRequest as any).thinking = {
      type: "enabled",
      budget_tokens: 10000
    };
    log(`${LOG_MARKERS.MODEL_THINKING} 已添加thinking参数: type=enabled, budget_tokens=10000`);

    // 修复消息格式：确保assistant消息中的thinking块格式正确
    if (fixedRequest.messages && fixedRequest.messages.length > 0) {
      log(`${LOG_MARKERS.MSG_TRANSFORM} 开始修复消息格式`);
      fixedRequest.messages = this.fixMessagesForThinking(fixedRequest.messages);
    }

    // 确保tool_choice兼容（thinking模式只支持"auto"或"none"）
    if (fixedRequest.tool_choice && typeof fixedRequest.tool_choice === 'object') {
      if (fixedRequest.tool_choice.type === "any" || fixedRequest.tool_choice.type === "tool") {
        log(`${LOG_MARKERS.TOOL_CHOICE} 修正tool_choice: thinking模式不支持'${fixedRequest.tool_choice.type}'，改为'auto'`);
        fixedRequest.tool_choice = "auto";
      }
    }

    log(`${LOG_MARKERS.MODEL_THINKING} thinking模式参数修复完成`);
    return fixedRequest;
  }

  /**
   * 修复thinking模式下的消息格式（继承v8.0逻辑）
   */
  private fixMessagesForThinking(messages: any[]): any[] {
    log(`${LOG_MARKERS.MSG_ANALYSIS} 开始分析消息格式 - 总消息数: ${messages.length}`);
    
    // 统计消息类型
    const messageStats: { [key: string]: number } = {};
    messages.forEach((msg, i) => {
      messageStats[msg.role] = (messageStats[msg.role] || 0) + 1;
      log(`${LOG_MARKERS.DEBUG_DETAIL}   消息[${i}]: role=${msg.role}, content类型=${typeof msg.content}`);
    });
    
    // 输出消息统计
    log(`${LOG_MARKERS.STATS} 消息统计: ${Object.entries(messageStats).map(([role, count]) => `${role}=${count}`).join(', ')}`);
    
    // 找到所有assistant消息的索引
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
    
    log(`${LOG_MARKERS.MSG_FIX} 找到${assistantIndices.length}个assistant消息，位置: [${assistantIndices.join(', ')}]`);
    
    // 处理每个assistant消息，确保都有thinking块
    let fixedCount = 0;
    for (const index of assistantIndices) {
      const targetMsg = messages[index];
      log(`${LOG_MARKERS.MSG_FIX} 处理assistant消息[${index}]: content=${JSON.stringify(targetMsg.content).substring(0, 50)}...`);
      
      const fixedContent = this.ensureThinkingBlock(targetMsg.content, index);
      
      if (fixedContent !== targetMsg.content) {
        targetMsg.content = fixedContent;
        fixedCount++;
        log(`${LOG_MARKERS.SUCCESS} assistant消息[${index}]已修复添加thinking块`);
      } else {
        log(`${LOG_MARKERS.INFO} assistant消息[${index}]无需修复`);
      }
    }
    
    log(`${LOG_MARKERS.SUMMARY} thinking块修复完成: ${fixedCount}/${assistantIndices.length}个消息需要修复`);
    
    // 🏗️ 最终结构验证
    log(`${LOG_MARKERS.MSG_VALIDATE} 验证最终消息结构:`);
    messages.forEach((msg, i) => {
      log(`${LOG_MARKERS.DEBUG_STRUCTURE}   最终消息[${i}]: role="${msg.role}"`);
      if (msg.content) {
        if (Array.isArray(msg.content)) {
          log(`${LOG_MARKERS.DEBUG_CONTENT}     content数组长度: ${msg.content.length}`);
          msg.content.forEach((block: any, j: number) => {
            log(`${LOG_MARKERS.DEBUG_STRUCTURE}       content[${j}].type: ${block.type || 'undefined'}`);
          });
        } else {
          log(`${LOG_MARKERS.DEBUG_CONTENT}     content类型: ${typeof msg.content}`);
        }
      } else {
        log(`${LOG_MARKERS.DEBUG_CONTENT}     content: null/undefined`);
      }
    });
    
    return messages;
  }

  /**
   * 确保内容块有thinking块作为开头（继承v8.0逻辑）
   */
  private ensureThinkingBlock(content: any, messageIndex: number): any {
    // 处理空content或null/undefined - 这种情况下仅添加thinking块
    if (!content || (Array.isArray(content) && content.length === 0)) {
      log(`${LOG_MARKERS.WARNING} assistant消息[${messageIndex}] content为空，仅添加thinking块`);
      return [
        {
          type: 'thinking',
          text: '我正在处理这个请求。'
        }
      ];
    }
    
    // 处理字符串content
    if (typeof content === 'string') {
      log(`${LOG_MARKERS.MSG_TRANSFORM} assistant消息[${messageIndex}] 字符串content转换为数组并添加thinking块`);
      return [
        {
          type: 'thinking',
          text: '让我分析这个请求。'
        },
        {
          type: 'text',
          text: content
        }
      ];
    }
    
    // 处理数组content
    if (Array.isArray(content)) {
      const firstBlock = content[0];
      const hasThinking = firstBlock && (firstBlock.type === 'thinking' || firstBlock.type === 'redacted_thinking');
      
      if (hasThinking) {
        log(`${LOG_MARKERS.SUCCESS} assistant消息[${messageIndex}] 已有thinking块，无需修改`);
        return content; // 已经有thinking块，不需要修改
      }
      
      log(`${LOG_MARKERS.MSG_FIX} assistant消息[${messageIndex}] 缺少thinking块，添加到开头`);
      // 检查内容类型，生成更合适的thinking文本
      const hasToolUse = content.some((block: any) => block.type === 'tool_use');
      const thinkingText = hasToolUse 
        ? '我需要使用工具来完成这个请求。' 
        : '我正在分析这个请求并准备回应。';
      
      // 插入thinking块到开头，保持原有内容
      return [
        {
          type: 'thinking',
          text: thinkingText
        },
        ...content
      ];
    }
    
    log(`${LOG_MARKERS.WARNING} assistant消息[${messageIndex}] content类型未知: ${typeof content}，直接返回`);
    return content;
  }

  /**
   * 检测是否为thinking模式模型（继承v8.0逻辑）
   */
  private isThinkingModel(model: string): boolean {
    // 检测模型名中是否包含"thinking"，或者是否为支持thinking的Claude 4模型
    const hasThinkingInName = model.includes("thinking");
    const isClaude4ThinkingModel = 
      model.includes("claude-sonnet-4-20250514") || 
      model.includes("claude-opus-4-20250514") ||
      model.includes("claude-3-7-sonnet");
    
    const isThinking = hasThinkingInName || isClaude4ThinkingModel;
    log(`${LOG_MARKERS.MODEL_DETECT} 模型检测: "${model}"`);
    log(`${LOG_MARKERS.MODEL_DETECT}   - 名称包含thinking: ${hasThinkingInName}`);
    log(`${LOG_MARKERS.MODEL_DETECT}   - 是Claude4模型: ${isClaude4ThinkingModel}`);
    log(`${LOG_MARKERS.MODEL_DETECT}   - 最终判断: ${isThinking ? '支持thinking模式' : '不支持thinking模式'}`);
    return isThinking;
  }

  // 🔍 重置数据流追踪器
  private resetTracker(): void {
    this.chunkCounter = 0;
    this.reasoningAccumulator = "";
    this.isReasoningCompleted = false;
    this.hasTextContent = false;
    log(`${LOG_MARKERS.DATA_FLOW} 数据流追踪器已重置`);
  }

  // 🛡️ 安全检查
  private safetyCheck(data: any): boolean {
    // 检查chunk计数器
    if (this.chunkCounter > SAFE_CONFIG.MAX_CHUNKS_PER_REQUEST) {
      log(`${LOG_MARKERS.SAFETY_CHECK} 安全检查失败：chunk数量超限 (${this.chunkCounter})`);
      return false;
    }

    // 检查推理内容长度
    if (data.choices?.[0]?.delta?.reasoning_content) {
      if (this.reasoningAccumulator.length + data.choices[0].delta.reasoning_content.length > SAFE_CONFIG.MAX_REASONING_LENGTH) {
        log(`${LOG_MARKERS.SAFETY_CHECK} 安全检查失败：推理内容过长`);
        return false;
      }
    }

    return true;
  }

  // 🔍 数据流追踪
  private trackDataFlow(data: any): void {
    const choice = data.choices?.[0];
    if (!choice) return;

    const delta = choice.delta;
    if (!delta) return;

    // 追踪推理内容
    if (delta.reasoning_content) {
      this.reasoningAccumulator += delta.reasoning_content;
      log(`${LOG_MARKERS.THINKING_TRACK} 推理内容累积 - 当前长度: ${this.reasoningAccumulator.length}, 新增: ${delta.reasoning_content.length}`);
    }

    // 追踪正文内容
    if (delta.content) {
      if (!this.hasTextContent) {
        this.hasTextContent = true;
        log(`${LOG_MARKERS.TEXT_TRACK} 检测到正文内容开始 - index: ${choice.index}, content: "${delta.content.substring(0, 20)}..."`);
      }
    }

    // 原始数据日志（调试模式）
    if (SAFE_CONFIG.LOG_RAW_DATA) {
      log(`${LOG_MARKERS.DEBUG_DETAIL} 原始数据[${this.chunkCounter}]: ${JSON.stringify(data).substring(0, 200)}...`);
    }
  }

  // 🧠 处理推理内容
  private processReasoningContent(data: any): any {
    const reasoningContent = data.choices[0].delta.reasoning_content;
    
    // 创建thinking格式的数据
    const thinkingData = {
      ...data,
      choices: [
        {
          ...data.choices[0],
          delta: {
            ...data.choices[0].delta,
            thinking: {
              content: reasoningContent,
            },
          },
        },
      ],
    };
    
    // 🔧 关键修复：保留reasoning_content，让后续处理
    log(`${LOG_MARKERS.REASONING_CONVERT} 推理内容转换完成 - 保留原始数据`);
    return thinkingData;
  }

  // 🎯 检测完成信号
  private detectCompletion(data: any): boolean {
    const delta = data.choices?.[0]?.delta;
    if (!delta) return false;

    // 检测模式：有正文内容 && 有积累的推理内容 && 推理未完成
    const hasContent = Boolean(delta.content);
    const hasAccumulatedReasoning = this.reasoningAccumulator.length > 0;
    const reasoningNotComplete = !this.isReasoningCompleted;

    const shouldComplete = hasContent && hasAccumulatedReasoning && reasoningNotComplete;
    
    if (shouldComplete) {
      log(`${LOG_MARKERS.COMPLETION_DETECT} 检测到完成条件 - content: ${Boolean(delta.content)}, reasoning: ${this.reasoningAccumulator.length}chars, completed: ${this.isReasoningCompleted}`);
    }

    return shouldComplete;
  }

  // 🔐 处理完成信号
  private handleCompletion(data: any): { data: any, signature: string } | null {
    if (this.isReasoningCompleted) return null;

    this.isReasoningCompleted = true;
    const signature = Date.now().toString();

    const completionData = {
      ...data,
      choices: [
        {
          ...data.choices[0],
          delta: {
            ...data.choices[0].delta,
            content: null, // 清空content避免重复
            thinking: {
              content: this.reasoningAccumulator,
              signature: signature,
            },
          },
        },
      ],
    };

    log(`${LOG_MARKERS.SIGNATURE_GEN} 生成完成信号 - signature: ${signature}, reasoning长度: ${this.reasoningAccumulator.length}`);
    return { data: completionData, signature };
  }

  // 📍 判断是否需要调整index
  private shouldAdjustIndex(data: any): boolean {
    return this.isReasoningCompleted && data.choices?.[0]?.delta?.content;
  }

  // 📍 调整index
  private adjustIndex(data: any): void {
    if (data.choices?.[0]) {
      const originalIndex = data.choices[0].index;
      data.choices[0].index++;
      log(`${LOG_MARKERS.INDEX_HANDLE} Index调整 - ${originalIndex} → ${data.choices[0].index}`);
    }
  }

  // 🔄 回滚处理
  private handleRollback(controller: any, encoder: TextEncoder, data: any): void {
    log(`${LOG_MARKERS.ROLLBACK} 执行回滚策略：透传原始数据`);
    const fallbackLine = `data: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(fallbackLine));
  }

  // 🛡️ 安全清理
  private safeCleanup(reader: any, controller: any): void {
    try {
      reader.releaseLock();
      log(`${LOG_MARKERS.SAFETY_CHECK} reader锁释放成功`);
    } catch (e: any) {
      log(`${LOG_MARKERS.WARNING} reader锁释放失败: ${e.message}`);
    }
    
    try {
      controller.close();
      log(`${LOG_MARKERS.SAFETY_CHECK} controller关闭成功`);
    } catch (e: any) {
      log(`${LOG_MARKERS.WARNING} controller关闭失败: ${e.message}`);
    }
  }

  // 🚨 错误处理
  private handleStreamError(controller: any, error: any): void {
    try {
      controller.error(error);
    } catch (e: any) {
      log(`${LOG_MARKERS.ERROR} controller.error失败: ${e.message}`);
    }
  }

  /**
   * 错误诊断和建议
   */
  transformRequestOut(request: Record<string, any>): UnifiedChatRequest {
    return request as UnifiedChatRequest;
  }
} 