#!/usr/bin/env python3
"""Discord ID 双列合并（2026-09-08）：live_employees.discord_id → discord_user_id

背景：live_employees 历史上存在双列（discord_id 旧列 44 行有值 / discord_user_id 新列），
员工表表单只暴露单一字段，旧 uid 界面上不可见，造成"绑定后旧 uid 丢失"的误解。

合并规则：
- merged = discord_user_id 现有值（保持顺序）+ discord_id 中不在并集里的补充值
- 合并后 discord_id 置空（列保留，代码端 reconcile 读两列并集，天然兼容）
- 幂等：重跑无变化（discord_id 已空 → 0 变更）

用法（服务器）：
    python3 scripts/merge_discord_uid.py /opt/member-admin-test/backend/members.db --dry-run
    python3 scripts/merge_discord_uid.py /opt/member-admin-test/backend/members.db --apply
"""
import argparse
import sqlite3
import sys
from datetime import datetime


def split_ids(raw):
    return [x.strip() for x in str(raw or '').split(',') if x.strip().isdigit()]


def merge(db_path, dry_run=True):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    changed = []
    try:
        rows = conn.execute(
            "SELECT id, emp_no, nickname, discord_id, discord_user_id FROM live_employees"
        ).fetchall()
        for r in rows:
            old_ids = split_ids(r['discord_id'])
            if not old_ids:
                continue  # 无旧值，无需合并
            new_ids = split_ids(r['discord_user_id'])
            merged = list(new_ids)
            for uid in old_ids:
                if uid not in merged:
                    merged.append(uid)
            new_val = ','.join(merged)
            changed.append({'emp_no': r['emp_no'], 'nickname': r['nickname'],
                            'before_uid': r['discord_user_id'] or '',
                            'after_uid': new_val,
                            'moved_from_discord_id': ','.join(old_ids)})
            if not dry_run:
                conn.execute(
                    "UPDATE live_employees SET discord_user_id = ?, discord_id = '', updated_at = ? WHERE id = ?",
                    (new_val, datetime.now().isoformat(sep=' ', timespec='seconds'), r['id']))
        if not dry_run:
            conn.commit()
    finally:
        conn.close()
    return changed


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Discord ID 双列合并')
    ap.add_argument('db', help='members.db 路径')
    ap.add_argument('--dry-run', action='store_true', help='只打印（默认）')
    ap.add_argument('--apply', action='store_true', help='写入')
    args = ap.parse_args()
    dry = not args.apply
    res = merge(args.db, dry_run=dry)
    print(f"{'DRY-RUN' if dry else 'APPLY'}：{len(res)} 行待合并" if res else "无变更（已合并或无需合并）")
    for c in res[:30]:
        print(f"· {c['emp_no']} {c['nickname']}：'{c['before_uid']}' + [{c['moved_from_discord_id']}] → '{c['after_uid']}'")
    if len(res) > 30:
        print(f"… 共 {len(res)} 行")
    sys.exit(0)
