#!/usr/bin/env python3
"""
scripts/prepare_base_update.py
从 monster_test 拉取 6/1-6/28 的军团统计日报和团长工作量日报数据，
输出为 JSON 供后续批量写入飞书 Base。
"""

import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import pymysql

ROOT = Path(__file__).parent.parent
OUTPUT_PATH = ROOT / "data/base_update_20260628.json"

DB_HOST = "106.75.213.178"
DB_PORT = 13307
DB_USER = "robo"
DB_NAME = "monster_test"

DATE_START = "2026-06-01"
DATE_END = "2026-06-28"

SERVER_ID_MAP = {
    "Q服": "750748016054341",
    "K服": "768538488131653",
}

# 自营团（与现有 Base 中一致）
SELF_GUILDS = [
    {"guild_id": 2, "guild_name": "TOP.Legend", "server_name": "Q服", "leader_name": "红山", "leader_uid": 13219628, "status": "正常运营"},
    {"guild_id": 9, "guild_name": "Hoả Long", "server_name": "Q服", "leader_name": "火龙", "leader_uid": 13219626, "status": "正常运营"},
    {"guild_id": 86, "guild_name": "NguyệtCung", "server_name": "Q服", "leader_name": "", "leader_uid": 0, "status": "已解散"},
    {"guild_id": 5, "guild_name": "Tu Tiên", "server_name": "Q服", "leader_name": "燕妮", "leader_uid": 13219701, "status": "正常运营"},
    {"guild_id": 62, "guild_name": "GOD DINO", "server_name": "Q服", "leader_name": "阿景", "leader_uid": 13219668, "status": "临时接管"},
    {"guild_id": 103, "guild_name": "Thiên Đế", "server_name": "Q服", "leader_name": "阿公", "leader_uid": 13219663, "status": "空缺"},
    {"guild_id": 49, "guild_name": "Long Chiến", "server_name": "K服", "leader_name": "阿凯", "leader_uid": 13229525, "status": "正常运营"},
    {"guild_id": 3, "guild_name": "Thiên Cơ", "server_name": "K服", "leader_name": "阿杰", "leader_uid": 13221220, "status": "空缺"},
    {"guild_id": 11, "guild_name": "Hắc Ám", "server_name": "K服", "leader_name": "文猛", "leader_uid": 13220114, "status": "空缺"},
    {"guild_id": 37, "guild_name": "Nhật Thực", "server_name": "K服", "leader_name": "阿发", "leader_uid": 13219767, "status": "临时接管"},
]

# 野生团（6/28 当日活跃 Top2）
WILD_GUILDS = [
    {"guild_id": 30, "guild_name": "Vô Gia Cư", "server_name": "Q服", "leader_uid": 13220505, "leader_name": "BabyBean", "status": "正常运营"},
    {"guild_id": 98, "guild_name": "HỏaLong2", "server_name": "Q服", "leader_uid": 13221234, "leader_name": "Akesh", "status": "正常运营"},
    {"guild_id": 40, "guild_name": "THIÊN HÀ", "server_name": "K服", "leader_uid": 13222366, "leader_name": "Redbull", "status": "正常运营"},
    {"guild_id": 52, "guild_name": "CHU TƯỚC", "server_name": "K服", "leader_uid": 13225779, "leader_name": "cody", "status": "正常运营"},
]

ALL_GUILDS = SELF_GUILDS + WILD_GUILDS
ALL_GUILD_KEYS = {(g["server_name"], g["guild_id"]) for g in ALL_GUILDS}

# Base 团名单选字段中的选项名（部分带中文括号标注）
GUILD_NAME_OPTION_MAP = {
    "Thiên Cơ": "Thiên Cơ（天机）",
    "TOP.Legend": "TOP.Legend",
    "Tu Tiên": "Tu Tiên（修仙）",
    "Hoả Long": "Hoả Long（火龙）",
    "Thiên Đế": "Thiên Đế（天帝）",
    "Long Chiến": "Long Chiến（龙战）",
    "Hắc Ám": "Hắc Ám（黑暗）",
    "HỏaLong2": "HỏaLong2（火龙2）",
    "Nhật Thực": "Nhật Thực（日食）",
    "NguyệtCung": "NguyệtCung（月宫）",
    "GOD DINO": "GOD DINO",
    "Vô Gia Cư": "Vô Gia Cư（流浪）",
    "THIÊN HÀ": "THIÊN HÀ（银河）",
    "CHU TƯỚC": "CHU TƯỚC（朱雀）",
}


