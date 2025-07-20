import { Transformer, UnifiedChatRequest } from "@/types/transformer";
import { log } from "@/utils/log";

/**
 * OpenAI Transformer - 標準 OpenAI 格式處理器
 *
 * 這個 Transformer 負責處理所有進出 `/v1/chat/completions` 路由的請求和響應。
 * 它會記錄請求和響應的日誌，並確保數據格式符合標準。
 */
export class OpenAITransformer implements Transformer {
  name = "openai";
  endPoint = "/v1/chat/completions";

  /**
   * 轉換外部請求為統一格式
   * @param request - 外部傳入的請求對象 (any)
   * @returns - 統一格式的聊天請求 (UnifiedChatRequest)
   */
  transformRequestOut(request: any): UnifiedChatRequest {
    log("[OpenAI-Transformer] 收到原始請求:", JSON.stringify(request, null, 2));
    // 假設傳入的 request 已經是 UnifiedChatRequest 格式
    return request as UnifiedChatRequest;
  }

  /**
   * 轉換最終響應以便發回客戶端
   * @param response - 經過 Provider 處理後的響應 (Response)
   * @returns - 準備發回給客戶端的最終響應 (Promise<Response>)
   */
  async transformResponseOut(response: Response): Promise<Response> {
    // 克隆響應以安全地讀取其內容
    const responseClone = response.clone();
    try {
      const responseBody = await responseClone.json();
      log(
        "[OpenAI-Transformer] 發送最終響應:",
        JSON.stringify(responseBody, null, 2)
      );
    } catch (error) {
      log("[OpenAI-Transformer] 無法解析最終響應為 JSON:", error);
      // 如果解析失敗，可以記錄文本內容
      const textBody = await response.clone().text();
      log("[OpenAI-Transformer] 最終響應 (文本):", textBody);
    }

    // 返回原始響應，因為 clone 後的 body 只能讀取一次
    return response;
  }
} 