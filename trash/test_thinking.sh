#!/bin/bash

# 测试 Gemini 思考功能
echo "🧠 测试 Gemini 思考功能..."

# 设置 API 密钥（请替换为您的实际密钥）
API_KEY="your_api_key_here"
BASE_URL="https://generativelanguage.googleapis.com"

# 测试请求 - 启用思考功能
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{"text": "请分析一下人工智能的发展趋势，并给出你的思考过程"}]
    }],
    "generationConfig": {
      "thinkingConfig": {
        "includeThoughts": true,
        "thinkingBudget": 1000
      }
    }
  }' | jq '.candidates[0].content.parts[] | select(.thought == true) | .text' 2>/dev/null

echo ""
echo "✅ 思考功能测试完成"
