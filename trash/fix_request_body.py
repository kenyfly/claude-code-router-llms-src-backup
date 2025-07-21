#!/usr/bin/env python3
"""
修复 OpenAI Chat Completions 请求体中的 tool_calls 格式问题
"""

import json
import sys
from typing import Dict, Any, List

def fix_tool_calls(tool_calls: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    修复 tool_calls 中的格式问题
    
    Args:
        tool_calls: 原始的 tool_calls 列表
        
    Returns:
        修复后的 tool_calls 列表
    """
    fixed_tool_calls = []
    
    for tool_call in tool_calls:
        # 提取原始数据
        call_id = tool_call.get("id", "")
        call_type = tool_call.get("type", "function")
        function_data = tool_call.get("function", {})
        
        # 修复函数名称（统一为小写）
        function_name = function_data.get("name", "").lower()
        
        # 修复参数格式
        original_args = function_data.get("arguments", "{}")
        
        # 如果参数是字符串，尝试解析为JSON
        if isinstance(original_args, str):
            try:
                args_dict = json.loads(original_args)
            except json.JSONDecodeError:
                # 如果解析失败，创建一个基本的参数结构
                args_dict = {}
        else:
            args_dict = original_args
        
        # 移除不应该作为参数的字段
        if "description" in args_dict:
            del args_dict["description"]
        
        # 重新构建修复后的 tool_call
        fixed_tool_call = {
            "id": call_id,
            "type": call_type,
            "function": {
                "name": function_name,
                "arguments": json.dumps(args_dict, ensure_ascii=False)
            }
        }
        
        fixed_tool_calls.append(fixed_tool_call)
    
    return fixed_tool_calls

def fix_request_body(request_body: Dict[str, Any]) -> Dict[str, Any]:
    """
    修复整个请求体
    
    Args:
        request_body: 原始请求体
        
    Returns:
        修复后的请求体
    """
    # 深拷贝请求体
    fixed_body = json.loads(json.dumps(request_body))
    
    # 遍历所有消息，修复 tool_calls
    if "messages" in fixed_body:
        for message in fixed_body["messages"]:
            if message.get("role") == "assistant" and "tool_calls" in message:
                message["tool_calls"] = fix_tool_calls(message["tool_calls"])
    
    return fixed_body

def main():
    """主函数"""
    if len(sys.argv) != 2:
        print("使用方法: python fix_request_body.py <input_file>")
        print("示例: python fix_request_body.py debug/body.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = input_file.replace('.json', '_fixed.json')
    
    try:
        # 读取原始请求体
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 提取请求体
        if "requestBody" in data:
            request_body = data["requestBody"]
        else:
            request_body = data
        
        # 修复请求体
        fixed_request_body = fix_request_body(request_body)
        
        # 如果原始数据有包装结构，保持包装结构
        if "requestBody" in data:
            fixed_data = data.copy()
            fixed_data["requestBody"] = fixed_request_body
        else:
            fixed_data = fixed_request_body
        
        # 保存修复后的请求体
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(fixed_data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ 请求体修复完成！")
        print(f"📁 原始文件: {input_file}")
        print(f"📁 修复文件: {output_file}")
        
        # 显示修复前后的对比
        print("\n🔍 修复前后对比:")
        print("=" * 50)
        
        # 找到第一个 tool_calls 进行对比
        original_tool_calls = None
        fixed_tool_calls = None
        
        if "requestBody" in data and "messages" in data["requestBody"]:
            for msg in data["requestBody"]["messages"]:
                if msg.get("role") == "assistant" and "tool_calls" in msg:
                    original_tool_calls = msg["tool_calls"]
                    break
        
        if "requestBody" in fixed_data and "messages" in fixed_data["requestBody"]:
            for msg in fixed_data["requestBody"]["messages"]:
                if msg.get("role") == "assistant" and "tool_calls" in msg:
                    fixed_tool_calls = msg["tool_calls"]
                    break
        
        if original_tool_calls and fixed_tool_calls:
            print("修复前:")
            print(json.dumps(original_tool_calls[0], indent=2, ensure_ascii=False))
            print("\n修复后:")
            print(json.dumps(fixed_tool_calls[0], indent=2, ensure_ascii=False))
        
        print("\n🚀 现在可以使用修复后的文件进行测试了！")
        
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