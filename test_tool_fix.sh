#!/bin/bash

# 自动化测试脚本 - tool 修复调试
# 集成构建、部署、测试、日志查看的完整流程

set -e  # 遇到错误立即退出

echo "🚀 开始自动化测试流程..."

# 1. 停止现有服务
echo "📛 停止现有服务..."
node dist/cli.js stop || true
pkill -f "node dist/cli.js" || true
sleep 2

# 2. 构建项目
echo "🔨 构建项目..."
npm run build

# 3. 启动服务
echo "⚡ 启动服务..."
node dist/cli.js start &
sleep 5

# 检查服务是否正常启动
echo "🔍 检查服务状态..."
RETRY_COUNT=0
MAX_RETRIES=10
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:3456/health > /dev/null 2>&1; then
    echo "✅ 服务启动成功"
    break
  else
    echo "⏳ 等待服务启动... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 1
    RETRY_COUNT=$((RETRY_COUNT + 1))
  fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "❌ 服务启动失败或超时"
  exit 1
fi

# 4. 测试用例
echo "🧪 执行测试用例..."

# 测试1: 简单请求验证服务正常
echo -e "\n=== 测试1: 基础服务验证 ==="
RESULT1=$(curl -s -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-test" \
  -d '{"model": "claude-sonnet-4-20250514-thinking", "messages": [{"role": "user", "content": "版本测试"}]}' \
  | jq -r '.choices[0].message.content // .error.message // "请求失败"')

if [[ $RESULT1 == *"Error"* ]]; then
  echo "❌ 基础服务失败: $RESULT1"
else
  echo "✅ 基础服务正常"
fi

# 测试2: 带工具的复杂请求 - 这是我们要修复的核心问题
echo -e "\n=== 测试2: thinking+tool 组合问题 ==="
RESULT2=$(curl -s -X POST http://localhost:3456/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-test" \
  -d '{
    "model": "claude-sonnet-4-20250514-thinking",
    "messages": [
      {"role": "user", "content": "请用工具计算2*3"},
      {
        "role": "assistant", 
        "content": [
          {"type": "text", "text": "我来计算2*3"},
          {"type": "tool_use", "id": "call_2", "name": "calc", "input": {"expr": "2*3"}}
        ]
      },
      {"role": "tool", "tool_use_id": "call_2", "content": "6"}
    ],
    "tools": [{"type": "function", "function": {"name": "calc", "description": "计算", "parameters": {"type": "object", "properties": {"expr": {"type": "string"}}, "required": ["expr"]}}}]
  }' | jq -r '.error.message // .choices[0].message.content // "请求成功"')

if [[ $RESULT2 == *"tool_result.tool_use_id: Field required"* ]]; then
  echo "❌ 核心问题依然存在: $RESULT2"
  echo "🔍 问题分析: tool消息未正确重组为tool_result块"
elif [[ $RESULT2 == *"Error"* ]]; then
  echo "❌ 其他错误: $RESULT2"
else
  echo "✅ thinking+tool 组合修复成功!"
fi

# 5. 显示关键日志
echo -e "\n=== 最新日志片段 ==="
# 尝试多个可能的日志位置
LOG_FOUND=false
for LOG_PATH in "/tmp/ccr.log" "/var/log/ccr.log" "~/.ccr/logs/ccr.log" "./ccr.log"; do
  if [[ -f "$LOG_PATH" ]]; then
    echo "📋 日志文件: $LOG_PATH"
    tail -n 20 "$LOG_PATH" | grep -E "(🎯|🚨|🔧|❌|✅|NewAPI|v7\.[0-9])" || true
    LOG_FOUND=true
    break
  fi
done

if [[ $LOG_FOUND == false ]]; then
  echo "⚠️ 未找到日志文件，可能日志输出到控制台"
fi

# 6. 总结
echo -e "\n=== 测试总结 ==="
if [[ $RESULT2 == *"tool_result.tool_use_id: Field required"* ]]; then
  echo "🎯 主要问题: 消息重组逻辑未生效"
  echo "🔍 需要检查: transformMessageFormats 方法是否被调用"
  echo "🔧 建议: 添加更多调试日志确认代码执行路径"
elif [[ $RESULT2 == *"Error"* ]]; then
  echo "🎯 发现其他错误: $RESULT2"
else
  echo "🎉 所有测试通过!"
fi

echo -e "\n✅ 自动化测试流程完成" 