# NewAPI 智能替换解决方案 - 配置指南

## 🎯 配置完成状态

✅ **本地开发环境已就绪**：
- 已将项目依赖切换到本地构建的 `llms-src`
- NewAPITransformer 已注册到转换器服务
- 配置文件已更新为使用NewAPI提供商

## 📝 配置步骤

### 1. 更新你的 NewAPI 信息

编辑 `config.json`，将以下占位符替换为实际值：

```json
{
  "providers": [
    {
      "name": "newapi",
      "api_base_url": "https://你的newapi域名.com/v1/chat/completions",
      "api_key": "你的api-key",
      "models": [
        "claude-sonnet-4-20250514-thinking",
        "claude-3-7-sonnet-20250219", 
        "gemini-2.5-pro-preview-06-05"
      ],
      "transformer": {
        "use": ["newapi"]
      }
    }
  ]
}
```

### 2. 测试配置

启动claude-code-router：
```bash
npm start
# 或者如果是全局安装的话
ccr
```

### 3. 验证NewAPI功能

使用包含MCP工具调用的请求测试：
- **Claude thinking模式**：使用 `claude-sonnet-4-20250514-thinking`
- **Gemini JSON Schema**：使用 `gemini-2.5-pro-preview-06-05` 

## 🔍 智能替换效果

### Claude Thinking模式
**之前报错**：`Expected 'thinking' or 'redacted_thinking', but found 'text'`  
**现在修复**：自动添加正确的thinking参数格式

### Gemini JSON Schema  
**之前报错**：`Unknown name "const" at 'tools[0].function_declarations'`  
**现在修复**：智能转换 `const: "value"` → `enum: ["value"]`

## 📋 功能特性

- ✅ **功能完整性保持**：转换而非删除，保持所有约束能力
- ✅ **智能错误诊断**：详细的错误分析和修复建议
- ✅ **自动验证**：确保转换后的工具定义仍然有效
- ✅ **详细日志**：记录每个转换步骤，便于调试

## 🚀 下一步

如果测试通过，你可以考虑：
1. **发布到npm**：将新版本发布到 `@musistudio/llms`
2. **更新文档**：在项目README中添加NewAPI使用说明
3. **版本回退**：如果遇到问题，可以快速回退到npm版本

## 🔧 故障排除

如果遇到问题：
1. 检查 `config.json` 中的API URL和密钥
2. 查看启动日志，寻找NewAPITransformer注册信息
3. 启用详细日志：设置 `"LOG": true`

## 回退到npm版本

如果需要回退：
```bash
# 1. 修改package.json
"@musistudio/llms": "^1.0.4"

# 2. 重新安装
npm install
``` 