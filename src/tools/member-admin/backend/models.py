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
    position TEXT DEFAULT '其他',       -- 岗位：GM/军团长/GS/其他
    status TEXT DEFAULT '在职',         -- 在职/其他
    probation_salary REAL DEFAULT 0, -- 试用期底薪
    formal_salary REAL DEFAULT 0,    -- 正式底薪
    employment_type TEXT DEFAULT '转正', -- 试用期/转正
    position_allowance REAL DEFAULT 0, -- 岗位津贴
    gm_allowance REAL DEFAULT 0,       -- GM津贴
    commission_rate TEXT DEFAULT '',   -- 分成比例
    entry_date TEXT DEFAULT '',        -- 入职日期 YYYY-MM-DD
    leave_date TEXT DEFAULT '',        -- 离职日期 YYYY-MM-DD（月中离职折算底薪用）
    guild_id INTEGER REFERENCES guilds(id) ON DELETE SET NULL,  -- 从属军团（GS 用，非团长）
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
    account_type TEXT DEFAULT '其他',   -- 银行账户/MoMo电子钱包/ZaloPay电子钱包/其他
    account_name TEXT DEFAULT '',      -- 收款人
    account_no TEXT DEFAULT '',        -- 银行账号/钱包账号
    bank_name TEXT DEFAULT '',         -- 银行名称
    bank_branch TEXT DEFAULT '',       -- 开户支行
    phone TEXT DEFAULT '',             -- 手机号
    address TEXT DEFAULT '',           -- 地址
    qr_image TEXT DEFAULT '',          -- 二维码图片路径
    remark TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sql_scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    params TEXT DEFAULT '',          -- 参数名逗号分隔，如 day,server_id
    param_specs TEXT DEFAULT '',     -- JSON: [{name, control}] control: date/month/server/guild/text
    sql_text TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS commission_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,             -- YYYY-MM
    basis TEXT DEFAULT 'paid',       -- 收入口径 paid/shipped
    remark TEXT DEFAULT '',          -- 备注
    expectations TEXT DEFAULT '',    -- 工作期望（中越双语文本）
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

