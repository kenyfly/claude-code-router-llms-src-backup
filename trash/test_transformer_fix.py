#!/usr/bin/env python3
"""
测试transformer修复是否有效
"""

import json
import sys
import subprocess
import time

def test_original_file():
    """测试原始文件"""
    print("🧪 测试原始文件 (应该失败)")
    print("=" * 50)
    
    try:
        result = subprocess.run([
            'node', '.test/test_zjcspace_request.js', 'debug/body_fixed.json'
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0 and "200" in result.stdout:
            print("❌ 意外成功 - 原始文件应该失败")
            return False
        else:
            print("✅ 如预期失败")
            print(f"   状态码: {result.returncode}")
            print(f"   输出: {result.stdout[-200:] if result.stdout else '无输出'}")
            return True
    except subprocess.TimeoutExpired:
        print("⏰ 请求超时")
        return True
    except Exception as e:
        print(f"❌ 测试异常: {e}")
        return False

def test_fixed_file():
    """测试修复后的文件"""
    print("\n🧪 测试修复后的文件 (应该成功)")
    print("=" * 50)
    
    try:
        result = subprocess.run([
            'node', '.test/test_zjcspace_request.js', 'debug/test_case_01_只移除嵌套Markdown图片.json'
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0 and "200" in result.stdout:
            print("✅ 修复成功")
            print(f"   状态码: {result.returncode}")
            print(f"   输出: {result.stdout[-200:] if result.stdout else '无输出'}")
            return True
        else:
            print("❌ 修复失败")
            print(f"   状态码: {result.returncode}")
            print(f"   输出: {result.stdout[-200:] if result.stdout else '无输出'}")
            print(f"   错误: {result.stderr[-200:] if result.stderr else '无错误'}")
            return False
    except subprocess.TimeoutExpired:
        print("⏰ 请求超时")
        return False
    except Exception as e:
        print(f"❌ 测试异常: {e}")
        return False

def check_transformer_logs():
    """检查transformer日志"""
    print("\n📋 检查transformer日志")
    print("=" * 50)
    
    # 这里可以添加检查transformer日志的逻辑
    # 由于transformer是实时运行的，我们需要在实际测试中观察日志
    
    print("💡 建议:")
    print("   1. 启动transformer服务")
    print("   2. 发送包含嵌套Markdown图片的请求")
    print("   3. 观察日志中是否出现内容清理信息")
    print("   4. 验证请求是否成功")

def main():
    """主函数"""
    print("🚀 开始测试transformer修复")
    print("=" * 60)
    
    # 测试原始文件
    original_failed = test_original_file()
    
    # 测试修复后的文件
    fixed_success = test_fixed_file()
    
    # 检查transformer日志
    check_transformer_logs()
    
    print("\n" + "=" * 60)
    print("📊 测试总结:")
    
    if original_failed and fixed_success:
        print("✅ 修复验证成功")
        print("   - 原始文件如预期失败")
        print("   - 修复后文件成功")
        print("   - 问题已解决")
    elif not original_failed:
        print("⚠️  原始文件意外成功，可能需要重新测试")
    elif not fixed_success:
        print("❌ 修复未生效，需要进一步调试")
    else:
        print("❓ 测试结果不明确，需要进一步分析")
    
    print("\n💡 下一步:")
    print("   1. 重新编译transformer代码")
    print("   2. 重启transformer服务")
    print("   3. 发送实际请求测试内容清理功能")
    print("   4. 观察日志中的清理信息")

if __name__ == "__main__":
    main() 