import { LLMProvider, UnifiedChatRequest } from "./llm";
export type { UnifiedChatRequest } from "./llm";

export type Transformer = {
  transformRequestIn?: (
    request: UnifiedChatRequest,
    provider: LLMProvider
  ) => Record<string, any>;
  transformResponseIn?: (response: Response) => Promise<Response>;

  // 将请求格式转换为通用的格式
  transformRequestOut?: (request: any) => UnifiedChatRequest;
  // 将相应格式转换为通用的格式
  transformResponseOut?: (response: Response) => Promise<Response>;

  endPoint?: string;
  name: string;
};
