#!/usr/bin/env python3
"""直播人员导入脚本（member-admin 直播模块）。

从 JSON 数据文件（由 越南员工信息表.xlsx 导出）导入 live_employees 表。
- 按 emp_no UPSERT：存在则更新，不存在则插入；幂等可重跑
- 金额单位：JSON 中为 K盾，落库 ×1000 转为 VND 基础数值
- 仅使用标准库，服务器上直接运行

用法：
  python3 scripts/import_live_employees.py --file live_employees.json \
      [--db /opt/member-admin-test/backend/members.db] [--dry-run]

JSON 生成（本地，需 openpyxl）：
  python3 scripts/import_live_employees.py --export-xlsx <xlsx路径> --out live_employees.json
"""
import argparse
import json
import sqlite3
import sys
from datetime import datetime

DEFAULT_DB = "/opt/member-admin-test/backend/members.db"

# JSON 字段（K盾）→ 表字段（VND）
MONEY_MAP = {
    "probation_salary_k": "probation_salary",
    "probation_salary_m2_k": "probation_salary_m2",
    "l_formal_salary_k": "formal_salary",
    "l_insurance_k": "insurance",
    "l_meal_allowance_k": "meal_allowance",
    "l_housing_allowance_k": "housing_allowance",
    "l_transport_allowance_k": "transport_allowance",
}
TEXT_FIELDS = ["emp_no", "nickname", "alias", "real_name", "cn_name", "domain", "position",
               "emp_type", "status", "entry_date", "leave_date", "sys_id", "sys_role",
               "account_holder", "bank", "account", "payee_phone",
               "phone_zalo", "discord", "birth_date",
               "email", "address", "id_card", "emergency_contact",
               "emergency_relation", "emergency_phone", "remark",
               "salary_mode", "commission_rate", "commission_tiers", "biz_commission_rate",
               "tiktok_live", "tiktok_clip", "tiktok_personal",
               "director_level", "youtube_commission_rate"]
INT_FIELDS = ["is_probation", "probation_months"]

# 代码值映射（与 backend/config.py 保持一致；兼任改写后在此统一派生，xlsx 代码列不参与入库）
DOMAIN_CODES = {"直播": "L", "游戏": "G"}
POSITION_CODES = {"主播": "ST", "陪玩": "PW", "HR": "HR", "剪辑": "VE", "直播间管理员": "LM",
                  "军团长": "GL", "GS": "GS", "GM": "GM"}
EMP_TYPE_CODES = {"全职": "F", "兼职": "P"}


def export_xlsx(xlsx_path, out_path):
    """本地工具：从 越南员工信息表.xlsx 导出 JSON（第2行为英文字段名）。"""
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    ws = wb["员工信息表"]
    rows = list(ws.iter_rows(values_only=True))
    keys = [str(k).strip() if k else "" for k in rows[1]]
    items = []
    for row in rows[2:]:
        rec = {keys[i]: row[i] for i in range(len(keys)) if keys[i]}
        if not rec.get("emp_no"):
            continue
        if rec.get("domain") == "直播":
            items.append(rec)
        elif rec.get("domain") == "游戏" and rec.get("sys_id"):
            # 游戏为主、兼任直播（如 00047 火龙/BẢO CHÂU）：同号进直播表，岗位记陪玩
            rec["position"] = "陪玩"
            rec["emp_type"] = "兼职"
            items.append(rec)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    print(f"exported {len(items)} 直播人员 -> {out_path}")


def audit_gate(conn, force):
    """安全闸：上次导入后若有 live_employee 界面修改，中止导入（防覆盖用户数据）。
    水位线存于目标库 _import_meta 表；首次运行建立基线不拦截历史。"""
    conn.execute("CREATE TABLE IF NOT EXISTS _import_meta (key TEXT PRIMARY KEY, value TEXT)")
    row = conn.execute("SELECT value FROM _import_meta WHERE key='last_import_at'").fetchone()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if row is None:
        conn.execute("INSERT INTO _import_meta VALUES ('last_import_at', ?)", (now,))
        return now
    last = row["value"]
    hits = conn.execute(
        "SELECT id, action, entity_label, created_at FROM audit_logs "
        "WHERE entity_type = 'live_employee' AND created_at > ? ORDER BY id", (last,)).fetchall()
    if hits and not force:
        print(f"⛔ 安全闸：检测到 {len(hits)} 条 live_employee 界面修改（{last} 之后），已中止导入：")
        for h in hits:
            print(f"  [{h['created_at']}] {h['action']} {h['entity_label']}")
        print("请先将这些修改回写 xlsx 源头，再加 --force 重跑（视为已回写）")
        sys.exit(1)
    if hits:
        print(f"⚠️ --force 放行：{len(hits)} 条界面修改视为已回写 xlsx")
    return now


def norm(rec):
    """JSON 记录 → 表记录（K盾转 VND，空值规范化）。"""
    out = {}
    for f in TEXT_FIELDS:
        v = rec.get(f)
        out[f] = "" if v is None else str(v).strip()
    for f in INT_FIELDS:
        v = rec.get(f)
        out[f] = int(v) if v not in (None, "") else 0
    for jf, tf in MONEY_MAP.items():
        v = rec.get(jf)
        out[tf] = float(v) * 1000 if v not in (None, "") else 0
    # 派生代码字段（基于兼任规则改写后的最终值）
    out["domain_code"] = DOMAIN_CODES.get(out["domain"], "")
    out["position_code"] = POSITION_CODES.get(out["position"], "")
    out["emp_type_code"] = EMP_TYPE_CODES.get(out["emp_type"], "")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="JSON 数据文件")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="跳过安全闸（确认界面修改已回写 xlsx 后使用）")
    ap.add_argument("--export-xlsx", help="从 xlsx 导出 JSON（本地用）")
    ap.add_argument("--out", default="live_employees.json")
    args = ap.parse_args()

    if args.export_xlsx:
        export_xlsx(args.export_xlsx, args.out)
        return

    with open(args.file, encoding="utf-8") as f:
        items = json.load(f)

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    if not args.dry_run:
        sync_time = audit_gate(conn, args.force)
    existing = {r["emp_no"]: r["id"] for r in
                conn.execute("SELECT id, emp_no FROM live_employees WHERE emp_no != ''")}
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    inserted = updated = 0
    for rec in items:
        row = norm(rec)
        emp_no = row["emp_no"]
        if emp_no in existing:
            sets = ", ".join(f"{k} = ?" for k in row) + ", updated_at = ?"
            sql = f"UPDATE live_employees SET {sets} WHERE id = ?"
            params = list(row.values()) + [now, existing[emp_no]]
            action = "update"
            updated += 1
        else:
            cols = ", ".join(list(row.keys()) + ["created_at", "updated_at"])
            ph = ", ".join("?" for _ in range(len(row) + 2))
            sql = f"INSERT INTO live_employees ({cols}) VALUES ({ph})"
            params = list(row.values()) + [now, now]
            action = "insert"
            inserted += 1
        if args.dry_run:
            print(f"[{action}] {emp_no} {row['nickname']} {row['real_name']}")
        else:
            conn.execute(sql, params)
    if not args.dry_run:
        conn.execute("UPDATE _import_meta SET value = ? WHERE key = 'last_import_at'", (sync_time,))
        conn.commit()
    total = conn.execute("SELECT COUNT(*) c FROM live_employees").fetchone()["c"]
    print(f"inserted={inserted} updated={updated} 表总数={total}" + (" (dry-run)" if args.dry_run else ""))
    conn.close()


if __name__ == "__main__":
    main()
