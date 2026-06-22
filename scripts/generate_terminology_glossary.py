#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate an HTML item glossary lookup page from terminology-glossary.md
and skin IDs from docs/怪兽巢穴代码.txt.

Usage:
    python scripts/generate_terminology_glossary.py \
        projects/002-内容/002-02-翻译/docs/terminology-glossary.md \
        projects/002-内容/002-02-翻译/docs/terminology-glossary.html
"""

import re
import sys
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent

# UI-only sections to drop
SKIP_CATEGORIES = {
    "6. UI 通用文本 (UI Common)",
}

# In 4.1, keep only rows whose Chinese name contains 点/卡/商城 (currency/shop/card)
GACHA_KEEP_PATTERNS = ["点", "卡", "商城"]

# Normalize nicknames in 怪兽巢穴代码.txt to full dinosaur names
DINO_NAME_MAP = {
    "霸王龙": "霸王龙",
    "远古霸王龙": "远古霸王龙",
    "UT": "犹他龙",
    "犹他龙": "犹他龙",
    "翼龙": "翼龙",
    "巨型脊背": "巨型脊背龙",
    "高脊": "高脊龙",
    "艾蕾拉龙": "艾雷拉龙",
    "远古南巨": "远古南巨",
    "大雷": "雷龙",
    "南手龙": "南手龙",
    "远古牛龙": "远古牛龙",
    "特暴": "超级暴龙",
    "甲龙": "甲龙",
    "三角龙": "三角龙",
}

# Map generic skin name -> full Chinese name with dinosaur prefix when applicable
GENERIC_SKIN_NAME_MAP = {
    "豹纹": "豹纹",
    "动物乐园": "动物乐园",
    "大白鹅": "大白鹅",
    "卡通兔子": "卡通兔子",
    "卡通小猫": "卡通小猫",
    "软萌暴暴": "软萌暴暴",
    "纯透明": "纯透明",
}


def parse_markdown_table(text: str) -> list[dict]:
    """Parse a single markdown table into list of row dicts."""
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
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
    table_blocks = re.findall(r"(?:^|\n)(?:\|[^\n]*\|\n?)+", section_text)
    result = []
    for block in table_blocks:
        rows = parse_markdown_table(block)
        if rows:
            headers = list(rows[0].keys())
            result.append((rows, headers))
    return result


def normalize_header(headers: list[str]) -> dict[str, str]:
    mapping = {}
    for h in headers:
        hl = h.lower()
        if "中文" in hl:
            mapping["zh"] = h
        elif "英文" in hl or "english" in hl:
            mapping["en"] = h
        elif "越南语" in hl or "vietnamese" in hl:
            mapping["vn"] = h
    return mapping


def parse_dino_names(md_path: Path) -> dict[str, dict[str, str]]:
    """Build a map: zh -> {en, vn} from section 1."""
    content = md_path.read_text(encoding="utf-8")
    raw_sections = re.split(r"\n(?=##\s)", content)
    dino_map = {}
    for sec in raw_sections:
        if not sec.strip().startswith("## 1. 恐龙名称"):
            continue
        for rows, headers in extract_tables(sec):
            mapping = normalize_header(headers)
            if "zh" not in mapping or "en" not in mapping or "vn" not in mapping:
                continue
            for row in rows:
                zh_raw = row.get(mapping["zh"], "").strip()
                en = row.get(mapping["en"], "").strip()
                vn = row.get(mapping["vn"], "").strip()
                for zh in re.split(r"\s*/\s*", zh_raw):
                    if zh:
                        dino_map[zh] = {"en": en, "vn": vn}
    return dino_map


def parse_skin_ids(txt_path: Path) -> dict[str, str]:
    """Parse docs/怪兽巢穴代码.txt to map skin name -> id or id range."""
    text = txt_path.read_text(encoding="utf-8")
    skin_ids: dict[str, str] = {}

    # 1. 洗皮 section: "霸王龙专属皮肤：/pf 2701-2703"
    wash_match = re.search(r"------洗皮-------\s*(.*?)\n\s*--------特殊皮-------", text, re.S)
    if wash_match:
        for line in wash_match.group(1).splitlines():
            line = line.strip()
            if not line or "/pf" not in line:
                continue
            name_part, cmd_part = line.split("/pf", 1)
            name = re.sub(r"【.*?】", "", name_part.replace(":", "").replace("：", "").strip())
            sid = cmd_part.strip()
            # Normalize name
            for nick, full in DINO_NAME_MAP.items():
                if name.startswith(nick) or name == nick:
                    # Build full Chinese name
                    if "专属皮肤" in name:
                        key = name
                    else:
                        key = f"{full}专属皮肤"
                    skin_ids[key] = sid
                    break
            else:
                # Fallback: keep original name as key
                skin_ids[name] = sid

    # 2. 皮肤 section: "/pf 2090 豹纹", "/pf 2129-2131 卡通兔子"
    skin_match = re.search(r"--------皮肤-------\s*(.*?)\n\s*\n", text, re.S)
    if skin_match:
        for line in skin_match.group(1).splitlines():
            line = line.strip()
            if not line.startswith("/pf"):
                continue
            # Split by /pf occurrences (multiple per line)
            parts = re.split(r"(?=/pf\s+\d)", line)
            for part in parts:
                part = part.strip()
                m = re.match(r"/pf\s+(\d+(?:-\d+)?)\s+(.+)", part)
                if not m:
                    continue
                sid, name = m.group(1), m.group(2).strip()
                if name in GENERIC_SKIN_NAME_MAP:
                    skin_ids[GENERIC_SKIN_NAME_MAP[name]] = sid
                elif name == "蓝水晶":  # First entry of the skin list
                    # Skip material skins (2001-2135 are mostly materials, not listed in glossary)
                    pass

    # 3. Hardcode skins from game-data-summary.md
    skin_ids["机械暴龙专属皮肤-魅影"] = "2727"
    skin_ids["机械暴龙专属皮肤-疾风"] = "2728"
    skin_ids["机械暴龙专属皮肤-赤炼"] = "2729"
    skin_ids["水墨苍龙"] = "2936"
    skin_ids["水墨苍龙-反色"] = "2937"

    return skin_ids


def parse_glossary(md_path: Path) -> tuple[list[dict], dict[str, dict[str, str]]]:
    content = md_path.read_text(encoding="utf-8")
    raw_sections = re.split(r"\n(?=##\s)", content)

    dino_map = parse_dino_names(md_path)
    categories = []

    for sec in raw_sections:
        sec = sec.strip()
        if not sec or sec.startswith("# 恐龙岛专用名词"):
            continue
        title_match = re.match(r"##\s+(.+)$", sec.split("\n")[0], re.M)
        if not title_match:
            continue
        title = title_match.group(1).strip()
        if title in SKIP_CATEGORIES:
            continue

        tables = extract_tables(sec)
        entries = []
        for rows, headers in tables:
            mapping = normalize_header(headers)
            if "zh" not in mapping or "en" not in mapping or "vn" not in mapping:
                continue
            for row in rows:
                zh = row.get(mapping.get("zh", ""), "").strip()
                en = row.get(mapping.get("en", ""), "").strip()
                vn = row.get(mapping.get("vn", ""), "").strip()
                if not zh and not en and not vn:
                    continue
                if title == "4.1 抽卡/活动系统术语 (Gacha/Event System)" and not any(p in zh for p in GACHA_KEEP_PATTERNS):
                    continue
                entries.append({"zh": zh, "en": en, "vn": vn})

        if entries:
            categories.append({"category": title, "entries": entries})

    return categories, dino_map


def format_zh_with_id(zh: str, sid: str) -> str:
    """Append skin ID in parentheses."""
    if not sid:
        return zh
    return f"{zh} ({sid})"


def expand_skin_entries(category: dict, skin_ids: dict[str, str], dino_map: dict[str, dict[str, str]]) -> dict:
    """Replace abstract skin rules with concrete skin entries with IDs."""
    new_entries = []

    # Generic skin name -> (en, vn) from glossary
    generic_lookup = {}
    exclusive_base = None
    team_skin_base = None

    for e in category["entries"]:
        zh = e["zh"]
        if zh == "团皮":
            team_skin_base = e
        elif zh == "专属皮肤":
            exclusive_base = e
        elif zh in GENERIC_SKIN_NAME_MAP.values() or zh in {"豹纹", "动物乐园", "大白鹅", "卡通兔子", "卡通小猫", "软萌暴暴"}:
            generic_lookup[zh] = e

    # Keep Team Skin as-is (no IDs)
    if team_skin_base:
        new_entries.append(team_skin_base)

    # Generic skins with IDs
    for zh in ["豹纹", "动物乐园", "大白鹅", "卡通兔子", "卡通小猫", "软萌暴暴"]:
        e = generic_lookup.get(zh)
        if not e:
            continue
        sid = skin_ids.get(zh, "")
        new_entries.append({
            "zh": format_zh_with_id(zh, sid),
            "en": e["en"],
            "vn": e["vn"],
        })

    # Exclusive skins by dinosaur
    exclusive_dinos = [
        "霸王龙", "远古霸王龙", "犹他龙", "翼龙", "巨型脊背龙", "高脊龙",
        "艾雷拉龙", "远古南巨", "雷龙", "南手龙", "远古牛龙", "超级暴龙",
        "三角龙", "甲龙",
    ]
    for dino in exclusive_dinos:
        sid = skin_ids.get(f"{dino}专属皮肤", "")
        if not sid:
            continue
        names = dino_map.get(dino, {"en": dino, "vn": dino})
        new_entries.append({
            "zh": format_zh_with_id(f"{dino}专属皮肤", sid),
            "en": f"{names['en']} Exclusive Skin",
            "vn": f"Skin Độc Quyền {names['vn']}",
        })

    # Mecha T-Rex exclusive skins
    mecha_skins = [
        ("魅影", "Phantom"),
        ("疾风", "Gale"),
        ("赤炼", "Crimson"),
    ]
    for zh_skin, en_skin in mecha_skins:
        key = f"机械暴龙专属皮肤-{zh_skin}"
        sid = skin_ids.get(key, "")
        if sid:
            new_entries.append({
                "zh": format_zh_with_id(key, sid),
                "en": f"Mecha T-Rex Exclusive Skin – {en_skin}",
                "vn": f"Skin Độc Quyền Khủng Long Máy – {en_skin}",
            })

    # Shui Mo Cang Long
    for zh_name, en_name in [("水墨苍龙", "Ink Canglong"), ("水墨苍龙-反色", "Ink Canglong – Inverse")]:
        sid = skin_ids.get(zh_name, "")
        if sid:
            new_entries.append({
                "zh": format_zh_with_id(zh_name, sid),
                "en": en_name,
                "vn": zh_name,  # No official VN name provided
            })

    return {"category": category["category"], "entries": new_entries}


def build_html(categories: list[dict]) -> str:
    data_json = json.dumps(categories, ensure_ascii=False, indent=2)
    total = sum(len(c["entries"]) for c in categories)

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>恐龙岛道具名称对照表 · Item Glossary</title>
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
    .header-links {{
      margin-top: 0.75rem;
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      font-size: 0.875rem;
    }}
    .header-links a {{
      color: var(--primary);
      text-decoration: none;
      padding: 0.25rem 0.5rem;
      border-radius: 0.375rem;
      background: var(--primary-light);
    }}
    .header-links a:hover {{
      text-decoration: underline;
    }}
    .search-wrap {{
      margin-top: 1rem;
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      align-items: center;
    }}
    .search-box {{
      flex: 1 1 260px;
      position: relative;
    }}
    #search {{
      width: 100%;
      padding: 0.6rem 2.25rem 0.6rem 0.875rem;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      font-size: 1rem;
      outline: none;
    }}
    #search:focus {{
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-light);
    }}
    #clear-search {{
      position: absolute;
      right: 0.5rem;
      top: 50%;
      transform: translateY(-50%);
      width: 1.5rem;
      height: 1.5rem;
      border: none;
      background: var(--border);
      color: var(--muted);
      border-radius: 50%;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
    }}
    #clear-search.visible {{ display: flex; }}
    #clear-search:hover {{
      background: var(--muted);
      color: #fff;
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
    .skin-id {{
      font-size: 0.8em;
      color: var(--muted);
      font-weight: 400;
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
    }}
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>恐龙岛道具名称对照表</h1>
      <p class="subtitle">海外团长申请资源发放对照 · CN / EN / VN</p>
      <div class="header-links">
        <a href="../game-data-search/index.html">游戏数据搜索 →</a>
      </div>
      <div class="search-wrap">
        <div class="search-box">
          <input type="text" id="search" placeholder="搜索中文 / English / Tiếng Việt…" autocomplete="off">
          <button id="clear-search" title="清空">×</button>
        </div>
        <span class="stats" id="stats">共 {total} 条</span>
      </div>
    </div>
  </header>

  <main class="container">
    <div id="glossary"></div>
    <div class="no-result" id="no-result" style="display:none;">未找到匹配的道具</div>
  </main>

  <script>
    const glossaryData = {data_json};

    const glossaryEl = document.getElementById('glossary');
    const searchEl = document.getElementById('search');
    const clearBtn = document.getElementById('clear-search');
    const statsEl = document.getElementById('stats');
    const noResultEl = document.getElementById('no-result');

    function escapeHtml(text) {{
      return text.replace(/[&<>"']/g, c =>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));
    }}

    function highlight(text, query) {{
      if (!query) return escapeHtml(text);
      const q = query.replace(/[\\^$.*+?()[\]{{}}|]/g, '\\$&');
      const re = new RegExp(`(${{q}})`, 'gi');
      return escapeHtml(text).replace(re, '<span class="highlight">$1</span>');
    }}

    function copyText(text, btn) {{
      navigator.clipboard.writeText(text).then(() => {{
        const old = btn.textContent;
        btn.textContent = '已复制';
        setTimeout(() => btn.textContent = old, 1200);
      }}).catch(() => {{
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }});
    }}

    function updateClearBtn() {{
      clearBtn.classList.toggle('visible', searchEl.value.length > 0);
    }}

    function clearSearch() {{
      searchEl.value = '';
      updateClearBtn();
      render();
      searchEl.focus();
    }}

    function render(query = '') {{
      glossaryEl.innerHTML = '';
      const q = query.trim().toLowerCase();
      let totalVisible = 0;

      glossaryData.forEach((cat, catIdx) => {{
        const filtered = cat.entries.filter(e => {{
          if (!q) return true;
          return [e.zh, e.en, e.vn].some(s => s && s.toLowerCase().includes(q));
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
                  <th style="width:32%">中文</th>
                  <th style="width:34%">English</th>
                  <th style="width:34%">Tiếng Việt</th>
                </tr>
              </thead>
              <tbody>
                ${{filtered.map((e, i) => `
                  <tr>
                    <td>
                      ${{highlight(e.zh, q)}}
                      <div style="margin-top:0.35rem;">
                        <button class="copy-btn" data-copy="${{escapeHtml(e.zh)}}" title="复制中文">复制</button>
                      </div>
                    </td>
                    <td>
                      <span class="lang lang-en">${{highlight(e.en, q)}}</span>
                      <div style="margin-top:0.35rem;">
                        <button class="copy-btn" data-copy="${{escapeHtml(e.en)}}" title="复制英文">Copy</button>
                      </div>
                    </td>
                    <td>
                      <span class="lang lang-vn">${{highlight(e.vn, q)}}</span>
                      <div style="margin-top:0.35rem;">
                        <button class="copy-btn" data-copy="${{escapeHtml(e.vn)}}" title="复制越南语">Sao chép</button>
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

      glossaryEl.querySelectorAll('button[data-copy]').forEach(btn => {{
        btn.addEventListener('click', () => copyText(btn.dataset.copy, btn));
      }});

      glossaryEl.querySelectorAll('.cat-header').forEach(header => {{
        header.addEventListener('click', () => {{
          header.parentElement.classList.toggle('collapsed');
        }});
      }});
    }}

    searchEl.addEventListener('input', () => {{ updateClearBtn(); render(searchEl.value); }});
    clearBtn.addEventListener('click', clearSearch);
    searchEl.addEventListener('keydown', (e) => {{ if (e.key === 'Escape') clearSearch(); }});
    updateClearBtn();
    render();
  </script>
</body>
</html>
"""


def main():
    if len(sys.argv) < 3:
        md_path = ROOT / "projects/002-内容/002-02-翻译/docs/terminology-glossary.md"
        out_path = ROOT / "projects/002-内容/002-02-翻译/docs/terminology-glossary.html"
    else:
        md_path = Path(sys.argv[1])
        out_path = Path(sys.argv[2])

    skin_txt = ROOT / "docs/怪兽巢穴代码.txt"
    if not skin_txt.exists():
        print(f"⚠️ 皮肤编号文件不存在: {skin_txt}")

    categories, dino_map = parse_glossary(md_path)
    skin_ids = parse_skin_ids(skin_txt) if skin_txt.exists() else {}

    # Expand skin category with IDs
    new_categories = []
    for cat in categories:
        if cat["category"] == "7. 皮肤名称 (Skins)":
            cat = expand_skin_entries(cat, skin_ids, dino_map)
        if cat["entries"]:
            new_categories.append(cat)

    html = build_html(new_categories)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"Generated: {out_path} ({sum(len(c['entries']) for c in new_categories)} entries in {len(new_categories)} categories)")


if __name__ == "__main__":
    main()