def get_db_password() -> str:
    secrets_path = ROOT / "memory/secrets.md"
    if secrets_path.exists():
        text = secrets_path.read_text()
        m = re.search(r"\|\s*密码\s*\|\s*`([^`]+)`\s*\|", text)
        if m:
            return m.group(1)
    return None


def connect():
    password = get_db_password()
    if not password:
        print("❌ 无法读取数据库密码")
        sys.exit(1)
    return pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=password,
        database=DB_NAME, charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor
    )


def date_range(start: str, end: str):
    cur = datetime.strptime(start, "%Y-%m-%d").date()
    end = datetime.strptime(end, "%Y-%m-%d").date()
    while cur <= end:
        yield cur.strftime("%Y-%m-%d")
        cur += timedelta(days=1)


def resolve_guild_at_date(guild_membership, game_uid, server_id, date_str):
    """返回用户在某日期末的最新归属团 guild_id"""
    key = (game_uid, server_id)
    if key not in guild_membership:
        return None
    cutoff = datetime.strptime(f"{date_str} 23:59:59", "%Y-%m-%d %H:%M:%S")
    best = None
    best_time = None
    for gid, joined in guild_membership[key]:
        if joined <= cutoff:
            if best_time is None or joined > best_time:
                best = gid
                best_time = joined
    return best


def fetch_data(conn):
    sid_list = [f"'{v}'" for v in SERVER_ID_MAP.values()]
    sid_in = ",".join(sid_list)
    start_dt = f"{DATE_START} 00:00:00"
    end_dt = f"{DATE_END} 23:59:59"

    cur = conn.cursor()

    # 1. 所有入团记录（用于归属判断和新增/转入统计）
    print("📥 拉取入团记录...")
    cur.execute(f"""
        SELECT game_uid, server_id, guild_id, joined_at
        FROM game_user_guilds
        WHERE server_id IN ({sid_in})
          AND joined_at <= %s
        ORDER BY game_uid, server_id, joined_at
    """, (end_dt,))
    guild_membership = defaultdict(list)  # (uid, sid) -> [(gid, joined_at)]
    prior_guild_set = set()  # (uid, sid) 是否有 prior guild
    join_events = []  # 用于新增/转入统计
    for row in cur.fetchall():
        uid = int(row["game_uid"])
        sid = row["server_id"]
        gid = int(row["guild_id"])
        joined = row["joined_at"]
        key = (uid, sid)
        if guild_membership[key]:
            prior_guild_set.add(key)
        guild_membership[key].append((gid, joined))
        if DATE_START <= joined.strftime("%Y-%m-%d") <= DATE_END:
            join_events.append({
                "game_uid": uid,
                "server_id": sid,
                "guild_id": gid,
                "joined_at": joined,
                "has_prior": key in prior_guild_set,
            })

    # 2. 每日活跃用户（按 UID+server 去重，game_dau_hour 同 UID 同一天可能有多条小时记录）
    print("📥 拉取每日活跃用户...")
    cur.execute(f"""
        SELECT DISTINCT active_date, game_uid, server_id
        FROM game_dau_hour
        WHERE active_date BETWEEN %s AND %s
          AND server_id IN ({sid_in})
    """, (DATE_START, DATE_END))
    dau_rows = cur.fetchall()

    # 3. 充值记录
    print("📥 拉取充值记录...")
    cur.execute(f"""
        SELECT amount, created_at, game_uid, server_id
        FROM prod_orders
        WHERE status IN ('paid', 'shipped')
          AND created_at BETWEEN %s AND %s
          AND server_id IN ({sid_in})
    """, (start_dt, end_dt))
    order_rows = cur.fetchall()

    # 4. 团长日志
    leader_uids = [str(g["leader_uid"]) for g in ALL_GUILDS if g["leader_uid"]]
    print(f"📥 拉取团长日志 (UIDs: {len(leader_uids)})...")
    if leader_uids:
        uid_in = ",".join(leader_uids)
        cur.execute(f"""
            SELECT game_uid, server_id, createtime, type_name
            FROM dino_game_logs
            WHERE createtime BETWEEN %s AND %s
              AND game_uid IN ({uid_in})
        """, (start_dt, end_dt))
        log_rows = cur.fetchall()
    else:
        log_rows = []

    cur.close()
    return guild_membership, join_events, dau_rows, order_rows, log_rows


