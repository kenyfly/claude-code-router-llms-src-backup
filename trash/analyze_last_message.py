#!/usr/bin/env python3
"""
详细分析最后一个消息的内容
找出可能导致500错误的具体原因
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

def analyze_content(content: str) -> Dict[str, Any]:
    """
    详细分析消息内容
    
    Args:
        content: 消息内容
        
    Returns:
        分析结果
    """
    analysis = {
        "length": len(content),
        "lines": len(content.split('\n')),
        "special_chars": {},
        "potential_issues": [],
        "content_preview": content[:200] + "..." if len(content) > 200 else content
    }
    
    # 检查特殊字符
    special_chars = {
        '\\t': content.count('\t'),
        '\\n': content.count('\n'),
        '\\r': content.count('\r'),
        '\\\\': content.count('\\\\'),
        '%': content.count('%'),
        '&': content.count('&'),
        '<': content.count('<'),
        '>': content.count('>'),
        '"': content.count('"'),
        "'": content.count("'"),
        '[': content.count('['),
        ']': content.count(']'),
        '(': content.count('('),
        ')': content.count(')'),
        '{': content.count('{'),
        '}': content.count('}'),
        '!': content.count('!'),
        '#': content.count('#'),
        '*': content.count('*'),
        '_': content.count('_'),
        '`': content.count('`'),
        '|': content.count('|'),
        '~': content.count('~'),
        '^': content.count('^'),
        '+': content.count('+'),
        '=': content.count('='),
        '@': content.count('@'),
        '$': content.count('$'),
        ';': content.count(';'),
        ':': content.count(':'),
        ',': content.count(','),
        '.': content.count('.'),
        '?': content.count('?'),
        '/': content.count('/'),
        '\\': content.count('\\'),
    }
    
    analysis["special_chars"] = {k: v for k, v in special_chars.items() if v > 0}
    
    # 检查潜在问题
    issues = []
    
    # 1. 检查URL格式
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    urls = re.findall(url_pattern, content)
    if urls:
        analysis["urls"] = urls
        issues.append(f"包含 {len(urls)} 个URL")
    
    # 2. 检查Markdown链接格式
    md_link_pattern = r'\[([^\]]+)\]\(([^)]+)\)'
    md_links = re.findall(md_link_pattern, content)
    if md_links:
        analysis["markdown_links"] = md_links
        issues.append(f"包含 {len(md_links)} 个Markdown链接")
    
    # 3. 检查转义字符
    escape_pattern = r'\\[^\\]'
    escapes = re.findall(escape_pattern, content)
    if escapes:
        analysis["escape_sequences"] = escapes
        issues.append(f"包含 {len(escapes)} 个转义序列")
    
    # 4. 检查特殊格式
    if content.startswith("name:\t"):
        issues.append("使用制表符分隔的格式")
    
    if "![Python]" in content:
        issues.append("包含Markdown图片语法")
    
    if "\\\\" in content:
        issues.append("包含双反斜杠")
    
    if "%2B" in content:
        issues.append("包含URL编码字符")
    
    # 5. 检查内容结构
    lines = content.split('\n')
    if len(lines) > 50:
        issues.append("内容行数过多")
    
    # 6. 检查中文字符
    chinese_chars = re.findall(r'[\u4e00-\u9fff]', content)
    if chinese_chars:
        analysis["chinese_chars_count"] = len(chinese_chars)
        issues.append(f"包含 {len(chinese_chars)} 个中文字符")
    
    # 7. 检查特殊符号组合
    if "![Python](https://img.shields.io/badge/Python-3.12%2B-blue.svg)" in content:
        issues.append("包含复杂的Markdown徽章语法")
    
    if "venv\\\\Scripts\\\\activate" in content:
        issues.append("包含Windows路径格式")
    
    analysis["potential_issues"] = issues
    
    return analysis

def analyze_last_tool_message(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    分析最后一个tool消息
    
    Args:
        messages: 消息列表
        
    Returns:
        分析结果
    """
    if not messages:
        return {"error": "没有找到消息"}
    
    # 找到最后一个tool消息
    last_tool_index = -1
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].get("role") == "tool":
            last_tool_index = i
            break
    
    if last_tool_index == -1:
        return {"error": "没有找到tool消息"}
    
    last_message = messages[last_tool_index]
    content = last_message.get("content", "")
    
    analysis = {
        "message_index": last_tool_index,
        "message_role": last_message.get("role"),
        "tool_call_id": last_message.get("tool_call_id"),
        "name": last_message.get("name"),
        "content_analysis": analyze_content(content)
    }
    
    return analysis

