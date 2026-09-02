#!/usr/bin/env python3
"""飞书智能表 → member-admin SQLite 一次性导入。

数据源：base KCmTb3czOapta6ssZjRc7FrfnV7
  - 员工信息表 tblq4nCVjkXPR2Nh  → employees
  - 军团基本信息表 tblCFw9m5OciBONQ → guilds
  - 团长账号表 tbl4lGgIpwGrFAvG   → game_accounts
排除：福利账号表、5/6/7 月薪资表、账号表的邮件恐龙数/皮肤数/兽币。

用法：python3 scripts/import_feishu.py [--db path]（默认 ../backend/members.db）
重复执行会先清空业务表（employees/guilds/game_accounts/payment_accounts），保留 admin_users/audit_logs。
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
import models  # noqa: E402

BASE_TOKEN = "KCmTb3czOapta6ssZjRc7FrfnV7"
TABLES = {
    "employees": "tblq4nCVjkXPR2Nh",
    "guilds": "tblCFw9m5OciBONQ",
    "accounts": "tbl4lGgIpwGrFAvG",
}

EMP_STATUS_MAP = {"在岗": "在职", "离职": "离职", "停薪": "停薪", "兼职": "其他"}
ACC_STATUS_MAP = {"正常": "正常", "封禁": "封禁", "冻结": "冻结", "回收": "回收"}

report = {"unmapped_position": [], "unmapped_status": [], "unmatched_leader": [],
          "unmatched_guild": [], "unmatched_account_employee": [], "guild_status_raw": {}}


def fetch_table(table_id):
    rows, fields, record_ids, offset = [], None, [], 0
    while True:
        out = subprocess.run(
            ["lark-cli", "base", "+record-list", "--base-token", BASE_TOKEN,
             "--table-id", table_id, "--limit", "200", "--offset", str(offset),
             "--format", "json"],
            capture_output=True, text=True, check=True).stdout
        d = json.loads(out)["data"]
        fields = d["fields"]
        rows.extend(d["data"])
        record_ids.extend(d["record_id_list"])
        if not d["has_more"]:
            break
        offset += 200
    return [dict(zip(fields, r), _record_id=rid) for r, rid in zip(rows, record_ids)]


def first(v):
    """select 字段返回数组，取第一个；空返回 None"""
    if isinstance(v, list):
        return v[0] if v else None
    return v


def link_id(v):
    """link 字段返回 [{id: rec...}]，取第一个 record_id"""
    if isinstance(v, list) and v and isinstance(v[0], dict):
        return v[0].get("id")
    return None


def num(v):
    if v in (None, ""):
        return 0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0


def date_str(v):
    if not v:
        return ""
    s = str(v)
    return s[:10]


def map_position(raw, nickname):
    s = (raw or "").strip()
    if "GM" in s.upper():
        return "GM"
    if s and s not in ("111",):
        return "军团长"  # 岗位列实际填的是团名
    report["unmapped_position"].append({"nickname": nickname, "岗位": s})
    return "军团长"


def parse_guild_ref(text):
    """'[Q服]Hoả Long（火龙）（9）' → ('Q服', 'Hoả Long（火龙）')"""
    if not text:
        return "", ""
    m = re.match(r"^\[([^\]]+)\](.*)$", text.strip())
    server, rest = (m.group(1), m.group(2)) if m else ("", text.strip())
    name = re.sub(r"[（(]\d+[）)]\s*$", "", rest).strip()
    return server, name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(Path(__file__).resolve().parent.parent / "backend" / "members.db"))
    args = ap.parse_args()

    import config
    config.DATABASE_PATH = args.db
    models.DATABASE_PATH = args.db
    models.init_db()

    conn = models.get_db()
    for t in ("game_accounts", "guilds", "payment_accounts", "employees"):
        conn.execute(f"DELETE FROM {t}")
    conn.commit()
    conn.close()

    emp_rows = fetch_table(TABLES["employees"])
    guild_rows = fetch_table(TABLES["guilds"])
    acc_rows = fetch_table(TABLES["accounts"])

    # 1. 员工
    emp_id_map = {}  # feishu_record_id -> sqlite id
    emp_name_map = {}
    for r in emp_rows:
        nickname = (r.get("员工名称") or "").strip()
        if not nickname:
            report["unmapped_status"].append({"record": r["_record_id"], "原因": "员工名称为空，跳过"})
            continue
        raw_status = first(r.get("状态"))
        status = EMP_STATUS_MAP.get(raw_status, "在职" if raw_status is None else "其他")
        if raw_status not in EMP_STATUS_MAP:
            report["unmapped_status"].append({"nickname": nickname, "状态": raw_status, "映射为": status})
        position = map_position(r.get("岗位"), nickname)
        data = {
            "nickname": nickname,
            "real_name": (r.get("姓名") or "").strip(),
            "cn_name": (r.get("中文") or "").strip(),
            "position": position,
            "status": status,
            "probation_salary": 0,
            "formal_salary": num(r.get("底薪")),
            "employment_type": "转正",
            "position_allowance": num(r.get("岗位津贴(w)")),
            "gm_allowance": num(r.get("GM津贴(w)")),
            "commission_rate": (r.get("分成比例") or "").strip(),
            "entry_date": date_str(r.get("入职日期")),
            "remark": (r.get("备注") or "").strip(),
        }
        fields = list(data.keys()) + ["feishu_record_id", "created_at", "updated_at"]
        vals = list(data.values()) + [r["_record_id"], models.now(), models.now()]
        conn = models.get_db()
        cur = conn.execute(
            f"INSERT INTO employees ({', '.join(fields)}) VALUES ({', '.join('?' * len(fields))})", vals)
        conn.commit()
        conn.close()
        emp_id_map[r["_record_id"]] = cur.lastrowid
        emp_name_map[nickname] = cur.lastrowid

    # 2. 军团
    guild_id_map = {}
    guild_name_map = {}
    for r in guild_rows:
        name = (r.get("团名") or "").strip()
        if not name:
            continue
        status = first(r.get("状态")) or "活跃"
        report["guild_status_raw"][status] = report["guild_status_raw"].get(status, 0) + 1
        leader_rec = link_id(r.get("团长名称"))
        leader_id = emp_id_map.get(leader_rec)
        if leader_rec and not leader_id:
            report["unmatched_leader"].append({"guild": name, "leader_record": leader_rec})
        conn = models.get_db()
        cur = conn.execute(
            "INSERT INTO guilds (name, server, leader_employee_id, status, operation_type, remark,"
            " feishu_record_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (name, first(r.get("服务器")) or "", leader_id, status,
             "自营团", (r.get("数据更新日期") or "").strip(),
             r["_record_id"], models.now(), models.now()))
        conn.commit()
        conn.close()
        guild_id_map[r["_record_id"]] = cur.lastrowid
        guild_name_map[name] = cur.lastrowid

    # 3. 账号
    n_acc = 0
    for r in acc_rows:
        leader_name = (r.get("团长名称") or "").strip()
        employee_id = emp_name_map.get(leader_name)
        if leader_name and not employee_id:
            report["unmatched_account_employee"].append({"account": r.get("昵称"), "团长名称": leader_name})
        _server, gname = parse_guild_ref(r.get("所属团") or "")
        guild_id = guild_name_map.get(gname)
        if gname and not guild_id:
            report["unmatched_guild"].append({"account": r.get("昵称"), "所属团": r.get("所属团")})
        raw_status = first(r.get("封禁状态"))
        status = ACC_STATUS_MAP.get(raw_status, "正常")
        conn = models.get_db()
        conn.execute(
            "INSERT INTO game_accounts (employee_id, game_uid, nickname, guild_id, status,"
            " tiktok_account, remark, feishu_record_id, created_at, updated_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (employee_id, (r.get("game_uid") or "").strip(), (r.get("昵称") or "").strip(),
             guild_id, status, (r.get("tiktok 账号") or "").strip(), (r.get("备注") or "").strip(),
             r["_record_id"], models.now(), models.now()))
        conn.commit()
        conn.close()
        n_acc += 1

    print(json.dumps({
        "imported": {"employees": len(emp_id_map), "guilds": len(guild_id_map), "accounts": n_acc},
        "report": report,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
