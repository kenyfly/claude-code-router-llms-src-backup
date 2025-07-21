#!/usr/bin/env python3
"""
测试反斜杠是否会导致JSON格式问题
验证用户的假设是否正确
"""

import json
import sys

def test_json_with_backslashes():
    """测试包含反斜杠的JSON内容"""
    
    print("🧪 测试反斜杠对JSON格式的影响")
    print("=" * 50)
    
    # 测试用例1：正常的反斜杠
    test_cases = [
        {
            "name": "正常反斜杠",
            "content": "venv\\Scripts\\activate"
        },
        {
            "name": "双反斜杠",
            "content": "venv\\\\Scripts\\\\activate"
        },
        {
            "name": "混合反斜杠",
            "content": "venv\\Scripts\\\\activate"
        },
        {
            "name": "包含特殊字符",
            "content": "venv\\\\Scripts\\\\activate # Windows"
        }
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n📋 测试用例 {i}: {test_case['name']}")
        print(f"📝 内容: {test_case['content']}")
        
        # 创建包含该内容的JSON
        test_json = {
            "role": "tool",
            "content": test_case['content'],
            "name": "test_tool"
        }
        
        try:
            # 尝试序列化
            json_str = json.dumps(test_json, ensure_ascii=False)
            print(f"✅ JSON序列化成功")
            print(f"📄 JSON字符串: {json_str}")
            
            # 尝试反序列化
            parsed_json = json.loads(json_str)
            print(f"✅ JSON反序列化成功")
            print(f"📄 解析结果: {parsed_json['content']}")
            
        except Exception as e:
            print(f"❌ JSON处理失败: {e}")
        
        print("-" * 30)

def test_actual_content():
    """测试实际的请求体内容"""
    
    print("\n🔍 测试实际请求体中的反斜杠内容")
    print("=" * 50)
    
    # 从实际内容中提取包含反斜杠的部分
    actual_content = """name:\tkenyfly/luogu
description:\t
--
# Luogu Crawler - 企业级插件化爬虫框架

[![Python](https://img.shields.io/badge/Python-3.12%2B-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Architecture](https://img.shields.io/badge/Architecture-Plugin%20Based-orange.svg)](docs/PROJECT_ARCHITECTURE.md)

一个基于插件架构的高性能、可扩展的爬虫框架，专门用于从洛谷（Luogu）平台抓取数据。项目采用企业级设计模式，实现了完全的模块化和可扩展性。

## ✨ 特性

- **🔌 插件化架构** - 所有功能都以插件形式存在，易于扩展和维护
- **🚀 高性能** - 支持并发爬取，内置连接池和智能重试机制
- **📦 模块化设计** - 清晰的分层架构，高内聚低耦合
- **🛡️ 健壮性** - 完善的错误处理、断点续传和监控告警
- **🔧 易于扩展** - 添加新平台或功能只需创建新插件
- **📊 数据持久化** - 支持 MongoDB 存储，易于切换其他存储方案

## 🏗️ 架构概览

项目采用三层架构设计：

```
├── 应用引导层 (cli.py)         # 负责启动和初始化
├── 核心框架层 (src/core)       # 定义接口和契约
└── 插件生态层 (src/plugins)    # 实现具体功能
    ├── 系统插件 (sys_*)        # HTTP客户端、存储、日志等
    ├── 平台插件 (platform_*)   # 洛谷等平台的爬虫实现
    └── 入口插件 (entrypoint_*) # CLI命令等应用入口
```

## 📦 核心插件

### 系统基础设施插件
- **sys_http_client** - HTTP 客户端，支持连接池、超时控制
- **sys_storage_mongodb** - MongoDB 数据存储
- **sys_log_service** - 企业级日志服务
- **sys_concurrency_service** - 并发控制服务
- **sys_error_recovery** - 错误恢复和重试机制
- **sys_monitoring** - 系统监控和告警
- **sys_workflow_engine** - 工作流引擎

### 平台插件
- **platform_luogu** - 洛谷平台爬虫，支持题目、题解、题目列表

### 入口插件
- **entrypoint_cli** - CLI 命令行接口

## 🚀 快速开始

### 环境要求
- Python 3.12+
- MongoDB 4.0+
- 虚拟环境（推荐）

### 安装

```bash
# 克隆项目
git clone https://github.com/yourusername/luogu-crawler.git
cd luogu-crawler

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv\\\\Scripts\\\\activate  # Windows

# 安装依赖
pip install -r requirements.txt
```"""
    
    print(f"📏 内容长度: {len(actual_content)} 字符")
    
    # 查找反斜杠
    backslash_count = actual_content.count('\\')
    print(f"🔧 反斜杠数量: {backslash_count}")
    
    if backslash_count > 0:
        # 找到反斜杠的位置
        lines = actual_content.split('\n')
        for i, line in enumerate(lines):
            if '\\' in line:
                print(f"📍 第 {i+1} 行包含反斜杠: {line}")
    
    # 测试JSON序列化
    test_json = {
        "role": "tool",
        "content": actual_content,
        "name": "test_tool"
    }
    
    try:
        json_str = json.dumps(test_json, ensure_ascii=False)
        print(f"✅ 实际内容JSON序列化成功")
        print(f"📏 JSON字符串长度: {len(json_str)} 字符")
        
        # 测试反序列化
        parsed_json = json.loads(json_str)
        print(f"✅ 实际内容JSON反序列化成功")
        
    except Exception as e:
        print(f"❌ 实际内容JSON处理失败: {e}")

def test_escape_sequences():
    """测试转义序列"""
    
    print("\n🔍 测试转义序列")
    print("=" * 50)
    
    # 测试各种转义序列
    escape_tests = [
        r"\\n",  # 换行符
        r"\\t",  # 制表符
        r"\\r",  # 回车符
        r"\\\\", # 双反斜杠
        r"\\\"", # 引号
        r"\\'",  # 单引号
    ]
    
    for escape_seq in escape_tests:
        print(f"📝 测试转义序列: {escape_seq}")
        
        test_json = {
            "content": f"test{escape_seq}content"
        }
        
        try:
            json_str = json.dumps(test_json, ensure_ascii=False)
            print(f"✅ 序列化成功: {json_str}")
            
            parsed = json.loads(json_str)
            print(f"✅ 反序列化成功: {parsed['content']}")
            
        except Exception as e:
            print(f"❌ 失败: {e}")
        
        print("-" * 20)

def main():
    """主函数"""
    print("🚀 开始JSON反斜杠测试")
    
    # 测试基本反斜杠
    test_json_with_backslashes()
    
    # 测试实际内容
    test_actual_content()
    
    # 测试转义序列
    test_escape_sequences()
    
    print("\n" + "=" * 50)
    print("📊 测试总结:")
    print("✅ 反斜杠本身不会导致JSON格式错误")
    print("✅ JSON库会自动处理转义")
    print("❓ 问题可能在于服务器端的解析逻辑")
    print("💡 建议：检查服务器是否正确处理转义字符")

if __name__ == "__main__":
    main() 