def main():
    """主函数"""
    if len(sys.argv) != 2:
        print("使用方法: python3 analyze_last_message.py <input_file>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    try:
        # 读取文件
        with open(input_file, 'r', encoding='utf-8') as f:
            request_body = json.load(f)
        
        print(f"📖 分析文件: {input_file}")
        
        # 查找messages字段
        messages = find_messages_in_json(request_body)
        
        if not messages:
            print("⚠️  未找到messages字段")
            return
        
        print(f"📊 找到消息数量: {len(messages)}")
        
        # 分析最后一个tool消息
        analysis = analyze_last_tool_message(messages)
        
        if "error" in analysis:
            print(f"❌ {analysis['error']}")
            return
        
        # 输出分析结果
        print("\n" + "="*60)
        print("🔍 最后一个Tool消息详细分析")
        print("="*60)
        
        print(f"📋 消息索引: {analysis['message_index']}")
        print(f"📋 消息角色: {analysis['message_role']}")
        print(f"📋 工具调用ID: {analysis['tool_call_id']}")
        print(f"📋 工具名称: {analysis['name']}")
        
        content_analysis = analysis['content_analysis']
        print(f"\n📊 内容统计:")
        print(f"   - 总长度: {content_analysis['length']} 字符")
        print(f"   - 总行数: {content_analysis['lines']} 行")
        
        if content_analysis['chinese_chars_count']:
            print(f"   - 中文字符: {content_analysis['chinese_chars_count']} 个")
        
        print(f"\n🔧 特殊字符统计:")
        for char, count in content_analysis['special_chars'].items():
            print(f"   - {char}: {count} 个")
        
        print(f"\n⚠️  潜在问题:")
        for issue in content_analysis['potential_issues']:
            print(f"   - {issue}")
        
        if 'urls' in content_analysis:
            print(f"\n🔗 发现的URL:")
            for url in content_analysis['urls'][:3]:  # 只显示前3个
                print(f"   - {url}")
            if len(content_analysis['urls']) > 3:
                print(f"   - ... 还有 {len(content_analysis['urls']) - 3} 个URL")
        
        if 'markdown_links' in content_analysis:
            print(f"\n📝 Markdown链接:")
            for text, url in content_analysis['markdown_links'][:3]:  # 只显示前3个
                print(f"   - [{text}]({url})")
            if len(content_analysis['markdown_links']) > 3:
                print(f"   - ... 还有 {len(content_analysis['markdown_links']) - 3} 个链接")
        
        print(f"\n📄 内容预览:")
        print(f"   {content_analysis['content_preview']}")
        
        print("\n" + "="*60)
        print("💡 建议:")
        
        # 根据分析结果给出建议
        if content_analysis['length'] > 1000:
            print("   - 内容过长，考虑截断")
        
        if 'urls' in content_analysis and len(content_analysis['urls']) > 5:
            print("   - URL数量过多，可能影响解析")
        
        if 'markdown_links' in content_analysis and len(content_analysis['markdown_links']) > 3:
            print("   - Markdown链接过多，可能影响格式")
        
        if "![Python]" in content_analysis['content_preview']:
            print("   - 包含Markdown图片语法，可能导致解析错误")
        
        if "\\\\" in content_analysis['content_preview']:
            print("   - 包含双反斜杠，可能导致转义问题")
        
        if "%2B" in content_analysis['content_preview']:
            print("   - 包含URL编码字符，可能导致解码问题")
        
        print("="*60)
        
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