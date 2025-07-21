#!/usr/bin/env python3
"""
专门修复最后一个消息的问题
主要处理tool消息的格式问题
"""

import json
import sys
from typing import Dict, Any, List

def find_messages_in_json(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    递归查找JSON中的messages字段
    """
    if isinstance(data, dict):
        if "messages" in data and isinstance(data["messages"], list):
            return data["messages"]
        
        for key, value in data.items():
            if isinstance(value, dict):
                result = find_messages_in_json(value)
                if result:
                    return result
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        result = find_messages_in_json(item)
                        if result:
                            return result
    
    return []

def fix_last_tool_message(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    修复最后一个tool消息
    
    Args:
        messages: 消息列表
        
    Returns:
        修复后的消息列表
    """
    if not messages:
        return messages
    
    # 找到最后一个tool消息
    last_tool_index = -1
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].get("role") == "tool":
            last_tool_index = i
            break
    
    if last_tool_index == -1:
        print("⚠️  未找到tool消息")
        return messages
    
    print(f"🔍 找到最后一个tool消息，索引: {last_tool_index}")
    
    # 获取最后一个tool消息
    last_message = messages[last_tool_index]
    content = last_message.get("content", "")
    
    print(f"📊 原始内容长度: {len(content)}")
    
    # 检查内容格式
    if content.startswith("name:\tkenyfly/luogu"):
        print("🔧 检测到GitHub仓库信息，进行格式修复...")
        
        # 提取关键信息
        lines = content.split('\n')
        if len(lines) >= 2:
            name_line = lines[0]
            description_line = lines[1]
            
            # 创建简化的内容
            simplified_content = f"{name_line}\n{description_line}\n[仓库信息已简化]"
            
            # 更新消息内容
            messages[last_tool_index]["content"] = simplified_content
            
            print(f"✅ 已修复最后一个tool消息，新长度: {len(simplified_content)}")
        else:
            print("⚠️  内容格式不符合预期")
    else:
        print("ℹ️  最后一个tool消息内容正常")
    
    return messages

def fix_request_body(request_body: Dict[str, Any]) -> Dict[str, Any]:
    """
    修复请求体中的最后一个消息
    
    Args:
        request_body: 原始请求体
        
    Returns:
        修复后的请求体
    """
    # 查找messages字段
    messages = find_messages_in_json(request_body)
    
    if not messages:
        print("⚠️  未找到messages字段")
        return request_body
    
    print(f"📊 找到消息数量: {len(messages)}")
    
    # 修复最后一个tool消息
    fixed_messages = fix_last_tool_message(messages)
    
    # 更新messages字段
    if "requestBody" in request_body and "messages" in request_body["requestBody"]:
        request_body["requestBody"]["messages"] = fixed_messages
    elif "messages" in request_body:
        request_body["messages"] = fixed_messages
    
    return request_body

def main():
    """主函数"""
    if len(sys.argv) != 2:
        print("使用方法: python3 fix_last_message.py <input_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = input_file.replace('.json', '_last_fixed.json')
    
    try:
        # 读取原始文件
        with open(input_file, 'r', encoding='utf-8') as f:
            request_body = json.load(f)
        
        print(f"📖 读取文件: {input_file}")
        
        # 修复最后一个消息
        fixed_body = fix_request_body(request_body)
        
        # 保存修复后的文件
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(fixed_body, f, ensure_ascii=False, indent=2)
        
        print(f"💾 保存修复后的文件: {output_file}")
        
        # 计算文件大小变化
        import os
        original_size = os.path.getsize(input_file)
        fixed_size = os.path.getsize(output_file)
        size_diff = original_size - fixed_size
        
        print(f"📏 文件大小变化: {original_size} -> {fixed_size} ({size_diff:+d} bytes)")
        
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