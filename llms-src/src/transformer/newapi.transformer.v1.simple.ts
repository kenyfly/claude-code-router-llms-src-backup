/// <reference lib="DOM" />
import { LLMProvider, UnifiedChatRequest, UnifiedTool } from "../types/llm";
import { Transformer } from "../types/transformer";
import { log } from "../utils/log";
import { NewAPIToolCleaner } from "../utils/tool-cleaner";

/**
 * NewAPI Transformer - 最简版本v1.0
 * 
 * 只做基本功能：
 * 1. 工具清理
 * 2. 直接透传响应，不处理thinking
 */
export class NewAPITransformer implements Transformer {
  name = "newapi";
  version = "v1.0 - 最简版本：只做基本工具清理";

  /**
   * 处理发送给NewAPI的请求
   */
  transformRequestIn(
    request: UnifiedChatRequest,
    provider: LLMProvider
  ): Record<string, any> {
    log(`开始处理请求 - 模型: ${request.model}`);
    
    let transformedRequest = { ...request };

    // 🧹 工具清理处理
    if (transformedRequest.tools && transformedRequest.tools.length > 0) {
      log(`开始清理工具定义 - 工具数量: ${transformedRequest.tools.length}`);
      transformedRequest.tools = NewAPIToolCleaner.cleanTools(transformedRequest.tools);
    }

    log(`请求处理完成`);
    return transformedRequest;
  }

  /**
   * 处理从NewAPI返回的响应 - 直接透传
   */
  async transformResponseOut(response: Response): Promise<Response> {
    log(`开始处理响应转换`);
    
    // 💡 最简策略：直接返回响应，完全不处理thinking
    // 让AnthropicTransformer处理所有格式转换
    
    log(`响应直接透传给AnthropicTransformer处理`);
    return response;
  }

  /**
   * 标准方法
   */
  transformRequestOut(request: Record<string, any>): UnifiedChatRequest {
    return request as UnifiedChatRequest;
  }
} 