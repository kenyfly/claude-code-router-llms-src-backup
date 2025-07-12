import { UnifiedTool } from "../types/llm";
import { log } from "./log";

/**
 * NewAPI工具清理器 - 智能替换版本
 * 不是简单删除字段，而是使用OpenAI支持的等效格式替代
 */
export class NewAPIToolCleaner {
  
  /**
   * 清理工具数组，将不兼容字段转换为兼容格式
   */
  static cleanTools(tools: UnifiedTool[]): UnifiedTool[] {
    if (!tools || !Array.isArray(tools)) {
      return tools;
    }

    const cleanedTools = tools.map(tool => this.cleanSingleTool(tool));
    return cleanedTools;
  }

  /**
   * 清理单个工具定义
   */
  private static cleanSingleTool(tool: UnifiedTool): UnifiedTool {
    const cleanedTool = JSON.parse(JSON.stringify(tool)); // 深拷贝
    
    if (cleanedTool.function?.parameters) {
      this.cleanJsonSchema(cleanedTool.function.parameters);
    }
    
    return cleanedTool;
  }

  /**
   * 智能清理JSON Schema - 使用替换而非删除策略
   */
  private static cleanJsonSchema(schema: any): void {
    if (!schema || typeof schema !== 'object') return;

    // 处理properties
    if (schema.properties && typeof schema.properties === 'object') {
      Object.keys(schema.properties).forEach(key => {
        this.cleanSchemaProperty(schema.properties[key]);
      });
    }

    // 处理数组items
    if (schema.items) {
      this.cleanSchemaProperty(schema.items);
    }

    // 递归处理嵌套的anyOf, allOf, oneOf等
    ['anyOf', 'allOf', 'oneOf'].forEach(key => {
      if (Array.isArray(schema[key])) {
        schema[key].forEach((subSchema: any) => this.cleanJsonSchema(subSchema));
      }
    });

    // 移除确认不支持的元数据字段（这些字段OpenAI确实不需要）
    delete schema.$schema;
    delete schema.additionalProperties; // OpenAI用strict模式处理
  }

  /**
   * 清理单个属性，重点处理const字段
   */
  private static cleanSchemaProperty(property: any): void {
    if (!property || typeof property !== 'object') return;

    // 🚀 关键改进：将const转换为enum，保持功能完整性
    if (property.const !== undefined) {
      // const: "value" → enum: ["value"]  
      // 这样保持了相同的约束功能，但使用OpenAI支持的格式
      property.enum = [property.const];
      delete property.const;
    }

    // 递归处理嵌套属性
    this.cleanJsonSchema(property);
  }

  /**
   * 验证清理后的工具定义
   */
  static validateCleanedTools(tools: UnifiedTool[]): boolean {
    try {
      // 检查基本结构
      if (!Array.isArray(tools)) return false;
      
      for (const tool of tools) {
        if (!tool.function?.name || !tool.function?.parameters) {
          return false;
        }
        
        // 检查是否还有不兼容字段
        const hasIncompatibleFields = this.hasIncompatibleFields(tool.function.parameters);
        if (hasIncompatibleFields) {
          log(`⚠️ 工具 ${tool.function.name} 仍包含不兼容字段`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      log(`❌ 工具验证失败: ${error}`);
      return false;
    }
  }

  /**
   * 检查是否还有不兼容字段
   */
  private static hasIncompatibleFields(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;

    // 检查已知的不兼容字段
    const incompatibleFields = ['const', '$schema'];
    
    for (const field of incompatibleFields) {
      if (obj[field] !== undefined) return true;
    }

    // 递归检查嵌套对象
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (this.hasIncompatibleFields(obj[key])) return true;
      }
    }

    return false;
  }
} 