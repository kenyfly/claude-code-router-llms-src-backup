# NewAPI Transformer v18.0 安全测试指南

## 🛡️ 安全特性概览

v18.0 引入了全面的安全机制，防止历史上的"正文丢失"问题重现：

### 🎛️ A/B 测试开关
- **SIGNATURE_FIX**: 控制是否启用 thinking 完成信号
- **INDEX_FIX**: 控制是否启用 index 调整逻辑
- **默认状态**: 所有新功能默认关闭，保持 v17.0 行为

### 🔍 完整数据流追踪
- 详细记录每个处理步骤
- 实时监控 thinking 和正文内容状态
- 性能指标追踪（chunk 数量、内容长度等）

### 🛡️ 安全检查机制
- 防止无限循环和内存溢出
- 自动回滚到安全状态
- 错误恢复和优雅降级

## 🧪 渐进式测试策略

### 第一阶段：基线测试（默认配置）
```bash
# 1. 构建和启动（默认所有新功能关闭）
./1_build.sh && ./2_start_service.sh

# 2. 验证基本功能不受影响
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "zuke-gemini,gemini-2.5-pro-preview-03-25-thinking", "messages": [{"role": "user", "content": "你好"}], "stream": true}'

# 3. 检查日志确认 v18.0 正常加载
./4_logs.sh | grep "NewAPI-v18.0"
```

**预期结果**：
- ✅ 服务正常启动
- ✅ 显示 "NewAPI-v18.0" 版本信息
- ✅ A/B 测试状态显示所有功能关闭
- ✅ 正文内容正常显示（继承 v17.0 行为）
- ❌ thinking 标签不显示（预期行为）

### 第二阶段：启用完成信号测试
```bash
# 1. 停止服务
pkill -f claude-code-router

# 2. 启用 SIGNATURE_FIX 功能
export NEWAPI_ENABLE_SIGNATURE=true
export NEWAPI_DEBUG=true

# 3. 重新启动并测试
./2_start_service.sh

# 4. 测试 thinking 完成信号
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "zuke-gemini,gemini-2.5-pro-preview-03-25-thinking", "messages": [{"role": "user", "content": "解释一下量子计算的基本原理"}], "stream": true}'
```

**预期结果**：
- ✅ 日志显示 "SIGNATURE_FIX: true"
- ✅ 检测到完成条件的日志
- ✅ 生成 signature 的日志
- ✅ thinking 标签开始显示（新功能）
- ✅ 正文内容继续正常显示

**⚠️ 如果出现问题**：
```bash
# 立即回滚到安全状态
unset NEWAPI_ENABLE_SIGNATURE
pkill -f claude-code-router
./2_start_service.sh
```

### 第三阶段：完整功能测试
```bash
# 启用所有新功能
export NEWAPI_ENABLE_SIGNATURE=true
export NEWAPI_ENABLE_INDEX=true
export NEWAPI_DEBUG=true
export NEWAPI_LOG_RAW=true  # 详细调试日志

# 重启并全面测试
pkill -f claude-code-router
./2_start_service.sh
```

## 📊 日志监控指南

### 关键日志标识符
```bash
# 监控 A/B 测试状态
./4_logs.sh | grep "A/B-TEST"

# 监控完成信号检测
./4_logs.sh | grep "COMPLETION-DETECT"

# 监控 signature 生成
./4_logs.sh | grep "SIGNATURE"

# 监控数据流追踪
./4_logs.sh | grep "DATA-FLOW"

# 监控安全检查
./4_logs.sh | grep "SAFETY"

# 监控回滚事件
./4_logs.sh | grep "ROLLBACK"
```

### 正常日志模式
```
[NewAPI-v18.0] 🧪 [A/B-TEST] A/B测试状态 - SIGNATURE_FIX: true, INDEX_FIX: false
[NewAPI-v18.0] 🧠 [THINKING-TRACK] 推理内容累积 - 当前长度: 245, 新增: 50
[NewAPI-v18.0] 📄 [TEXT-TRACK] 检测到正文内容开始 - index: 0, content: "量子计算是一种..."
[NewAPI-v18.0] 🎯 [COMPLETION-DETECT] 检测到完成条件 - content: true, reasoning: 245chars, completed: false
[NewAPI-v18.0] 🔐 [SIGNATURE] 生成完成信号 - signature: 1704616234567, reasoning长度: 245
```

### 警告日志模式
```
[NewAPI-v18.0] ⚠️ [WARNING] reasoning内容长度接近阈值
[NewAPI-v18.0] 🛡️ [SAFETY] 安全检查失败：chunk数量超限
[NewAPI-v18.0] 🔄 [ROLLBACK] 执行回滚策略：透传原始数据
```

## 🚨 紧急回滚程序

### 快速回滚命令
```bash
#!/bin/bash
# 紧急回滚脚本

echo "🚨 执行紧急回滚..."

# 1. 停止服务
pkill -f claude-code-router

# 2. 清除所有实验性环境变量
unset NEWAPI_ENABLE_SIGNATURE
unset NEWAPI_ENABLE_INDEX
unset NEWAPI_DEBUG
unset NEWAPI_LOG_RAW

# 3. 切换到 v8.0 稳定版本（如果需要）
# cp my/newapi.ts llms-src/src/transformer/newapi.transformer.ts

# 4. 重新构建和启动
./1_build.sh && ./2_start_service.sh

echo "✅ 回滚完成，服务已恢复到安全状态"
```

### 回滚验证
```bash
# 验证回滚成功
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "zuke-gemini,gemini-2.5-pro-preview-03-25-thinking", "messages": [{"role": "user", "content": "简单测试"}], "stream": true}' \
  | head -20

# 检查版本信息
./4_logs.sh | grep "NewAPI" | tail -5
```

## 🔍 问题诊断清单

### Thinking 标签不显示
1. ✅ 检查 `NEWAPI_ENABLE_SIGNATURE=true` 是否设置
2. ✅ 查看是否有 "COMPLETION-DETECT" 日志
3. ✅ 确认推理内容长度 > 0
4. ✅ 验证 signature 是否生成

### 正文内容丢失
1. 🚨 **立即回滚** - 这是不可接受的
2. 检查 "TEXT-TRACK" 日志
3. 查看 "ROLLBACK" 事件
4. 验证数据流追踪状态

### 性能问题
1. 检查 chunk 计数是否超限
2. 查看推理内容长度
3. 监控内存使用情况
4. 考虑调整安全阈值

## 📈 成功标准

### 基础成功标准
- ✅ 服务稳定运行，无崩溃
- ✅ 正文内容 100% 正常显示
- ✅ 工具调用功能不受影响
- ✅ 性能无显著下降

### 增强功能成功标准
- ✅ Thinking 标签正确显示
- ✅ 推理过程和正文内容同时显示
- ✅ signature 机制正常工作
- ✅ 完整的数据流追踪

### 安全特性成功标准
- ✅ A/B 测试开关正常工作
- ✅ 安全检查有效防护
- ✅ 回滚机制可靠
- ✅ 错误恢复机制正常

## 🎯 最佳实践建议

1. **始终从默认配置开始测试**
2. **逐步启用新功能，每次只测试一个**
3. **密切监控日志，特别关注 ROLLBACK 事件**
4. **准备好快速回滚程序**
5. **在生产环境使用前，进行充分的压力测试**

---

**记住**：安全第一！如果有任何疑虑，立即回滚到稳定状态。 