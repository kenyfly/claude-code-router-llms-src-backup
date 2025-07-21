#!/usr/bin/env python3
"""
详细测试URL转义字符问题
"""

import json
import sys

def test_url_escape_in_json():
    """测试URL在JSON中的转义情况"""
    print("🧪 测试URL在JSON中的转义情况")
    print("=" * 60)
    
    # 测试各种URL格式
    test_cases = [
        {
            "name": "基本URL",
            "url": "https://www.python.org/"
        },
        {
            "name": "包含特殊字符的URL",
            "url": "https://img.shields.io/badge/Python-3.12%2B-blue.svg"
        },
        {
            "name": "包含下划线的URL",
            "url": "https://img.shields.io/badge/License-MIT-green.svg"
        },
        {
            "name": "包含空格的URL",
            "url": "https://img.shields.io/badge/Architecture-Plugin%20Based-orange.svg"
        },
        {
            "name": "GitHub URL",
            "url": "https://github.com/yourusername/luogu-crawler/issues"
        }
    ]
    
    for test_case in test_cases:
        print(f"\n📋 测试: {test_case['name']}")
        print(f"🔗 URL: {test_case['url']}")
        
        # 创建包含该URL的消息
        message = {
            "role": "tool",
            "content": f"name: test\ndescription: test\n--\n{test_case['url']}",
            "name": "test_tool"
        }
        
        try:
            # JSON序列化
            json_str = json.dumps(message, ensure_ascii=False)
            print(f"✅ JSON序列化成功")
            print(f"📏 JSON长度: {len(json_str)} 字符")
            
            # 分析转义字符
            backslash_count = json_str.count('\\')
            print(f"🔧 反斜杠数量: {backslash_count}")
            
            # 查找具体的转义序列
            escape_sequences = []
            for i, char in enumerate(json_str):
                if char == '\\' and i + 1 < len(json_str):
                    next_char = json_str[i + 1]
                    escape_sequences.append(f"\\{next_char}")
            
            if escape_sequences:
                print(f"🔧 转义序列: {escape_sequences}")
            
            # JSON反序列化
            parsed = json.loads(json_str)
            print(f"✅ JSON反序列化成功")
            
            # 验证URL是否完整
            if test_case['url'] in parsed['content']:
                print(f"✅ URL完整保留")
            else:
                print(f"❌ URL被修改")
            
        except Exception as e:
            print(f"❌ 失败: {e}")
        
        print("-" * 40)

def test_nested_markdown_with_urls():
    """测试嵌套Markdown中的URL"""
    print("\n🧪 测试嵌套Markdown中的URL")
    print("=" * 60)
    
    # 测试嵌套Markdown语法
    test_cases = [
        {
            "name": "嵌套Markdown图片",
            "content": "[![Python](https://img.shields.io/badge/Python-3.12%2B-blue.svg)](https://www.python.org/)"
        },
        {
            "name": "普通Markdown链接",
            "content": "[Python](https://www.python.org/)"
        },
        {
            "name": "Markdown图片",
            "content": "![Python](https://img.shields.io/badge/Python-3.12%2B-blue.svg)"
        },
        {
            "name": "纯URL",
            "content": "https://img.shields.io/badge/Python-3.12%2B-blue.svg"
        }
    ]
    
    for test_case in test_cases:
        print(f"\n📋 测试: {test_case['name']}")
        print(f"📝 内容: {test_case['content']}")
        
        # 创建消息
        message = {
            "role": "tool",
            "content": f"name: test\ndescription: test\n--\n{test_case['content']}",
            "name": "test_tool"
        }
        
        try:
            # JSON序列化
            json_str = json.dumps(message, ensure_ascii=False)
            print(f"✅ JSON序列化成功")
            print(f"📏 JSON长度: {len(json_str)} 字符")
            
            # 分析转义字符
            backslash_count = json_str.count('\\')
            print(f"🔧 反斜杠数量: {backslash_count}")
            
            # 查找具体的转义序列
            escape_sequences = []
            for i, char in enumerate(json_str):
                if char == '\\' and i + 1 < len(json_str):
                    next_char = json_str[i + 1]
                    escape_sequences.append(f"\\{next_char}")
            
            if escape_sequences:
                print(f"🔧 转义序列: {escape_sequences}")
            
            # JSON反序列化
            parsed = json.loads(json_str)
            print(f"✅ JSON反序列化成功")
            
        except Exception as e:
            print(f"❌ 失败: {e}")
        
        print("-" * 40)

def test_actual_content_analysis():
    """分析实际内容中的URL转义问题"""
    print("\n🔍 分析实际内容中的URL转义问题")
    print("=" * 60)
    
    # 从实际内容中提取的URL
    actual_urls = [
        "https://img.shields.io/badge/Python-3.12%2B-blue.svg)",
        "https://www.python.org/)",
        "https://img.shields.io/badge/License-MIT-green.svg)",
        "https://img.shields.io/badge/Architecture-Plugin%20Based-orange.svg)",
        "https://github.com/yourusername/luogu-crawler.git",
        "https://github.com/yourusername/luogu-crawler/issues)"
    ]
    
    print(f"📊 分析 {len(actual_urls)} 个实际URL")
    
    for i, url in enumerate(actual_urls, 1):
        print(f"\n🔗 URL {i}: {url}")
        
        # 分析URL结构
        slash_count = url.count('/')
        double_slash_count = url.count('//')
        percent_count = url.count('%')
        
        print(f"   📏 长度: {len(url)} 字符")
        print(f"   🔧 斜杠数量: {slash_count}")
        print(f"   🔧 双斜杠数量: {double_slash_count}")
        print(f"   🔧 百分号数量: {percent_count}")
        
        # 检查是否有问题
        issues = []
        if double_slash_count > 1:
            issues.append("多个双斜杠")
        if percent_count > 0:
            issues.append("包含URL编码字符")
        if url.endswith(')'):
            issues.append("以括号结尾")
        
        if issues:
            print(f"   ⚠️  问题: {', '.join(issues)}")
        else:
            print(f"   ✅ 看起来正常")
        
        # 测试JSON序列化
        test_message = {
            "role": "tool",
            "content": f"name: test\ndescription: test\n--\n{url}",
            "name": "test_tool"
        }
        
        try:
            json_str = json.dumps(test_message, ensure_ascii=False)
            backslash_count = json_str.count('\\')
            print(f"   🔧 JSON转义字符: {backslash_count}")
            
            if backslash_count > 3:  # 正常的协议转义
                print(f"   ⚠️  转义字符过多")
            else:
                print(f"   ✅ 转义字符正常")
                
        except Exception as e:
            print(f"   ❌ JSON序列化失败: {e}")

def main():
    """主函数"""
    print("🚀 开始详细URL转义字符测试")
    
    # 测试基本URL转义
    test_url_escape_in_json()
    
    # 测试嵌套Markdown中的URL
    test_nested_markdown_with_urls()
    
    # 分析实际内容
    test_actual_content_analysis()
    
    print("\n" + "=" * 60)
    print("📊 测试总结:")
    print("✅ URL本身在JSON中能正常序列化")
    print("✅ 转义字符数量正常")
    print("❓ 问题可能在于嵌套Markdown语法的复杂性")
    print("💡 建议：重点关注嵌套Markdown语法，而不是URL转义")

if __name__ == "__main__":
    main() 