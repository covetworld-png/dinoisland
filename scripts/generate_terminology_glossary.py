#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate an HTML glossary lookup page from terminology-glossary.md.

Usage:
    python scripts/generate_terminology_glossary.py \
        projects/002-内容/002-02-翻译/docs/terminology-glossary.md \
        projects/002-内容/002-02-翻译/docs/terminology-glossary.html
"""

import re
import sys
import json
from pathlib import Path


def parse_markdown_table(text: str) -> list[dict]:
    """Parse a single markdown table into list of row dicts."""
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    # Drop separator line (contains only |, -, :, spaces)
    body_lines = []
    for ln in lines:
        if re.fullmatch(r"[\|\s\-:]+", ln):
            continue
        body_lines.append(ln)
    if not body_lines:
        return []
    headers = [c.strip() for c in body_lines[0].strip("|").split("|")]
    rows = []
    for ln in body_lines[1:]:
        cells = [c.strip() for c in ln.strip("|").split("|")]
        if len(cells) < len(headers):
            cells += [""] * (len(headers) - len(cells))
        rows.append(dict(zip(headers, cells)))
    return rows


def extract_tables(section_text: str) -> list[tuple[list[dict], list[str]]]:
    """Extract all tables from a markdown section."""
    # Match tables: rows starting with | and not empty
    table_blocks = re.findall(r"(?:^|\n)(?:\|[^\n]*\|\n?)+", section_text)
    result = []
    for block in table_blocks:
        rows = parse_markdown_table(block)
        if rows:
            headers = list(rows[0].keys())
            result.append((rows, headers))
    return result


def normalize_header(headers: list[str]) -> dict[str, str]:
    """Map header names to canonical keys: zh, en, vn, status, note."""
    mapping = {}
    for h in headers:
        hl = h.lower()
        if "中文" in hl:
            mapping["zh"] = h
        elif "英文" in hl or "english" in hl:
            mapping["en"] = h
        elif "越南语" in hl or "vietnamese" in hl:
            mapping["vn"] = h
        elif "状态" in hl or "status" in hl:
            mapping["status"] = h
        elif "备注" in hl or "note" in hl or "说明" in hl:
            mapping["note"] = h
    return mapping


def parse_glossary(md_path: Path) -> list[dict]:
    content = md_path.read_text(encoding="utf-8")
    # Split by top-level sections (##)
    raw_sections = re.split(r"\n(?=##\s)", content)

    categories = []
    for sec in raw_sections:
        sec = sec.strip()
        if not sec or sec.startswith("# 恐龙岛专用名词"):
            continue
        title_match = re.match(r"##\s+(.+)$", sec.split("\n")[0], re.M)
        if not title_match:
            continue
        title = title_match.group(1).strip()

        tables = extract_tables(sec)
        entries = []
        for rows, headers in tables:
            mapping = normalize_header(headers)
            if "zh" not in mapping or "en" not in mapping or "vn" not in mapping:
                # Skip non-translation tables (rule tables, changelog, etc.)
                continue
            for row in rows:
                zh = row.get(mapping.get("zh", ""), "").strip()
                en = row.get(mapping.get("en", ""), "").strip()
                vn = row.get(mapping.get("vn", ""), "").strip()
                if not zh and not en and not vn:
                    continue
                note = row.get(mapping.get("note", ""), "").strip()
                status = row.get(mapping.get("status", ""), "").strip()
                entries.append(
                    {
                        "zh": zh,
                        "en": en,
                        "vn": vn,
                        "note": note,
                        "status": status,
                    }
                )

        if entries:
            categories.append({"category": title, "entries": entries})

    return categories


def build_html(categories: list[dict]) -> str:
    data_json = json.dumps(categories, ensure_ascii=False, indent=2)
    total = sum(len(c["entries"]) for c in categories)

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>恐龙岛术语对照表 · Glossary Lookup</title>
  <style>
    :root {{
      --bg: #f6f7f9;
      --card: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --border: #e5e7eb;
      --primary: #2563eb;
      --primary-light: #eff6ff;
      --success: #16a34a;
      --success-bg: #dcfce7;
      --shadow: 0 1px 3px rgba(0,0,0,0.08);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }}
    header {{
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 1.25rem 1rem;
      position: sticky;
      top: 0;
      z-index: 20;
    }}
    .container {{
      max-width: 960px;
      margin: 0 auto;
      padding: 0 1rem;
    }}
    h1 {{
      margin: 0 0 0.25rem;
      font-size: 1.25rem;
      font-weight: 700;
    }}
    .subtitle {{
      margin: 0;
      color: var(--muted);
      font-size: 0.875rem;
    }}
    .search-wrap {{
      margin-top: 1rem;
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      align-items: center;
    }}
    #search {{
      flex: 1 1 260px;
      padding: 0.6rem 0.875rem;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      font-size: 1rem;
      outline: none;
    }}
    #search:focus {{
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-light);
    }}
    .stats {{
      font-size: 0.875rem;
      color: var(--muted);
      white-space: nowrap;
    }}
    main {{
      padding: 1.25rem 0 3rem;
    }}
    .category {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      margin-bottom: 1rem;
      box-shadow: var(--shadow);
      overflow: hidden;
    }}
    .cat-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1rem;
      cursor: pointer;
      user-select: none;
      background: #fafafa;
      border-bottom: 1px solid var(--border);
    }}
    .cat-header:hover {{ background: #f3f4f6; }}
    .cat-title {{
      font-weight: 600;
      font-size: 1rem;
      margin: 0;
    }}
    .cat-count {{
      font-size: 0.75rem;
      color: var(--muted);
      background: var(--bg);
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      margin-left: 0.5rem;
    }}
    .cat-toggle {{
      color: var(--muted);
      font-size: 0.875rem;
      transition: transform 0.2s;
    }}
    .category.collapsed .cat-toggle {{ transform: rotate(-90deg); }}
    .cat-body {{
      padding: 0.5rem 0;
      display: block;
    }}
    .category.collapsed .cat-body {{ display: none; }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9375rem;
    }}
    th, td {{
      padding: 0.625rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }}
    th {{
      font-weight: 600;
      color: var(--muted);
      font-size: 0.8125rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      background: #fafafa;
      position: sticky;
      top: 0;
    }}
    tr:last-child td {{ border-bottom: none; }}
    tr:hover td {{ background: #f9fafb; }}
    .lang {{
      display: block;
      font-weight: 500;
    }}
    .lang-vn {{
      color: #b45309;
      font-size: 0.95em;
    }}
    .lang-en {{
      color: #1d4ed8;
      font-size: 0.95em;
    }}
    .note {{
      font-size: 0.8125rem;
      color: var(--muted);
      margin-top: 0.15rem;
    }}
    .status {{
      display: inline-block;
      font-size: 0.75rem;
      padding: 0.15rem 0.45rem;
      border-radius: 999px;
      background: var(--success-bg);
      color: var(--success);
      white-space: nowrap;
    }}
    .copy-btn {{
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      cursor: pointer;
    }}
    .copy-btn:hover {{
      border-color: var(--primary);
      color: var(--primary);
    }}
    .no-result {{
      text-align: center;
      padding: 3rem 1rem;
      color: var(--muted);
    }}
    .highlight {{
      background: #fef08a;
      border-radius: 2px;
      padding: 0 1px;
    }}
    @media (max-width: 640px) {{
      th, td {{ padding: 0.5rem; font-size: 0.875rem; }}
      .note {{ display: none; }}
      th:nth-child(4), td:nth-child(4) {{ display: none; }}
    }}
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>恐龙岛术语对照表</h1>
      <p class="subtitle">海外团长申请资源发放对照 · CN / EN / VN</p>
      <div class="search-wrap">
        <input type="text" id="search" placeholder="搜索中文 / English / Tiếng Việt…" autocomplete="off">
        <span class="stats" id="stats">共 {total} 条</span>
      </div>
    </div>
  </header>

  <main class="container">
    <div id="glossary"></div>
    <div class="no-result" id="no-result" style="display:none;">未找到匹配的术语</div>
  </main>

  <script>
    const glossaryData = {data_json};

    const glossaryEl = document.getElementById('glossary');
    const searchEl = document.getElementById('search');
    const statsEl = document.getElementById('stats');
    const noResultEl = document.getElementById('no-result');

    function escapeHtml(text) {{
      return text.replace(/[&<>"']/g, c =>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));
    }}

    function highlight(text, query) {{
      if (!query) return escapeHtml(text);
      const q = query.replace(/[.*+?^${{}}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(${{q}})`, 'gi');
      return escapeHtml(text).replace(re, '<span class="highlight">$1</span>');
    }}

    function copyText(text, btn) {{
      navigator.clipboard.writeText(text).then(() => {{
        const old = btn.textContent;
        btn.textContent = '已复制';
        setTimeout(() => btn.textContent = old, 1200);
      }}).catch(() => {{
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }});
    }}

    function render(query = '') {{
      glossaryEl.innerHTML = '';
      const q = query.trim().toLowerCase();
      let totalVisible = 0;

      glossaryData.forEach((cat, catIdx) => {{
        const filtered = cat.entries.filter(e => {{
          if (!q) return true;
          return [e.zh, e.en, e.vn, e.note].some(s => s && s.toLowerCase().includes(q));
        }});
        if (!filtered.length) return;
        totalVisible += filtered.length;

        const section = document.createElement('section');
        section.className = 'category';
        section.innerHTML = `
          <div class="cat-header" data-idx="${{catIdx}}">
            <h2 class="cat-title">${{escapeHtml(cat.category)}}<span class="cat-count">${{filtered.length}}</span></h2>
            <span class="cat-toggle">▼</span>
          </div>
          <div class="cat-body">
            <table>
              <thead>
                <tr>
                  <th style="width:26%">中文</th>
                  <th style="width:28%">English</th>
                  <th style="width:28%">Tiếng Việt</th>
                  <th style="width:18%">备注 / 操作</th>
                </tr>
              </thead>
              <tbody>
                ${{filtered.map((e, i) => `
                  <tr>
                    <td>${{highlight(e.zh, q)}}</td>
                    <td><span class="lang lang-en">${{highlight(e.en, q)}}</span></td>
                    <td><span class="lang lang-vn">${{highlight(e.vn, q)}}</span></td>
                    <td>
                      ${{e.note ? `<div class="note">${{highlight(e.note, q)}}</div>` : ''}}
                      <div style="margin-top:0.35rem;display:flex;gap:0.35rem;flex-wrap:wrap;">
                        <button class="copy-btn" data-copy="${{escapeHtml(e.zh)}}" title="复制中文">CN</button>
                        <button class="copy-btn" data-copy="${{escapeHtml(e.en)}}" title="复制英文">EN</button>
                        <button class="copy-btn" data-copy="${{escapeHtml(e.vn)}}" title="复制越南语">VN</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}}
              </tbody>
            </table>
          </div>
        `;
        glossaryEl.appendChild(section);
      }});

      statsEl.textContent = q ? `匹配 ${{totalVisible}} 条` : `共 ${{totalVisible}} 条`;
      noResultEl.style.display = totalVisible ? 'none' : 'block';

      // Attach copy handlers
      glossaryEl.querySelectorAll('button[data-copy]').forEach(btn => {{
        btn.addEventListener('click', () => copyText(btn.dataset.copy, btn));
      }});

      // Attach collapse handlers
      glossaryEl.querySelectorAll('.cat-header').forEach(header => {{
        header.addEventListener('click', () => {{
          header.parentElement.classList.toggle('collapsed');
        }});
      }});
    }}

    searchEl.addEventListener('input', () => render(searchEl.value));
    render();
  </script>
</body>
</html>
"""


def main():
    if len(sys.argv) < 3:
        md_path = Path("projects/002-内容/002-02-翻译/docs/terminology-glossary.md")
        out_path = Path("projects/002-内容/002-02-翻译/docs/terminology-glossary.html")
    else:
        md_path = Path(sys.argv[1])
        out_path = Path(sys.argv[2])

    categories = parse_glossary(md_path)
    html = build_html(categories)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"Generated: {out_path} ({sum(len(c['entries']) for c in categories)} entries in {len(categories)} categories)")


if __name__ == "__main__":
    main()
