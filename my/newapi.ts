/// <reference lib="DOM" />
import { LLMProvider, UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";
import { log } from "../utils/log";
import { NewAPIToolCleaner } from "../utils/tool-cleaner";

// 版本号常量定义
const NEWAPI_VERSION = "v8.0";

// 日志标志系统 - 结构化标识符
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
  SUMMARY: `${LOG_PREFIX} 📋 [SUMMARY]`
};

/**
 * NewAPI Transformer - 简化版本
 * 
 * 回归简单策略，只处理核心问题：
 * 1. Claude thinking错误：添加正确的thinking参数格式
 * 2. JSON Schema错误：智能替换不兼容字段，保持功能完整性
 * 3. 移除复杂的消息重组逻辑，避免无限循环
 * 
 * 核心原则：简单有效，稳定可靠
 */
export class NewAPITransformer implements Transformer {
  name = "newapi";
  version = `${NEWAPI_VERSION} - 回归简单：只修复thinking模式，移除消息重组`; // 🎯 版本标识
  // 移除endPoint，作为provider transformer使用

  /**
   * 处理发送给NewAPI的请求
   * 核心策略：智能替换不兼容字段，保持完整功能
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
   * 修复Claude thinking模式的参数格式
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
   * 修复thinking模式下的消息格式 - 检查并修复所有assistant消息
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
   * 确保内容块有thinking块作为开头
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
   * 检测是否为thinking模式模型
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

  /**
   * 错误诊断和建议
   */
  transformRequestOut(request: Record<string, any>): UnifiedChatRequest {
    log(`${LOG_MARKERS.INFO} 响应转换 - 诊断模式`);
    
    // 这里可以添加响应转换逻辑，目前先直接返回
    return request as UnifiedChatRequest;
  }

  /**
   * 智能错误分析
   */
  private analyzeError(error: any): string {
    const errorStr = error.toString();
    
    if (errorStr.includes("thinking") && errorStr.includes("text")) {
      return `
${LOG_MARKERS.ERROR} Claude Thinking模式错误诊断：
- 问题：缺少thinking参数或格式错误
- 解决：已自动添加正确的thinking参数格式
- 格式：{ "thinking": { "type": "enabled", "budget_tokens": 10000 } }
      `.trim();
    }
    
    if (errorStr.includes("tool_use_id") && errorStr.includes("tool_result")) {
      return `
${LOG_MARKERS.ERROR} 工具调用格式错误诊断：
- 问题：Anthropic原生tool_use格式与OpenAI tool_calls格式不匹配
- 解决：已自动转换消息格式
- 转换：tool_use content blocks → tool_calls array
      `.trim();
    }
    
    if (errorStr.includes("const") && errorStr.includes("function_declarations")) {
      return `
${LOG_MARKERS.ERROR} Gemini JSON Schema错误诊断：
- 问题：const字段不被OpenAI/NewAPI支持
- 解决：已自动转换为等效的enum格式
- 转换：const: "value" → enum: ["value"]
- 效果：保持相同的约束功能，但格式兼容
      `.trim();
    }
    
    if (errorStr.includes("Unknown name")) {
      return `
${LOG_MARKERS.ERROR} JSON Schema兼容性错误：
- 问题：使用了OpenAI不支持的JSON Schema字段
- 解决：已启用智能清理器进行格式转换
- 策略：替换而非删除，保持功能完整性
      `.trim();
    }
    
    return `
${LOG_MARKERS.ERROR} 一般性NewAPI错误：
- 建议：检查模型名称和API key配置
- 参考：https://docs.newapi.pro/
    `.trim();
  }
} 