#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');

// 配置
const CONFIG = {
  baseUrl: 'https://new.zjcspace.xyz/v1/chat/completions',
  apiKey: 'sk-hzlwZKK1HGKMcjqpIl3cHB2VWTsxfT8t0FXSgaYAj6i6ruhb', // 从配置文件获取的API密钥
  debugDir: path.join(__dirname, '../debug')
};

// 解析命令行参数
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {
    requestBodyFile: 'body.json', // 默认文件名
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-f':
      case '--file':
        if (i + 1 < args.length) {
          options.requestBodyFile = args[i + 1];
          i++; // 跳过下一个参数
        } else {
          console.error('❌ 错误: -f/--file 参数需要指定文件名');
          process.exit(1);
        }
        break;
      default:
        // 如果没有指定 -f 参数，第一个参数就是文件名
        if (!options.requestBodyFile || options.requestBodyFile === 'body.json') {
          options.requestBodyFile = arg;
        } else {
          console.error(`❌ 错误: 未知参数 ${arg}`);
          console.log('使用 -h 或 --help 查看帮助信息');
          process.exit(1);
        }
    }
  }
  
  return options;
}

// 显示帮助信息
function showHelp() {
  console.log('🧪 Zjcspace API 测试脚本');
  console.log('=' .repeat(50));
  console.log('使用方法:');
  console.log('  node test_zjcspace_request.js [选项] [文件名]');
  console.log('');
  console.log('参数:');
  console.log('  文件名              请求体文件名 (默认: body.json)');
  console.log('');
  console.log('选项:');
  console.log('  -f, --file <文件>   指定请求体文件名');
  console.log('  -h, --help          显示此帮助信息');
  console.log('');
  console.log('示例:');
  console.log('  node test_zjcspace_request.js                    # 使用默认的 body.json');
  console.log('  node test_zjcspace_request.js body_fixed.json    # 使用 body_fixed.json');
  console.log('  node test_zjcspace_request.js -f custom.json     # 使用 custom.json');
  console.log('  node test_zjcspace_request.js --file test.json   # 使用 test.json');
  console.log('');
  console.log('文件位置:');
  console.log(`  请求体文件应放在: ${CONFIG.debugDir}/`);
  console.log('');
}

// 读取请求体文件
function readRequestBody(requestBodyFile) {
  const bodyPath = path.join(CONFIG.debugDir, requestBodyFile);
  
  if (!fs.existsSync(bodyPath)) {
    console.error(`❌ 请求体文件不存在: ${bodyPath}`);
    console.log(`请确保在 ${CONFIG.debugDir} 目录下有 ${requestBodyFile} 文件`);
    console.log('');
    console.log('可用的文件:');
    try {
      const files = fs.readdirSync(CONFIG.debugDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      if (jsonFiles.length > 0) {
        jsonFiles.forEach(file => {
          console.log(`  - ${file}`);
        });
      } else {
        console.log('  (没有找到 .json 文件)');
      }
    } catch (error) {
      console.log('  (无法读取目录)');
    }
    return null;
  }
  
  try {
    const content = fs.readFileSync(bodyPath, 'utf8');
    const data = JSON.parse(content);
    
    // 如果是持久化格式，提取requestBody字段
    if (data.requestBody) {
      return data.requestBody;
    }
    
    // 否则直接返回整个内容
    return data;
  } catch (error) {
    console.error(`❌ 读取请求体文件失败: ${error.message}`);
    return null;
  }
}

// 发送HTTP请求
function sendRequest(requestBody) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.baseUrl);
    
    const postData = JSON.stringify(requestBody);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    console.log(`🚀 发送请求到: ${CONFIG.baseUrl}`);
    console.log(`📝 请求体大小: ${Buffer.byteLength(postData)} bytes`);
    console.log(`🔑 API密钥长度: ${CONFIG.apiKey.length}`);
    
    const req = https.request(options, (res) => {
      console.log(`\n📨 响应状态: ${res.statusCode} ${res.statusMessage}`);
      console.log(`📊 响应头:`);
      
      // 打印响应头
      Object.keys(res.headers).forEach(key => {
        console.log(`  ${key}: ${res.headers[key]}`);
      });
      
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log(`\n📄 响应体:`);
        try {
          // 尝试解析为JSON
          const jsonResponse = JSON.parse(responseData);
          console.log(JSON.stringify(jsonResponse, null, 2));
          
          // 保存响应到文件
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const responseFile = path.join(CONFIG.debugDir, `test-response-${timestamp}.json`);
          
          const responseData = {
            timestamp: new Date().toISOString(),
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            body: jsonResponse
          };
          
          fs.writeFileSync(responseFile, JSON.stringify(responseData, null, 2));
          console.log(`\n💾 响应已保存到: ${responseFile}`);
          
        } catch (e) {
          // 如果不是JSON，直接打印原始内容
          console.log(responseData);
        }
        
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseData
        });
      });
    });
    
    req.on('error', (error) => {
      console.error(`❌ 请求失败: ${error.message}`);
      reject(error);
    });
    
    // 发送请求体
    req.write(postData);
    req.end();
  });
}

// 主函数
async function main() {
  // 解析命令行参数
  const options = parseArguments();
  
  // 显示帮助信息
  if (options.help) {
    showHelp();
    return;
  }
  
  console.log('🧪 Zjcspace API 测试脚本');
  console.log('=' .repeat(50));
  console.log(`📁 使用请求体文件: ${options.requestBodyFile}`);
  console.log('');
  
  // 检查API密钥
  if (CONFIG.apiKey === 'your-api-key-here') {
    console.error('❌ 请先设置API密钥！');
    console.log('请在脚本中修改 CONFIG.apiKey 为实际的API密钥');
    process.exit(1);
  }
  
  // 读取请求体
  const requestBody = readRequestBody(options.requestBodyFile);
  if (!requestBody) {
    process.exit(1);
  }
  
  console.log(`📖 读取请求体成功，字段数量: ${Object.keys(requestBody).length}`);
  console.log(`📋 请求体字段: ${Object.keys(requestBody).join(', ')}`);
  
  // 发送请求
  try {
    const response = await sendRequest(requestBody);
    
    console.log('\n' + '=' .repeat(50));
    console.log('✅ 测试完成');
    
    if (response.statusCode === 200) {
      console.log('🎉 请求成功！');
    } else if (response.statusCode === 206) {
      console.log('⚠️  收到206状态码，这是预期的错误响应');
    } else {
      console.log(`❌ 请求失败，状态码: ${response.statusCode}`);
    }
    
  } catch (error) {
    console.error(`❌ 测试失败: ${error.message}`);
    process.exit(1);
  }
}

// 运行脚本
if (require.main === module) {
  main();
}

module.exports = {
  sendRequest,
  readRequestBody,
  CONFIG
};