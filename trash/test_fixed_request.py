#!/usr/bin/env python3
"""
测试修复后的请求体格式是否正确
"""

import json
import sys

def validate_tool_calls(tool_calls):
    """验证 tool_calls 格式是否正确"""
    if not isinstance(tool_calls, list):
        return False, "tool_calls 必须是数组"
    
    for i, tool_call in enumerate(tool_calls):
        # 检查必需字段
        if "id" not in tool_call:
            return False, f"tool_call[{i}] 缺少 id 字段"
        
        if "type" not in tool_call:
            return False, f"tool_call[{i}] 缺少 type 字段"
        
        if "function" not in tool_call:
            return False, f"tool_call[{i}] 缺少 function 字段"
        
        # 检查 function 字段
        function = tool_call["function"]
        if "name" not in function:
            return False, f"tool_call[{i}].function 缺少 name 字段"
        
        if "arguments" not in function:
            return False, f"tool_call[{i}].function 缺少 arguments 字段"
        
        # 检查 name 是否为小写
        if function["name"] != function["name"].lower():
            return False, f"tool_call[{i}].function.name 应该为小写: {function['name']}"
        
        # 检查 arguments 是否为有效的 JSON 字符串
        try:
            args = json.loads(function["arguments"])
            if not isinstance(args, dict):
                return False, f"tool_call[{i}].function.arguments 应该解析为对象"
            
            # 检查是否包含不应该存在的字段
            if "description" in args:
                return False, f"tool_call[{i}].function.arguments 不应该包含 description 字段"
                
        except json.JSONDecodeError:
            return False, f"tool_call[{i}].function.arguments 不是有效的 JSON 字符串"
    
    return True, "格式正确"

def main():
    """主函数"""
    if len(sys.argv) != 2:
        print("使用方法: python test_fixed_request.py <fixed_file>")
        print("示例: python test_fixed_request.py debug/body_fixed.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    try:
        # 读取修复后的请求体
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 提取请求体
        if "requestBody" in data:
            request_body = data["requestBody"]
        else:
            request_body = data
        
        print(f"🔍 验证文件: {input_file}")
        print("=" * 50)
        
        # 检查 messages 字段
        if "messages" not in request_body:
            print("❌ 错误: 请求体缺少 messages 字段")
            sys.exit(1)
        
        messages = request_body["messages"]
        print(f"✅ 找到 {len(messages)} 条消息")
        
        # 检查每个 assistant 消息的 tool_calls
        tool_calls_count = 0
        for i, message in enumerate(messages):
            if message.get("role") == "assistant" and "tool_calls" in message:
                tool_calls_count += 1
                print(f"\n📋 检查第 {i+1} 条 assistant 消息的 tool_calls:")
                
                is_valid, error_msg = validate_tool_calls(message["tool_calls"])
                if is_valid:
                    print(f"✅ tool_calls 格式正确 ({len(message['tool_calls'])} 个工具调用)")
                    
                    # 显示工具调用详情
                    for j, tool_call in enumerate(message["tool_calls"]):
                        function = tool_call["function"]
                        print(f"   🔧 {j+1}. {function['name']} - {function['arguments']}")
                else:
                    print(f"❌ tool_calls 格式错误: {error_msg}")
                    sys.exit(1)
        
        if tool_calls_count == 0:
            print("⚠️  警告: 没有找到包含 tool_calls 的 assistant 消息")
        else:
            print(f"\n🎉 验证完成！所有 {tool_calls_count} 个 tool_calls 格式都正确")
            print("\n🚀 修复后的请求体可以安全发送了！")
        
    except FileNotFoundError:
        print(f"❌ 错误: 找不到文件 {input_file}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ 错误: JSON 格式错误 - {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 错误: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 