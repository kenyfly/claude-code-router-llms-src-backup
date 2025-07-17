import { AnthropicTransformer } from "./anthropic.transformer";
import { GeminiTransformer } from "./gemini.transformer";
import { DeepseekTransformer } from "./deepseek.transformer";
import { TooluseTransformer } from "./tooluse.transformer";
import { OpenrouterTransformer } from "./openrouter.transformer";
import { OpenAITransformer } from "./openai.transformer";
import { NewAPITransformer } from "./newapi.transformer";
// 导入我们刚刚创建的两个新转换器
import { GeminiNativeTransformer } from './gemini-native.transformer';

// 确保只声明一次 transformers 数组
export const transformers = [
  new OpenrouterTransformer(),
  new DeepseekTransformer(),
  new GeminiTransformer(),
  new NewAPITransformer(),
  new OpenAITransformer(),
  // 在这里注册我们的新工具，顺序不影响查找
  new GeminiNativeTransformer(),
];

export {
  AnthropicTransformer,
  GeminiTransformer,
  DeepseekTransformer,
  TooluseTransformer,
  OpenrouterTransformer,
  OpenAITransformer,
  NewAPITransformer,
  GeminiNativeTransformer,
};