def build_guild_daily(guild_membership, join_events, dau_rows, order_rows):
    """构建军团统计日报：日期 -> (server_name, guild_id) -> 指标"""
    daily = defaultdict(lambda: defaultdict(lambda: {
        "active": 0, "new": 0, "transferred": 0, "recharge": 0
    }))

    # 活跃用户按日期+归属团聚合（去重）
    seen_active = set()
    for r in dau_rows:
        date_str = r["active_date"].strftime("%Y-%m-%d") if hasattr(r["active_date"], "strftime") else str(r["active_date"])
        uid = int(r["game_uid"])
        sid = r["server_id"]
        server_name = "Q服" if sid == SERVER_ID_MAP["Q服"] else "K服"
        gid = resolve_guild_at_date(guild_membership, uid, sid, date_str)
        if gid is not None:
            key = (date_str, uid, server_name, gid)
            if key not in seen_active:
                seen_active.add(key)
                daily[date_str][(server_name, gid)]["active"] += 1

    # 新增/转入按日期+团聚合（去重）
    seen_join = set()
    for e in join_events:
        date_str = e["joined_at"].strftime("%Y-%m-%d")
        server_name = "Q服" if e["server_id"] == SERVER_ID_MAP["Q服"] else "K服"
        key = (date_str, e["game_uid"], server_name, e["guild_id"])
        if key in seen_join:
            continue
        seen_join.add(key)
        gkey = (server_name, e["guild_id"])
        if e["has_prior"]:
            daily[date_str][gkey]["transferred"] += 1
        else:
            daily[date_str][gkey]["new"] += 1

    # 充值按日期+归属团聚合（时点归属，同一订单只计一次）
    seen_order = set()
    for r in order_rows:
        created = r["created_at"]
        date_str = created.strftime("%Y-%m-%d")
        uid = int(r["game_uid"])
        sid = r["server_id"]
        server_name = "Q服" if sid == SERVER_ID_MAP["Q服"] else "K服"
        # 使用订单唯一标识去重（game_uid+server_id+created_at+amount）
        okey = (r["game_uid"], sid, created.strftime("%Y-%m-%d %H:%M:%S"), int(r["amount"]))
        if okey in seen_order:
            continue
        seen_order.add(okey)
        gid = resolve_guild_at_date(guild_membership, uid, sid, date_str)
        if gid is not None:
            daily[date_str][(server_name, gid)]["recharge"] += int(r["amount"])

    # 构建最终数组
    result = []
    for date_str in date_range(DATE_START, DATE_END):
        for g in ALL_GUILDS:
            key = (g["server_name"], g["guild_id"])
            metrics = daily[date_str][key]
            result.append({
                "date": date_str,
                "server_name": g["server_name"],
                "guild_id": g["guild_id"],
                "guild_name": GUILD_NAME_OPTION_MAP.get(g["guild_name"], g["guild_name"]),
                "leader_name": g["leader_name"],
                "active": metrics["active"],
                "new": metrics["new"],
                "transferred": metrics["transferred"],
                "recharge_wan": round(metrics["recharge"] / 10000, 2),
                "status": g["status"],
                "type": "野生团" if g in WILD_GUILDS else "自营团",
            })
    return result


def build_monthly_report(guild_daily):
    """基于日报数据聚合 2026-06 月报"""
    monthly = {}
    for r in guild_daily:
        if not r["date"].startswith("2026-06"):
            continue
        key = (r["server_name"], r["guild_id"])
        if key not in monthly:
            monthly[key] = {
                "server_name": r["server_name"],
                "guild_id": r["guild_id"],
                "guild_name": r["guild_name"],
                "month": "2026-06",
                "stat_date": "2026-06-28",
                "active_uids": set(),
                "active_7d_uids": set(),
                "new_pure": 0,
                "transferred_total": 0,
                "new_total": 0,
                "recharge_total": 0.0,
            }
        m = monthly[key]
        # 当月活跃：去重所有当日活跃 UID（guild_daily 中没有 UID，需从数据库聚合；这里用 active 人数简单累加不准确）
        # 实际上 guild_daily 中只有活跃人数，没有 UID。所以月报活跃人数需要从原始数据重新聚合。
        m["new_pure"] += r["new"]
        m["transferred_total"] += r["transferred"]
        m["new_total"] += r["new"] + r["transferred"]
        m["recharge_total"] += r["recharge_wan"]
    
    # 从原始 DAU 重新聚合当月活跃和近7天活跃 UID
    # 这部分逻辑放在 build_guild_daily 之后，需要原始 dau_rows
    return monthly


