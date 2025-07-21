#!/usr/bin/env python3
"""
增量排除测试
逐步移除可疑内容来找出真正的问题
"""

import json
import sys
import re

def find_messages_in_json(data):
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

def remove_nested_markdown_images(content):
    """移除嵌套的Markdown图片语法"""
    if not content:
        return content
    
    # 移除嵌套的Markdown图片语法 [![...](...)](...)
    nested_image_pattern = r'\[!\[([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\)'
    content = re.sub(nested_image_pattern, r'[\1](\3)', content)
    
    return content

def remove_all_markdown_links(content):
    """移除所有Markdown链接"""
    if not content:
        return content
    
    # 移除所有Markdown链接 [text](url)
    md_link_pattern = r'\[([^\]]+)\]\([^)]+\)'
    content = re.sub(md_link_pattern, r'\1', content)
    
    return content

def remove_markdown_badges(content):
    """移除Markdown徽章"""
    if not content:
        return content
    
    # 移除Markdown徽章 ![text](url)
    badge_pattern = r'!\[([^\]]+)\]\([^)]+\)'
    content = re.sub(badge_pattern, r'\1', content)
    
    return content

def remove_url_encoded_chars(content):
    """移除URL编码字符"""
    if not content:
        return content
    
    # 移除URL编码字符
    content = content.replace('%2B', '+')
    
    return content

def remove_windows_paths(content):
    """移除Windows路径"""
    if not content:
        return content
    
    # 移除Windows路径
    content = content.replace('venv\\\\Scripts\\\\activate', 'venv/Scripts/activate')
    
    return content

def create_test_case(content, name, fix_func):
    """创建测试用例"""
    fixed_content = fix_func(content)
    return {
        "name": name,
        "content": fixed_content,
        "original_length": len(content),
        "fixed_length": len(fixed_content),
        "reduction": len(content) - len(fixed_content)
    }

def main():
    """主函数"""
    if len(sys.argv) != 2:
        print("使用方法: python3 incremental_test.py <input_file>")
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
        
        # 找到最后一个tool消息
        last_tool_index = -1
        for i in range(len(messages) - 1, -1, -1):
            if messages[i].get("role") == "tool":
                last_tool_index = i
                break
        
        if last_tool_index == -1:
            print("⚠️  未找到tool消息")
            return
        
        original_message = messages[last_tool_index]
        original_content = original_message.get("content", "")
        
        print(f"🔧 测试消息索引 {last_tool_index}")
        print(f"📏 原始长度: {len(original_content)} 字符")
        
        # 定义测试用例
        test_cases = [
            ("只移除嵌套Markdown图片", remove_nested_markdown_images),
            ("移除所有Markdown链接", remove_all_markdown_links),
            ("移除Markdown徽章", remove_markdown_badges),
            ("移除URL编码字符", remove_url_encoded_chars),
            ("移除Windows路径", remove_windows_paths),
            ("移除嵌套图片+所有链接", lambda c: remove_all_markdown_links(remove_nested_markdown_images(c))),
            ("移除嵌套图片+徽章", lambda c: remove_markdown_badges(remove_nested_markdown_images(c))),
            ("移除嵌套图片+URL编码", lambda c: remove_url_encoded_chars(remove_nested_markdown_images(c))),
            ("移除嵌套图片+Windows路径", lambda c: remove_windows_paths(remove_nested_markdown_images(c))),
            ("移除所有Markdown语法", lambda c: remove_windows_paths(remove_url_encoded_chars(remove_markdown_badges(remove_all_markdown_links(remove_nested_markdown_images(c)))))),
        ]
        
        print(f"\n🧪 开始增量排除测试")
        print("=" * 60)
        
        for i, (name, fix_func) in enumerate(test_cases, 1):
            print(f"\n📋 测试用例 {i}: {name}")
            
            # 创建测试用例
            test_case = create_test_case(original_content, name, fix_func)
            
            print(f"📏 原始长度: {test_case['original_length']} 字符")
            print(f"📏 修复后长度: {test_case['fixed_length']} 字符")
            print(f"📉 减少: {test_case['reduction']} 字符")
            
            # 创建修复后的消息
            fixed_messages = messages.copy()
            fixed_message = fixed_messages[last_tool_index].copy()
            fixed_message["content"] = test_case["content"]
            fixed_messages[last_tool_index] = fixed_message
            
            # 更新请求体
            if "requestBody" in request_body and "messages" in request_body["requestBody"]:
                request_body["requestBody"]["messages"] = fixed_messages
            elif "messages" in request_body:
                request_body["messages"] = fixed_messages
            
            # 生成输出文件名
            output_file = f"debug/test_case_{i:02d}_{name.replace(' ', '_').replace('+', '_plus_')}.json"
            
            # 保存修复后的文件
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(request_body, f, ensure_ascii=False, indent=2)
            
            print(f"💾 保存到: {output_file}")
            
            # 显示关键信息
            if '嵌套Markdown图片' in name:
                if 'venv\\\\Scripts\\\\activate' in test_case["content"]:
                    print("⚠️  仍包含Windows路径")
                else:
                    print("✅ 已移除Windows路径")
                
                if '[![Python]' in test_case["content"]:
                    print("⚠️  仍包含嵌套Markdown图片")
                else:
                    print("✅ 已移除嵌套Markdown图片")
                
                if '%2B' in test_case["content"]:
                    print("⚠️  仍包含URL编码字符")
                else:
                    print("✅ 已移除URL编码字符")
            
            print("-" * 40)
        
        print(f"\n🎯 测试用例生成完成！")
        print(f"📁 所有测试文件保存在 debug/ 目录")
        print(f"🚀 现在可以逐个测试这些文件来找出真正的问题")
        
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