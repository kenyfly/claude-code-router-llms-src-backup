#!/bin/bash
# 脚本功能: 解析由 test_thinking.sh 生成的 thinking_response.json 文件。
# 它会提取并清晰地展示“思考过程”和“最终的回答内容”。
#
# 前提条件:
# 1. 系统中已安装 'jq' (一个命令行JSON处理器)。
#    - 如果未安装，请使用您的包管理器安装 (e.g., sudo apt-get install jq, brew install jq)。
# 2. 'thinking_response.json' 文件存在于同一目录下。

# --- 检查依赖 ---
if ! command -v jq &> /dev/null
then
    echo "错误: 'jq' 未安装。请先安装 jq (e.g., sudo apt-get install jq) 再运行此脚本。"
    exit 1
fi

RESPONSE_FILE="thinking_response.json"

if [ ! -f "$RESPONSE_FILE" ]; then
    echo "错误: 未找到 '$RESPONSE_FILE' 文件。请先运行 './test_thinking.sh' 来生成它。"
    exit 1
fi

# --- 解析和展示 ---

echo "🧠 解析响应: $RESPONSE_FILE"
echo "========================================="

# 提取并打印“思考过程”
# 逻辑:
# 1. `grep '^data:'`: 只选择包含服务器发送事件(SSE)数据的行。
# 2. `sed 's/^data: //'`: 移除 SSE 的 'data: ' 前缀，留下纯 JSON。
# 3. `jq -r '.. | .thinking? // empty'`: 递归地在每个JSON对象中查找 'thinking' 字段，
#    如果找到就打印其值，否则打印空。 `-r` 选项移除字符串的引号。
echo "🤔 思考过程 (Thinking Process):"
echo "-----------------------------------------"
grep '^data:' "$RESPONSE_FILE" | sed 's/^data: //' | jq -r '.. | .thinking? // empty' | while read -r line; do
    # 如果思考内容是多行，这里可以进行格式化
    echo "$line"
done
echo "-----------------------------------------"
echo

# 提取并打印“最终回答”
# 逻辑:
# 1. 同样地，先清理 SSE 数据。
# 2. `jq -r '.. | .text? // empty'`: 递归地查找并打印 'text' 字段的内容。
#    Gemini API 通常将最终的文本放在 'text' 字段里。
echo "💬 最终回答 (Final Answer):"
echo "-----------------------------------------"
FINAL_TEXT=$(grep '^data:' "$RESPONSE_FILE" | sed 's/^data: //' | jq -r '.. | .text? // empty' | tr -d '\n')
echo "$FINAL_TEXT"
echo "-----------------------------------------"
echo "✅ 解析完成。"
