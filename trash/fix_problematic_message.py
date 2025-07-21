#!/usr/bin/env python3
"""
修复导致500错误的问题消息
主要处理过长的tool消息内容
"""

import json
import sys
from typing import Dict, Any, List

def truncate_tool_message(content: str, max_length: int = 500) -> str:
    """
    截断过长的tool消息内容
    
    Args:
        content: 原始内容
        max_length: 最大长度限制
        
    Returns:
        截断后的内容
    """
    if len(content) <= max_length:
        return content
    
    # 如果是工具调用结果，保留关键信息
    if content.startswith("name:"):
        lines = content.split('\n')
        if len(lines) >= 2:
            # 保留工具名称和简短描述
            name_line = lines[0]
            description_line = lines[1]
            
            # 如果描述行太长，截断它
            if len(description_line) > max_length - len(name_line) - 10:
                description_line = description_line[:max_length - len(name_line) - 13] + "..."
            
            return f"{name_line}\n{description_line}\n[内容已截断]"
    
    # 对于其他内容，直接截断
    return content[:max_length-3] + "..."

def clean_tool_message(message: Dict[str, Any]) -> Dict[str, Any]:
    """
    清理单个tool消息
    
    Args:
        message: 原始消息
        
    Returns:
        清理后的消息
    """
    if message.get("role") == "tool" and "content" in message:
        content = message["content"]
        
        # 检查内容是否过长或包含问题字符
        if len(content) > 500 or "![Python]" in content or "![License]" in content:
            message["content"] = truncate_tool_message(content)
            print(f"⚠️  已截断过长的tool消息，原始长度: {len(content)}")
    
    return message

def find_messages_in_json(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    递归查找JSON中的messages字段
    
    Args:
        data: JSON数据
        
    Returns:
        找到的messages列表，如果没找到返回空列表
    """
    if isinstance(data, dict):
        # 直接查找messages字段
        if "messages" in data and isinstance(data["messages"], list):
            return data["messages"]
        
        # 递归查找嵌套的messages字段
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

def fix_problematic_messages(request_body: Dict[str, Any]) -> Dict[str, Any]:
    """
    修复请求体中的问题消息
    
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
    
    fixed_messages = []
    problematic_count = 0
    
    for i, message in enumerate(messages):
        original_content = message.get("content", "")
        
        # 检查是否是问题消息
        if (message.get("role") == "tool" and 
            len(original_content) > 500):
            problematic_count += 1
            print(f"🔍 发现第 {i+1} 个问题消息，长度: {len(original_content)}")
        
        # 清理消息
        cleaned_message = clean_tool_message(message)
        fixed_messages.append(cleaned_message)
    
    # 更新messages字段
    if "requestBody" in request_body and "messages" in request_body["requestBody"]:
        request_body["requestBody"]["messages"] = fixed_messages
    elif "messages" in request_body:
        request_body["messages"] = fixed_messages
    
    if problematic_count > 0:
        print(f"✅ 已修复 {problematic_count} 个问题消息")
    
    return request_body

def main():
    """主函数"""
    if len(sys.argv) != 2:
        print("使用方法: python3 fix_problematic_message.py <input_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = input_file.replace('.json', '_cleaned.json')
    
    try:
        # 读取原始文件
        with open(input_file, 'r', encoding='utf-8') as f:
            request_body = json.load(f)
        
        print(f"📖 读取文件: {input_file}")
        
        # 查找messages字段
        messages = find_messages_in_json(request_body)
        print(f"📊 找到消息数量: {len(messages)}")
        
        # 修复问题消息
        fixed_body = fix_problematic_messages(request_body)
        
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