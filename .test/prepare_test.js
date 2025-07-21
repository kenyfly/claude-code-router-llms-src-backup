#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 配置
const DEBUG_DIR = path.join(__dirname, '../debug');
const TARGET_FILE = 'body.json';

// 获取最新的请求体文件
function getLatestRequestFile() {
  if (!fs.existsSync(DEBUG_DIR)) {
    console.error(`❌ Debug目录不存在: ${DEBUG_DIR}`);
    return null;
  }
  
  const files = fs.readdirSync(DEBUG_DIR)
    .filter(file => file.startsWith('request-') && file.endsWith('.json'))
    .map(file => ({
      name: file,
      path: path.join(DEBUG_DIR, file),
      time: fs.statSync(path.join(DEBUG_DIR, file)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time); // 按时间倒序排列
  
  if (files.length === 0) {
    console.error('❌ 没有找到请求体文件');
    console.log('请先运行一次转换器，生成请求体文件');
    return null;
  }
  
  return files[0];
}

// 复制文件
function copyRequestFile(sourceFile) {
  const targetPath = path.join(DEBUG_DIR, TARGET_FILE);
  
  try {
    fs.copyFileSync(sourceFile.path, targetPath);
    console.log(`✅ 已复制最新请求体文件: ${sourceFile.name} -> ${TARGET_FILE}`);
    console.log(`📅 文件时间: ${new Date(sourceFile.time).toLocaleString()}`);
    return true;
  } catch (error) {
    console.error(`❌ 复制文件失败: ${error.message}`);
    return false;
  }
}

// 显示文件内容摘要
function showFileSummary(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    console.log('\n📋 文件内容摘要:');
    
    if (data.requestBody) {
      const body = data.requestBody;
      console.log(`  📝 请求体字段: ${Object.keys(body).join(', ')}`);
      console.log(`  💬 Messages数量: ${body.messages?.length || 0}`);
      console.log(`  🔧 Tools数量: ${body.tools?.length || 0}`);
      console.log(`  🌊 Stream: ${body.stream}`);
      console.log(`  🔢 Max tokens: ${body.max_tokens || '未设置'}`);
      console.log(`  🌡️ Temperature: ${body.temperature || '未设置'}`);
    } else {
      console.log(`  📝 直接请求体字段: ${Object.keys(data).join(', ')}`);
    }
    
  } catch (error) {
    console.error(`❌ 读取文件摘要失败: ${error.message}`);
  }
}

// 主函数
function main() {
  console.log('🔧 准备测试环境');
  console.log('=' .repeat(40));
  
  // 获取最新请求体文件
  const latestFile = getLatestRequestFile();
  if (!latestFile) {
    process.exit(1);
  }
  
  console.log(`📁 找到最新请求体文件: ${latestFile.name}`);
  
  // 复制文件
  if (!copyRequestFile(latestFile)) {
    process.exit(1);
  }
  
  // 显示文件摘要
  const targetPath = path.join(DEBUG_DIR, TARGET_FILE);
  showFileSummary(targetPath);
  
  console.log('\n' + '=' .repeat(40));
  console.log('✅ 测试环境准备完成！');
  console.log('\n📝 下一步操作:');
  console.log('1. 编辑 debug/body.json 文件，修改请求体');
  console.log('2. 运行测试脚本: node .test/test_zjcspace_request.js');
  console.log('3. 分析响应结果');
}

// 运行脚本
if (require.main === module) {
  main();
}

module.exports = {
  getLatestRequestFile,
  copyRequestFile,
  showFileSummary
}; 