-- 直播人员（职能隔离：独立于游戏 employees 表；金额单位 VND）
CREATE TABLE IF NOT EXISTS live_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no TEXT DEFAULT '',            -- 员工编号（5位数字）
    nickname TEXT NOT NULL,            -- 昵称（主名）
    alias TEXT DEFAULT '',             -- 别名（第二身份名）
    real_name TEXT DEFAULT '',         -- 越南真实姓名
    cn_name TEXT DEFAULT '',           -- 中文名
    domain TEXT DEFAULT '直播',        -- 业务域：直播/游戏
    domain_code TEXT DEFAULT '',       -- 业务域代码（派生）：L/G
    position TEXT DEFAULT '陪玩',        -- 主播/陪玩/HR/剪辑/直播间管理员
    position_code TEXT DEFAULT '',     -- 岗位代码（派生）：ST/PW/HR/VE/LM/GL/GS/GM
    emp_type TEXT DEFAULT '全职',       -- 全职/兼职
    emp_type_code TEXT DEFAULT '',     -- 雇佣类型代码（派生）：F/P
    status TEXT DEFAULT '在职',         -- 在职/离职
    is_probation INTEGER DEFAULT 0,    -- 是否试用期 0/1
    probation_months INTEGER DEFAULT 0, -- 试用期月数 0/1/2
    probation_salary REAL DEFAULT 0,   -- 试用期第1个月底薪 VND
    probation_salary_m2 REAL DEFAULT 0,-- 试用期第2个月底薪 VND（仅2个月试用期）
    formal_salary REAL DEFAULT 0,      -- 转正底薪 VND（0=不拿工资）
    insurance REAL DEFAULT 0,          -- 保险基数（合同底薪）VND
    meal_allowance REAL DEFAULT 0,     -- 餐补：0=无，非0=有（存单价 VND/天，固定 60000）
    attendance_allowance REAL DEFAULT 0, -- 出勤补贴：0=无，非0=有（存单价 VND/天，固定 96000）
    housing_allowance REAL DEFAULT 0,  -- 住房补贴 VND（绝对数）
    transport_allowance REAL DEFAULT 0,-- 交通补贴 VND
    salary_mode TEXT DEFAULT '',       -- 薪资结构：纯底薪/底薪+分成/纯分成-固定/纯分成-阶梯/计件
    commission_rate TEXT DEFAULT '',   -- 直播分成比例（固定时），如 50%
    commission_tiers TEXT DEFAULT '',  -- 分成阶梯 JSON（阶梯时）：[{"kc":150000,"rate":10},...]
    biz_commission_rate TEXT DEFAULT '', -- 商单分成比例
    director_level TEXT DEFAULT '',    -- 剧本导演等级：S/A/B（技术导演与陪玩无分级）
    youtube_commission_rate TEXT DEFAULT '', -- YouTube 收入分成比例
    entry_date TEXT DEFAULT '',        -- 入职日期 YYYY-MM-DD
    leave_date TEXT DEFAULT '',        -- 离职日期
    sys_id TEXT DEFAULT '',            -- 陪玩系统ID
    sys_role TEXT DEFAULT '',          -- 系统角色（单字段多值，逗号分隔）：剧本导演,技术导演,陪玩
    account_holder TEXT DEFAULT '',    -- 账户人（留空=本人账户）
    bank TEXT DEFAULT '',              -- 银行
    account TEXT DEFAULT '',           -- 银行账号
    payee_phone TEXT DEFAULT '',       -- 收款人手机号
    phone_zalo TEXT DEFAULT '',        -- 联系电话/zalo
    discord TEXT DEFAULT '',           -- Discord 昵称
    discord_user_id TEXT DEFAULT '',   -- Discord user_id（用于签到机器人精确匹配）
    tiktok_live TEXT DEFAULT '',       -- TikTok 直播账号
    tiktok_clip TEXT DEFAULT '',       -- TikTok 剪辑账号
    tiktok_personal TEXT DEFAULT '',   -- TikTok 个人小号
    birth_date TEXT DEFAULT '',        -- 出生日期
    email TEXT DEFAULT '',             -- 电子邮箱
    address TEXT DEFAULT '',           -- 家庭地址
    id_card TEXT DEFAULT '',           -- 身份证
    emergency_contact TEXT DEFAULT '', -- 紧急联系人
    emergency_relation TEXT DEFAULT '',-- 联系人关系：父母/配偶/兄弟/其他
    emergency_phone TEXT DEFAULT '',   -- 紧急联系电话
    remark TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_employees_emp_no ON live_employees(emp_no);

-- 陪玩映射：play_detail 昵称 -> 直播员工（用于签到/数据校对）
CREATE TABLE IF NOT EXISTS player_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT NOT NULL,         -- play_detail 里出现的昵称
    emp_no TEXT DEFAULT '',            -- 关联直播员工编号
    discord TEXT DEFAULT '',           -- Discord 昵称
    pd_id INTEGER DEFAULT 0,           -- pd 侧 live_player.id（server 补缺，只填不改）
    remark TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_mapping_name ON player_mapping(player_name);
CREATE INDEX IF NOT EXISTS idx_player_mapping_emp_no ON player_mapping(emp_no);

