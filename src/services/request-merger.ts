import { UnifiedChatRequest, UnifiedMessage } from "../types/llm";
import { log } from "../utils/log";
import { FastifyReply } from "fastify";
import { sendUnifiedRequest } from "../utils/request";

interface PendingRequest {
  id: string;
  request: UnifiedChatRequest;
  reply: FastifyReply;
  timestamp: number;
  resolved: boolean;
  config: any;
  url: string;
}

interface MergedRequest {
  baseRequest: UnifiedChatRequest;
  subRequests: Array<{
    id: string;
    startIndex: number;
    endIndex: number;
    originalMessages: UnifiedMessage[];
  }>;
}

/**
 * 请求合并器 - 智能合并多个请求以节省token
 * 
 * 核心策略：
 * 1. 收集短时间内的多个请求
 * 2. 检测相同的系统提示词和上下文
 * 3. 将多个对话合并成一个大请求
 * 4. 解析响应后分发给各个客户端
 */
export class RequestMergerService {
  private pendingRequests = new Map<string, PendingRequest>();
  private mergeWindow = 2000; // 2秒合并窗口
  private maxMergeSize = 5; // 最大合并请求数量
  private mergeTimer: NodeJS.Timeout | null = null;

  constructor() {
    log("🔄 请求合并器已启动，合并窗口: 2秒, 最大合并数: 5");
  }

  /**
   * 添加待处理请求
   */
  addRequest(
    id: string,
    request: UnifiedChatRequest,
    reply: FastifyReply,
    config: any,
    url: string
  ): void {
    const pendingRequest: PendingRequest = {
      id,
      request,
      reply,
      timestamp: Date.now(),
      resolved: false,
      config,
      url,
    };

    this.pendingRequests.set(id, pendingRequest);
    log(`📥 收到请求 ${id}，当前队列长度: ${this.pendingRequests.size}`);

    // 如果达到最大合并数量，立即处理
    if (this.pendingRequests.size >= this.maxMergeSize) {
      log(`🚀 达到最大合并数量(${this.maxMergeSize})，立即处理`);
      this.processPendingRequests();
      return;
    }

    // 设置合并定时器
    if (this.mergeTimer) {
      clearTimeout(this.mergeTimer);
    }
    
    this.mergeTimer = setTimeout(() => {
      this.processPendingRequests();
    }, this.mergeWindow);
  }

  /**
   * 处理所有待处理请求
   */
  private async processPendingRequests(): Promise<void> {
    if (this.pendingRequests.size === 0) return;

    const requests = Array.from(this.pendingRequests.values());
    this.pendingRequests.clear();

    if (this.mergeTimer) {
      clearTimeout(this.mergeTimer);
      this.mergeTimer = null;
    }

    log(`🔄 开始处理 ${requests.length} 个待处理请求`);

    // 按提供商和模型分组
    const groups = this.groupRequestsByProvider(requests);

    // 并行处理每个组
    const processingPromises = groups.map(group => this.processGroup(group));
    await Promise.all(processingPromises);
  }

