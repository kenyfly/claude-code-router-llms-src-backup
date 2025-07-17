import { Transformer } from "@/types/transformer";
import { log } from "@/utils/log";
import { ConfigService } from "./config";
import {
  AnthropicTransformer,
  GeminiTransformer,
  DeepseekTransformer,
  TooluseTransformer,
  OpenrouterTransformer,
  OpenAITransformer,
  NewAPITransformer,
  GeminiNativeTransformer,
} from "@/transformer";

interface TransformerConfig {
  transformers: Array<{
    name: string;
    type: "class" | "module";
    path?: string;
    options?: any;
  }>;
}

export class TransformerService {
  private transformers: Map<string, Transformer> = new Map();

  constructor(private readonly configService: ConfigService) {
    this.initialize();
  }

  registerTransformer(name: string, transformer: Transformer): void {
    this.transformers.set(name, transformer);
    log(
      `register transformer: ${name}${
        transformer.endPoint
          ? ` (endpoint: ${transformer.endPoint})`
          : " (no endpoint)"
      }`
    );
  }

  getTransformer(name: string): Transformer | undefined {
    return this.transformers.get(name);
  }

  getAllTransformers(): Map<string, Transformer> {
    return new Map(this.transformers);
  }

  getTransformersWithEndpoint(): { name: string; transformer: Transformer }[] {
    const result: { name: string; transformer: Transformer }[] = [];

    this.transformers.forEach((transformer, name) => {
      if (transformer.endPoint) {
        result.push({ name, transformer });
      }
    });

    return result;
  }

  getTransformersWithoutEndpoint(): {
    name: string;
    transformer: Transformer;
  }[] {
    const result: { name: string; transformer: Transformer }[] = [];

    this.transformers.forEach((transformer, name) => {
      if (!transformer.endPoint) {
        result.push({ name, transformer });
      }
    });

    return result;
  }

  removeTransformer(name: string): boolean {
    return this.transformers.delete(name);
  }

  hasTransformer(name: string): boolean {
    return this.transformers.has(name);
  }

  async registerTransformerFromConfig(config: {
    path?: string;
    options?: any;
  }): Promise<boolean> {
    try {
      if (config.path) {
        const module = require(config.path);
        if (module) {
          const instance = new module(config.options);
          if (!instance.name) {
            throw new Error(
              `Transformer instance from ${config.path} does not have a name property.`
            );
          }
          this.registerTransformer(instance.name, instance);
          return true;
        }
      }
      return false;
    } catch (error) {
      log(`load transformer (${config.path}):`, error);
      return false;
    }
  }

  private async initialize(): Promise<void> {
    try {
      await this.registerDefaultTransformersInternal();
      await this.loadFromConfig();
    } catch (error) {
      log("TransformerService init error:", error);
    }
  }

  private async registerDefaultTransformersInternal(): Promise<void> {
    try {
      const anthropic = new AnthropicTransformer();
      const gemini = new GeminiTransformer();
      const deepseek = new DeepseekTransformer();
      const tooluse = new TooluseTransformer();
      const openrouter = new OpenrouterTransformer();
      const openai = new OpenAITransformer();
      const newapi = new NewAPITransformer();
      const geminiNative = new GeminiNativeTransformer();

      this.registerTransformer(anthropic.name, anthropic);
      this.registerTransformer(gemini.name, gemini);
      this.registerTransformer(deepseek.name, deepseek);
      this.registerTransformer(tooluse.name, tooluse);
      this.registerTransformer(openrouter.name, openrouter);
      this.registerTransformer(openai.name, openai);
      this.registerTransformer(newapi.name, newapi);
      this.registerTransformer(geminiNative.name, geminiNative);
    } catch (error) {
      log("transformer regist error:", error);
    }
  }

  private async loadFromConfig(): Promise<void> {
    const transformers = this.configService.get<
      TransformerConfig["transformers"]
    >("transformers", []);
    for (const transformer of transformers) {
      await this.registerTransformerFromConfig(transformer);
    }
  }
}
