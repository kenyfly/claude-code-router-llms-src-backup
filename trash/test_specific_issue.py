#!/usr/bin/env python3
"""
专门测试那个具体的Windows路径问题
"""

import json
import sys

def test_specific_windows_path():
    """测试具体的Windows路径"""
    
    print("🔍 测试具体的Windows路径问题")
    print("=" * 50)
    
    # 从实际内容中提取的那一行
    problematic_line = "venv\\\\Scripts\\\\activate  # Windows"
    
    print(f"📝 问题行: {problematic_line}")
    print(f"📏 长度: {len(problematic_line)} 字符")
    print(f"🔧 反斜杠数量: {problematic_line.count('\\')}")
    
    # 测试不同的处理方式
    test_cases = [
        {
            "name": "原始内容",
            "content": problematic_line
        },
        {
            "name": "替换为单反斜杠",
            "content": problematic_line.replace('\\\\', '\\')
        },
        {
            "name": "替换为正斜杠",
            "content": problematic_line.replace('\\\\', '/')
        },
        {
            "name": "移除注释",
            "content": problematic_line.split('#')[0].strip()
        },
        {
            "name": "完全清理",
            "content": problematic_line.replace('\\\\', '/').split('#')[0].strip()
        }
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n📋 测试用例 {i}: {test_case['name']}")
        print(f"📝 内容: {test_case['content']}")
        
        # 创建完整的消息结构
        message = {
            "role": "tool",
            "content": f"name:\tkenyfly/luogu\ndescription:\t\n--\n# Test\n\n{test_case['content']}",
            "name": "test_tool"
        }
        
        try:
            # 测试JSON序列化
            json_str = json.dumps(message, ensure_ascii=False)
            print(f"✅ JSON序列化成功")
            print(f"📏 JSON长度: {len(json_str)} 字符")
            
            # 测试JSON反序列化
            parsed = json.loads(json_str)
            print(f"✅ JSON反序列化成功")
            
            # 测试HTTP请求模拟
            request_body = {
                "model": "gemini-2.5-pro",
                "messages": [message],
                "stream": False,
                "max_tokens": 1000,
                "temperature": 0.7
            }
            
            full_json = json.dumps(request_body, ensure_ascii=False)
            print(f"✅ 完整请求体JSON序列化成功")
            print(f"📏 完整请求体长度: {len(full_json)} 字符")
            
        except Exception as e:
            print(f"❌ 失败: {e}")
        
        print("-" * 30)

def test_original_vs_fixed():
    """对比原始内容和修复后的内容"""
    
    print("\n🔄 对比原始内容和修复后的内容")
    print("=" * 50)
    
    # 原始内容（包含问题行）
    original_content = """name:\tkenyfly/luogu
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
    
    # 修复后的内容
    fixed_content = """name: kenyfly/luogu
description: 
--
Luogu Crawler - 企业级插件化爬虫框架

Python
License
Architecture

一个基于插件架构的高性能、可扩展的爬虫框架，专门用于从洛谷（Luogu）平台抓取数据。项目采用企业级设计模式，实现了完全的模块化和可扩展性。

特性

- 插件化架构 - 所有功能都以插件形式存在，易于扩展和维护
- 高性能 - 支持并发爬取，内置连接池和智能重试机制
- 模块化设计 - 清晰的分层架构，高内聚低耦合
- 健壮性 - 完善的错误处理、断点续传和监控告警
- 易于扩展 - 添加新平台或功能只需创建新插件
- 数据持久化 - 支持 MongoDB 存储，易于切换其他存储方案

架构概览

项目采用三层架构设计：

应用引导层 (cli.py)         # 负责启动和初始化
核心框架层 (src/core)       # 定义接口和契约
插件生态层 (src/plugins)    # 实现具体功能
    系统插件 (sys_*)        # HTTP客户端、存储、日志等
    平台插件 (platform_*)   # 洛谷等平台的爬虫实现
    入口插件 (entrypoint_*) # CLI命令等应用入口

核心插件

系统基础设施插件
- sys_http_client - HTTP 客户端，支持连接池、超时控制
- sys_storage_mongodb - MongoDB 数据存储
- sys_log_service - 企业级日志服务
- sys_concurrency_service - 并发控制服务
- sys_error_recovery - 错误恢复和重试机制
- sys_monitoring - 系统监控和告警
- sys_workflow_engine - 工作流引擎

平台插件
- platform_luogu - 洛谷平台爬虫，支持题目、题解、题目列表

入口插件
- entrypoint_cli - CLI 命令行接口

快速开始

环境要求
- Python 3.12+
- MongoDB 4.0+
- 虚拟环境（推荐）

安装

克隆项目
git clone https://github.com/yourusername/luogu-crawler.git
cd luogu-crawler

创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或
venv/Scripts/activate  # Windows

安装依赖
pip install -r requirements.txt"""
    
    print(f"📏 原始内容长度: {len(original_content)} 字符")
    print(f"📏 修复后内容长度: {len(fixed_content)} 字符")
    print(f"📉 减少: {len(original_content) - len(fixed_content)} 字符")
    
    # 测试原始内容
    print(f"\n🔍 测试原始内容:")
    try:
        original_message = {
            "role": "tool",
            "content": original_content,
            "name": "test_tool"
        }
        original_json = json.dumps(original_message, ensure_ascii=False)
        print(f"✅ 原始内容JSON序列化成功")
        print(f"📏 原始JSON长度: {len(original_json)} 字符")
    except Exception as e:
        print(f"❌ 原始内容失败: {e}")
    
    # 测试修复后内容
    print(f"\n🔍 测试修复后内容:")
    try:
        fixed_message = {
            "role": "tool",
            "content": fixed_content,
            "name": "test_tool"
        }
        fixed_json = json.dumps(fixed_message, ensure_ascii=False)
        print(f"✅ 修复后内容JSON序列化成功")
        print(f"📏 修复后JSON长度: {len(fixed_json)} 字符")
    except Exception as e:
        print(f"❌ 修复后内容失败: {e}")

def main():
    """主函数"""
    print("🚀 开始具体问题测试")
    
    # 测试具体的Windows路径
    test_specific_windows_path()
    
    # 对比原始内容和修复后内容
    test_original_vs_fixed()
    
    print("\n" + "=" * 50)
    print("📊 结论:")
    print("✅ JSON格式本身没有问题")
    print("❓ 问题可能在于:")
    print("   1. 服务器端的特殊字符处理")
    print("   2. 特定的转义序列组合")
    print("   3. 内容长度或复杂度")
    print("💡 建议：逐个移除可疑内容进行测试")

if __name__ == "__main__":
    main() 