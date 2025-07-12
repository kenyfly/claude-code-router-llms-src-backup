import { Transformer } from "@/types/transformer";

/**
 * OpenAI Transformer - Minimal Endpoint Handler
 * 
 * 这是一个最简化的endpoint transformer，仅用于处理 /v1/chat/completions 路由
 * 不包含任何转换逻辑，所有实际转换由provider transformer (如NewAPITransformer) 处理
 */
export class OpenAITransformer implements Transformer {
  name = "openai";
  endPoint = "/v1/chat/completions";
  
  // 无转换逻辑，直接透传
  // 所有实际转换由provider transformer处理
} 