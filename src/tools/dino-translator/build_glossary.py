#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
术语表同步工具：002-02-翻译 的权威 md → App 运行时 glossary.json

数据流:
    projects/002-内容/002-02-翻译/docs/terminology-glossary.md   (权威源, 翻译子项目维护)
        └─> tools/build_glossary.py  ─>  ~/LangPlugin/data/glossary.json  (运行时派生物)

用法:
    python3 tools/build_glossary.py            # 同步到 ~/LangPlugin/data/
    python3 tools/build_glossary.py --dry-run  # 仅预览统计，不写文件

JSON 格式 (与 translator_app_mac.py load_glossary 兼容):
    {"terms": [{"zh": "...", "en": "...", "vn": "..."}, ...]}
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

MD_SOURCE = Path(__file__).resolve().parents[3] / '002-内容' / '002-02-翻译' / 'docs' / 'terminology-glossary.md'
JSON_TARGET = Path.home() / 'LangPlugin' / 'data' / 'glossary.json'


def parse_md(md_text):
    """解析所有含 中文/越南语 表头的 md 表格，抽取已定术语。"""
    lines = md_text.splitlines()
    terms, i, n = [], 0, len(lines)
    while i < n:
        line = lines[i]
        # 表头行判定：同一行同时含"中文"和"越南语"且为表格行
        if line.lstrip().startswith('|') and '中文' in line and '越南语' in line:
            cols = [c.strip() for c in line.strip('|').split('|')]
            try:
                izh = next(idx for idx, c in enumerate(cols) if c.startswith('中文'))
                ivn = next(idx for idx, c in enumerate(cols) if '越南语' in c)
                ien = next((idx for idx, c in enumerate(cols) if '英文' in c), None)
            except StopIteration:
                i += 1
                continue
            i += 1  # 跳过分隔行 |---|---|
            while i < n and lines[i].lstrip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip('|').split('|')]
                if len(cells) > max(izh, ivn) and not set(cells[izh]) <= {'-', ':'}:
                    zh_raw = cells[izh].replace('**', '')
                    vn = cells[ivn].replace('**', '')
                    en = cells[ien].replace('**', '') if ien is not None and ien < len(cells) else ''
                    # 状态过滤：仅收录 ✅ 已定 条目（无状态列时全收）
                    status = next((c for c in cells[izh + 1:] if ('✅' in c or '已定' in c or '待定' in c or '⏳' in c or '弃用' in c)), '')
                    if ('✅' in status or '已定' in status) or not status:
                        # zh 支持多别名 "A / B" 拆分
                        for zh in re.split(r'\s*/\s*', zh_raw):
                            if zh and vn:
                                terms.append({'zh': zh, 'en': en, 'vn': vn})
                i += 1
        else:
            i += 1
    # 去重：同 zh 保留首个
    seen, unique = set(), []
    for t in terms:
        if t['zh'] not in seen:
            seen.add(t['zh'])
            unique.append(t)
    return unique


def main():
    if not MD_SOURCE.exists():
        sys.exit(f'找不到术语表源文件: {MD_SOURCE}')
    terms = parse_md(MD_SOURCE.read_text(encoding='utf-8'))
    print(f'解析得到 {len(terms)} 条术语')
    for t in terms[:5]:
        print('  样例:', t)
    if '--dry-run' in sys.argv:
        return
    JSON_TARGET.parent.mkdir(parents=True, exist_ok=True)
    JSON_TARGET.write_text(json.dumps({
        'version': date.today().isoformat(),
        'source': str(MD_SOURCE.relative_to(MD_SOURCE.parents[3])),
        'terms': terms,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'✓ 已写入 {JSON_TARGET}')


if __name__ == '__main__':
    main()
