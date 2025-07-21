#!/usr/bin/env python3
"""
专门测试URL中双斜杠是否导致转义字符混乱
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

def analyze_url_slashes(content):
    """分析URL中的斜杠问题"""
    print("🔍 分析URL中的斜杠问题")
    print("=" * 50)
    
    # 查找所有URL
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    urls = re.findall(url_pattern, content)
    
    print(f"📊 找到 {len(urls)} 个URL")
    
    slash_issues = []
    for i, url in enumerate(urls):
        # 计算斜杠数量
        slash_count = url.count('/')
        double_slash_count = url.count('//')
        
        print(f"🔗 URL {i+1}: {url}")
        print(f"   📏 总长度: {len(url)} 字符")
        print(f"   🔧 斜杠数量: {slash_count}")
        print(f"   🔧 双斜杠数量: {double_slash_count}")
        
        # 检查是否有问题
        if double_slash_count > 1:  # 除了协议部分的双斜杠
            print(f"   ⚠️  可能有问题: 包含多个双斜杠")
            slash_issues.append(url)
        elif slash_count > 5:
            print(f"   ⚠️  可能有问题: 斜杠数量过多")
            slash_issues.append(url)
        else:
            print(f"   ✅ 看起来正常")
        
        print()
    
    return slash_issues

def test_url_escape_sequences():
    """测试URL转义序列"""
    print("🧪 测试URL转义序列")
    print("=" * 50)
    
    # 测试各种URL格式
    test_urls = [
        "https://img.shields.io/badge/Python-3.12%2B-blue.svg",
        "https://www.python.org/",
        "https://img.shields.io/badge/License-MIT-green.svg",
        "https://img.shields.io/badge/Architecture-Plugin%20Based-orange.svg",
        "https://github.com/yourusername/luogu-crawler/issues",
        "https://github.com/yourusername/luogu-crawler.git"
    ]
    
    for url in test_urls:
        print(f"🔗 测试URL: {url}")
        
        # 创建包含该URL的消息
        test_message = {
            "role": "tool",
            "content": f"name: test\ndescription: test\n--\n{url}",
            "name": "test_tool"
        }
        
        try:
            # 测试JSON序列化
            json_str = json.dumps(test_message, ensure_ascii=False)
            print(f"   ✅ JSON序列化成功")
            
            # 测试JSON反序列化
            parsed = json.loads(json_str)
            print(f"   ✅ JSON反序列化成功")
            
            # 检查转义字符
            backslash_count = json_str.count('\\')
            if backslash_count > 0:
                print(f"   🔧 转义字符数量: {backslash_count}")
            
        except Exception as e:
            print(f"   ❌ 失败: {e}")
        
        print()

def fix_url_slashes(content):
    """修复URL中的斜杠问题"""
    if not content:
        return content
    
    print("🔧 修复URL中的斜杠问题")
    
    # 方法1: 简单替换，但保留协议部分
    # 先标记协议部分，然后替换其他双斜杠
    fixed_content = content
    
    # 保护协议部分
    fixed_content = fixed_content.replace('https://', 'HTTPS_PROTOCOL_PLACEHOLDER')
    fixed_content = fixed_content.replace('http://', 'HTTP_PROTOCOL_PLACEHOLDER')
    
    # 替换其他双斜杠
    fixed_content = fixed_content.replace('//', '/')
    
    # 恢复协议部分
    fixed_content = fixed_content.replace('HTTPS_PROTOCOL_PLACEHOLDER', 'https://')
    fixed_content = fixed_content.replace('HTTP_PROTOCOL_PLACEHOLDER', 'http://')
    
    return fixed_content

def main():
    """主函数"""
    if len(sys.argv) != 2:
        print("使用方法: python3 test_url_slashes.py <input_file>")
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
        
        print(f"🔧 分析消息索引 {last_tool_index}")
        print(f"📏 原始长度: {len(original_content)} 字符")
        
        # 分析URL中的斜杠问题
        slash_issues = analyze_url_slashes(original_content)
        
        # 测试URL转义序列
        test_url_escape_sequences()
        
        # 创建修复版本
        print("🛠️  创建修复版本")
        print("=" * 50)
        
        # 修复URL斜杠
        fixed_content = fix_url_slashes(original_content)
        
        print(f"📏 原始长度: {len(original_content)} 字符")
        print(f"📏 修复后长度: {len(fixed_content)} 字符")
        print(f"📉 减少: {len(original_content) - len(fixed_content)} 字符")
        
        # 创建修复后的消息
        fixed_messages = messages.copy()
        fixed_message = fixed_messages[last_tool_index].copy()
        fixed_message["content"] = fixed_content
        fixed_messages[last_tool_index] = fixed_message
        
        # 更新请求体
        if "requestBody" in request_body and "messages" in request_body["requestBody"]:
            request_body["requestBody"]["messages"] = fixed_messages
        elif "messages" in request_body:
            request_body["messages"] = fixed_messages
        
        # 生成输出文件名
        output_file = input_file.replace('.json', '_url_slashes_fixed.json')
        
        # 保存修复后的文件
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(request_body, f, ensure_ascii=False, indent=2)
        
        print(f"✅ 修复完成，保存到: {output_file}")
        
        # 显示关键信息
        if slash_issues:
            print(f"\n⚠️  发现 {len(slash_issues)} 个可能有问题的URL:")
            for url in slash_issues:
                print(f"   - {url}")
        else:
            print(f"\n✅ 未发现明显的URL斜杠问题")
        
        print(f"\n💡 建议:")
        print(f"   1. 测试修复后的文件是否解决问题")
        print(f"   2. 如果解决了，说明是URL斜杠导致的转义问题")
        print(f"   3. 如果没解决，说明问题在其他地方")
        
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