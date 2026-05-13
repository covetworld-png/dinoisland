#!/usr/bin/env python3
"""
game-data-search 构建脚本
读取 docs/game-data-summary.md，生成可搜索的单文件 HTML
输出: src/tools/game-data-search/index.html
用法: python projects/004-工具/004-03-game-data-search/build.py
"""

import json
import re
from pathlib import Path

import markdown
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent.parent.parent.parent  # 项目根目录
SRC_MD = ROOT / "docs" / "game-data-summary.md"
OUT_HTML = ROOT / "projects" / "004-工具" / "004-03-game-data-search" / "index.html"


def parse_markdown(md_text: str) -> tuple[str, list]:
    """将 Markdown 转为增强 HTML，并提取搜索索引"""
    html_body = markdown.markdown(md_text, extensions=["tables", "fenced_code"])
    soup = BeautifulSoup(html_body, "html.parser")

    records = []
    section_id = 0
    row_id = 0

    # Section 颜色映射
    SECTION_COLORS = {
        "一、恐龙属性数据": "#059669",
        "二、商城数据": "#3b82f6",
        "三、公会商城": "#d97706",
        "四、皮肤数据": "#8b5cf6",
        "五、权益系统": "#f97316",
        "六、每日任务奖励": "#ef4444",
    }

    # 为每个 h2/h3/h4 添加锚点 id 和 section 颜色
    for tag in soup.find_all(["h2", "h3", "h4"]):
        section_id += 1
        tag["id"] = f"sec-{section_id}"
        text = tag.get_text().strip()
        for prefix, color in SECTION_COLORS.items():
            if text.startswith(prefix):
                tag["data-section-color"] = color
                break

    # 为每个表格行添加 data-search 和 data-section
    for table in soup.find_all("table"):
        # 找到该表格所在的 section
        section_name = ""
        prev = table.find_previous(["h2", "h3", "h4"])
        if prev:
            section_name = prev.get_text().strip()
            sec_id = prev.get("id", "")
            sec_color = prev.get("data-section-color", "")
            if sec_color:
                table["data-section-color"] = sec_color
        else:
            sec_id = ""

        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if not tds:
                continue
            cells_text = [td.get_text().strip() for td in tds]
            full_text = " ".join(cells_text)
            row_id += 1
            rid = f"row-{row_id}"
            tr["id"] = rid
            tr["data-search"] = full_text
            tr["data-section"] = section_name
            tr["data-sec-id"] = sec_id
            records.append({
                "id": rid,
                "section": section_name,
                "secId": sec_id,
                "text": full_text,
                "cells": cells_text,
            })

    return str(soup), records


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>恐龙岛游戏数据查询</title>
<script src="https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js"></script>
<style>
:root {
  --bg: #f0f2f5;
  --bg-elevated: #ffffff;
  --border: #d1d5db;
  --text: #374151;
  --text-muted: #6b7280;
  --accent: #2563eb;
  --accent-dim: #1d4ed8;
  --highlight: rgba(37, 99, 235, 0.08);
  --danger: #dc2626;
  --success: #16a34a;
  --warning: #d97706;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif;
  font-size: 14px;
  line-height: 1.6;
}

/* Header */
.header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
}
.search-wrap {
  flex: 1;
  min-width: 240px;
  position: relative;
}
#searchInput {
  width: 100%;
  padding: 10px 14px 10px 38px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color .2s;
}
#searchInput:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12), 0 0 12px rgba(37, 99, 235, 0.06);
}
.search-wrap::before {
  content: "🔍";
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  opacity: .6;
  font-size: 13px;
}
#searchInput::placeholder { color: var(--text-muted); }
.stats {
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
}
.stats b { color: var(--accent); }

/* Layout */
.container { max-width: 1200px; margin: 0 auto; padding: 20px; }

/* Section */
.section { margin-bottom: 24px; }
.section-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 0;
  user-select: none;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}
.section-toggle:hover { color: var(--accent); }
.section-toggle .arrow {
  display: inline-block;
  width: 0; height: 0;
  border-left: 5px solid var(--text-muted);
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  transition: transform .2s;
}
.section.collapsed .arrow { transform: rotate(-90deg); }
.section.collapsed .section-body { display: none; }

/* Headings */
h2 {
  font-size: 20px;
  color: var(--accent);
  border-bottom: 1px solid var(--border);
  padding: 8px 0 8px 14px;
  margin-top: 32px;
  border-left: 4px solid transparent;
  transition: border-left-color .2s;
}
h3 { font-size: 16px; color: var(--text); margin-top: 24px; padding-left: 8px; border-left: 3px solid transparent; }
h4 { font-size: 14px; color: var(--text-muted); margin-top: 16px; padding-left: 8px; border-left: 3px solid transparent; }

