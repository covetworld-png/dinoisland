#!/usr/bin/env python3
"""重新计算指定 commission_snapshots 的活跃天数/日均在线时长。

用法（在服务器上执行）：
    cd /opt/member-admin-prod/backend
    python3 ../scripts/update_snapshot_activity.py [snapshot_id]

不传入 snapshot_id 时默认处理最新一条快照。
"""
import json
import os
import sqlite3
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))

from query_engine import _fetch_activity, _fetch_employee_uids


def main():
    db_path = os.path.join(BASE_DIR, "backend", "members.db")
    snapshot_id = int(sys.argv[1]) if len(sys.argv) > 1 else None

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    if snapshot_id:
        row = conn.execute("SELECT * FROM commission_snapshots WHERE id = ?", (snapshot_id,)).fetchone()
    else:
        row = conn.execute("SELECT * FROM commission_snapshots ORDER BY id DESC LIMIT 1").fetchone()

    if not row:
        print("未找到快照")
        conn.close()
        return

    snapshot = dict(row)
    items = json.loads(snapshot.get("items_json") or "[]")
    month = snapshot["month"]

    if not items:
        print(f"快照 {snapshot['id']} 无明细数据")
        conn.close()
        return

    # 区分军团长 / GM / 无军团团长
    leader_emp_ids = list({it["employee_id"] for it in items
                           if not it.get("is_gm") and it.get("guild") != "（无归属军团）"})
    other_emp_ids = list({it["employee_id"] for it in items
                          if it.get("is_gm") or it.get("guild") == "（无归属军团）"})

    # 从明细中的军团名称反推 guild_id，作为 leader 账号的筛选范围
    guild_names = {it["guild"] for it in items
                   if not it.get("is_gm") and it.get("guild") not in ("（无归属军团）", "（GM 无军团）")}
    guild_ids = []
    if guild_names:
        cur = conn.execute(
            f"SELECT id FROM guilds WHERE name IN ({','.join('?' * len(guild_names))})",
            tuple(guild_names),
        )
        guild_ids = [r["id"] for r in cur.fetchall()]

    uids_by_emp = _fetch_employee_uids(db_path, leader_emp_ids, guild_ids=guild_ids or None)
    uids_by_emp.update(_fetch_employee_uids(db_path, other_emp_ids))
    activity = _fetch_activity(uids_by_emp, month)

    updated = 0
    for it in items:
        eid = it.get("employee_id")
        act = activity.get(eid, {"active_days": 0, "avg_online_hours": 0.0})
        if it.get("active_days") != act["active_days"] or it.get("avg_online_hours") != act["avg_online_hours"]:
            it["active_days"] = act["active_days"]
            it["avg_online_hours"] = act["avg_online_hours"]
            updated += 1

    # 同步更新 summary_json
    summary = json.loads(snapshot.get("summary_json") or "[]")
    for s in summary:
        eid = s.get("employee_id")
        act = activity.get(eid, {"active_days": 0, "avg_online_hours": 0.0})
        s["active_days"] = act["active_days"]
        s["avg_online_hours"] = act["avg_online_hours"]

    conn.execute(
        "UPDATE commission_snapshots SET items_json = ?, summary_json = ?, updated_at = ? WHERE id = ?",
        (json.dumps(items, ensure_ascii=False), json.dumps(summary, ensure_ascii=False),
         __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M:%S"), snapshot["id"]),
    )
    conn.commit()
    conn.close()
    print(f"已更新快照 {snapshot['id']}（月份 {month}），更新 {updated} 条明细的活跃数据")


if __name__ == "__main__":
    main()
