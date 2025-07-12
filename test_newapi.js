#!/usr/bin/env node

/**
 * NewAPI功能测试脚本
 * 用于验证Claude thinking模式和Gemini JSON Schema问题是否修复
 */

const fs = require('fs');
const path = require('path');

// 测试用的MCP工具定义（包含会导致错误的字段）
const testTools = [
  {
    type: "function",
    function: {
      name: "test_tool",
      description: "测试工具",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            const: "test_action",  // 这个会导致Gemini错误
            description: "动作类型"
          },
          mode: {
            type: "string", 
            enum: ["debug", "production"],
            default: "debug"
          }
        },
        required: ["action"],
        additionalProperties: false,  // 这个也会被清理
        $schema: "http://json-schema.org/draft-07/schema#"  // 这个也会被清理
      }
    }
  }
];

// 测试请求
const testRequest = {
  model: "claude-sonnet-4-20250514-thinking",  // thinking模式测试
  messages: [
    {
      role: "user",
      content: "请使用test_tool工具执行一个测试动作"
    }
  ],
  tools: testTools,
  temperature: 0.1,
  max_tokens: 1000,
  stream: false
};

async function testNewAPITransformer() {
  console.log('🧪 NewAPI 转换器测试');
  console.log('═══════════════════════════════════════');
  
  try {
    // 检查配置文件
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
      console.log('❌ 配置文件不存在');
      return;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const claudeProvider = config.providers?.find(p => p.name === 'zuke-claude');
    const geminiProvider = config.providers?.find(p => p.name === 'zuke-gemini');
    
    if (!claudeProvider && !geminiProvider) {
      console.log('❌ NewAPI提供商配置不存在');
      return;
    }
    
    console.log('✅ 配置文件检查通过');
    
    if (claudeProvider) {
      console.log('\n📍 Claude Provider:');
      console.log('   URL:', claudeProvider.api_base_url);
      console.log('   Key:', claudeProvider.api_key.slice(0, 15) + '...');
      console.log('   Models:', claudeProvider.models.join(', '));
    }
    
    if (geminiProvider) {
      console.log('\n📍 Gemini Provider:');
      console.log('   URL:', geminiProvider.api_base_url);
      console.log('   Key:', geminiProvider.api_key.slice(0, 15) + '...');
      console.log('   Models:', geminiProvider.models.join(', '));
    }
    
    // 发送测试请求
    console.log('\n🚀 发送测试请求...');
    console.log('🎯 测试目标:');
    console.log('  - Claude thinking模式参数自动添加');
    console.log('  - JSON Schema字段智能转换 (const → enum)');
    console.log('  - 无用字段清理');
    
    const response = await fetch('http://127.0.0.1:3456/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy-key'  // claude-code-router会处理认证
      },
             body: JSON.stringify({
         ...testRequest,
         model: `zuke-claude,${testRequest.model}`  // 指定使用zuke-claude提供商
       })
    });
    
    console.log('\n📡 响应状态:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ 请求成功！NewAPI转换器工作正常');
      console.log('💬 响应:', result.choices[0]?.message?.content?.slice(0, 200) + '...');
      
      if (result.choices[0]?.message?.tool_calls) {
        console.log('🔧 工具调用:', result.choices[0].message.tool_calls.length, '个');
      }
    } else {
      const errorText = await response.text();
      console.log('❌ 请求失败:', errorText);
      
      // 分析常见错误
      if (errorText.includes('thinking')) {
        console.log('🔍 可能是Claude thinking模式参数问题');
      }
      if (errorText.includes('const') || errorText.includes('Unknown name')) {
        console.log('🔍 可能是JSON Schema兼容性问题');
      }
    }
    
  } catch (error) {
    console.log('❌ 测试过程中出现错误:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 请确保claude-code-router服务正在运行:');
      console.log('   node dist/cli.js start');
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testNewAPITransformer();
}

module.exports = { testNewAPITransformer }; 