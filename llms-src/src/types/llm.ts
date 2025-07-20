import type { ChatCompletionMessageParam as OpenAIMessage } from "openai/resources/chat/completions";
import type { MessageParam as AnthropicMessage } from "@anthropic-ai/sdk/resources/messages";
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import type {
  Message,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages";

// 内容类型定义
export interface TextContent {
  type: "text";
  text: string;
  cache_control?: {
    type?: string
  }
}

export interface ImageContent {
  type: "image";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export type MessageContent = TextContent | ImageContent;

// 统一的消息接口
export interface UnifiedMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null | MessageContent[];
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string; // 新增，兼容 Gemini 工具响应
  cache_control?: {
    type?: string
  };
  thinking?: {
    content: string;
    signature?: string;
  };
}

// 统一的工具定义接口
export interface UnifiedTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
      $schema?: string;
    };
  };
}

// 统一的请求接口
export interface UnifiedChatRequest {
  messages: UnifiedMessage[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: UnifiedTool[];
  tool_choice?: "auto" | "none" | "required" | { type: "auto" | "none" | "any" | "tool"; name?: string };
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
}

// 统一的响应接口
export interface UnifiedChatResponse {
  id: string;
  model: string;
  content: string | null;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

// 流式响应相关类型
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices?: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

// Anthropic 流式事件类型
export type AnthropicStreamEvent = MessageStreamEvent;

// OpenAI 流式块类型
export type OpenAIStreamChunk = ChatCompletionChunk;

// OpenAI 特定类型
export interface OpenAIChatRequest {
  messages: OpenAIMessage[];
  model: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ChatCompletionTool[];
  tool_choice?:
  | "auto"
  | "none"
  | { type: "function"; function: { name: string } };
}

// Anthropic 特定类型
export interface AnthropicChatRequest {
  messages: AnthropicMessage[];
  model: string;
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
  system?: string;
  tools?: AnthropicTool[];
  tool_choice?: { type: "auto" } | { type: "tool"; name: string };
}

// 转换选项
export interface ConversionOptions {
  targetProvider: "openai" | "anthropic";
  sourceProvider: "openai" | "anthropic";
}

// 服务商注册相关类型
export interface LLMProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  transformer?: {
    use?: string[];
    [key: string]: any;
  };
}

export type RegisterProviderRequest = LLMProvider;

export interface ModelRoute {
  provider: string;
  model: string;
  fullModel: string;
}

export interface RequestRouteInfo {
  provider: LLMProvider;
  originalModel: string;
  targetModel: string;
}

export interface ConfigProvider {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
}
