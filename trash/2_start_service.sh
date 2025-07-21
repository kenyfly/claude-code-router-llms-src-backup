#!/bin/bash

# 阶段2: 启动服务脚本
# 启动服务 -> 检查状态 -> 显示服务信息

echo "⚡ 阶段2: 启动服务开始..."

# 检查构建文件是否存在
if [ ! -f "dist/cli.js" ]; then
    echo "❌ 构建文件不存在，请先运行 ./1_build.sh"
    exit 1
fi

# 启动服务
echo "🚀 启动服务..."
node dist/cli.js start &
SERVICE_PID=$!

sleep 3

# 检查服务状态
echo "🔍 检查服务状态..."
RETRY_COUNT=0
MAX_RETRIES=15
SERVICE_RUNNING=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3456/health > /dev/null 2>&1; then
        echo "✅ 服务启动成功"
        SERVICE_RUNNING=true
        break
    else
        CURRENT_COUNT=$((RETRY_COUNT + 1))
        echo "⏳ 等待服务启动... ($CURRENT_COUNT/$MAX_RETRIES)"
        sleep 1
        RETRY_COUNT=$((RETRY_COUNT + 1))
    fi
done

if [ "$SERVICE_RUNNING" = false ]; then
    echo "❌ 服务启动失败或超时"
    echo "🔍 检查进程状态:"
    ps aux | grep "node dist/cli.js" | grep -v grep || echo "未找到服务进程"
    exit 1
fi

# 显示服务信息
echo "📋 服务信息:"
echo "  - 地址: http://localhost:3456"
echo "  - 健康检查: http://localhost:3456/health"
echo "  - API 端点: http://localhost:3456/v1/chat/completions"

# 测试基础连接
echo "🔗 测试基础连接..."
HEALTH_RESPONSE=$(curl -s http://localhost:3456/health)
if [ $? -eq 0 ]; then
    echo "✅ 基础连接正常: $HEALTH_RESPONSE"
else
    echo "❌ 基础连接失败"
    exit 1
fi

echo "✅ 阶段2: 启动服务完成" 