/* Tables */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
  border-left: 3px solid transparent;
  transition: border-left-color .2s;
}
th, td {
  padding: 8px 12px;
  text-align: left;
  border: 1px solid var(--border);
}
td {
  font-variant-numeric: tabular-nums;
}
th {
  background: #f1f5f9;
  color: var(--accent);
  font-weight: 600;
  position: sticky;
  top: 68px;
  z-index: 10;
  letter-spacing: 0.3px;
}
tr:nth-child(even) { background: rgba(0,0,0,.02); }
tr:hover { background: rgba(37, 99, 235, 0.06) !important; }
tr.hidden { display: none !important; }
tr.matched { background: var(--highlight) !important; }

/* Highlight */
mark {
  background: rgba(37, 99, 235, 0.20);
  color: var(--text);
  padding: 0 2px;
  border-radius: 3px;
}

/* Empty state */
.no-results {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
  font-size: 15px;
}
.no-results b { color: var(--danger); }

/* Scroll to top */
.to-top {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s;
  font-size: 18px;
}
.to-top.visible { opacity: 1; pointer-events: auto; }
.to-top:hover { border-color: var(--accent); color: var(--accent); }

/* Responsive */
@media (max-width: 768px) {
  .header { padding: 12px 16px; }
  .container { padding: 12px; }
  th, td { padding: 6px 8px; font-size: 12px; }
  h2 { font-size: 17px; }
}
</style>
</head>
<body>

<div class="header">
  <h1>🦖 恐龙岛数据查询</h1>
  <div class="search-wrap">
    <input type="text" id="searchInput" placeholder="输入关键词搜索，如：牛龙、咬合力、128888、积分..." autocomplete="off">
  </div>
  <div class="stats">共 <b id="totalRows">0</b> 条数据 · 匹配 <b id="matchRows">0</b> 条</div>
</div>

<div class="container" id="content">
  {body_html}
</div>

<div class="to-top" id="toTop" onclick="window.scrollTo({top:0,behavior:'smooth'})">↑</div>

<script>
// 数据索引
const ROWS = JSON.parse(`{records_json}`);

// 初始化 Fuse
const fuse = new Fuse(ROWS, {
  keys: ['text', 'section'],
  threshold: 0.25,
  includeMatches: true,
  minMatchCharLength: 1,
});

const searchInput = document.getElementById('searchInput');
const totalEl = document.getElementById('totalRows');
const matchEl = document.getElementById('matchRows');
const toTopBtn = document.getElementById('toTop');

// 统计
const allRowEls = document.querySelectorAll('tr[data-search]');
totalEl.textContent = allRowEls.length;
matchEl.textContent = allRowEls.length;

