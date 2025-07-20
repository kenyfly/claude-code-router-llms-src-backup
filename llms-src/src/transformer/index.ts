import { AnthropicTransformer } from "./anthropic.transformer";
import { GeminiTransformer } from "./gemini.transformer";
import { GeminiProTransformer } from "./gemini-pro.transformer";
import { DeepseekTransformer } from "./deepseek.transformer";
import { TooluseTransformer } from "./tooluse.transformer";
import { OpenrouterTransformer } from "./openrouter.transformer";
import { OpenAITransformer } from "./openai.transformer";
import { NewAPITransformer } from "./newapi.transformer";
import { GeminiNativeTransformer } from './gemini-native.transformer';
import { ZjcspaceProTransformer } from './zjcspace-pro.transformer';
import { ZjcspaceTransformer } from './zjcspace.transformer';

export const transformers = [
  new OpenrouterTransformer(),
  new DeepseekTransformer(),
  new GeminiTransformer(),
  new GeminiProTransformer(),
  new NewAPITransformer(),
  new OpenAITransformer(),
  new GeminiNativeTransformer(),
  new ZjcspaceTransformer(),
  new ZjcspaceProTransformer(),
];

export {
  AnthropicTransformer,
  GeminiTransformer,
  GeminiProTransformer,
  DeepseekTransformer,
  TooluseTransformer,
  OpenrouterTransformer,
  OpenAITransformer,
  NewAPITransformer,
  GeminiNativeTransformer,
  ZjcspaceTransformer,
  ZjcspaceProTransformer,
};