#!/usr/bin/env node
/**
 * 主播空降活动页面打包脚本
 * 输出：dist/streamer-dropin/
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  srcDir: __dirname,
  outDir: path.join(__dirname, 'dist', 'streamer-dropin'),
  assetsDir: path.join(__dirname, 'assets'),
  // 需要复制的文件
  files: [
    'index.html',
    'config.json',      // 配置文件（如不存在则创建模板）
    'README.md',        // 技术文档
    'PRD.md'            // 产品文档
  ],
  // 需要复制的目录
  dirs: [
    'assets'
  ]
};

// 工具函数
const utils = {
  // 确保目录存在
  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[创建目录] ${dir}`);
    }
  },

  // 复制文件
  copyFile(src, dest) {
    if (!fs.existsSync(src)) {
      console.warn(`[警告] 文件不存在: ${src}`);
      return false;
    }
    fs.copyFileSync(src, dest);
    console.log(`[复制文件] ${path.basename(src)} -> ${dest}`);
    return true;
  },

  // 递归复制目录
  copyDir(src, dest) {
    if (!fs.existsSync(src)) {
      console.warn(`[警告] 目录不存在: ${src}`);
      return;
    }

    this.ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else {
        this.copyFile(srcPath, destPath);
      }
    }
    console.log(`[复制目录] ${path.basename(src)}/ -> ${dest}/`);
  },

  // 计算文件大小
  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return (stats.size / 1024).toFixed(2) + ' KB';
    } catch {
      return 'N/A';
    }
  }
};

// 创建默认配置模板
function createDefaultConfig() {
  const configPath = path.join(CONFIG.outDir, 'config.json');
  
  if (fs.existsSync(configPath)) {
    console.log(`[配置] 已存在: config.json`);
    return;
  }

  const defaultConfig = {
    "_meta": {
      "version": "1.0.0",
      "updatedAt": new Date().toISOString(),
      "updatedBy": "build-script"
    },
    "timings": {
      "registrationDeadline": "2026-04-01T00:00:00+07:00",
      "battleStartTime": "2026-04-01T20:00:00+07:00",
      "skinRevealTime": "2026-04-02T00:00:00+07:00",
      "saleStartTime": "2026-04-03T00:00:00+07:00",
      "saleEndTime": "2026-04-17T00:00:00+07:00"
    },
    "skinState": {
      "current": "comingSoon",
      "allowedValues": ["comingSoon", "revealed", "onSale", "eventEnded", "skinDelivered"]
    },
    "factionResults": {
      "q": {
        "winner": "heni",
        "discounts": {
          "heni": 50,
          "ricon": 10
        }
      },
      "k": {
        "winner": "suachua",
        "discounts": {
          "suachua": 50,
          "miumiu": 10
        }
      }
    },
    "pricing": {
      "exchangeRate": 1800,
      "warrior": {
        "gold": 3888
      },
      "overlord": {
        "gold": 18888,
        "discountPercent": 34
      }
    },
    "links": {
      "discord": {
        "q": {
          "heni": "https://discord.gg/9BGHDX56U",
          "ricon": "https://discord.gg/hbn4y6nwR"
        },
        "k": {
          "suachua": "https://discord.gg/5ujDrmCHa",
          "miumiu": "https://discord.gg/zaU4tf2Rd"
        }
      },
      "downloads": [
        {"name": "MediaFire", "url": "https://www.mediafire.com/file/h35uc0bhc5gv15z/QuanDoanChien.zip/file"},
        {"name": "Google Drive 1", "url": "https://drive.google.com/file/d/1n7JHQkX-bnmKX3vpXB7Cw41c929MeTWq/view"},
        {"name": "Google Drive 2", "url": "https://drive.google.com/file/d/11Yj793DCdpEPvFhKj-jpYFIdGf1wyoAi/view"},
        {"name": "Google Drive 3", "url": "https://drive.google.com/file/d/1o4YeZ2JyVoeDaueaaWzABJhDAfTrDj9b/view"}
      ]
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`[创建配置] config.json (默认模板)`);
}

// 主构建流程
function build() {
  console.log('='.repeat(50));
  console.log('主播空降活动页面打包');
  console.log('='.repeat(50));
  console.log();

  // 1. 清理旧构建
  if (fs.existsSync(CONFIG.outDir)) {
    console.log('[清理] 删除旧构建目录...');
    fs.rmSync(CONFIG.outDir, { recursive: true });
  }

  // 2. 创建输出目录
  utils.ensureDir(CONFIG.outDir);

  // 3. 复制文件
  console.log('\n[复制文件]');
  for (const file of CONFIG.files) {
    const src = path.join(CONFIG.srcDir, file);
    const dest = path.join(CONFIG.outDir, file);
    utils.copyFile(src, dest);
  }

  // 4. 复制目录
  console.log('\n[复制目录]');
  for (const dir of CONFIG.dirs) {
    const src = path.join(CONFIG.srcDir, dir);
    const dest = path.join(CONFIG.outDir, dir);
    utils.copyDir(src, dest);
  }

  // 5. 创建默认配置（如不存在）
  console.log('\n[配置检查]');
  createDefaultConfig();

  // 6. 生成构建报告
  console.log('\n' + '='.repeat(50));
  console.log('构建完成');
  console.log('='.repeat(50));
  console.log(`输出目录: ${CONFIG.outDir}`);
  console.log();
  console.log('文件清单:');
  
  const listFiles = (dir, prefix = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(CONFIG.outDir, fullPath);
      if (entry.isDirectory()) {
        console.log(`${prefix}📁 ${relativePath}/`);
        listFiles(fullPath, prefix + '  ');
      } else {
        const size = utils.getFileSize(fullPath);
        console.log(`${prefix}📄 ${relativePath} (${size})`);
      }
    }
  };
  
  listFiles(CONFIG.outDir);
  console.log();
  console.log('部署路径: https://monster-lair.vn/campaign/streamer-dropin/');
  console.log();
}

// 执行构建
try {
  build();
  process.exit(0);
} catch (error) {
  console.error('[错误]', error.message);
  process.exit(1);
}
