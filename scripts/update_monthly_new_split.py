#!/usr/bin/env python3
"""
scripts/update_monthly_new_split.py
将分军团月报中的「当月新增」拆分为「当月纯新增」与「当月转入」。
只更新 2026-05 和 2026-06 两个月份的这三项字段，不触碰其他字段。
"""

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent.parent
BASE_TOKEN = "KqwPbKWmYarSNAsSGh8cFK4onde"
TABLE_ID = "tblXTJLUcMCaD0ui"


def load_reports():
    reports = {}
    for path, month in [
        (ROOT / "data/base_update_202605.json", "2026-05"),
        (ROOT / "data/base_update_20260628.json", "2026-06"),
    ]:
        data = json.loads(path.read_text(encoding="utf-8"))
        for r in data["monthly_report"]:
            reports[(month, r["guild_name"])] = {
                "new_pure": r["new_pure"],
                "transferred_total": r["transferred_total"],
                "new_total": r["new_total"],
            }
    return reports


def list_records():
    cmd = [
        "lark-cli", "base", "+record-list",
        "--base-token", BASE_TOKEN,
        "--table-id", TABLE_ID,
        "--field-id", "月份",
        "--field-id", "团名",
        "--limit", "200",
        "--format", "json",
        "--as", "user",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("❌ 查询记录失败:", res.stderr)
        raise SystemExit(1)
    data = json.loads(res.stdout)
    rows = data["data"]["data"]
    record_ids = data["data"]["record_id_list"]
    records = []
    for rid, row in zip(record_ids, rows):
        month = row[0]
        guild_name = row[1][0] if isinstance(row[1], list) else row[1]
        records.append({"record_id": rid, "month": month, "guild_name": guild_name})
    return records


def update_record(record_id, values):
    payload = {
        "当月纯新增": values["new_pure"],
        "当月转入": values["transferred_total"],
        "当月新增": values["new_total"],
    }
    cmd = [
        "lark-cli", "base", "+record-upsert",
        "--base-token", BASE_TOKEN,
        "--table-id", TABLE_ID,
        "--record-id", record_id,
        "--json", json.dumps(payload, ensure_ascii=False),
        "--as", "user",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"❌ 更新 {record_id} 失败:", res.stderr)
        return False
    return True


def main():
    reports = load_reports()
    records = list_records()

    updated = 0
    skipped = 0
    failed = 0

    for rec in records:
        key = (rec["month"], rec["guild_name"])
        if key not in reports:
            print(f"⏭️  跳过无匹配记录: {key}")
            skipped += 1
            continue
        vals = reports[key]
        print(f"🔄 更新 {rec['month']} {rec['guild_name']}: 纯新增={vals['new_pure']}, 转入={vals['transferred_total']}, 总计={vals['new_total']}")
        if update_record(rec["record_id"], vals):
            updated += 1
        else:
            failed += 1

    print(f"\n✅ 更新完成: 成功 {updated} 条, 跳过 {skipped} 条, 失败 {failed} 条")


if __name__ == "__main__":
    main()