def build_leader_daily(log_rows):
    """构建团长工作量日报：日期 -> leader_uid -> 指标"""
    leader_uids = {g["leader_uid"] for g in ALL_GUILDS if g["leader_uid"]}
    uid_to_guild = {g["leader_uid"]: g for g in ALL_GUILDS if g["leader_uid"]}

    daily = defaultdict(lambda: defaultdict(lambda: {
        "log_count": 0, "kill_count": 0, "hours": set(), "last_login": None
    }))

    for r in log_rows:
        uid = int(r["game_uid"])
        if uid not in leader_uids:
            continue
        date_str = r["createtime"].strftime("%Y-%m-%d")
        hour = r["createtime"].hour
        daily[date_str][uid]["log_count"] += 1
        daily[date_str][uid]["hours"].add(hour)
        if r["type_name"] == "恐龙死亡":
            daily[date_str][uid]["kill_count"] += 1
        if daily[date_str][uid]["last_login"] is None or r["createtime"] > daily[date_str][uid]["last_login"]:
            daily[date_str][uid]["last_login"] = r["createtime"]

    result = []
    for date_str in date_range(DATE_START, DATE_END):
        for uid in leader_uids:
            g = uid_to_guild[uid]
            m = daily[date_str][uid]
            last_login = m["last_login"].strftime("%Y-%m-%d %H:%M") if m["last_login"] else "—"
            result.append({
                "date": date_str,
                "leader_uid": uid,
                "leader_name": g["leader_name"],
                "server_name": g["server_name"],
                "guild_name": GUILD_NAME_OPTION_MAP.get(g["guild_name"], g["guild_name"]),
                "last_login": last_login,
                "online_hours": len(m["hours"]),
                "actions": m["log_count"],
                "kills": m["kill_count"],
            })
    return result


def main():
    print(f"🔗 连接数据库 {DB_HOST}:{DB_PORT}...")
    conn = connect()
    try:
        guild_membership, join_events, dau_rows, order_rows, log_rows = fetch_data(conn)
        print("\n🏗️ 构建军团统计日报...")
        guild_daily = build_guild_daily(guild_membership, join_events, dau_rows, order_rows)
        print("🏗️ 构建团长工作量日报...")
        leader_daily = build_leader_daily(log_rows)
        print("🏗️ 构建分军团月报...")
        monthly_report = build_monthly_report(guild_daily)
        # 从原始 DAU 聚合当月活跃和近7天活跃 UID
        monthly_active_uids = defaultdict(lambda: {"month": set(), "7d": set()})
        cutoff_7d = datetime.strptime("2026-06-22", "%Y-%m-%d").date()
        for r in dau_rows:
            date_str = r["active_date"].strftime("%Y-%m-%d") if hasattr(r["active_date"], "strftime") else str(r["active_date"])
            if not date_str.startswith("2026-06"):
                continue
            uid = int(r["game_uid"])
            sid = r["server_id"]
            server_name = "Q服" if sid == SERVER_ID_MAP["Q服"] else "K服"
            gid = resolve_guild_at_date(guild_membership, uid, sid, date_str)
            if gid is None:
                continue
            key = (server_name, gid)
            monthly_active_uids[key]["month"].add(uid)
            if datetime.strptime(date_str, "%Y-%m-%d").date() >= cutoff_7d:
                monthly_active_uids[key]["7d"].add(uid)
        
        monthly_result = []
        for key, m in monthly_report.items():
            uids = monthly_active_uids.get(key, {"month": set(), "7d": set()})
            monthly_result.append({
                "server_name": m["server_name"],
                "guild_id": m["guild_id"],
                "guild_name": m["guild_name"],
                "month": m["month"],
                "stat_date": m["stat_date"],
                "active_month": len(uids["month"]),
                "active_7d": len(uids["7d"]),
                "new_pure": m["new_pure"],
                "transferred_total": m["transferred_total"],
                "new_total": m["new_total"],
                "recharge_total": round(m["recharge_total"], 2),
                "kills": None,
                "deaths": None,
            })

        output = {
            "meta": {
                "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "date_range": [DATE_START, DATE_END],
                "guild_count": len(ALL_GUILDS),
                "wild_guild_count": len(WILD_GUILDS),
            },
            "wild_guilds": WILD_GUILDS,
            "guild_daily": guild_daily,
            "leader_daily": leader_daily,
            "monthly_report": monthly_result,
        }

        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n✅ 已输出: {OUTPUT_PATH}")
        print(f"   军团日报记录: {len(guild_daily)}")
        print(f"   团长日报记录: {len(leader_daily)}")
        print(f"   分军团月报记录: {len(monthly_result)}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
