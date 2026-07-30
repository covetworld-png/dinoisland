"""只读 SQL 查询执行 + 月度分成计算（时点归属子查询口径）。

口径依据 [引用:data/DBSQL/SQL_KNOWLEDGE.md#时点归属SQL]：
- 写法A 子查询：订单归属 = 该 uid 同 server 下 joined_at < 订单时间 的最后一次入团
- amount 单位为 VND，禁止 /100
- prod_orders 时间为 GMT+7
"""
import re
import time

from config import MONSTER_DB

MAX_ROWS = 500
QUERY_TIMEOUT = 30

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|"
    r"set|use|lock|unlock|call|exec|into\s+outfile|into\s+dumpfile|load_file)\b",
    re.IGNORECASE,
)


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
    """带过团的军团长列表（含离职）及其名下军团，供两级勾选"""
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT e.id AS emp_id, e.nickname, e.status, e.employment_type,
               g.id AS guild_id, g.name AS guild_name, g.game_guild_id, g.server, g.operation_type, g.status AS guild_status
        FROM employees e JOIN guilds g ON g.leader_employee_id = e.id
        ORDER BY e.status = '离职', e.nickname, g.id
    """).fetchall()
    conn.close()
    leaders = {}
    for r in rows:
        l = leaders.setdefault(r["emp_id"], {
            "id": r["emp_id"], "nickname": r["nickname"], "status": r["status"],
            "employment_type": r["employment_type"], "guilds": []})
        l["guilds"].append({"id": r["guild_id"], "name": r["guild_name"],
                            "game_guild_id": r["game_guild_id"],
                            "server": r["server"], "operation_type": r["operation_type"],
                            "status": r["guild_status"]})
    return list(leaders.values())


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


def run_commission(month, db_path, employee_ids=None, guild_ids=None, basis="paid"):
    """month='YYYY-MM'，返回每团长分成明细。db_path 为 members.db 路径。
    guild_ids: 指定统计哪些军团（优先）；employee_ids: 指定哪些团长；
    都不传=全部非离职团长的团。basis: paid|shipped 收入口径"""
    import sqlite3
    if not re.match(r"^\d{4}-\d{2}$", month or ""):
        return {"ok": False, "error": "月份格式应为 YYYY-MM"}
    if basis not in BASIS:
        basis = "paid"

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
               e.status AS emp_status
        FROM guilds g JOIN employees e ON g.leader_employee_id = e.id
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
        base = g["probation_salary"] if g["employment_type"] == "试用期" else g["formal_salary"]
        commission = round(amount * rate)
        total = commission + (base or 0) + (g["position_allowance"] or 0) + (g["gm_allowance"] or 0)
        items.append({
            "employee": g["nickname"], "employee_status": g["emp_status"],
            "guild": g["name"], "guild_game_id": gid_raw, "server": g["server"],
            "operation_type": g["operation_type"],
            "revenue": amount, "commission_rate": g["commission_rate"] or "",
            "commission": commission, "employment_type": g["employment_type"],
            "base_salary": base or 0,
            "position_allowance": g["position_allowance"] or 0,
            "gm_allowance": g["gm_allowance"] or 0,
            "total": total,
            "unmatched": not matched_sid and gid_raw == "",
        })

    # 无军团收入的团长也列出（amount=0），按员工分组排序
    items.sort(key=lambda x: (x["employee"], x["guild"]))
    summary = {}
    for it in items:
        s = summary.setdefault(it["employee"], {
            "employee": it["employee"], "employment_type": it["employment_type"],
            "revenue": 0.0, "commission": 0, "base_salary": it["base_salary"],
            "position_allowance": it["position_allowance"], "gm_allowance": it["gm_allowance"],
            "total": 0, "guilds": []})
        s["revenue"] += it["revenue"]
        s["commission"] += it["commission"]
        s["guilds"].append(it["guild"])
    # 合计 = 分成合计 + 底薪/津贴（每人只计一次）
    for s in summary.values():
        s["total"] = s["commission"] + (s["base_salary"] or 0) + \
            (s["position_allowance"] or 0) + (s["gm_allowance"] or 0)

    return {"ok": True, "data": {
        "month": month,
        "basis": f"{BASIS[basis]['label']}｜时点归属子查询（prod_orders，GMT+7，amount 单位 VND）",
        "basis_key": basis,
        "items": items,
        "summary": sorted(summary.values(), key=lambda x: -x["total"]),
        "guild_count_with_revenue": len(revenue),
    }}