-- 数据校对报告
CREATE TABLE IF NOT EXISTS verify_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date TEXT NOT NULL UNIQUE,  -- 报告日期 YYYY-MM-DD
    summary TEXT DEFAULT '{}',         -- JSON：sessions/matched_persons/match_rate/avg_diff
    content TEXT DEFAULT '',           -- Markdown 报告正文
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_verify_reports_date ON verify_reports(report_date);
"""

# 各表允许写入的字段（API 入参白名单）
TABLE_FIELDS = {
    "employees": ["nickname", "emp_no", "real_name", "cn_name", "position", "status",
                  "probation_salary", "formal_salary", "employment_type",
                  "position_allowance", "gm_allowance", "commission_rate",
                  "entry_date", "leave_date", "guild_id", "remark"],
    "guilds": ["name", "cn_name", "game_guild_id", "server", "leader_employee_id", "status", "operation_type", "remark"],
    "game_accounts": ["employee_id", "game_uid", "nickname", "guild_id", "status",
                      "tiktok_account", "remark"],
    "payment_accounts": ["employee_id", "account_type", "account_name", "account_no",
                         "bank_name", "bank_branch", "phone", "address", "qr_image", "remark"],
    "sql_scripts": ["name", "description", "params", "param_specs", "sql_text"],
    "commission_snapshots": ["month", "basis", "remark", "expectations", "employee_expectations"],
    "live_employees": ["emp_no", "nickname", "alias", "real_name", "cn_name",
                       "domain", "domain_code", "position", "position_code",
                       "emp_type", "emp_type_code", "status", "is_probation", "probation_months",
                       "probation_salary", "probation_salary_m2",
                       "formal_salary", "insurance",
                       "meal_allowance", "housing_allowance", "transport_allowance",
                       "attendance_allowance",
                       "salary_mode", "commission_rate", "commission_tiers", "biz_commission_rate",
                       "director_level", "youtube_commission_rate",
                       "entry_date", "leave_date", "sys_id", "sys_role",
                       "account_holder", "bank", "account", "payee_phone",
                       "phone_zalo", "discord", "discord_user_id",
                       "tiktok_live", "tiktok_clip", "tiktok_personal",
                       "birth_date", "email", "address", "id_card",
                       "emergency_contact", "emergency_relation", "emergency_phone", "remark"],
    "player_mapping": ["player_name", "emp_no", "discord", "discord_id", "remark"],
}

ENTITY_LABEL_FIELD = {
    "employees": "nickname",
    "guilds": "name",
    "game_accounts": "nickname",
    "payment_accounts": "account_name",
    "sql_scripts": "name",
    "commission_snapshots": "month",
    "live_employees": "nickname",
    "player_mapping": "player_name",
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
    # 迁移：player_mapping 增加 pd_id（存量库补列；pd 侧 live_player.id，只补缺不覆盖）
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(player_mapping)")]
    if "pd_id" not in cols:
        conn.execute("ALTER TABLE player_mapping ADD COLUMN pd_id INTEGER DEFAULT 0")
    # 迁移：live_employees 增加 attendance_allowance（出勤补贴，0=无/非0=单价）
    le_cols = [r["name"] for r in conn.execute("PRAGMA table_info(live_employees)")]
    if "attendance_allowance" not in le_cols:
        conn.execute("ALTER TABLE live_employees ADD COLUMN attendance_allowance REAL DEFAULT 0")
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
              exclude=None, join_filters=None, order_by=None):
    """filters: 精确匹配；exclude: 排除匹配；keyword 模糊搜索；
    join_filters: [(fk_col, ref_table, ref_col, value)] → fk_col IN (SELECT id FROM ref_table WHERE ref_col = value)"""
    where, params = [], []
    for k, v in (filters or {}).items():
        if v not in (None, "", "all"):
            where.append(f"{k} = ?")
            params.append(v)
    for k, v in (exclude or {}).items():
        where.append(f"{k} != ?")
        params.append(v)
    for fk_col, ref_table, ref_col, value in (join_filters or []):
        where.append(f"{fk_col} IN (SELECT id FROM {ref_table} WHERE {ref_col} = ?)")
        params.append(value)
    if keyword and keyword_fields:
        where.append("(" + " OR ".join(f"{f} LIKE ?" for f in keyword_fields) + ")")
        params.extend([f"%{keyword}%"] * len(keyword_fields))
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    order_sql = order_by or "id DESC"
    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) c FROM {table} {where_sql}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM {table} {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows], total
