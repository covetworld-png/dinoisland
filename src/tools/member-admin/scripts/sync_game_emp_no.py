#!/usr/bin/env python3
"""游戏侧员工编号反向同步（member-admin）。

将 employees 表 6 人的 emp_no 同步为越南员工信息表的 5 位编号。
按 nickname + real_name 匹配（不硬编码 id），只 UPDATE emp_no，其他字段不动。

用法：python3 scripts/sync_game_emp_no.py [--db /opt/member-admin-test/backend/members.db] [--dry-run]
"""
import argparse
import sqlite3

DEFAULT_DB = "/opt/member-admin-test/backend/members.db"

# (nickname 关键词, real_name 关键词, 目标 emp_no)
MAPPING = [
    ("火龙", "CHAU MY PHUONG", "00047"),
    ("燕妮", "NGUYEN THI YEN NHI", "00048"),
    ("阿发", "TRIEU TIEN PHAT", "00008"),
    ("卢娜", "Oanh", "00051"),
    ("孟强", "Chu Mạnh Cường", "00049"),
    ("kalos", "THIỆN MINH", "00050"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, nickname, real_name, emp_no FROM employees").fetchall()
    changed = 0
    for nick, real, emp_no in MAPPING:
        # real_name 主匹配（昵称可能未更新，如测试库阿强=孟强）
        hits = [r for r in rows if real.upper() in (r["real_name"] or "").upper()]
        if len(hits) != 1:
            print(f"!! {nick} 匹配到 {len(hits)} 行，跳过（需人工检查）")
            continue
        r = hits[0]
        if nick not in (r["nickname"] or ""):
            print(f"   注意：{nick} 线上昵称为 {r['nickname']!r}（按 real_name 匹配）")
        if r["emp_no"] == emp_no:
            print(f"== {nick}(id={r['id']}) 已是 {emp_no}，跳过")
            continue
        print(f"{'[dry] ' if args.dry_run else ''}{nick}(id={r['id']}) emp_no: {r['emp_no']!r} -> {emp_no}")
        if not args.dry_run:
            conn.execute("UPDATE employees SET emp_no = ? WHERE id = ?", (emp_no, r["id"]))
            changed += 1
    if not args.dry_run:
        conn.commit()
    print(f"done, changed={changed}")
    conn.close()


if __name__ == "__main__":
    main()
