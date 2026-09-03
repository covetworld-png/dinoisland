"""只读 SQL 查询执行 + 月度分成计算（时点归属子查询口径）。

口径依据 [引用:data/DBSQL/SQL_KNOWLEDGE.md#时点归属SQL]：
- 写法A 子查询：订单归属 = 该 uid 同 server 下 joined_at < 订单时间 的最后一次入团
- amount 单位为 VND，禁止 /100
- prod_orders 时间为 GMT+7
"""
import calendar
import re
import sqlite3
import time
from datetime import date, datetime

from config import MONSTER_DB

MAX_ROWS = 500
QUERY_TIMEOUT = 180  # 大表月度扫描（dino_op_logs 无有效组合索引）约 45-60s

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|"
    r"set|use|lock|unlock|call|exec|into\s+outfile|into\s+dumpfile|load_file)\b",
    re.IGNORECASE,
)


def _parse_ymd(s):
    """'YYYY-MM-DD' → date；空/非法 → None"""
    try:
        return datetime.strptime((s or "").strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _work_days(month, entry_date, leave_date):
    """在职天数折算：entry_date 晚于月初则起算入职日，leave_date 早于月末则止算离职日。
    返回 (在职天数, 当月天数)。区间无效（入职晚于月末/离职早于月初）→ 0。"""
    y, m = int(month[:4]), int(month[5:7])
    month_days = calendar.monthrange(y, m)[1]
    start, end = date(y, m, 1), date(y, m, month_days)
    e, l = _parse_ymd(entry_date), _parse_ymd(leave_date)
    if e and e > start:
        start = e
    if l and l < end:
        end = l
    if start > end:
        return 0, month_days
    return (end - start).days + 1, month_days


def _prorated_base(base_full, month, entry_date, leave_date):
    """底薪按在职天数/当月实际天数折算；无入离职限制时为全额。返回 (折算底薪, 在职天数, 当月天数)"""
    wd, md = _work_days(month, entry_date, leave_date)
    base_full = base_full or 0
    if wd == md:
        return base_full, wd, md
    return round(base_full * wd / md), wd, md


def _connect():
    import pymysql
    return pymysql.connect(
        host=MONSTER_DB["host"], port=MONSTER_DB["port"],
        user=MONSTER_DB["user"], password=MONSTER_DB["password"],
        database=MONSTER_DB["database"], charset="utf8mb4",
        connect_timeout=5, read_timeout=QUERY_TIMEOUT,
        cursorclass=pymysql.cursors.DictCursor,
    )


def validate_select_sql(sql):
    """只允许单条 SELECT/WITH 查询；返回清洗后的 sql 或抛 ValueError"""
    s = (sql or "").strip().rstrip(";").strip()
    if not s:
        raise ValueError("SQL 为空")
    if ";" in s:
        raise ValueError("只允许单条语句")
    head = s.split(None, 1)[0].upper()
    if head not in ("SELECT", "WITH", "SHOW", "DESC", "DESCRIBE", "EXPLAIN"):
        raise ValueError("只允许 SELECT 查询")
    m = FORBIDDEN.search(re.sub(r"'[^']*'", "''", s))
    if m:
        raise ValueError(f"包含禁止关键字: {m.group(1)}")
    return s


def run_query(sql, params=None):
    """执行只读查询，返回 {ok, columns, rows, row_count, truncated, elapsed_ms|error}"""
    if not MONSTER_DB["password"]:
        return {"ok": False, "error": "服务器未配置游戏数据库连接（MONSTER_DB_PASSWORD）"}
    try:
        s = validate_select_sql(sql)
    except ValueError as e:
        return {"ok": False, "error": str(e)}
    t0 = time.time()
    try:
        conn = _connect()
        with conn.cursor() as cur:
            cur.execute(s, params or {})
            rows = cur.fetchmany(MAX_ROWS + 1)
            columns = [d[0] for d in cur.description] if cur.description else []
        conn.close()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"查询失败: {e}"}
    truncated = len(rows) > MAX_ROWS
    rows = rows[:MAX_ROWS]
    # pymysql 对 decimal/datetime 需序列化
    clean = [[str(v) if v is not None and not isinstance(v, (int, float)) else v for v in r.values()]
             for r in rows]
    return {"ok": True, "data": {
        "columns": columns, "rows": clean, "row_count": len(clean),
        "truncated": truncated, "elapsed_ms": int((time.time() - t0) * 1000),
    }}


