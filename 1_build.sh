#!/bin/bash

# 阶段1: 重构项目脚本
# 停止服务 -> 构建项目 -> 清理缓存

echo "🔨 阶段1: 重构项目开始..."

# 停止所有相关服务
echo "📛 停止现有服务..."
node dist/cli.js stop 2>/dev/null || echo "服务已停止"
pkill -f "node dist/cli.js" 2>/dev/null || echo "清理进程完成"
sleep 2

# 清理构建缓存
echo "🧹 清理构建缓存..."
rm -rf dist/ node_modules/.cache llms-src/dist/ 2>/dev/null || true

# 构建 llms-src 模块
echo "🔧 构建 llms-src 模块..."
cd llms-src && npm run build && cd ..

# 构建主项目
echo "🔧 构建主项目..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ 构建成功"
else
    echo "❌ 构建失败"
    exit 1
fi

echo "✅ 阶段1: 重构项目完成" 