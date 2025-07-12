#!/bin/bash

# 阶段3: 测试脚本
# 执行各种测试用例，重点测试 thinking+tool 组合问题

echo "🧪 阶段3: 测试开始..."

# 检查服务是否在运行
if ! curl -s http://localhost:3456/health > /dev/null 2>&1; then
    echo "❌ 服务未运行，请先运行 ./2_start_service.sh"
    exit 1
fi

# 测试计数器
TESTS_PASSED=0
TESTS_FAILED=0

# 测试函数
run_test() {
    local TEST_NAME="$1"
    local EXPECTED_TYPE="$2"  # "success" 或 "error"
    local CURL_COMMAND="$3"
    
    echo -e "\n🔍 测试: $TEST_NAME"
    
    local RESULT=$(eval "$CURL_COMMAND")
    local EXIT_CODE=$?
    
    if [ $EXIT_CODE -ne 0 ]; then
        echo "❌ 请求失败: $RESULT"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
    
    if [ "$EXPECTED_TYPE" = "success" ]; then
        if [[ $RESULT == *"Error"* ]]; then
            echo "❌ 期望成功但返回错误: $RESULT"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        else
            echo "✅ 测试通过: $RESULT"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        fi
    else
        if [[ $RESULT == *"Error"* ]]; then
            echo "🔍 期望错误并得到错误: $RESULT"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        else
            echo "❌ 期望错误但返回成功: $RESULT"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        fi
    fi
}

# 测试1: 基础 thinking 模式
echo "=== 测试套件开始 ==="
run_test "基础 thinking 模式" "success" \
    'curl -s -X POST http://localhost:3456/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer sk-test" -d "{\"model\": \"claude-sonnet-4-20250514-thinking\", \"messages\": [{\"role\": \"user\", \"content\": \"1+1等于多少？\"}]}" | jq -r ".choices[0].message.content // .error.message // \"请求失败\""'

# 测试2: 基础工具调用
run_test "基础工具调用" "success" \
    'curl -s -X POST http://localhost:3456/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer sk-test" -d "{\"model\": \"claude-sonnet-4-20250514-thinking\", \"messages\": [{\"role\": \"user\", \"content\": \"请使用计算器\"}], \"tools\": [{\"type\": \"function\", \"function\": {\"name\": \"calc\", \"description\": \"计算\", \"parameters\": {\"type\": \"object\", \"properties\": {\"expr\": {\"type\": \"string\"}}, \"required\": [\"expr\"]}}}]}" | jq -r ".choices[0].message.content // .error.message // \"请求失败\""'

# 测试3: 核心问题 - thinking+tool 组合（这个应该会失败）
run_test "核心问题: thinking+tool 组合" "error" \
    'curl -s -X POST http://localhost:3456/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer sk-test" -d "{\"model\": \"claude-sonnet-4-20250514-thinking\", \"messages\": [{\"role\": \"user\", \"content\": \"请用工具计算2*3\"}, {\"role\": \"assistant\", \"content\": [{\"type\": \"text\", \"text\": \"我来计算2*3\"}, {\"type\": \"tool_use\", \"id\": \"call_2\", \"name\": \"calc\", \"input\": {\"expr\": \"2*3\"}}]}, {\"role\": \"tool\", \"tool_use_id\": \"call_2\", \"content\": \"6\"}], \"tools\": [{\"type\": \"function\", \"function\": {\"name\": \"calc\", \"description\": \"计算\", \"parameters\": {\"type\": \"object\", \"properties\": {\"expr\": {\"type\": \"string\"}}, \"required\": [\"expr\"]}}}]}" | jq -r ".error.message // .choices[0].message.content // \"请求成功\""'

# 测试4: 不同的工具调用格式
run_test "OpenAI 格式工具调用" "success" \
    'curl -s -X POST http://localhost:3456/v1/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer sk-test" -d "{\"model\": \"claude-sonnet-4-20250514-thinking\", \"messages\": [{\"role\": \"user\", \"content\": \"计算\"}, {\"role\": \"assistant\", \"content\": \"我来计算\", \"tool_calls\": [{\"id\": \"call_1\", \"type\": \"function\", \"function\": {\"name\": \"calc\", \"arguments\": \"{\\\"expr\\\":\\\"1+1\\\"}\"}}]}, {\"role\": \"tool\", \"tool_call_id\": \"call_1\", \"content\": \"2\"}], \"tools\": [{\"type\": \"function\", \"function\": {\"name\": \"calc\", \"description\": \"计算\", \"parameters\": {\"type\": \"object\", \"properties\": {\"expr\": {\"type\": \"string\"}}, \"required\": [\"expr\"]}}}]}" | jq -r ".error.message // .choices[0].message.content // \"请求成功\""'

# 测试结果统计
echo -e "\n=== 测试结果统计 ==="
echo "✅ 通过: $TESTS_PASSED"
echo "❌ 失败: $TESTS_FAILED"
echo "📊 总计: $((TESTS_PASSED + TESTS_FAILED))"

# 重点分析核心问题
echo -e "\n=== 核心问题分析 ==="
echo "🎯 主要问题: thinking+tool 组合"
echo "🔍 错误特征: 'tool_result.tool_use_id: Field required'"
echo "📝 问题根源: 消息重组逻辑未正确执行"
echo "💡 解决方向: 需要将独立的 tool 消息合并到 assistant 消息的 content 中作为 tool_result 块"

if [ $TESTS_FAILED -gt 0 ]; then
    echo "❌ 存在测试失败，需要进一步调试"
    exit 1
else
    echo "✅ 所有测试通过"
    exit 0
fi

echo "✅ 阶段3: 测试完成" 