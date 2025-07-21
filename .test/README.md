# Zjcspace API 测试脚本

这个目录包含了用于测试 Zjcspace API 的脚本，帮助你调试服务器返回500错误的原因。

## 文件说明

- `prepare_test.js` - 准备测试环境，复制最新的请求体文件
- `test_zjcspace_request.js` - 发送API请求的测试脚本
- `README.md` - 本说明文件

## 使用步骤

### 1. 准备测试环境

```bash
# 复制最新的请求体文件为 body.json
node .test/prepare_test.js
```

这个脚本会：
- 自动找到debug目录中最新的请求体文件
- 复制为 `debug/body.json`
- 显示文件内容摘要

### 2. 修改请求体

编辑 `debug/body.json` 文件，删除或修改某些字段来测试：

```json
{
  "timestamp": "2025-07-19T18:07:40.351Z",
  "requestId": "req_1752948460351_3u4tjzc33",
  "requestBody": {
    "model": "gemini-2.5-pro",
    "messages": [...],
    "tools": [...],
    "stream": false,
    "max_tokens": 1000,
    "temperature": 0.7
  }
}
```

**测试建议：**
- 删除 `tools` 字段
- 删除 `max_tokens` 字段
- 删除 `temperature` 字段
- 修改 `stream` 为 `true`
- 简化 `messages` 内容

### 3. 设置API密钥

编辑 `test_zjcspace_request.js` 文件，设置你的API密钥：

```javascript
const CONFIG = {
  baseUrl: 'https://new.zjcspace.xyz/v1/chat/completions',
  apiKey: 'your-actual-api-key-here', // 替换为实际密钥
  // ...
};
```

### 4. 运行测试

```bash
# 发送请求并查看响应
node .test/test_zjcspace_request.js
```

### 5. 分析结果

脚本会：
- 显示请求详情
- 显示响应状态码和头信息
- 显示响应体内容
- 保存响应到 `debug/test-response-*.json` 文件

## 测试策略

### 逐步删除字段测试

1. **基础测试**：只保留 `model` 和 `messages`
```json
{
  "model": "gemini-2.5-pro",
  "messages": [...]
}
```

2. **添加stream字段**：
```json
{
  "model": "gemini-2.5-pro",
  "messages": [...],
  "stream": true
}
```

3. **添加tools字段**：
```json
{
  "model": "gemini-2.5-pro",
  "messages": [...],
  "stream": false,
  "tools": [...]
}
```

4. **添加其他字段**：逐步添加 `max_tokens`、`temperature` 等

### 观察响应

- **200状态码**：请求成功
- **206状态码**：当前遇到的错误
- **400状态码**：请求格式错误
- **401状态码**：认证失败
- **500状态码**：服务器内部错误

## 调试技巧

1. **对比测试**：修改一个字段后立即测试
2. **记录结果**：每次测试后记录状态码和错误信息
3. **逐步恢复**：找到问题字段后，逐步恢复其他字段
4. **查看日志**：结合转换器的日志分析问题

## 示例工作流

```bash
# 1. 准备测试
node .test/prepare_test.js

# 2. 编辑请求体（删除tools字段）
vim debug/body.json

# 3. 运行测试
node .test/test_zjcspace_request.js

# 4. 如果还是206错误，继续删除其他字段
# 5. 找到问题字段后，在转换器中修复
```

通过这种方法，你可以快速定位是哪个字段导致服务器返回206错误！ 