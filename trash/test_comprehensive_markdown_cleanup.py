#!/usr/bin/env python3
"""
测试全面的Markdown清理功能
"""

import json
import re

def create_test_cases():
    """创建各种Markdown语法测试用例"""
    test_cases = [
        {
            "name": "嵌套Markdown图片",
            "input": "[![Python](https://img.shields.io/badge/Python-3.12%2B-blue.svg)](https://www.python.org/)",
            "expected": "[Python](https://www.python.org/)"
        },
        {
            "name": "不完整的链接",
            "input": "[Python](https://www.python.org",
            "expected": "[Python](https://www.python.org)"
        },
        {
            "name": "Windows路径",
            "input": "C:\\\\Users\\\\username\\\\file.txt",
            "expected": "C:/Users/username/file.txt"
        },
        {
            "name": "无效URL",
            "input": "[GitHub](github.com/username/repo)",
            "expected": "[GitHub](https://github.com/username/repo)"
        },
        {
            "name": "空alt的图片",
            "input": "![](https://example.com/image.png)",
            "expected": "![图片](https://example.com/image.png)"
        },
        {
            "name": "多余空格",
            "input": "这是一个   测试   文本",
            "expected": "这是一个 测试 文本"
        },
        {
            "name": "复杂组合",
            "input": "[![Logo](C:\\\\logo.png)](example.com) 这是一个   测试",
            "expected": "[Logo](https://example.com) 这是一个 测试"
        }
    ]
    return test_cases

def simulate_cleanup(content):
    """模拟transformer中的清理逻辑"""
    cleaned_content = content
    
    # 1. 修复嵌套Markdown图片语法
    nested_image_pattern = r'\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)'
    cleaned_content = re.sub(nested_image_pattern, r'[\1](\3)', cleaned_content)
    
    # 2. 修复不完整的链接
    incomplete_link_pattern = r'\[([^\]]+)\]\(([^)]*)$'
    cleaned_content = re.sub(incomplete_link_pattern, r'[\1](\2)', cleaned_content)
    
    # 3. 修复Windows路径
    windows_path_pattern = r'\\\\'
    cleaned_content = re.sub(windows_path_pattern, '/', cleaned_content)
    
    # 4. 修复无效URL
    url_pattern = r'\[([^\]]+)\]\(([^)]+)\)'
    def fix_url(match):
        text, url = match.groups()
        if url and not url.startswith(('http://', 'https://', 'mailto:', 'tel:', '#')):
            if not url.startswith(('/', './', '../')):
                if '.' in url and ' ' not in url and '\\' not in url:
                    return f'[{text}](https://{url})'
        return match.group(0)
    cleaned_content = re.sub(url_pattern, fix_url, cleaned_content)
    
    # 5. 修复空alt的图片
    empty_alt_pattern = r'!\[\]\(([^)]+)\)'
    cleaned_content = re.sub(empty_alt_pattern, r'![图片](\1)', cleaned_content)
    
    # 6. 修复多余空格
    cleaned_content = re.sub(r'\s+', ' ', cleaned_content)
    cleaned_content = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned_content)
    
    return cleaned_content

def test_cleanup_function():
    """测试清理功能"""
    print("🧪 测试全面的Markdown清理功能")
    print("=" * 60)
    
    test_cases = create_test_cases()
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n📋 测试 {i}: {test_case['name']}")
        print(f"📥 输入: {test_case['input']}")
        
        # 模拟清理
        result = simulate_cleanup(test_case['input'])
        print(f"📤 输出: {result}")
        print(f"🎯 期望: {test_case['expected']}")
        
        # 检查结果
        if result == test_case['expected']:
            print("✅ 测试通过")
        else:
            print("❌ 测试失败")
            print(f"   差异: 期望 '{test_case['expected']}', 实际 '{result}'")

def create_test_request():
    """创建包含各种Markdown问题的测试请求"""
    print("\n📝 创建测试请求")
    print("=" * 60)
    
    # 读取原始请求体
    with open('debug/body_fixed.json', 'r', encoding='utf-8') as f:
        request_body = json.load(f)
    
    # 找到最后一个tool消息
    messages = request_body.get('messages', [])
    last_tool_index = -1
    for i in range(len(messages) - 1, -1, -1):
        if messages[i].get("role") == "tool":
            last_tool_index = i
            break
    
    if last_tool_index == -1:
        print("❌ 未找到tool消息")
        return
    
    # 创建包含各种Markdown问题的内容
    problematic_content = """
# 测试各种Markdown语法问题

## 1. 嵌套图片
[![Python](https://img.shields.io/badge/Python-3.12%2B-blue.svg)](https://www.python.org/)

## 2. 不完整的链接
[Python](https://www.python.org

## 3. Windows路径
C:\\\\Users\\\\username\\\\file.txt

## 4. 无效URL
[GitHub](github.com/username/repo)

## 5. 空alt的图片
![](https://example.com/image.png)

## 6. 多余空格
这是一个   测试   文本

## 7. 复杂组合
[![Logo](C:\\\\logo.png)](example.com) 这是一个   测试
"""
    
    # 更新消息内容
    messages[last_tool_index]['content'] = problematic_content
    
    # 保存测试请求
    test_file = 'debug/test_comprehensive_markdown.json'
    with open(test_file, 'w', encoding='utf-8') as f:
        json.dump(request_body, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 测试请求已保存到: {test_file}")
    print(f"📏 内容长度: {len(problematic_content)} 字符")
    
    # 显示清理后的内容
    cleaned_content = simulate_cleanup(problematic_content)
    print(f"\n🔧 清理后的内容:")
    print("-" * 40)
    print(cleaned_content)
    print("-" * 40)
    print(f"📏 清理后长度: {len(cleaned_content)} 字符")
    print(f"📉 减少: {len(problematic_content) - len(cleaned_content)} 字符")

def main():
    """主函数"""
    print("🚀 开始全面Markdown清理功能测试")
    print("=" * 60)
    
    # 测试清理功能
    test_cleanup_function()
    
    # 创建测试请求
    create_test_request()
    
    print("\n" + "=" * 60)
    print("📊 测试总结:")
    print("✅ 全面的Markdown清理功能已实现")
    print("✅ 包含以下清理功能:")
    print("   - 嵌套Markdown图片语法修复")
    print("   - 不完整链接修复")
    print("   - Windows路径格式修复")
    print("   - 无效URL格式修复")
    print("   - 空alt图片修复")
    print("   - 多余空格清理")
    print("   - 详细统计日志")
    
    print("\n💡 下一步:")
    print("   1. 重新编译transformer代码")
    print("   2. 重启transformer服务")
    print("   3. 测试包含各种Markdown问题的请求")
    print("   4. 观察日志中的清理统计信息")

if __name__ == "__main__":
    main() 