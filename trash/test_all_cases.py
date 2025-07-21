#!/usr/bin/env python3
"""
自动化测试所有生成的测试用例
"""

import os
import subprocess
import json
import time

def test_single_case(filename):
    """测试单个测试用例"""
    print(f"\n🧪 测试: {filename}")
    print("-" * 50)
    
    try:
        # 运行测试，使用相对路径
        result = subprocess.run([
            'node', '.test/test_zjcspace_request.js', filename
        ], capture_output=True, text=True, timeout=30, cwd=os.getcwd())
        
        # 分析结果
        if result.returncode == 0:
            # 查找响应状态
            if "响应状态: 200 OK" in result.stdout:
                print("✅ 成功 - 200 OK")
                return True, "200 OK"
            elif "响应状态: 500" in result.stdout:
                print("❌ 失败 - 500 错误")
                return False, "500 Error"
            else:
                print("❓ 未知状态")
                return False, "Unknown"
        else:
            print(f"❌ 执行失败: {result.stderr}")
            return False, "Execution Error"
            
    except subprocess.TimeoutExpired:
        print("⏰ 超时")
        return False, "Timeout"
    except Exception as e:
        print(f"❌ 异常: {e}")
        return False, "Exception"

def main():
    """主函数"""
    print("🚀 开始自动化测试所有测试用例")
    print("=" * 60)
    
    # 获取所有测试用例文件
    test_files = []
    debug_dir = "debug"
    
    for filename in os.listdir(debug_dir):
        if filename.startswith("test_case_") and filename.endswith(".json"):
            test_files.append(filename)  # 只使用文件名，不使用完整路径
    
    # 按文件名排序
    test_files.sort()
    
    print(f"📁 找到 {len(test_files)} 个测试用例")
    
    # 测试结果
    results = []
    
    # 逐个测试
    for i, test_file in enumerate(test_files, 1):
        print(f"\n📋 测试用例 {i}/{len(test_files)}")
        
        success, status = test_single_case(test_file)
        
        # 提取测试用例名称
        test_name = test_file.replace('.json', '')
        
        results.append({
            "file": test_file,
            "name": test_name,
            "success": success,
            "status": status
        })
        
        # 添加延迟避免请求过快
        time.sleep(1)
    
    # 输出总结
    print("\n" + "=" * 60)
    print("📊 测试结果总结")
    print("=" * 60)
    
    success_count = 0
    for result in results:
        status_icon = "✅" if result["success"] else "❌"
        print(f"{status_icon} {result['name']}: {result['status']}")
        if result["success"]:
            success_count += 1
    
    print(f"\n📈 成功率: {success_count}/{len(results)} ({success_count/len(results)*100:.1f}%)")
    
    # 找出成功的测试用例
    successful_cases = [r for r in results if r["success"]]
    if successful_cases:
        print(f"\n🎉 成功的测试用例:")
        for case in successful_cases:
            print(f"   ✅ {case['name']}")
        
        # 分析成功的模式
        print(f"\n🔍 成功模式分析:")
        for case in successful_cases:
            if "嵌套Markdown图片" in case['name']:
                print(f"   📝 移除嵌套Markdown图片有效")
            if "所有Markdown链接" in case['name']:
                print(f"   📝 移除所有Markdown链接有效")
            if "Markdown徽章" in case['name']:
                print(f"   📝 移除Markdown徽章有效")
            if "URL编码" in case['name']:
                print(f"   📝 移除URL编码字符有效")
            if "Windows路径" in case['name']:
                print(f"   📝 移除Windows路径有效")
    else:
        print(f"\n😞 没有成功的测试用例")
    
    # 保存测试结果
    with open("debug/test_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 详细结果已保存到: debug/test_results.json")

if __name__ == "__main__":
    main() 