#!/bin/bash

# 阶段4: 查看日志脚本
# 查找并显示相关日志，重点关注 transformer 相关的调试信息

echo "📋 阶段4: 查看日志开始..."

# 日志文件候选位置
LOG_LOCATIONS=(
    "/tmp/ccr.log"
    "/var/log/ccr.log"
    "$HOME/.ccr/logs/ccr.log"
    "$HOME/.claude-code-router/logs/ccr.log"
    "./ccr.log"
    "./logs/ccr.log"
    "/tmp/claude-code-router.log"
)

# 查找日志文件
FOUND_LOGS=()
echo "🔍 搜索日志文件..."
for LOG_PATH in "${LOG_LOCATIONS[@]}"; do
    if [ -f "$LOG_PATH" ]; then
        FOUND_LOGS+=("$LOG_PATH")
        echo "✅ 找到日志: $LOG_PATH"
    fi
done

# 如果没有找到日志文件，尝试查找进程输出
if [ ${#FOUND_LOGS[@]} -eq 0 ]; then
    echo "⚠️ 未找到标准日志文件，尝试查找进程输出..."
    
    # 查找服务进程
    SERVICE_PID=$(ps aux | grep "node dist/cli.js" | grep -v grep | awk '{print $2}' | head -1)
    
    if [ ! -z "$SERVICE_PID" ]; then
        echo "🔍 找到服务进程 PID: $SERVICE_PID"
        echo "💡 日志可能输出到控制台，建议查看进程启动时的输出"
    else
        echo "❌ 未找到服务进程"
    fi
    
    # 检查系统日志
    echo "🔍 检查系统日志..."
    if command -v journalctl >/dev/null 2>&1; then
        echo "📋 最近的系统日志（包含 node 关键词）:"
        journalctl -u "*node*" --since "1 hour ago" --no-pager | tail -20 2>/dev/null || echo "无相关系统日志"
    fi
    
    exit 1
fi

# 分析日志内容
echo -e "\n=== 日志分析 ==="
for LOG_FILE in "${FOUND_LOGS[@]}"; do
    echo -e "\n📄 分析日志文件: $LOG_FILE"
    
    # 文件大小和最后修改时间
    if [ -f "$LOG_FILE" ]; then
        FILE_SIZE=$(ls -lh "$LOG_FILE" | awk '{print $5}')
        LAST_MODIFIED=$(ls -l "$LOG_FILE" | awk '{print $6, $7, $8}')
        echo "📊 文件大小: $FILE_SIZE, 最后修改: $LAST_MODIFIED"
    fi
    
    # 显示最近的日志条目
    echo "📋 最近 30 条日志:"
    tail -30 "$LOG_FILE" 2>/dev/null || echo "无法读取日志文件"
    
    echo -e "\n🔍 关键信息筛选:"
    
    # 1. Transformer 相关信息
    echo "🔧 Transformer 相关:"
    grep -E "(NewAPI|transformer|v7\.[0-9])" "$LOG_FILE" | tail -10 2>/dev/null || echo "  无 Transformer 相关日志"
    
    # 2. 错误信息
    echo "❌ 错误信息:"
    grep -E "(Error|error|❌)" "$LOG_FILE" | tail -5 2>/dev/null || echo "  无错误信息"
    
    # 3. 思考模式相关
    echo "🧠 Thinking 模式:"
    grep -E "(thinking|💭|🎯)" "$LOG_FILE" | tail -5 2>/dev/null || echo "  无 Thinking 模式日志"
    
    # 4. 工具调用相关
    echo "🔧 工具调用:"
    grep -E "(tool_use|tool_call|tool_result)" "$LOG_FILE" | tail -5 2>/dev/null || echo "  无工具调用日志"
    
    # 5. 消息重组相关
    echo "📝 消息重组:"
    grep -E "(重组|reorganize|convertMessageFormats)" "$LOG_FILE" | tail -5 2>/dev/null || echo "  无消息重组日志"
    
    echo -e "\n" "="*50
done

# 实时日志监控选项
echo -e "\n💡 实时监控建议:"
echo "1. 实时监控日志: tail -f [日志文件]"
echo "2. 筛选关键信息: tail -f [日志文件] | grep -E '(NewAPI|Error|thinking)'"
echo "3. 重新运行测试: ./3_test.sh"

# 提供便捷的实时监控选项
if [ ${#FOUND_LOGS[@]} -gt 0 ]; then
    echo -e "\n❓ 是否启动实时日志监控？(y/n)"
    read -t 10 -r MONITOR_CHOICE
    if [ "$MONITOR_CHOICE" = "y" ] || [ "$MONITOR_CHOICE" = "Y" ]; then
        echo "🔄 开始实时监控 ${FOUND_LOGS[0]}"
        tail -f "${FOUND_LOGS[0]}" | grep --line-buffered -E "(NewAPI|Error|thinking|tool_|🎯|❌|✅)"
    fi
fi

echo "✅ 阶段4: 查看日志完成" 