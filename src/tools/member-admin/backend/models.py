import sqlite3
from datetime import datetime

from config import DATABASE_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,            -- 员工名称（花名）
    emp_no TEXT DEFAULT '',            -- 员工编号
    real_name TEXT DEFAULT '',         -- 姓名
    cn_name TEXT DEFAULT '',           -- 中文名
    position TEXT DEFAULT '其他',       -- 岗位：GM/军团长/其他
    status TEXT DEFAULT '在职',         -- 在职/其他
    probation_salary REAL DEFAULT 0, -- 试用期底薪
    formal_salary REAL DEFAULT 0,    -- 正式底薪
    employment_type TEXT DEFAULT '转正', -- 试用期/转正
    position_allowance REAL DEFAULT 0, -- 岗位津贴
    gm_allowance REAL DEFAULT 0,       -- GM津贴
    commission_rate TEXT DEFAULT '',   -- 分成比例
    entry_date TEXT DEFAULT '',        -- 入职日期 YYYY-MM-DD
    remark TEXT DEFAULT '',
    feishu_record_id TEXT DEFAULT '',  -- 飞书导入溯源
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS guilds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                -- 团名
    cn_name TEXT DEFAULT '',           -- 中文名（翻译）
    game_guild_id TEXT DEFAULT '',     -- 游戏内军团 ID
    server TEXT DEFAULT '',            -- 服务器
    leader_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    status TEXT DEFAULT '空缺',         -- 正常运营/临时接管/空缺/已解散
    operation_type TEXT DEFAULT '自营团', -- 自营团/野生团
    remark TEXT DEFAULT '',
    feishu_record_id TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS game_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    game_uid TEXT DEFAULT '',
    nickname TEXT DEFAULT '',
    guild_id INTEGER REFERENCES guilds(id) ON DELETE SET NULL,
    status TEXT DEFAULT '正常',         -- 正常/封禁/下野
    tiktok_account TEXT DEFAULT '',
    remark TEXT DEFAULT '',
    feishu_record_id TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS payment_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    account_type TEXT DEFAULT '其他',   -- 银行/MoMo/ZaloPay/其他
    account_name TEXT DEFAULT '',      -- 户名
    info_html TEXT DEFAULT '',         -- 富文本：账号/二维码/说明混排
    remark TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sql_scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    params TEXT DEFAULT '',          -- 参数名逗号分隔，如 month_start,month_end
    sql_text TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS commission_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,             -- YYYY-MM
    remark TEXT DEFAULT '',
    items_json TEXT DEFAULT '[]',    -- 明细快照
    summary_json TEXT DEFAULT '[]',  -- 汇总快照
    created_by TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',       -- super/admin/viewer
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,              -- create/update/delete/login
    entity_type TEXT NOT NULL,         -- employee/guild/account/payment_account
    entity_id INTEGER,
    entity_label TEXT DEFAULT '',
    changes TEXT DEFAULT '{}',         -- JSON: {field: {before, after}}
    ip TEXT DEFAULT '',
    created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_guilds_leader ON guilds(leader_employee_id);
CREATE INDEX IF NOT EXISTS idx_accounts_employee ON game_accounts(employee_id);
CREATE INDEX IF NOT EXISTS idx_accounts_guild ON game_accounts(guild_id);
CREATE INDEX IF NOT EXISTS idx_accounts_uid ON game_accounts(game_uid);
CREATE INDEX IF NOT EXISTS idx_payment_employee ON payment_accounts(employee_id);
CREATE INDEX IF NOT EXISTS idx_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_logs_time ON audit_logs(created_at);
"""

# 各表允许写入的字段（API 入参白名单）
TABLE_FIELDS = {
    "employees": ["nickname", "emp_no", "real_name", "cn_name", "position", "status",
                  "probation_salary", "formal_salary", "employment_type",
                  "position_allowance", "gm_allowance", "commission_rate",
                  "entry_date", "remark"],
    "guilds": ["name", "cn_name", "game_guild_id", "server", "leader_employee_id", "status", "operation_type", "remark"],
    "game_accounts": ["employee_id", "game_uid", "nickname", "guild_id", "status",
                      "tiktok_account", "remark"],
    "payment_accounts": ["employee_id", "account_type", "account_name", "info_html", "remark"],
    "sql_scripts": ["name", "description", "params", "sql_text"],
    "commission_snapshots": ["month", "remark"],
}

ENTITY_LABEL_FIELD = {
    "employees": "nickname",
    "guilds": "name",
    "game_accounts": "nickname",
    "payment_accounts": "account_name",
    "sql_scripts": "name",
    "commission_snapshots": "month",
}


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def row_to_dict(row):
    return dict(row) if row is not None else None


def get_by_id(table, row_id):
    conn = get_db()
    row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone()
    conn.close()
    return row_to_dict(row)


def insert_row(table, data):
    fields = [f for f in TABLE_FIELDS[table] if f in data]
    data = {f: data[f] for f in fields}
    data["created_at"] = now()
    data["updated_at"] = now()
    cols = ", ".join(data.keys())
    ph = ", ".join("?" for _ in data)
    conn = get_db()
    cur = conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({ph})", list(data.values()))
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def update_row(table, row_id, data):
    fields = [f for f in TABLE_FIELDS[table] if f in data]
    if not fields:
        return
    data = {f: data[f] for f in fields}
    data["updated_at"] = now()
    sets = ", ".join(f"{k} = ?" for k in data)
    conn = get_db()
    conn.execute(f"UPDATE {table} SET {sets} WHERE id = ?", list(data.values()) + [row_id])
    conn.commit()
    conn.close()


def delete_row(table, row_id):
    conn = get_db()
    conn.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))
    conn.commit()
    conn.close()


def list_rows(table, filters=None, keyword=None, keyword_fields=None, page=1, page_size=20,
              exclude=None):
    """filters: {field: value} 精确匹配；exclude: {field: value} 排除匹配；keyword 模糊搜索"""
    where, params = [], []
    for k, v in (filters or {}).items():
        if v not in (None, "", "all"):
            where.append(f"{k} = ?")
            params.append(v)
    for k, v in (exclude or {}).items():
        where.append(f"{k} != ?")
        params.append(v)
    if keyword and keyword_fields:
        where.append("(" + " OR ".join(f"{f} LIKE ?" for f in keyword_fields) + ")")
        params.extend([f"%{keyword}%"] * len(keyword_fields))
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) c FROM {table} {where_sql}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM {table} {where_sql} ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows], total
