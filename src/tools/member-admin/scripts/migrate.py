#!/usr/bin/env python3
"""member-admin 数据库原地迁移脚本（在服务器上执行）。

规则：测试/正式环境的数据是用户正在编辑的生产数据，禁止重新导入覆盖。
所有表结构变更必须写成幂等迁移，追加到 MIGRATIONS 列表。

用法：python3 scripts/migrate.py [--db /opt/member-admin-test/backend/members.db]
"""
import argparse
import re
import sqlite3
from pathlib import Path

DEFAULT_DB = "/opt/member-admin-test/backend/members.db"

# (迁移名, [SQL 语句...]) —— 每条迁移幂等，按顺序执行并记录
MIGRATIONS = [
    ("20260730_drop_guild_nickname", [
        "ALTER TABLE guilds DROP COLUMN nickname",
    ]),
    ("20260730_add_guild_game_id", [
        "ALTER TABLE guilds ADD COLUMN game_guild_id TEXT DEFAULT ''",
    ]),
    ("20260730_add_employee_emp_no", [
        "ALTER TABLE employees ADD COLUMN emp_no TEXT DEFAULT ''",
    ]),
    ("20260730_add_sql_scripts", [
        """CREATE TABLE IF NOT EXISTS sql_scripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            params TEXT DEFAULT '',
            sql_text TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT
        )""",
    ]),
    ("20260730_add_commission_snapshots", [
        """CREATE TABLE IF NOT EXISTS commission_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            month TEXT NOT NULL,
            remark TEXT DEFAULT '',
            items_json TEXT DEFAULT '[]',
            summary_json TEXT DEFAULT '[]',
            created_by TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT
        )""",
    ]),
    ("20260730_add_user_role", [
        "ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'admin'",
        "UPDATE admin_users SET role = 'super' WHERE username = 'robo'",
    ]),
    ("20260730_add_guild_cn_name", [
        "ALTER TABLE guilds ADD COLUMN cn_name TEXT DEFAULT ''",
    ]),
    ("20260730_add_snapshot_basis", [
        "ALTER TABLE commission_snapshots ADD COLUMN basis TEXT DEFAULT 'paid'",
    ]),
    ("20260731_rename_payment_types", [
        "UPDATE payment_accounts SET account_type = '银行账户' WHERE account_type = '银行'",
        "UPDATE payment_accounts SET account_type = 'MoMo 电子钱包' WHERE account_type = 'MoMo'",
        "UPDATE payment_accounts SET account_type = 'ZaloPay 电子钱包' WHERE account_type = 'ZaloPay'",
    ]),
    ("20260731_payment_structured", [
        "ALTER TABLE payment_accounts ADD COLUMN account_no TEXT DEFAULT ''",
        "ALTER TABLE payment_accounts ADD COLUMN bank_name TEXT DEFAULT ''",
        "ALTER TABLE payment_accounts ADD COLUMN bank_branch TEXT DEFAULT ''",
        "ALTER TABLE payment_accounts ADD COLUMN phone TEXT DEFAULT ''",
        "ALTER TABLE payment_accounts ADD COLUMN address TEXT DEFAULT ''",
        "ALTER TABLE payment_accounts ADD COLUMN qr_image TEXT DEFAULT ''",
    ]),
    ("20260731_add_employee_guild", [
        "ALTER TABLE employees ADD COLUMN guild_id INTEGER",
    ]),
    ("20260731_add_script_param_specs", [
        "ALTER TABLE sql_scripts ADD COLUMN param_specs TEXT DEFAULT ''",
    ]),
    ("20260731_add_login_security", [
        """CREATE TABLE IF NOT EXISTS login_security (
            username TEXT PRIMARY KEY,
            fail_count INTEGER DEFAULT 0,
            locked_until TEXT
        )""",
    ]),
    ("20260731_add_employee_leave_date", [
        "ALTER TABLE employees ADD COLUMN leave_date TEXT DEFAULT ''",
    ]),
    ("20260812_add_live_employees", [
        # 直播人员表（职能隔离：独立于游戏 employees；金额单位 VND）
        """CREATE TABLE IF NOT EXISTS live_employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emp_no TEXT DEFAULT '',
            nickname TEXT NOT NULL,
            alias TEXT DEFAULT '',
            real_name TEXT DEFAULT '',
            cn_name TEXT DEFAULT '',
            position TEXT DEFAULT '陪玩',
            emp_type TEXT DEFAULT '全职',
            status TEXT DEFAULT '在职',
            is_probation INTEGER DEFAULT 0,
            probation_months INTEGER DEFAULT 0,
            probation_salary REAL DEFAULT 0,
            probation_salary_m2 REAL DEFAULT 0,
            base_salary REAL DEFAULT 0,
            formal_salary REAL DEFAULT 0,
            insurance REAL DEFAULT 0,
            entry_date TEXT DEFAULT '',
            leave_date TEXT DEFAULT '',
            sys_id TEXT DEFAULT '',
            sys_role TEXT DEFAULT '',
            account_holder TEXT DEFAULT '',
            bank TEXT DEFAULT '',
            account TEXT DEFAULT '',
            phone_zalo TEXT DEFAULT '',
            birth_date TEXT DEFAULT '',
            email TEXT DEFAULT '',
            address TEXT DEFAULT '',
            id_card TEXT DEFAULT '',
            emergency_contact TEXT DEFAULT '',
            emergency_relation TEXT DEFAULT '',
            emergency_phone TEXT DEFAULT '',
            remark TEXT DEFAULT '',
            created_at TEXT,
            updated_at TEXT
        )""",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_live_employees_emp_no ON live_employees(emp_no)",
    ]),
    ("20260813_add_live_allowances", [
        "ALTER TABLE live_employees ADD COLUMN meal_allowance REAL DEFAULT 0",
        "ALTER TABLE live_employees ADD COLUMN housing_allowance REAL DEFAULT 0",
        "ALTER TABLE live_employees ADD COLUMN transport_allowance REAL DEFAULT 0",
    ]),
    ("20260813_add_live_commission", [
        "ALTER TABLE live_employees ADD COLUMN salary_mode TEXT DEFAULT ''",
        "ALTER TABLE live_employees ADD COLUMN commission_rate TEXT DEFAULT ''",
        "ALTER TABLE live_employees ADD COLUMN commission_tiers TEXT DEFAULT ''",
        "ALTER TABLE live_employees ADD COLUMN biz_commission_rate TEXT DEFAULT ''",
    ]),
    ("20260813_add_live_tiktok", [
        "ALTER TABLE live_employees ADD COLUMN tiktok_live TEXT DEFAULT ''",
        "ALTER TABLE live_employees ADD COLUMN tiktok_clip TEXT DEFAULT ''",
        "ALTER TABLE live_employees ADD COLUMN tiktok_personal TEXT DEFAULT ''",
    ]),
    ("20260813_add_live_director_youtube", [
        "ALTER TABLE live_employees ADD COLUMN director_level TEXT DEFAULT ''",
        "ALTER TABLE live_employees ADD COLUMN youtube_commission_rate TEXT DEFAULT ''",
    ]),
    ("20260813_add_live_contract_bonus", [
        "ALTER TABLE live_employees ADD COLUMN contract_bonus REAL DEFAULT 0",
    ]),
    ("20260813_drop_live_contract_bonus", [
        # 合同奖金为推导字段（= 转正底薪 - 保险基数），重复计算易出错，移除
        "ALTER TABLE live_employees DROP COLUMN contract_bonus",
    ]),
    ("20260813_add_live_codes", [
        # 业务域/岗位/雇佣类型的代码字段（派生自文本值，映射见 config.py）
        "ALTER TABLE live_employees ADD COLUMN domain TEXT DEFAULT '直播'",
        "ALTER TABLE live_employees ADD COLUMN domain_code TEXT DEFAULT ''",
        "ALTER TABLE live_employees ADD COLUMN position_code TEXT DEFAULT ''",
        "ALTER TABLE live_employees ADD COLUMN emp_type_code TEXT DEFAULT ''",
    ]),
    ("20260813_drop_live_base_salary", [
        # 当月实际底薪（7月实绩）为月度发生值非员工属性，移出主表（实绩见月度工资单）
        "ALTER TABLE live_employees DROP COLUMN base_salary",
    ]),
    ("20260901_add_snapshot_expectations", [
        # 发放快照增加工作期望字段
        "ALTER TABLE commission_snapshots ADD COLUMN expectations TEXT DEFAULT ''",
    ]),
    ("20260901_add_snapshot_emp_expectations", [
        # 工作期望改为按员工独立设置
        "ALTER TABLE commission_snapshots ADD COLUMN employee_expectations TEXT DEFAULT '{}'",
    ]),
    ("20260814_add_live_discord_payee_phone", [
        # 新增 Discord 昵称与收款人手机号
        "ALTER TABLE live_employees ADD COLUMN discord TEXT DEFAULT ''",
        "ALTER TABLE live_employees ADD COLUMN payee_phone TEXT DEFAULT ''",
    ]),
    ("20260827_add_live_discord_user_id", [
        # 新增 Discord user_id，供签到机器人精确匹配主播
        "ALTER TABLE live_employees ADD COLUMN discord_user_id TEXT DEFAULT ''",
    ]),
]


def column_exists(conn, table, column):
    return any(r[1] == column for r in conn.execute(f"PRAGMA table_info({table})"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.execute("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT)")
    applied = {r[0] for r in conn.execute("SELECT name FROM _migrations")}
    for name, statements in MIGRATIONS:
        if name in applied:
            print(f"skip {name} (已应用)")
            continue
        for sql in statements:
            # 幂等预检：ADD/DROP COLUMN 先查列是否存在
            m_add = re.search(r"ALTER TABLE (\w+) ADD COLUMN (\w+)", sql, re.I)
            m_drop = re.search(r"ALTER TABLE (\w+) DROP COLUMN (\w+)", sql, re.I)
            if m_add and column_exists(conn, m_add.group(1), m_add.group(2)):
                print(f"  列已存在，跳过: {sql}")
                continue
            if m_drop and not column_exists(conn, m_drop.group(1), m_drop.group(2)):
                print(f"  列不存在，跳过: {sql}")
                continue
            conn.execute(sql)
        conn.execute("INSERT INTO _migrations VALUES (?, datetime('now','localtime'))", (name,))
        conn.commit()
        print(f"applied {name}")
    conn.close()
    print("done")


if __name__ == "__main__":
    main()
