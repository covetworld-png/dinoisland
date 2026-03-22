#!/usr/bin/env node
/**
 * i18n 工具脚本 - 简化版
 * 
 * 命令:
 *   node i18n-tool.js export    生成翻译文档 i18n-for-translation.md
 *   node i18n-tool.js embed     将 i18n.json 嵌入到 index.html
 * 
 * 工作流程:
 *   1. export → 生成 MD 发送给翻译
 *   2. 翻译标注修改后返回
 *   3. 开发手动更新 i18n.json
 *   4. embed → 同步到 HTML
 */

const fs = require('fs');
const path = require('path');

const I18N_FILE = path.join(__dirname, 'i18n.json');
const HTML_FILE = path.join(__dirname, 'index.html');
const MD_FILE = path.join(__dirname, 'i18n-for-translation.md');

// 读取 i18n.json
function loadI18n() {
    const content = fs.readFileSync(I18N_FILE, 'utf-8');
    return JSON.parse(content);
}

// 命令: export - 生成 Markdown 文档
function exportMd() {
    const i18n = loadI18n();
    const date = new Date().toISOString().split('T')[0];
    
    const lines = [];
    lines.push('# Streamer Dropin Campaign - 翻译确认文档');
    lines.push('');
    lines.push(`> 生成时间: ${date}`);
    lines.push('> 说明: 请在此文档中标注修改建议（加粗/下划线/批注），返回后开发手动同步到 i18n.json');
    lines.push('');
    lines.push('| Key | 中文 (cn) | 越南语 (vi) | 状态 | 备注 |');
    lines.push('|-----|-----------|-------------|------|------|');

    // 递归提取所有翻译
    function extract(obj, prefix = '') {
        const items = [];
        for (const [key, value] of Object.entries(obj)) {
            if (key === '_meta') continue;
            
            const fullKey = prefix ? `${prefix}.${key}` : key;
            
            if (value && typeof value === 'object') {
                if ('vi' in value && 'cn' in value) {
                    // 叶子节点
                    items.push({
                        key: fullKey,
                        cn: value.cn,
                        vi: value.vi
                    });
                } else {
                    // 递归
                    items.push(...extract(value, fullKey));
                }
            }
        }
        return items;
    }

    const items = extract(i18n);
    items.sort((a, b) => a.key.localeCompare(b.key));

    for (const item of items) {
        // 转义 pipe 符号
        const cn = String(item.cn).replace(/\|/g, '\\|');
        const vi = String(item.vi).replace(/\|/g, '\\|');
        lines.push(`| ${item.key} | ${cn} | ${vi} | 待确认 | |`);
    }

    fs.writeFileSync(MD_FILE, lines.join('\n'));
    console.log(`✅ 已生成: i18n-for-translation.md (${items.length} 条翻译)`);
}

// 命令: embed - 嵌入到 HTML
function embedHtml() {
    const i18n = loadI18n();
    
    // 移除 _meta 节省空间
    delete i18n._meta;
    
    // 生成格式化的 JSON
    const jsonStr = JSON.stringify(i18n, null, 2);
    
    // 读取 HTML
    let html = fs.readFileSync(HTML_FILE, 'utf-8');
    
    // 替换 EMBEDDED_I18N
    const pattern = /const EMBEDDED_I18N = \{[\s\S]*?\n        \};/;
    const replacement = `const EMBEDDED_I18N = ${jsonStr};`;
    
    if (!pattern.test(html)) {
        console.error('❌ 未找到 EMBEDDED_I18N 变量，请检查 HTML 结构');
        process.exit(1);
    }
    
    html = html.replace(pattern, replacement);
    fs.writeFileSync(HTML_FILE, html);
    
    // 统计
    const count = JSON.stringify(i18n).match(/"vi":/g)?.length || 0;
    console.log(`✅ 已嵌入: index.html (${count} 条翻译)`);
}

// 主入口
const command = process.argv[2];

if (!command || command === 'help') {
    console.log(`
i18n-tool.js - 国际化工具

用法:
  node i18n-tool.js export    生成翻译文档 (i18n-for-translation.md)
  node i18n-tool.js embed     嵌入到 HTML (index.html)

工作流程:
  1. export → 生成 MD 发送给翻译
  2. 翻译标注修改后返回
  3. 开发手动更新 i18n.json
  4. embed → 同步到 HTML
`);
    process.exit(0);
}

try {
    if (command === 'export') {
        exportMd();
    } else if (command === 'embed') {
        embedHtml();
    } else {
        console.error(`❌ 未知命令: ${command}`);
        console.log('可用命令: export, embed');
        process.exit(1);
    }
} catch (err) {
    console.error('❌ 错误:', err.message);
    process.exit(1);
}