// 高亮匹配文本
function highlightText(node, indices) {
  if (!indices || indices.length === 0) return;
  const text = node.textContent;
  let html = '';
  let last = 0;
  for (const [s, e] of indices) {
    html += escapeHtml(text.slice(last, s));
    html += '<mark>' + escapeHtml(text.slice(s, e + 1)) + '</mark>';
    last = e + 1;
  }
  html += escapeHtml(text.slice(last));
  node.innerHTML = html;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function clearHighlight(tr) {
  tr.querySelectorAll('td').forEach(td => {
    td.textContent = td.textContent; // 清除 innerHTML，恢复纯文本
  });
}

// 搜索逻辑
function doSearch(query) {
  const q = query.trim();

  if (!q) {
    // 清空搜索，显示全部
    allRowEls.forEach(tr => {
      tr.classList.remove('hidden', 'matched');
      clearHighlight(tr);
    });
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('collapsed'));
    // 恢复所有表格和标题显示
    document.querySelectorAll('table').forEach(t => t.style.display = '');
    document.querySelectorAll('h2, h3, h4').forEach(h => h.style.display = '');
    matchEl.textContent = allRowEls.length;
    return;
  }

  const results = fuse.search(q);
  const matchedIds = new Set(results.map(r => r.item.id));

  allRowEls.forEach(tr => {
    const rid = tr.id;
    const result = results.find(r => r.item.id === rid);

    if (matchedIds.has(rid)) {
      tr.classList.remove('hidden');
      tr.classList.add('matched');

      // 高亮匹配单元格
      const matches = result.matches || [];
      const textMatch = matches.find(m => m.key === 'text');
      if (textMatch) {
        const tds = tr.querySelectorAll('td');
        // 简化处理：在整行文本中高亮，重新分配到单元格不太精确
        // 这里采用简单策略：如果匹配在 section 中，不高亮单元格；如果在 text 中，尝试在对应单元格高亮
        // 由于 Fuse 返回的是合并文本的 indices，我们在每个 td 中搜索 query 并高亮
        tds.forEach(td => {
          const tdText = td.textContent;
          const regex = new RegExp('(' + escapeRegex(q) + ')', 'gi');
          if (regex.test(tdText)) {
            td.innerHTML = escapeHtml(tdText).replace(regex, '<mark>$1</mark>');
          }
        });
      }
    } else {
      tr.classList.add('hidden');
      tr.classList.remove('matched');
      clearHighlight(tr);
    }
  });

  matchEl.textContent = matchedIds.size;

  // 自动展开有匹配结果的 section
  document.querySelectorAll('.section').forEach(sec => {
    const visible = sec.querySelectorAll('tr[data-search]:not(.hidden)');
    if (visible.length > 0) {
      sec.classList.remove('collapsed');
    }
  });

  // 隐藏没有可见数据行的表格及其前面的标题
  document.querySelectorAll('table').forEach(table => {
    const visibleRows = table.querySelectorAll('tr[data-search]:not(.hidden)');
    if (visibleRows.length === 0) {
      table.style.display = 'none';
      // 隐藏紧邻的前一个标题（h2/h3/h4），如果该标题后面没有其他可见表格
      let prev = table.previousElementSibling;
      while (prev && !prev.matches('h2, h3, h4')) {
        prev = prev.previousElementSibling;
      }
      if (prev) {
        // 检查该标题和下一个同层级标题之间是否还有可见表格
        let hasVisibleTable = false;
        let next = prev.nextElementSibling;
        while (next && next !== table) {
          next = next.nextElementSibling;
        }
        // 简化处理：只隐藏紧邻表格的 h4/h3，h2 作为大章节始终保留
        if (prev.matches('h3, h4')) {
          prev.style.display = 'none';
        }
      }
    } else {
      table.style.display = '';
      let prev = table.previousElementSibling;
      while (prev && !prev.matches('h2, h3, h4')) {
        prev = prev.previousElementSibling;
      }
      if (prev && prev.matches('h3, h4')) {
        prev.style.display = '';
      }
    }
  });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
}

// 事件监听
let debounceTimer;
searchInput.addEventListener('input', e => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => doSearch(e.target.value), 150);
});

// Section 折叠
document.querySelectorAll('.section-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    toggle.closest('.section').classList.toggle('collapsed');
  });
});

// 自动为每个 section 添加 toggle（如果没有的话）
document.querySelectorAll('.section').forEach(sec => {
  const h2 = sec.querySelector('h2');
  if (h2 && !sec.querySelector('.section-toggle')) {
    const toggle = document.createElement('div');
    toggle.className = 'section-toggle';
    toggle.innerHTML = '<span class="arrow"></span><b>' + escapeHtml(h2.textContent) + '</b>';
    sec.insertBefore(toggle, h2.nextSibling);
    toggle.addEventListener('click', () => sec.classList.toggle('collapsed'));
  }
});

// 回到顶部
window.addEventListener('scroll', () => {
  toTopBtn.classList.toggle('visible', window.scrollY > 300);
});

// 快捷键
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    doSearch('');
    searchInput.blur();
  }
});

// 初始化 section 色条
document.querySelectorAll('[data-section-color]').forEach(el => {
  el.style.borderLeftColor = el.dataset.sectionColor;
});

// 自动聚焦搜索框（桌面端）
if (window.innerWidth > 768) {
  searchInput.focus();
}
</script>

</body>
</html>
"""


def main():
    if not SRC_MD.exists():
        print(f"❌ 源文件不存在: {SRC_MD}")
        return 1

    md_text = SRC_MD.read_text(encoding="utf-8")
    body_html, records = parse_markdown(md_text)

    # 将 records 转为 JSON 字符串（注意转义反斜杠和引号）
    records_json = json.dumps(records, ensure_ascii=False)
    records_json = records_json.replace("\\", "\\\\").replace("`", "\\`")

    html = HTML_TEMPLATE.replace("{body_html}", body_html).replace("{records_json}", records_json)

    OUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(html, encoding="utf-8")

    print(f"✅ 已生成: {OUT_HTML.relative_to(ROOT)}")
    print(f"   数据条目: {len(records)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
