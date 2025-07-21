#!/usr/bin/env python3
"""
专门修复Markdown语法问题
主要处理嵌套的Markdown图片语法和其他可能导致500错误的格式
"""

import json
import sys
import re
from typing import Dict, Any, List

def find_messages_in_json(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """递归查找JSON中的messages字段"""
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

def fix_markdown_content(content: str) -> str:
    """
    修复Markdown内容中的问题
    
    Args:
        content: 原始内容
        
    Returns:
        修复后的内容
    """
    if not content:
        return content
    
    # 1. 修复嵌套的Markdown图片语法
    # 将 [![...](...)](...) 简化为 [...](...)
    nested_image_pattern = r'\[!\[([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\)'
    content = re.sub(nested_image_pattern, r'[\1](\3)', content)
    
    # 2. 修复URL编码字符
    # 将 %2B 转换为 +
    content = content.replace('%2B', '+')
    
    # 3. 修复Windows路径格式
    # 将 \\\\ 转换为 /
    content = content.replace('\\\\', '/')
    
    # 4. 修复制表符分隔格式
    # 将 name:\t 转换为 name: 
    content = re.sub(r'name:\t', 'name: ', content)
    
    # 5. 移除或简化复杂的Markdown徽章
    # 将 ![Python](...) 简化为 Python
    badge_pattern = r'!\[([^\]]+)\]\([^)]+\)'
    content = re.sub(badge_pattern, r'\1', content)
    
    # 6. 简化Markdown链接
    # 将 [text](url) 简化为 text
    md_link_pattern = r'\[([^\]]+)\]\([^)]+\)'
    content = re.sub(md_link_pattern, r'\1', content)
    
    # 7. 移除过多的Markdown语法
    # 将 **text** 简化为 text
    content = re.sub(r'\*\*([^*]+)\*\*', r'\1', content)
    
    # 将 `text` 简化为 text
    content = re.sub(r'`([^`]+)`', r'\1', content)
    
    # 将 # 标题 简化为 标题
    content = re.sub(r'^#+\s*', '', content, flags=re.MULTILINE)
    
    return content

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
        return messages
    
    # 创建新的消息列表
    fixed_messages = messages.copy()
    
    # 修复最后一个tool消息
    last_message = fixed_messages[last_tool_index].copy()
    original_content = last_message.get("content", "")
    
    print(f"🔧 修复消息索引 {last_tool_index}")
    print(f"📏 原始长度: {len(original_content)} 字符")
    
    # 修复内容
    fixed_content = fix_markdown_content(original_content)
    
    print(f"📏 修复后长度: {len(fixed_content)} 字符")
    print(f"📉 减少: {len(original_content) - len(fixed_content)} 字符")
    
    # 更新消息
    last_message["content"] = fixed_content
    fixed_messages[last_tool_index] = last_message
    
    return fixed_messages

def main():
    """主函数"""
    if len(sys.argv) != 2:
        print("使用方法: python3 fix_markdown_issues.py <input_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    try:
        # 读取文件
        with open(input_file, 'r', encoding='utf-8') as f:
            request_body = json.load(f)
        
        print(f"📖 处理文件: {input_file}")
        
        # 查找messages字段
        messages = find_messages_in_json(request_body)
        
        if not messages:
            print("⚠️  未找到messages字段")
            return
        
        print(f"📊 找到消息数量: {len(messages)}")
        
        # 修复最后一个tool消息
        fixed_messages = fix_last_tool_message(messages)
        
        # 更新请求体
        if "requestBody" in request_body and "messages" in request_body["requestBody"]:
            request_body["requestBody"]["messages"] = fixed_messages
        elif "messages" in request_body:
            request_body["messages"] = fixed_messages
        
        # 生成输出文件名
        output_file = input_file.replace('.json', '_markdown_fixed.json')
        
        # 保存修复后的文件
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(request_body, f, ensure_ascii=False, indent=2)
        
        print(f"✅ 修复完成，保存到: {output_file}")
        
        # 显示修复效果
        original_size = len(json.dumps(request_body, ensure_ascii=False))
        print(f"📊 文件大小: {original_size} 字符")
        
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