  /**
   * 按提供商和模型分组请求
   */
  private groupRequestsByProvider(requests: PendingRequest[]): PendingRequest[][] {
    const groups = new Map<string, PendingRequest[]>();

    for (const request of requests) {
      const key = `${request.url}_${request.request.model}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(request);
    }

    return Array.from(groups.values());
  }

  /**
   * 处理单个组的请求
   */
  private async processGroup(requests: PendingRequest[]): Promise<void> {
    if (requests.length === 1) {
      // 单个请求，直接发送
      await this.processSingleRequest(requests[0]);
      return;
    }

    log(`🔀 合并处理 ${requests.length} 个相同提供商的请求`);
    
    // 检查是否可以合并
    const mergeResult = this.attemptMerge(requests);
    
    if (mergeResult) {
      // 可以合并，发送合并请求
      await this.processMergedRequest(mergeResult, requests);
    } else {
      // 无法合并，单独处理
      log(`⚠️  无法合并请求，将单独处理`);
      const processingPromises = requests.map(req => this.processSingleRequest(req));
      await Promise.all(processingPromises);
    }
  }

  /**
   * 尝试合并请求
   */
  private attemptMerge(requests: PendingRequest[]): MergedRequest | null {
    // 检查是否具有相同的系统提示词和基础配置
    const firstRequest = requests[0].request;
    const baseSystemMessages = this.extractSystemMessages(firstRequest.messages);
    
    // 检查所有请求是否具有相同的系统提示词
    const canMerge = requests.every(req => {
      const systemMessages = this.extractSystemMessages(req.request.messages);
      return this.messagesEqual(baseSystemMessages, systemMessages);
    });

    if (!canMerge) {
      return null;
    }

    // 创建合并请求
    const mergedMessages: UnifiedMessage[] = [...baseSystemMessages];
    const subRequests = [];

    for (const request of requests) {
      const userMessages = this.extractUserMessages(request.request.messages);
      const startIndex = mergedMessages.length;
      
      // 添加分隔符
      mergedMessages.push({
        role: "user",
        content: `--- 请求 ${request.id} 开始 ---`
      });
      
      // 添加用户消息
      mergedMessages.push(...userMessages);
      
      // 添加结束分隔符
      mergedMessages.push({
        role: "user", 
        content: `--- 请求 ${request.id} 结束 ---`
      });

      const endIndex = mergedMessages.length - 1;
      
      subRequests.push({
        id: request.id,
        startIndex,
        endIndex,
        originalMessages: userMessages
      });
    }

    const mergedRequest: UnifiedChatRequest = {
      ...firstRequest,
      messages: mergedMessages,
      // 合并请求需要更多的tokens
      max_tokens: Math.min(
        (firstRequest.max_tokens || 4096) * requests.length,
        16384
      )
    };

    log(`✅ 成功合并 ${requests.length} 个请求，总消息数: ${mergedMessages.length}`);
    
    return {
      baseRequest: mergedRequest,
      subRequests
    };
  }

  /**
   * 处理合并请求
   */
  private async processMergedRequest(
    mergeResult: MergedRequest,
    originalRequests: PendingRequest[]
  ): Promise<void> {
    try {
      const config = originalRequests[0].config;
      const url = originalRequests[0].url;
      
      log(`🚀 发送合并请求，包含 ${mergeResult.subRequests.length} 个子请求`);
      
      const response = await sendUnifiedRequest(url, mergeResult.baseRequest, config);
      
      if (!response.ok) {
        throw new Error(`合并请求失败: ${response.status} ${response.statusText}`);
      }

      // 处理响应
      if (mergeResult.baseRequest.stream) {
        await this.handleMergedStreamResponse(response, mergeResult, originalRequests);
      } else {
        await this.handleMergedResponse(response, mergeResult, originalRequests);
      }
      
    } catch (error: any) {
      log(`❌ 合并请求处理失败: ${error.message}`);
      
      // 失败时单独处理每个请求
      const processingPromises = originalRequests.map(req => this.processSingleRequest(req));
      await Promise.all(processingPromises);
    }
  }

  /**
   * 处理合并的非流式响应
   */
  private async handleMergedResponse(
    response: Response,
    mergeResult: MergedRequest,
    originalRequests: PendingRequest[]
  ): Promise<void> {
    const data = await response.json();
    const fullContent = data.choices?.[0]?.message?.content || "";
    
    // 按分隔符分割响应
    const responses = this.splitMergedResponse(fullContent, mergeResult.subRequests);
    
    // 分发响应给各个客户端
    for (let i = 0; i < originalRequests.length; i++) {
      const request = originalRequests[i];
      const subResponse = responses[i] || "处理失败";
      
      const responseData = {
        ...data,
        choices: [{
          ...data.choices[0],
          message: {
            ...data.choices[0].message,
            content: subResponse
          }
        }]
      };
      
      request.reply.send(responseData);
      log(`📤 已发送响应给请求 ${request.id}`);
    }
  }

  /**
   * 处理合并的流式响应
   */
  private async handleMergedStreamResponse(
    response: Response,
    mergeResult: MergedRequest,
    originalRequests: PendingRequest[]
  ): Promise<void> {
    // 流式响应更复杂，需要实时解析和分发
    // 目前先简化处理，后续可以优化
    log(`⚠️  合并流式响应处理较复杂，暂时单独处理`);
    
    // 单独处理每个请求
    const processingPromises = originalRequests.map(req => this.processSingleRequest(req));
    await Promise.all(processingPromises);
  }

  /**
   * 处理单个请求
   */
  private async processSingleRequest(request: PendingRequest): Promise<void> {
    try {
      log(`🔄 单独处理请求 ${request.id}`);
      
      const response = await sendUnifiedRequest(request.url, request.request, request.config);
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`);
      }

      // 转发响应
      if (request.request.stream) {
        request.reply.header("Content-Type", "text/event-stream");
        request.reply.header("Cache-Control", "no-cache");
        request.reply.header("Connection", "keep-alive");
        request.reply.send(response.body);
      } else {
        const data = await response.json();
        request.reply.send(data);
      }
      
      log(`✅ 请求 ${request.id} 处理完成`);
      
    } catch (error: any) {
      log(`❌ 请求 ${request.id} 处理失败: ${error.message}`);
      request.reply.code(500).send({ error: error.message });
    }
  }

  /**
   * 提取系统消息
   */
  private extractSystemMessages(messages: UnifiedMessage[]): UnifiedMessage[] {
    return messages.filter(msg => msg.role === "system");
  }

  /**
   * 提取用户消息
   */
  private extractUserMessages(messages: UnifiedMessage[]): UnifiedMessage[] {
    return messages.filter(msg => msg.role !== "system");
  }

  /**
   * 比较消息是否相等
   */
  private messagesEqual(messages1: UnifiedMessage[], messages2: UnifiedMessage[]): boolean {
    if (messages1.length !== messages2.length) return false;
    
    for (let i = 0; i < messages1.length; i++) {
      const msg1 = messages1[i];
      const msg2 = messages2[i];
      
      if (msg1.role !== msg2.role || msg1.content !== msg2.content) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 分割合并响应
   */
  private splitMergedResponse(fullContent: string, subRequests: any[]): string[] {
    const responses: string[] = [];
    
    for (const subRequest of subRequests) {
      const startMarker = `--- 请求 ${subRequest.id} 开始 ---`;
      const endMarker = `--- 请求 ${subRequest.id} 结束 ---`;
      
      const startIndex = fullContent.indexOf(startMarker);
      const endIndex = fullContent.indexOf(endMarker);
      
      if (startIndex !== -1 && endIndex !== -1) {
        const responseContent = fullContent.substring(
          startIndex + startMarker.length,
          endIndex
        ).trim();
        responses.push(responseContent);
      } else {
        responses.push(""); // 如果找不到分隔符，返回空响应
      }
    }
    
    return responses;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      mergeWindow: this.mergeWindow,
      maxMergeSize: this.maxMergeSize
    };
  }
} 