#!/usr/bin/env node
/**
 * CSV 同步工具
 * 将 videos.csv 同步到 js/csv_data.js
 * 使用: node scripts/sync_csv.js
 * 或: node scripts/sync_csv.js --watch (监听变化自动同步)
 */

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '../data/videos.csv');
const JS_PATH = path.join(__dirname, '../js/csv_data.js');

function sync() {
  try {
    const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
    
    const jsContent = `// 封面路径配置
const THUMBNAIL_PATH = 'data/thumbnails/';

function getThumbnailPath(video) {
  const url = video.url;
  const filename = url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('.'));
  return THUMBNAIL_PATH + filename + '.jpg';
}

const CSV_DATA = \`${csvContent.replace(/`/g, '\\`')}\`;
`;
    
    fs.writeFileSync(JS_PATH, jsContent);
    console.log(`✓ 已同步: ${new Date().toLocaleTimeString()}`);
    console.log(`  CSV: ${CSV_PATH}`);
    console.log(`  JS:  ${JS_PATH}`);
    
  } catch (err) {
    console.error('✗ 同步失败:', err.message);
    process.exit(1);
  }
}

// 主逻辑
const args = process.argv.slice(2);

if (args.includes('--watch') || args.includes('-w')) {
  console.log('👀 监听模式启动...');
  console.log(`   监听文件: ${CSV_PATH}`);
  
  sync(); // 先同步一次
  
  fs.watchFile(CSV_PATH, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
      console.log('\n📄 检测到 CSV 变化...');
      sync();
    }
  });
  
} else {
  sync();
}
