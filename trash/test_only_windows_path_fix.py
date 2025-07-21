#!/usr/bin/env python3
"""
只修复Windows路径，测试是否是这个具体问题
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

def fix_only_windows_path(content):
    """只修复Windows路径问题"""
    if not content:
        return content
    
    # 只修复Windows路径
    # 将 venv\\\\Scripts\\\\activate 替换为 venv/Scripts/activate
    content = content.replace('venv\\\\Scripts\\\\activate', 'venv/Scripts/activate')
    
    return content

def main():
    """主函数"""
    if len(sys.argv) != 2:
        print("使用方法: python3 test_only_windows_path_fix.py <input_file>")
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
        
        # 创建新的消息列表
        fixed_messages = messages.copy()
        
        # 修复最后一个tool消息
        last_message = fixed_messages[last_tool_index].copy()
        original_content = last_message.get("content", "")
        
        print(f"🔧 修复消息索引 {last_tool_index}")
        print(f"📏 原始长度: {len(original_content)} 字符")
        
        # 检查是否包含Windows路径
        if 'venv\\\\Scripts\\\\activate' in original_content:
            print("📍 发现Windows路径问题")
        else:
            print("⚠️  未发现Windows路径问题")
        
        # 修复内容
        fixed_content = fix_only_windows_path(original_content)
        
        print(f"📏 修复后长度: {len(fixed_content)} 字符")
        print(f"📉 减少: {len(original_content) - len(fixed_content)} 字符")
        
        # 更新消息
        last_message["content"] = fixed_content
        fixed_messages[last_tool_index] = last_message
        
        # 更新请求体
        if "requestBody" in request_body and "messages" in request_body["requestBody"]:
            request_body["requestBody"]["messages"] = fixed_messages
        elif "messages" in request_body:
            request_body["messages"] = fixed_messages
        
        # 生成输出文件名
        output_file = input_file.replace('.json', '_windows_path_fixed.json')
        
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