# ---------- 月度分成（时点归属子查询口径，按月汇总） ----------

# 写法A 子查询（[引用:data/DBSQL/SQL_KNOWLEDGE.md#时点归属SQL]），按 guild_id+server_id 聚合
# 口径：paid=仅当前 paid/shipped；shipped=已发货即计入（含 shipped_at 非空的单）
GUILD_MONTH_REVENUE_SQL = """
SELECT attributed.guild_id AS guild_id,
       attributed.server_id AS server_id,
       SUM(attributed.amount) AS total_amount
FROM (
    SELECT o.game_uid, o.amount, o.server_id,
           (SELECT tb.guild_id FROM game_user_guilds tb
            WHERE tb.game_uid = o.game_uid
              AND tb.server_id = o.server_id
              AND o.created_at > tb.joined_at
            ORDER BY tb.joined_at DESC LIMIT 1) AS guild_id
    FROM prod_orders o
    WHERE {status_filter}
      AND o.created_at >= %(month_start)s
      AND o.created_at < DATE_ADD(%(month_start)s, INTERVAL 1 MONTH)
) attributed
WHERE attributed.guild_id IS NOT NULL
GROUP BY attributed.guild_id, attributed.server_id
"""

BASIS = {
    "paid": {
        "filter": "o.status IN ('paid', 'shipped')",
        "label": "口径A：仅当前已付款（status IN paid/shipped）",
    },
    "shipped": {
        "filter": "(o.status IN ('paid', 'shipped') OR o.shipped_at IS NOT NULL)",
        "label": "口径B：已发货即计入（含状态回退的单）",
    },
}

def list_leaders(db_path):
    """军团长（含名下无军团的，有底薪）+ GS（从属军团）+ GM 列表，供两级勾选"""
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT e.id AS emp_id, e.nickname, e.status, e.employment_type,
               g.id AS guild_id, g.name AS guild_name, g.cn_name AS guild_cn_name, g.game_guild_id, g.server, g.operation_type, g.status AS guild_status
        FROM employees e LEFT JOIN guilds g ON g.leader_employee_id = e.id
        WHERE e.position = '军团长' OR g.leader_employee_id IS NOT NULL
        ORDER BY e.status = '离职', e.nickname, g.id
    """).fetchall()
    conn.close()
    leaders = {}
    for r in rows:
        l = leaders.setdefault(r["emp_id"], {
            "id": r["emp_id"], "nickname": r["nickname"], "status": r["status"],
            "employment_type": r["employment_type"], "position": "军团长", "guilds": []})
        if r["guild_id"] is None:
            continue  # 名下无军团的团长：只出人头，便于勾选底薪
        l["guilds"].append({"id": r["guild_id"], "name": r["guild_name"],
                            "cn_name": r["guild_cn_name"],
                            "game_guild_id": r["game_guild_id"],
                            "server": r["server"], "operation_type": r["operation_type"],
                            "status": r["guild_status"]})
    result = list(leaders.values())
    conn2 = sqlite3.connect(db_path)
    conn2.row_factory = sqlite3.Row
    # GS（从属军团但非团长）
    for e in conn2.execute("""
            SELECT e.id, e.nickname, e.status, e.employment_type,
                   g.id AS guild_id, g.name AS guild_name, g.cn_name AS guild_cn_name,
                   g.game_guild_id, g.server, g.operation_type, g.status AS guild_status
            FROM employees e LEFT JOIN guilds g ON e.guild_id = g.id
            WHERE e.position = 'GS'
            ORDER BY e.status = '离职', e.nickname""").fetchall():
        entry = {"id": e["id"], "nickname": e["nickname"], "status": e["status"],
                 "employment_type": e["employment_type"], "position": "GS", "guilds": []}
        if e["guild_id"]:
            entry["guilds"].append({"id": e["guild_id"], "name": e["guild_name"],
                                    "cn_name": e["guild_cn_name"],
                                    "game_guild_id": e["game_guild_id"],
                                    "server": e["server"],
                                    "operation_type": e["operation_type"],
                                    "status": e["guild_status"]})
        result.append(entry)
    # GM（不带团）
    for e in conn2.execute(
            "SELECT id, nickname, status, employment_type FROM employees WHERE position = 'GM'"
            " ORDER BY status = '离职', nickname").fetchall():
        result.append({"id": e["id"], "nickname": e["nickname"], "status": e["status"],
                       "employment_type": e["employment_type"], "position": "GM", "guilds": []})
    conn2.close()
    return result


SERVER_ALIAS = {"Q服": "Q", "K服": "K"}


def _parse_rate(s):
    """'10%' -> 0.10；'0.1' -> 0.10；空 -> 0"""
    if not s:
        return 0.0
    s = str(s).strip()
    try:
        if s.endswith("%"):
            return float(s[:-1]) / 100
        v = float(s)
        return v / 100 if v > 1 else v
    except ValueError:
        return 0.0


def _month_bounds(month):
    """'YYYY-MM' → (month_start_str 'YYYY-MM-DD', month_end_str 'YYYY-MM-DD')"""
    y, m = int(month[:4]), int(month[5:7])
    month_days = calendar.monthrange(y, m)[1]
    return f"{month}-01", f"{month}-{month_days:02d}"


def _fetch_employee_uids(db_path, emp_ids, guild_ids=None):
    """返回 {employee_id: [game_uid, ...]}（仅 employees/game_accounts 关联的游戏账号）。
    guild_ids 不为 None 时，只返回所属军团在该列表内的账号（用于手动勾选军团模式）。"""
    if not emp_ids:
        return {}
    placeholders = ",".join("?" * len(emp_ids))
    params = list(emp_ids)
    sql = (
        f"SELECT employee_id, game_uid FROM game_accounts "
        f"WHERE employee_id IN ({placeholders}) AND game_uid IS NOT NULL AND game_uid != ''"
    )
    if guild_ids:
        g_placeholders = ",".join("?" * len(guild_ids))
        sql += f" AND guild_id IN ({g_placeholders})"
        params.extend(guild_ids)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()
    result = {}
    for r in rows:
        result.setdefault(r["employee_id"], []).append(r["game_uid"])
    return result


def _fetch_activity(uids_by_emp, month):
    """基于 monster_test.game_dau_hour 计算每个员工的月活跃天数与日均在线小时数。
    口径：活跃天数 = 各账号去重活跃日期之和；日均在线时长 = 活跃小时行数 / 活跃天数。
    返回 {employee_id: {'active_days': int, 'avg_online_hours': float}}"""
    if not uids_by_emp:
        return {}
    month_start, month_end = _month_bounds(month)
    uid_to_emp = {}
    for emp_id, uids in uids_by_emp.items():
        for uid in uids:
            uid_to_emp[str(uid)] = emp_id
    if not uid_to_emp:
        return {}
    uid_list = list(uid_to_emp.keys())
    # 一次性查询所有账号（MySQL IN 长度通常足够；超过 1000 时分批）
    batch_size = 800
    uid_rows = []
    try:
        conn = _connect()
        with conn.cursor() as cur:
            for i in range(0, len(uid_list), batch_size):
                batch = uid_list[i:i + batch_size]
                cur.execute(
                    """
                    SELECT game_uid, active_date, COUNT(*) AS active_hours
                    FROM game_dau_hour
                    WHERE active_date >= %(ms)s AND active_date <= %(me)s
                      AND game_uid IN %(uids)s
                    GROUP BY game_uid, active_date
                    """,
                    {"ms": month_start, "me": month_end, "uids": tuple(batch)},
                )
                uid_rows.extend(cur.fetchall())
        conn.close()
    except Exception:  # noqa: BLE001
        return {}

    emp_hours = {}
    emp_dates = {}
    for r in uid_rows:
        uid = str(r["game_uid"])
        emp_id = uid_to_emp.get(uid)
        if emp_id is None:
            continue
        emp_dates.setdefault(emp_id, set()).add(str(r["active_date"]))
        emp_hours[emp_id] = emp_hours.get(emp_id, 0) + int(r["active_hours"] or 0)

    result = {}
    for emp_id in uids_by_emp:
        days = len(emp_dates.get(emp_id, set()))
        hours = emp_hours.get(emp_id, 0)
        result[emp_id] = {
            "active_days": days,
            "avg_online_hours": round(hours / days, 2) if days else 0.0,
        }
    return result


def run_commission(month, db_path, employee_ids=None, guild_ids=None, basis="paid",
                   gm_ids=None, leader_ids=None, deductions=None):
    """month='YYYY-MM'，返回每团长分成明细。db_path 为 members.db 路径。
    guild_ids: 指定统计哪些军团（优先）；employee_ids: 指定哪些团长；
    都不传=全部非离职团长的团。basis: paid|shipped 收入口径。
    gm_ids: 指定统计哪些 GM（None=默认全部非离职 GM）
    leader_ids: 指定统计哪些名下无军团的团长（None=默认模式下全部非离职）
    deductions: [{employee_id, amount, remark}] 保存时录入的当月扣除项"""
    import sqlite3
    if not re.match(r"^\d{4}-\d{2}$", month or ""):
        return {"ok": False, "error": "月份格式应为 YYYY-MM"}
    if basis not in BASIS:
        basis = "paid"

    # 扣除项按员工汇总
    deduction_map = {}
    deduction_breakdown = {}
    for d in (deductions or []):
        eid = d.get("employee_id")
        if eid is None:
            continue
        amt = float(d.get("amount") or 0)
        if amt <= 0:
            continue
        deduction_map[eid] = deduction_map.get(eid, 0) + amt
        deduction_breakdown.setdefault(eid, []).append({
            "amount": amt,
            "remark": (d.get("remark") or "").strip(),
        })

    rev = run_query(GUILD_MONTH_REVENUE_SQL.format(status_filter=BASIS[basis]["filter"]),
                    {"month_start": month + "-01"})
    if not rev.get("ok"):
        return rev
    # (server_alias, guild_id) -> amount
    revenue = {}
    for cols_row in rev["data"]["rows"]:
        gid, sid, amount = cols_row
        revenue[(str(sid), str(gid))] = float(amount or 0)

    # server_id -> alias
    sid_map = {}
    try:
        conn = _connect()
        with conn.cursor() as cur:
            cur.execute("SELECT server_id, alias FROM game_servers WHERE alias IS NOT NULL")
            for r in cur.fetchall():
                sid_map[str(r["server_id"])] = str(r["alias"])
        conn.close()
    except Exception:  # noqa: BLE001
        pass

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    guilds = conn.execute("""
        SELECT g.id, g.name, g.game_guild_id, g.server, g.operation_type,
               e.id AS emp_id, e.nickname, e.commission_rate, e.employment_type,
               e.probation_salary, e.formal_salary, e.position_allowance, e.gm_allowance,
               e.status AS emp_status, e.position AS emp_position,
               e.entry_date, e.leave_date
        FROM guilds g JOIN employees e ON g.leader_employee_id = e.id
        UNION ALL
        SELECT g.id, g.name, g.game_guild_id, g.server, g.operation_type,
               e.id AS emp_id, e.nickname, e.commission_rate, e.employment_type,
               e.probation_salary, e.formal_salary, e.position_allowance, e.gm_allowance,
               e.status AS emp_status, e.position AS emp_position,
               e.entry_date, e.leave_date
        FROM employees e JOIN guilds g ON e.guild_id = g.id AND e.position = 'GS'
    """).fetchall()
    conn.close()

    items = []
    for g in guilds:
        if guild_ids is not None:
            if g["id"] not in guild_ids:
                continue  # 未勾选的军团不统计
        elif employee_ids is not None:
            if g["emp_id"] not in employee_ids:
                continue  # 未勾选的团长不统计
        elif g["emp_status"] == "离职":
            continue  # 默认离职员工不计算分成
        alias = SERVER_ALIAS.get(g["server"], "")
        gid_raw = (g["game_guild_id"] or "").strip()
        # 兼容无前缀旧数据：用 server 前缀剥离
        gid_num = gid_raw
        for p in ("Q", "K"):
            if gid_num.upper().startswith(p) and gid_num[1:].isdigit():
                gid_num = gid_num[1:]
                break
        amount = 0.0
        matched_sid = ""
        for (sid, gid), amt in revenue.items():
            if gid == gid_num and sid_map.get(sid) == alias and alias:
                amount = amt
                matched_sid = sid
                break
        rate = _parse_rate(g["commission_rate"])
        base_full = g["probation_salary"] if g["employment_type"] == "试用期" else g["formal_salary"]
        base, work_days, month_days = _prorated_base(
            base_full, month, g["entry_date"], g["leave_date"])
        commission = round(amount * rate)
        emp_id = g["emp_id"]
        deduction = deduction_map.get(emp_id, 0)
        total = commission + (base or 0) + (g["position_allowance"] or 0) + (g["gm_allowance"] or 0) - deduction
        items.append({
            "employee": g["nickname"], "employee_status": g["emp_status"],
            "employee_id": emp_id,
            "guild": g["name"], "guild_game_id": gid_raw, "server": g["server"],
            "operation_type": g["operation_type"],
            "revenue": amount, "commission_rate": g["commission_rate"] or "",
            "commission": commission, "employment_type": g["employment_type"],
            "base_salary": base or 0, "base_salary_full": base_full or 0,
            "work_days": work_days, "month_days": month_days,
            "position_allowance": g["position_allowance"] or 0,
            "gm_allowance": g["gm_allowance"] or 0,
            "deduction": deduction,
            "deduction_breakdown": deduction_breakdown.get(emp_id, []),
            "total": total,
            "unmatched": not matched_sid and gid_raw == "",
            "emp_position": g["emp_position"],
            "expectations": "",
        })

    # GM：无军团收入，只发底薪+津贴
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    gm_rows = conn.execute(
        "SELECT * FROM employees WHERE position = 'GM'").fetchall()
    conn.close()
    default_mode = guild_ids is None and employee_ids is None
    for e in gm_rows:
        if gm_ids is not None:
            if e["id"] not in gm_ids:
                continue
        elif not default_mode:
            continue  # 手动勾选模式下 GM 只在 gm_ids 中勾选才计入
        elif e["status"] == "离职":
            continue
        base_full = e["probation_salary"] if e["employment_type"] == "试用期" else e["formal_salary"]
        base, work_days, month_days = _prorated_base(
            base_full, month, e["entry_date"], e["leave_date"])
        emp_id = e["id"]
        deduction = deduction_map.get(emp_id, 0)
        total = (base or 0) + (e["position_allowance"] or 0) + (e["gm_allowance"] or 0) - deduction
        items.append({
            "employee": e["nickname"], "employee_status": e["status"],
            "employee_id": emp_id,
            "guild": "（GM 无军团）", "guild_game_id": "", "server": "",
            "operation_type": "",
            "revenue": 0.0, "commission_rate": "", "commission": 0,
            "employment_type": e["employment_type"],
            "base_salary": base or 0, "base_salary_full": base_full or 0,
            "work_days": work_days, "month_days": month_days,
            "position_allowance": e["position_allowance"] or 0,
            "gm_allowance": e["gm_allowance"] or 0,
            "deduction": deduction,
            "deduction_breakdown": deduction_breakdown.get(emp_id, []),
            "total": total, "unmatched": False, "is_gm": True,
            "expectations": "",
        })

    # 名下无军团的军团长：无军团收入，只发底薪+津贴（有底薪）
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    noguild_leaders = conn.execute("""
        SELECT * FROM employees
        WHERE position = '军团长'
          AND id NOT IN (SELECT leader_employee_id FROM guilds
                         WHERE leader_employee_id IS NOT NULL)
    """).fetchall()
    conn.close()
    for e in noguild_leaders:
        if leader_ids is not None:
            if e["id"] not in leader_ids:
                continue
        elif not default_mode:
            continue  # 手动勾选模式下只在 leader_ids 勾选才计入
        elif e["status"] == "离职":
            continue
        base_full = e["probation_salary"] if e["employment_type"] == "试用期" else e["formal_salary"]
        base, work_days, month_days = _prorated_base(
            base_full, month, e["entry_date"], e["leave_date"])
        emp_id = e["id"]
        deduction = deduction_map.get(emp_id, 0)
        total = (base or 0) + (e["position_allowance"] or 0) + (e["gm_allowance"] or 0) - deduction
        items.append({
            "employee": e["nickname"], "employee_status": e["status"],
            "employee_id": emp_id,
            "guild": "（无归属军团）", "guild_game_id": "", "server": "",
            "operation_type": "",
            "revenue": 0.0, "commission_rate": "", "commission": 0,
            "employment_type": e["employment_type"],
            "base_salary": base or 0, "base_salary_full": base_full or 0,
            "work_days": work_days, "month_days": month_days,
            "position_allowance": e["position_allowance"] or 0,
            "gm_allowance": e["gm_allowance"] or 0,
            "deduction": deduction,
            "deduction_breakdown": deduction_breakdown.get(emp_id, []),
            "total": total, "unmatched": False,
            "expectations": "",
        })

    # 无军团收入的团长也列出（amount=0），按员工分组排序
    items.sort(key=lambda x: (x["employee"], x["guild"]))

    # 查询游戏活跃数据并附加到明细/汇总
    # 军团长：按勾选军团筛选 game_uid；GM / 无军团团长：统计所有账号
    leader_emp_ids = list({it["employee_id"] for it in items
                           if not it.get("is_gm") and it.get("guild") != "（无归属军团）"})
    other_emp_ids = list({it["employee_id"] for it in items
                          if it.get("is_gm") or it.get("guild") == "（无归属军团）"})
    uids_by_emp = _fetch_employee_uids(db_path, leader_emp_ids, guild_ids=guild_ids)
    uids_by_emp.update(_fetch_employee_uids(db_path, other_emp_ids))
    activity = _fetch_activity(uids_by_emp, month)
    for it in items:
        act = activity.get(it["employee_id"], {"active_days": 0, "avg_online_hours": 0.0})
        it["active_days"] = act["active_days"]
        it["avg_online_hours"] = act["avg_online_hours"]

    summary = {}
    for it in items:
        s = summary.setdefault(it["employee"], {
            "employee": it["employee"], "employment_type": it["employment_type"],
            "employee_id": it["employee_id"],
            "revenue": 0.0, "commission": 0, "base_salary": it["base_salary"],
            "base_salary_full": it["base_salary_full"],
            "work_days": it["work_days"], "month_days": it["month_days"],
            "position_allowance": it["position_allowance"], "gm_allowance": it["gm_allowance"],
            "total": 0, "guilds": [], "expectations": ""})
        s["revenue"] += it["revenue"]
        s["commission"] += it["commission"]
        s["guilds"].append(it["guild"])
    # 合计 = 分成合计 + 底薪/津贴（每人只计一次）
    for s in summary.values():
        s["deduction"] = deduction_map.get(s["employee_id"], 0)
        s["deduction_breakdown"] = deduction_breakdown.get(s["employee_id"], [])
        s["total"] = s["commission"] + (s["base_salary"] or 0) + \
            (s["position_allowance"] or 0) + (s["gm_allowance"] or 0) - s["deduction"]
        act = activity.get(s["employee_id"], {"active_days": 0, "avg_online_hours": 0.0})
        s["active_days"] = act["active_days"]
        s["avg_online_hours"] = act["avg_online_hours"]

    return {"ok": True, "data": {
        "month": month,
        "basis": f"{BASIS[basis]['label']}｜时点归属子查询（prod_orders，GMT+7，amount 单位 VND）",
        "basis_key": basis,
        "items": items,
        "summary": sorted(summary.values(), key=lambda x: -x["total"]),
        "guild_count_with_revenue": len(revenue),
    }}
