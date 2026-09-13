#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =====================================================================
# MA（Member Admin）后端 - 部署规范（硬性，编辑本文件前必读）
#
# [部署红线 - 违反即事故]
# 1. prod 部署必须等用户显式指令（"上 prod" / "部署生产"），禁止自主双端同步
# 2. 所有改动顺序：本地校验 -> 部署 test 验证 -> 用户确认 -> 才可 prod
# 3. 编码前先备份：cp 本文件 xxx.bak-$(date)，改数据前备份目标库到 /opt/backups/
# 4. 修改后提交 git（push 需用户显式确认）
# 5. 违例示例（2026-09-12）：昵称列/改名告警未经确认直接上 prod —— 禁止再犯
# =====================================================================
import os
import re
import json
import uuid
import sqlite3
from functools import wraps
from io import BytesIO

from flask import Flask, request, session, jsonify, send_file, abort, Response
from werkzeug.security import generate_password_hash, check_password_hash

from config import (SECRET_KEY, SESSION_COOKIE_NAME, SESSION_COOKIE_PATH,
                    UPLOAD_DIR, MAX_UPLOAD_MB, ALLOWED_IMAGE_EXT, META,
                    DOMAIN_CODES, POSITION_CODES, EMP_TYPE_CODES, DATABASE_PATH,
                    CHECKIN_DB, CHECKIN_GUILD_ID)
import models
from models import (init_db, get_db, get_by_id, insert_row, update_row, delete_row,
                    list_rows, TABLE_FIELDS, ENTITY_LABEL_FIELD, now)
import vietqr
from audit import log_change, list_logs
from game_data import get_game_data
from query_engine import run_query, run_commission, list_leaders
from payroll_md import generate_payroll_pdf, generate_payroll_zip

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config["SESSION_COOKIE_NAME"] = SESSION_COOKIE_NAME
app.config["SESSION_COOKIE_PATH"] = SESSION_COOKIE_PATH
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

# 场次签到使用 discord-checkin 的 SQLite 数据库（只读/写签到相关表）
MEMBER_ADMIN_DB = os.environ.get("MEMBER_ADMIN_DB", DATABASE_PATH)

os.makedirs(UPLOAD_DIR, exist_ok=True)
init_db()

# 场次签到使用 discord-checkin 的 SQLite 数据库（只读/写签到相关表）
CHECKIN_DB_PATH = CHECKIN_DB

# 初始管理员：首次启动且环境变量提供密码时创建
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "robo")
_admin_pwd = os.environ.get("ADMIN_INITIAL_PASSWORD", "")
if _admin_pwd:
    conn = get_db()
    if not conn.execute("SELECT 1 FROM admin_users WHERE username = ?", (ADMIN_USERNAME,)).fetchone():
        conn.execute("INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)",
                     (ADMIN_USERNAME, generate_password_hash(_admin_pwd), now()))
        conn.commit()
    conn.close()


# ---------- 鉴权 ----------

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            return jsonify({"ok": False, "error": "未登录"}), 401
        return f(*args, **kwargs)
    return wrapper


ROLES = {"super": "超级管理员", "admin": "管理员", "viewer": "普通用户"}


def write_required(f):
    """写操作：super/admin 可用，viewer 只读"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            return jsonify({"ok": False, "error": "未登录"}), 401
        if session.get("role") not in ("super", "admin"):
            return jsonify({"ok": False, "error": "无编辑权限（普通用户只读）"}), 403
        return f(*args, **kwargs)
    return wrapper


def super_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            return jsonify({"ok": False, "error": "未登录"}), 401
        if session.get("role") != "super":
            return jsonify({"ok": False, "error": "仅超级管理员可操作"}), 403
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    """查询类操作：super/admin 可用；viewer 只能查看业务数据和快照"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            return jsonify({"ok": False, "error": "未登录"}), 401
        if session.get("role") not in ("super", "admin"):
            return jsonify({"ok": False, "error": "查询权限需管理员及以上"}), 403
        return f(*args, **kwargs)
    return wrapper


def client_ip():
    return request.headers.get("X-Real-IP") or request.remote_addr or ""


@app.post("/api/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    conn = get_db()
    # 登录锁定：失败 3 次锁 2 小时
    lock = conn.execute("SELECT * FROM login_security WHERE username = ?", (username,)).fetchone()
    if lock and lock["locked_until"] and lock["locked_until"] > now():
        conn.close()
        return jsonify({"ok": False,
                        "error": f"账号已锁定，请于 {lock['locked_until']} 后再试"}), 423
    user = conn.execute("SELECT * FROM admin_users WHERE username = ?", (username,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        fails = (lock["fail_count"] if lock else 0) + 1
        locked_until = None
        if fails >= 3:
            from datetime import datetime, timedelta
            locked_until = (datetime.now() + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")
            fails = 0
        conn.execute(
            "INSERT INTO login_security (username, fail_count, locked_until) VALUES (?, ?, ?)"
            " ON CONFLICT(username) DO UPDATE SET fail_count = ?, locked_until = ?",
            (username, fails, locked_until, fails, locked_until))
        conn.commit()
        conn.close()
        if locked_until:
            return jsonify({"ok": False,
                            "error": f"连续失败 3 次，账号锁定 2 小时（至 {locked_until}）"}), 423
        return jsonify({"ok": False, "error": f"用户名或密码错误（{fails}/3 次后锁定）"}), 401
    conn.execute(
        "INSERT INTO login_security (username, fail_count, locked_until) VALUES (?, 0, NULL)"
        " ON CONFLICT(username) DO UPDATE SET fail_count = 0, locked_until = NULL",
        (username,))
    conn.commit()
    role = user["role"] if "role" in user.keys() else "admin"
    session["user"] = username
    session["role"] = role
    conn.close()
    log_change(username, "login", "admin_user", user["id"], username, ip=client_ip())
    return jsonify({"ok": True, "data": {"username": username, "role": role}})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    username = session.get("user")
    role = session.get("role")
    if username and not role:  # 旧会话无 role，回源数据库
        conn = get_db()
        row = conn.execute("SELECT role FROM admin_users WHERE username = ?",
                           (username,)).fetchone()
        conn.close()
        role = (row["role"] if row and "role" in row.keys() else None) or "admin"
        session["role"] = role
    return jsonify({"ok": True, "data": {"username": username, "role": role}})


@app.post("/api/change-password")
@login_required
def change_password():
    data = request.get_json(force=True, silent=True) or {}
    old, new = data.get("old_password") or "", data.get("new_password") or ""
    if len(new) < 6:
        return jsonify({"ok": False, "error": "新密码至少 6 位"}), 400
    conn = get_db()
    user = conn.execute("SELECT * FROM admin_users WHERE username = ?", (session["user"],)).fetchone()
    if not user or not check_password_hash(user["password_hash"], old):
        conn.close()
        return jsonify({"ok": False, "error": "原密码错误"}), 400
    conn.execute("UPDATE admin_users SET password_hash = ? WHERE id = ?",
                 (generate_password_hash(new), user["id"]))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


def guild_label(g, with_status=False):
    """军团拼接展示：(Q110)THIÊN HÀ（天河）"""
    server = g.get("server") or ""
    letter = server[0] if server else ""
    gid = g.get("game_guild_id") or ""
    prefix = f"({letter}{gid})" if gid else ""
    name = g.get("name") or ""
    cn = g.get("cn_name") or ""
    if cn and f"（{cn}）" in name:  # 名称已含中文括号则不重复
        cn = ""
    label = f"{prefix}{name}（{cn}）" if cn else f"{prefix}{name}"
    if with_status and g.get("status"):
        label += f"（{g['status']}）"
    return label


# ---------- 元数据 ----------

@app.get("/api/meta")
@login_required
def meta():
    conn = get_db()
    servers = [r["server"] for r in conn.execute(
        "SELECT DISTINCT server FROM guilds WHERE server != '' ORDER BY server").fetchall()]
    conn.close()
    data = dict(META)
    data["servers"] = servers
    return jsonify({"ok": True, "data": data})


# ---------- 通用 CRUD ----------

ENTITY_CONFIG = {
    "employees": {"keyword_fields": ["nickname", "emp_no", "real_name", "cn_name", "remark"],
                  "filter_fields": ["position", "status"],
                  "default_exclude": {"status": "离职"}},
    "guilds": {"keyword_fields": ["name", "game_guild_id", "remark"],
               "filter_fields": ["server", "status", "operation_type", "leader_employee_id"]},
    "game_accounts": {"keyword_fields": ["game_uid", "nickname", "tiktok_account", "remark"],
                      "filter_fields": ["status", "employee_id", "guild_id"]},
    "payment_accounts": {"keyword_fields": ["account_name", "account_no", "bank_name", "remark"],
                         "filter_fields": ["account_type", "employee_id"],
                         "join_filters": {"employee_status": ("employee_id", "employees", "status")}},
    "sql_scripts": {"keyword_fields": ["name", "description"],
                    "filter_fields": [], "list_min_role": "admin"},
    "commission_snapshots": {"keyword_fields": ["month", "remark", "created_by"],
                             "filter_fields": ["month"]},
    "live_employees": {"keyword_fields": ["nickname", "emp_no", "real_name", "cn_name", "alias", "remark"],
                       "filter_fields": ["position", "emp_type", "status"],
                       "order_by": "emp_no ASC"},
    "player_mapping": {"keyword_fields": ["player_name", "emp_no", "discord", "remark"],
                       "filter_fields": []},
}

ENTITY_TYPE_MAP = {
    "employees": "employee", "guilds": "guild",
    "game_accounts": "account", "payment_accounts": "payment_account",
    "sql_scripts": "sql_script",
    "commission_snapshots": "commission_snapshot",
    "live_employees": "live_employee",
    "player_mapping": "player_mapping",
}


def _page_args():
    page = max(int(request.args.get("page", 1) or 1), 1)
    page_size = min(max(int(request.args.get("page_size", 20) or 20), 1), 200)
    return page, page_size


def _derive_live_codes(data, before=None):
    """live_employees 派生代码字段：以提交值优先、原值兑底，防止界面改文本后代码失效。"""
    src = dict(before or {})
    src.update(data)
    data["domain_code"] = DOMAIN_CODES.get(src.get("domain", ""), "")
    data["position_code"] = POSITION_CODES.get(src.get("position", ""), "")
    data["emp_type_code"] = EMP_TYPE_CODES.get(src.get("emp_type", ""), "")


_PD_ID_CACHE = {"ts": 0, "map": {}}
_PD_ID_CACHE_TTL = 600  # live_player 变动极少，10min 内存缓存避免每次开表都建远程 MySQL 连接


def _fold_name(x):
    """昵称折叠：NFKC 归一 + 去音标 + 压缩空白，用于模糊匹配（越南语昵称大小写/音标差异）。"""
    import unicodedata as _ud
    import re as _re
    y = _ud.normalize('NFKC', str(x or '').strip().lower())
    y = ''.join(c for c in _ud.normalize('NFD', y) if _ud.category(c) != 'Mn')
    return _re.sub(r'\s+', ' ', y).strip()


def _pd_id_map():
    """name(nick/player_name, 折叠) -> live_player.id，带 TTL 缓存；查询失败时用旧缓存兜底。"""
    import time
    now_t = time.time()
    if _PD_ID_CACHE["map"] and now_t - _PD_ID_CACHE["ts"] < _PD_ID_CACHE_TTL:
        return _PD_ID_CACHE["map"]
    try:
        import os
        import pymysql
        conn = pymysql.connect(
            host=os.environ['LIVE_MYSQL_HOST'], port=int(os.environ['LIVE_MYSQL_PORT']),
            user=os.environ['LIVE_MYSQL_USER'], password=os.environ['LIVE_MYSQL_PASSWORD'],
            database=os.environ['LIVE_MYSQL_DB'], charset='utf8mb4',
            connect_timeout=5, read_timeout=10,
            cursorclass=pymysql.cursors.DictCursor)
        cur = conn.cursor()
        cur.execute("SELECT id, player_name, nick_name FROM live_player")
        name2id = {}
        for r in cur.fetchall():
            for key in (r["player_name"], r["nick_name"]):
                f = _fold_name(key) if key else None
                if f and f not in name2id:
                    name2id[f] = r["id"]
        conn.close()
        _PD_ID_CACHE.update(ts=now_t, map=name2id)
    except Exception as e:
        print(f"[MA] pd_id map refresh failed (用旧缓存): {e}", flush=True)
    return _PD_ID_CACHE["map"]


def _attach_pd_ids(rows):
    """player_mapping 列表附加 pd ID：优先读本地列（staff_sync 每日补缺落库）；
    本地为空的行用 live_player 映射缓存兜底展示（只补缺不覆盖，不写库）。"""
    m = _pd_id_map()
    for row in rows:
        local = row.get("pd_id")
        if local:
            continue  # 本地已有值，永不覆盖
        row["pd_id"] = m.get(_fold_name(row.get("player_name") or ""), "")

def _source_staff_conn():
    """源库（live_schema）连接，复用 _pd_id_map 同款凭据来源。"""
    import os
    import pymysql
    return pymysql.connect(
        host=os.environ['LIVE_MYSQL_HOST'], port=int(os.environ['LIVE_MYSQL_PORT']),
        user=os.environ['LIVE_MYSQL_USER'], password=os.environ['LIVE_MYSQL_PASSWORD'],
        database=os.environ['LIVE_MYSQL_DB'], charset='utf8mb4',
        connect_timeout=5, read_timeout=10,
        cursorclass=pymysql.cursors.DictCursor)


@app.get("/api/source/staff")
@login_required
@write_required
def source_staff_list():
    """源库待建档员工列表：源 staff_info 有、MA live_employees 未建档（emp_no 不在 MA）。
    供新增员工表单「从源头导入」选择（只读，不写任何表）。
    与消息中心「新员工待建档」判定口径一致（源有 MA 无）。"""
    kw = (request.args.get("kw") or "").strip()
    try:
        conn = _source_staff_conn()
        cur = conn.cursor()
        sql = ("SELECT staff_no, name_vn, name_cn, nick_name, discord_name, staff_status, "
               "emp_position, emp_type, entry_date FROM staff_info "
               "WHERE emp_domain='L' AND staff_no IS NOT NULL AND staff_no != ''")
        args = []
        if kw:
            sql += " AND (staff_no LIKE %s OR name_vn LIKE %s OR name_cn LIKE %s OR nick_name LIKE %s OR discord_name LIKE %s)"
            like = '%' + kw + '%'
            args = [like] * 5
        sql += " ORDER BY staff_no"
        cur.execute(sql, args)
        rows = cur.fetchall()
        conn.close()
        # 过滤：MA live_employees 已建档的 emp_no 不列出（待建档 = 源有 MA 无）
        mconn = get_db()
        try:
            built = {r[0] for r in mconn.execute(
                "SELECT emp_no FROM live_employees WHERE emp_no != ''")}
        finally:
            mconn.close()
        pending = [r for r in rows if r["staff_no"] not in built]
        return jsonify({"ok": True, "data": pending})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"ok": False, "error": "源库查询失败: " + str(e)}), 500


@app.get("/api/source/staff/<staff_no>")
@login_required
@write_required
def source_staff_detail(staff_no):
    """源库单个员工全字段：供「从源头导入」回填表单。只读。"""
    try:
        conn = _source_staff_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM staff_info WHERE emp_domain='L' AND staff_no=%s", (staff_no,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return jsonify({"ok": False, "error": "源库无此员工"}), 404
        # 日期/Decimal 序列化
        import datetime
        for k, v in list(row.items()):
            if isinstance(v, (datetime.date, datetime.datetime)):
                row[k] = v.strftime('%Y-%m-%d')
        return jsonify({"ok": True, "data": row})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"ok": False, "error": "源库查询失败: " + str(e)}), 500


def _register_crud(table):
    cfg = ENTITY_CONFIG[table]
    entity_type = ENTITY_TYPE_MAP[table]
    label_field = ENTITY_LABEL_FIELD[table]

    def list_view():
        if cfg.get("list_min_role") == "admin" and session.get("role") not in ("super", "admin"):
            return jsonify({"ok": False, "error": "查询权限需管理员及以上"}), 403
        filters = {f: request.args.get(f) for f in cfg["filter_fields"]}
        exclude = {k: v for k, v in (cfg.get("default_exclude") or {}).items()
                   if not filters.get(k)}
        join_filters = []
        for param, (fk_col, ref_table, ref_col) in (cfg.get("join_filters") or {}).items():
            val = request.args.get(param)
            if val not in (None, "", "all"):
                join_filters.append((fk_col, ref_table, ref_col, val))
        page, page_size = _page_args()
        rows, total = list_rows(table, filters, request.args.get("keyword", "").strip(),
                                cfg["keyword_fields"], page, page_size, exclude=exclude,
                                join_filters=join_filters, order_by=cfg.get("order_by"))
        if table == "player_mapping":
            _attach_pd_ids(rows)
        return jsonify({"ok": True, "data": {"items": rows, "total": total,
                                             "page": page, "page_size": page_size}})

    def create_view():
        data = request.get_json(force=True, silent=True) or {}
        if table == "live_employees":
            _derive_live_codes(data)
        row_id = insert_row(table, data)
        after = get_by_id(table, row_id)
        log_change(session["user"], "create", entity_type, row_id,
                   str(after.get(label_field) or ""), after=after, ip=client_ip())
        return jsonify({"ok": True, "data": after})

    def update_view(row_id):
        before = get_by_id(table, row_id)
        if not before:
            return jsonify({"ok": False, "error": "记录不存在"}), 404
        data = request.get_json(force=True, silent=True) or {}
        if table == "live_employees":
            _derive_live_codes(data, before)
        update_row(table, row_id, data)
        after = get_by_id(table, row_id)
        log_change(session["user"], "update", entity_type, row_id,
                   str(after.get(label_field) or ""), before=before, after=after, ip=client_ip())
        return jsonify({"ok": True, "data": after})

    def delete_view(row_id):
        before = get_by_id(table, row_id)
        if not before:
            return jsonify({"ok": False, "error": "记录不存在"}), 404
        delete_row(table, row_id)
        log_change(session["user"], "delete", entity_type, row_id,
                   str(before.get(label_field) or ""), before=before, ip=client_ip())
        return jsonify({"ok": True})

    singular = table.rstrip("s")
    app.add_url_rule(f"/api/{table}", f"{table}_list", login_required(list_view), methods=["GET"])
    app.add_url_rule(f"/api/{table}", f"{table}_create", write_required(create_view), methods=["POST"])
    app.add_url_rule(f"/api/{table}/<int:row_id>", f"{singular}_update",
                     write_required(update_view), methods=["PUT"])
    app.add_url_rule(f"/api/{table}/<int:row_id>", f"{singular}_delete",
                     write_required(delete_view), methods=["DELETE"])


for _table in ENTITY_CONFIG:
    _register_crud(_table)


# ---------- 直播员工导出 CSV（格式对齐员工信息表：双表头 + K盾金额） ----------

# (中文表头, 英文字段名, db字段[None=空列], 金额VND→K盾)
LIVE_EXPORT_COLUMNS = [
    ("员工编号", "emp_no", "emp_no", False),
    ("昵称", "nickname", "nickname", False),
    ("别名", "alias", "alias", False),
    ("真实姓名", "real_name", "real_name", False),
    ("中文名", "cn_name", "cn_name", False),
    ("性别", "gender", "gender", False),
    ("业务域", "domain", "domain", False),
    ("业务域代码", "domain_code", "domain_code", False),
    ("岗位", "position", "position", False),
    ("岗位代码", "position_code", "position_code", False),
    ("雇佣类型", "emp_type", "emp_type", False),
    ("雇佣类型代码", "emp_type_code", "emp_type_code", False),
    ("在职状态", "status", "status", False),
    ("是否试用期(1/0)", "is_probation", "is_probation", False),
    ("试用期月数", "probation_months", "probation_months", False),
    ("试用底薪m1(K盾)", "probation_salary_k", "probation_salary", True),
    ("试用底薪m2(K盾)", "probation_salary_m2_k", "probation_salary_m2", True),
    ("底薪(K盾·游戏)", "g_base_salary_k", None, False),
    ("岗位津贴(K盾·游戏)", "g_position_allowance_k", None, False),
    ("GM津贴(K盾·游戏)", "g_gm_allowance_k", None, False),
    ("分成比例(游戏)", "g_commission_rate", None, False),
    ("转正底薪(K盾·直播)", "l_formal_salary_k", "formal_salary", True),
    ("缴纳保险(K盾·直播)", "l_insurance_k", "insurance", True),
    ("出勤补贴(直播)", "l_attendance_allowance_k", "attendance_allowance", True),
    ("餐补(K盾·直播)", "l_meal_allowance_k", "meal_allowance", True),
    ("住房补贴(K盾·直播)", "l_housing_allowance_k", "housing_allowance", True),
    ("交通补贴(K盾·直播)", "l_transport_allowance_k", "transport_allowance", True),
    ("薪资结构", "salary_mode", "salary_mode", False),
    ("直播分成比例", "commission_rate", "commission_rate", False),
    ("分成阶梯(JSON)", "commission_tiers", "commission_tiers", False),
    ("商单分成比例", "biz_commission_rate", "biz_commission_rate", False),
    ("导演等级(S/A/B)", "director_level", "director_level", False),
    ("YouTube分成比例", "youtube_commission_rate", "youtube_commission_rate", False),
    ("入职日期", "entry_date", "entry_date", False),
    ("离职日期", "leave_date", "leave_date", False),
    ("系统ID", "sys_id", "sys_id", False),
    ("系统角色(多值,逗号分隔)", "sys_role", "sys_role", False),
    ("账户人(非本人时填)", "account_holder", "account_holder", False),
    ("银行", "bank", "bank", False),
    ("银行账号", "account", "account", False),
    ("收款人手机号", "payee_phone", "payee_phone", False),
    ("联系电话/zalo", "phone_zalo", "phone_zalo", False),
    ("Discord 昵称", "discord", "discord", False),
    ("TikTok直播账号", "tiktok_live", "tiktok_live", False),
    ("TikTok剪辑账号", "tiktok_clip", "tiktok_clip", False),
    ("TikTok个人小号", "tiktok_personal", "tiktok_personal", False),
    ("出生日期", "birth_date", "birth_date", False),
    ("电子邮箱", "email", "email", False),
    ("家庭地址", "address", "address", False),
    ("身份证", "id_card", "id_card", False),
    ("紧急联系人", "emergency_contact", "emergency_contact", False),
    ("联系人关系", "emergency_relation", "emergency_relation", False),
    ("紧急联系电话", "emergency_phone", "emergency_phone", False),
    ("备注", "remark", "remark", False),
]


@app.get("/api/live_employees/export")
@login_required
def live_employees_export():
    import csv
    import io
    from datetime import datetime as _dt
    conn = get_db()
    rows = conn.execute("SELECT * FROM live_employees ORDER BY emp_no ASC").fetchall()
    buf = io.StringIO()
    buf.write("\ufeff")  # BOM，Excel 识别 UTF-8
    w = csv.writer(buf)
    w.writerow([c[0] for c in LIVE_EXPORT_COLUMNS])
    w.writerow([c[1] for c in LIVE_EXPORT_COLUMNS])
    for r in rows:
        keys = r.keys()
        line = []
        for _, _, col, is_money in LIVE_EXPORT_COLUMNS:
            if col is None or col not in keys:
                line.append("")
                continue
            v = r[col]
            if is_money:
                line.append(int(v / 1000) if v else "")
            elif col == "salary_mode":
                # 数字编码 → 中文（与源头一致：1纯底薪 2纯分成-固定 3底薪+分成 4底薪+阶梯分成 5计件）
                sm = {"1": "纯底薪", "2": "纯分成-固定", "3": "底薪+分成", "4": "底薪+阶梯分成", "5": "计件"}
                line.append(sm.get(str(v), "" if v is None else v))
            elif col == "gender":
                # 数字编码 → 中文（1=男 2=女）
                gd = {"1": "男", "2": "女"}
                line.append(gd.get(str(v), "" if v is None else v))
            else:
                line.append("" if v is None else v)
        w.writerow(line)
    fname = "live_employees_%s.csv" % _dt.now().strftime("%Y%m%d_%H%M")
    return Response(buf.getvalue(), mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename={fname}"})


# ---------- 聚合详情 ----------

@app.get("/api/employees/<int:emp_id>/detail")
@login_required
def employee_detail(emp_id):
    emp = get_by_id("employees", emp_id)
    if not emp:
        return jsonify({"ok": False, "error": "员工不存在"}), 404
    conn = get_db()
    guilds = [dict(r) for r in conn.execute(
        "SELECT * FROM guilds WHERE leader_employee_id = ? ORDER BY id DESC", (emp_id,)).fetchall()]
    accounts = [dict(r) for r in conn.execute(
        "SELECT a.*, g.name AS guild_name, g.cn_name AS guild_cn_name, g.game_guild_id AS guild_game_id, g.server AS guild_server "
        "FROM game_accounts a "
        "LEFT JOIN guilds g ON a.guild_id = g.id WHERE a.employee_id = ? ORDER BY a.id DESC",
        (emp_id,)).fetchall()]
    payments = [dict(r) for r in conn.execute(
        "SELECT * FROM payment_accounts WHERE employee_id = ? ORDER BY id DESC", (emp_id,)).fetchall()]
    conn.close()
    return jsonify({"ok": True, "data": {"employee": emp, "guilds": guilds,
                                         "accounts": accounts, "payments": payments}})


@app.get("/api/accounts/<int:acc_id>/game-data")
@login_required
def account_game_data(acc_id):
    acc = get_by_id("game_accounts", acc_id)
    if not acc:
        return jsonify({"ok": False, "error": "账号不存在"}), 404
    result = get_game_data(acc.get("game_uid"))
    return jsonify(result)


# ---------- 下拉选项辅助（员工/军团选择器） ----------

@app.get("/api/options/<string:kind>")
@login_required
def options(kind):
    conn = get_db()
    if kind == "employees":
        rows = conn.execute(
            "SELECT id, nickname, position, status FROM employees ORDER BY nickname").fetchall()
        items = [{"id": r["id"], "label": f'{r["nickname"]}（{r["position"]}·{r["status"]}）'} for r in rows]
    elif kind == "guilds":
        rows = conn.execute("SELECT id, name, cn_name, game_guild_id, server, status FROM guilds ORDER BY name").fetchall()
        items = [{"id": r["id"], "label": guild_label(dict(r))} for r in rows]
    elif kind == "game_guilds":
        # 以游戏内军团 ID 为值（供 SQL 脚本 guild_id 参数下拉）
        rows = conn.execute(
            "SELECT id, name, cn_name, game_guild_id, server, status FROM guilds"
            " WHERE game_guild_id != '' ORDER BY server, CAST(game_guild_id AS INTEGER)").fetchall()
        items = [{"id": r["game_guild_id"], "label": guild_label(dict(r))} for r in rows]
    elif kind == "live_employees":
        # 以 emp_no 为值，供 player_mapping 等按编号关联场景使用；头部追加「已离职」历史遗留选项
        rows = conn.execute(
            "SELECT emp_no, nickname, alias, position, status FROM live_employees"
            " ORDER BY emp_no").fetchall()
        items = [{"id": r["emp_no"],
                  "label": f'{r["nickname"] or r["alias"] or r["emp_no"]}（{r["position"] or "-"}·{r["status"] or "-"}）'} for r in rows]
        items.insert(0, {"id": "LEFT", "label": "已离职（历史遗留）"})
    else:
        conn.close()
        abort(404)
    conn.close()
    return jsonify({"ok": True, "data": items})


# ---------- 图片上传（富文本内嵌） ----------

@app.post("/api/upload/image")
@write_required
def upload_image():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"ok": False, "error": "未选择文件"}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        return jsonify({"ok": False, "error": f"仅支持 {','.join(ALLOWED_IMAGE_EXT)}"}), 400
    filename = f"{uuid.uuid4().hex}{ext}"
    f.save(os.path.join(UPLOAD_DIR, filename))
    return jsonify({"ok": True, "data": {"url": f"api/files/{filename}"}})


@app.get("/api/files/<path:filename>")
@login_required
def serve_file(filename):
    path = os.path.join(UPLOAD_DIR, os.path.basename(filename))
    if not os.path.isfile(path):
        abort(404)
    return send_file(path)


# ---------- 审计日志 ----------

@app.get("/api/logs")
@login_required
def logs():
    page, page_size = _page_args()
    if page_size > 100:
        page_size = 100
    rows, total = list_logs(
        entity_type=request.args.get("entity_type") or None,
        action=request.args.get("action") or None,
        actor=request.args.get("actor") or None,
        date_from=request.args.get("date_from") or None,
        date_to=request.args.get("date_to") or None,
        page=page, page_size=page_size,
    )
    return jsonify({"ok": True, "data": {"items": rows, "total": total,
                                         "page": page, "page_size": page_size}})


# ---------- 用户管理（仅超级管理员） ----------

@app.get("/api/users")
@super_required
def users_list():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, username, role, created_at FROM admin_users ORDER BY id").fetchall()
    conn.close()
    return jsonify({"ok": True, "data": [dict(r) for r in rows]})


@app.post("/api/users")
@super_required
def users_create():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = data.get("role") or "viewer"
    if not username or len(password) < 6:
        return jsonify({"ok": False, "error": "用户名必填，密码至少 6 位"}), 400
    if role not in ROLES:
        return jsonify({"ok": False, "error": "角色无效"}), 400
    conn = get_db()
    if conn.execute("SELECT 1 FROM admin_users WHERE username = ?", (username,)).fetchone():
        conn.close()
        return jsonify({"ok": False, "error": "用户名已存在"}), 400
    cur = conn.execute(
        "INSERT INTO admin_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
        (username, generate_password_hash(password), role, now()))
    conn.commit()
    conn.close()
    log_change(session["user"], "create", "admin_user", cur.lastrowid, username,
               after={"username": username, "role": role}, ip=client_ip())
    return jsonify({"ok": True, "data": {"id": cur.lastrowid, "username": username, "role": role}})


@app.put("/api/users/<int:uid>")
@super_required
def users_update(uid):
    data = request.get_json(force=True, silent=True) or {}
    conn = get_db()
    user = conn.execute("SELECT * FROM admin_users WHERE id = ?", (uid,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"ok": False, "error": "用户不存在"}), 404
    before = dict(user)
    new_role = data.get("role")
    new_pwd = data.get("password")
    if new_role:
        if new_role not in ROLES:
            conn.close()
            return jsonify({"ok": False, "error": "角色无效"}), 400
        conn.execute("UPDATE admin_users SET role = ? WHERE id = ?", (new_role, uid))
    if new_pwd:
        if len(new_pwd) < 6:
            conn.close()
            return jsonify({"ok": False, "error": "密码至少 6 位"}), 400
        conn.execute("UPDATE admin_users SET password_hash = ? WHERE id = ?",
                     (generate_password_hash(new_pwd), uid))
    conn.commit()
    conn.close()
    log_change(session["user"], "update", "admin_user", uid, user["username"],
               before={"role": before.get("role")},
               after={"role": new_role, "password_reset": bool(new_pwd)}, ip=client_ip())
    return jsonify({"ok": True})


@app.delete("/api/users/<int:uid>")
@super_required
def users_delete(uid):
    conn = get_db()
    user = conn.execute("SELECT * FROM admin_users WHERE id = ?", (uid,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"ok": False, "error": "用户不存在"}), 404
    if user["username"] == session["user"]:
        conn.close()
        return jsonify({"ok": False, "error": "不能删除当前登录账号"}), 400
    conn.execute("DELETE FROM admin_users WHERE id = ?", (uid,))
    conn.commit()
    conn.close()
    log_change(session["user"], "delete", "admin_user", uid, user["username"],
               before={"username": user["username"]}, ip=client_ip())
    return jsonify({"ok": True})


# ---------- 只读 SQL 查询 + 月度分成 ----------

@app.post("/api/query/run")
@admin_required
def query_run():
    data = request.get_json(force=True, silent=True) or {}
    result = run_query(data.get("sql"), data.get("params") or {})
    log_change(session["user"], "query", "sql_script", data.get("script_id") or 0,
               (data.get("name") or "")[:80], after={"sql": (data.get("sql") or "")[:500]},
               ip=client_ip())
    return jsonify(result)


@app.get("/api/commission/leaders")
@admin_required
def commission_leaders():
    from config import DATABASE_PATH
    return jsonify({"ok": True, "data": list_leaders(DATABASE_PATH)})


@app.post("/api/commission/run")
@admin_required
def commission_run():
    from config import DATABASE_PATH
    data = request.get_json(force=True, silent=True) or {}
    emp_ids = data.get("employee_ids")
    if emp_ids is not None:
        emp_ids = [int(x) for x in emp_ids if str(x).isdigit()]
    guild_ids = data.get("guild_ids")
    if guild_ids is not None:
        guild_ids = [int(x) for x in guild_ids if str(x).isdigit()]
    gm_ids = data.get("gm_ids")
    if gm_ids is not None:
        gm_ids = [int(x) for x in gm_ids if str(x).isdigit()]
    leader_ids = data.get("leader_ids")
    if leader_ids is not None:
        leader_ids = [int(x) for x in leader_ids if str(x).isdigit()]
    deductions = data.get("deductions")
    result = run_commission(data.get("month", ""), DATABASE_PATH,
                            employee_ids=emp_ids, guild_ids=guild_ids,
                            basis=data.get("basis", "paid"), gm_ids=gm_ids,
                            leader_ids=leader_ids, deductions=deductions)
    log_change(session["user"], "query", "commission", 0, data.get("month", ""),
               ip=client_ip())
    return jsonify(result)


@app.post("/api/commission/save")
@write_required
def commission_save():
    from config import DATABASE_PATH
    data = request.get_json(force=True, silent=True) or {}
    month = data.get("month", "")
    emp_ids = data.get("employee_ids")
    if emp_ids is not None:
        emp_ids = [int(x) for x in emp_ids if str(x).isdigit()]
    guild_ids = data.get("guild_ids")
    if guild_ids is not None:
        guild_ids = [int(x) for x in guild_ids if str(x).isdigit()]
    gm_ids = data.get("gm_ids")
    if gm_ids is not None:
        gm_ids = [int(x) for x in gm_ids if str(x).isdigit()]
    leader_ids = data.get("leader_ids")
    if leader_ids is not None:
        leader_ids = [int(x) for x in leader_ids if str(x).isdigit()]
    deductions = data.get("deductions")
    result = run_commission(month, DATABASE_PATH, employee_ids=emp_ids,
                            guild_ids=guild_ids, basis=data.get("basis", "paid"),
                            gm_ids=gm_ids, leader_ids=leader_ids,
                            deductions=deductions)
    if not result.get("ok"):
        return jsonify(result)
    emp_expectations = data.get("employee_expectations") or {}
    if not isinstance(emp_expectations, dict):
        emp_expectations = {}
    # 将按员工期望写入汇总/明细，方便 PDF 直接读取
    for s in result["data"]["summary"]:
        eid = s.get("employee_id")
        s["expectations"] = str(emp_expectations.get(str(eid), emp_expectations.get(eid, ""))).strip()
    for it in result["data"]["items"]:
        eid = it.get("employee_id")
        it["expectations"] = str(emp_expectations.get(str(eid), emp_expectations.get(eid, ""))).strip()
    payload = {
        "month": month,
        "basis": result["data"].get("basis_key", "paid"),
        "remark": (data.get("remark") or "").strip(),
        "expectations": (data.get("expectations") or "").strip(),
        "employee_expectations": json.dumps(emp_expectations, ensure_ascii=False),
    }
    row_id = insert_row("commission_snapshots", payload)
    # 快照内容与创建人单独写入（不在通用白名单内）
    conn = get_db()
    conn.execute(
        "UPDATE commission_snapshots SET items_json = ?, summary_json = ?, created_by = ? WHERE id = ?",
        (json.dumps(result["data"]["items"], ensure_ascii=False),
         json.dumps(result["data"]["summary"], ensure_ascii=False),
         session["user"], row_id))
    conn.commit()
    conn.close()
    after = get_by_id("commission_snapshots", row_id)
    log_change(session["user"], "create", "commission_snapshot", row_id, month,
               after={"month": month, "remark": payload["remark"],
                      "items": len(result["data"]["items"])}, ip=client_ip())
    return jsonify({"ok": True, "data": after})


@app.get("/api/commission/snapshot/<int:snapshot_id>/payroll.pdf")
@login_required
def commission_payroll_pdf(snapshot_id):
    """下载指定快照的中越双语工资单 PDF（Markdown → PDF）。"""
    row = get_by_id("commission_snapshots", snapshot_id)
    if not row:
        return jsonify({"ok": False, "error": "快照不存在"}), 404
    employee_id = request.args.get("employee_id")
    if employee_id:
        try:
            employee_id = int(employee_id)
        except (TypeError, ValueError):
            employee_id = None
    try:
        pdf_bytes = generate_payroll_pdf(row, employee_id=employee_id)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    month = row.get("month", "payroll")
    if employee_id:
        emp = get_by_id("employees", employee_id)
        nickname = emp.get("nickname") or emp.get("real_name") or str(employee_id) if emp else str(employee_id)
        safe = re.sub(r'[\\/:*?"<>|\s]+', '_', str(nickname)).strip('_')
        filename = f"payroll-{month}-{safe}.pdf"
    else:
        filename = f"payroll-{month}.pdf"
    return send_file(
        BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


@app.get("/api/commission/snapshot/<int:snapshot_id>/payroll.zip")
@login_required
def commission_payroll_zip(snapshot_id):
    """下载指定快照的全部员工工资单 PDF 压缩包。"""
    row = get_by_id("commission_snapshots", snapshot_id)
    if not row:
        return jsonify({"ok": False, "error": "快照不存在"}), 404
    try:
        zip_bytes = generate_payroll_zip(row)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except RuntimeError as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    month = row.get("month", "payroll")
    return send_file(
        BytesIO(zip_bytes),
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"payroll-{month}.zip",
    )


# ---------- 场次签到（discord-checkin 数据库） ----------

def _checkin_conn():
    conn = sqlite3.connect(CHECKIN_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route("/api/checkin/sessions")
@write_required
def get_checkin_sessions():
    """Get sessions list with checkins."""
    import sqlite3
    from datetime import datetime
    try:
        guild_id = CHECKIN_GUILD_ID
        from_date = request.args.get("from", "")
        to_date = request.args.get("to", "")
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))

        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        conditions = ["s.guild_id = ?", "s.status != 'cancelled'"]  # cancelled=判定准确的虚假/空场，静默隐藏不 review
        params = [guild_id]

        if from_date:
            conditions.append("date(s.start_time) >= ?")
            params.append(from_date)
        if to_date:
            conditions.append("date(s.start_time) <= ?")
            params.append(to_date)

        where = " AND ".join(conditions)

        count_row = conn.execute(
            f"SELECT COUNT(*) as cnt FROM sessions s WHERE {where}", params
        ).fetchone()
        total = count_row["cnt"] if count_row else 0

        offset = (page - 1) * page_size
        rows = conn.execute(
            f"""SELECT s.*,
                      (SELECT COUNT(*) FROM checkins WHERE session_id = s.id) as checkin_count
               FROM sessions s
               WHERE {where}
               ORDER BY s.start_time DESC
               LIMIT ? OFFSET ?""",
            params + [page_size, offset],
        ).fetchall()

        items = []
        for r in rows:
            s = dict(r)
            # Fetch voice session participants for this channel
            voice_users = {}  # user_id -> {nickname, duration}
            if s.get("voice_channel_id") and s.get("start_time"):
                vs_until = s["end_time"] if s.get("end_time") else datetime.now().isoformat(sep=" ", timespec="seconds")
                vs_since = s["start_time"]
                voice_rows = conn.execute(
                    """SELECT vs.user_id, vs.duration_minutes,
                              COALESCE(
                                  un.nickname,
                                  (SELECT c2.nickname FROM checkins c2
                                   WHERE c2.user_id = vs.user_id
                                   ORDER BY c2.checkin_time DESC LIMIT 1)
                              ) as nickname
                       FROM voice_sessions vs
                       LEFT JOIN user_nicknames un ON vs.user_id = un.user_id
                       WHERE vs.channel_id = ?
                           AND vs.join_time < ?
                           AND (vs.leave_time IS NULL OR vs.leave_time > ?)
                       ORDER BY vs.user_id""",
                    (s["voice_channel_id"], vs_until, vs_since),
                ).fetchall()
                for vr in voice_rows:
                    uid = vr["user_id"]
                    dur = vr["duration_minutes"] or 0
                    nick = vr["nickname"] if vr["nickname"] else uid
                    if uid not in voice_users:
                        voice_users[uid] = {"nickname": nick, "duration": dur}
                    else:
                        voice_users[uid]["duration"] += dur

            checkin_rows = conn.execute(
                """SELECT c.* FROM checkins c WHERE c.session_id = ?
                   ORDER BY c.checkin_time ASC""",
                (s["id"],),
            ).fetchall()
            creator_id = s.get("creator_id", "")
            streamer_name = s.get("streamer_name", "")

            checkin_map = {}
            for cr in checkin_rows:
                crd = dict(cr)
                uid = crd["user_id"]
                crd["checked_in"] = True
                crd["duration"] = voice_users.get(uid, {}).get("duration", 0) if uid in voice_users else 0
                crd["is_streamer"] = False
                checkin_map[uid] = crd

            for uid, vinfo in voice_users.items():
                if uid not in checkin_map:
                    checkin_map[uid] = {
                        "user_id": uid,
                        "nickname": vinfo["nickname"],
                        "checkin_time": "",
                        "method": "voice",
                        "checked_in": False,
                        "duration": vinfo["duration"],
                        "is_streamer": False,
                    }

            checkins = list(checkin_map.values())

            # Priority 1: match by nickname
            if streamer_name:
                for c in checkins:
                    nick = c.get("nickname", "")
                    if nick == streamer_name or nick.startswith(streamer_name):
                        c["is_streamer"] = True
                        break

            # Priority 2: check streamer_cache table
            if streamer_name and not any(c.get("is_streamer") for c in checkins):
                cached = conn.execute(
                    "SELECT user_id FROM streamer_cache WHERE alias = ?",
                    (streamer_name,),
                ).fetchone()
                if cached:
                    for c in checkins:
                        if c["user_id"] == cached["user_id"]:
                            c["is_streamer"] = True
                            break

            # Priority 3: query employee database, save to cache
            if streamer_name and not any(c.get("is_streamer") for c in checkins):
                try:
                    member_db = os.environ.get("MEMBER_ADMIN_DB", "/opt/member-admin-prod/backend/members.db")
                    emp_conn = sqlite3.connect(member_db)
                    emp_conn.row_factory = sqlite3.Row
                    emp = emp_conn.execute(
                        "SELECT nickname, alias, discord FROM live_employees"
                        " WHERE (LOWER(nickname) = LOWER(?) OR LOWER(alias) = LOWER(?))"
                        " AND status = '在职'",
                        (streamer_name, streamer_name),
                    ).fetchone()
                    if emp:
                        discord_nick = emp["discord"] or emp["nickname"]
                        nick_row = conn.execute(
                            "SELECT user_id FROM user_nicknames WHERE nickname = ?",
                            (discord_nick,),
                        ).fetchone()
                        if nick_row:
                            target_uid = nick_row["user_id"]
                            # Save to cache
                            conn.execute(
                                "INSERT OR REPLACE INTO streamer_cache (alias, user_id, updated_at) VALUES (?, ?, datetime('now'))",
                                (streamer_name, target_uid),
                            )
                            conn.commit()
                            for c in checkins:
                                if c["user_id"] == target_uid:
                                    c["is_streamer"] = True
                                    break
                    emp_conn.close()
                except Exception:
                    pass

            # Priority 4: fallback to creator_id
            if not any(c.get("is_streamer") for c in checkins):
                for c in checkins:
                    if c["user_id"] == creator_id:
                        c["is_streamer"] = True
                        break

            checkins.sort(key=lambda x: (0 if x.get("is_streamer") else 1 if x.get("checked_in") else 2, -x.get("duration", 0)))
            s["checkins"] = checkins
            s["checkin_count"] = len(checkins)

            if s["start_time"]:
                start = datetime.fromisoformat(s["start_time"])
                if s["end_time"]:
                    end = datetime.fromisoformat(s["end_time"])
                else:
                    from datetime import datetime as dt_now
                    end = dt_now.now()
                s["duration_minutes"] = int((end - start).total_seconds() / 60)
            else:
                s["duration_minutes"] = 0

            items.append(s)

        conn.close()
        return jsonify({"ok": True, "data": {"items": items, "total": total, "page": page, "page_size": page_size}})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/checkin/sessions/<int:session_id>/restore")
@write_required
def restore_checkin_session(session_id):
    """A' 策略·审计化恢复入口：恢复被误取消的场次。
    铁律：只允许恢复「有参与历史」的场（checkins ≥1 或 voice_sessions 除主播外 ≥1 人）；
    空场（从未有人参与）不可恢复——它不成立，只能保持取消。
    恢复 = status cancelled → ended（end_time/end_reason 保留作追溯），审计留痕。
    """
    import sqlite3
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            conn.close()
            return jsonify({"ok": False, "error": "Session not found"}), 404
        if row["status"] != "cancelled":
            conn.close()
            return jsonify({"ok": False, "error": "仅 cancelled 场次可恢复"}), 400
        chk = conn.execute("SELECT COUNT(*) c FROM checkins WHERE session_id = ?", (session_id,)).fetchone()["c"]
        part = conn.execute("SELECT COUNT(DISTINCT user_id) c FROM voice_sessions WHERE session_id = ? AND user_id != ?",
                            (session_id, str(row["creator_id"]))).fetchone()["c"]
        if chk == 0 and part == 0:
            conn.close()
            return jsonify({"ok": False, "error": "空场无参与历史，不可恢复（未成立的场次保持取消）"}), 409
        before = {"status": row["status"], "end_reason": row["end_reason"], "checkins": chk, "participants": part}
        conn.execute("UPDATE sessions SET status = 'ended' WHERE id = ?", (session_id,))
        conn.commit()
        conn.close()
        log_change(session["user"], "restore", "checkin_session", session_id,
                   row["session_no"], before=before,
                   after={"status": "ended", "note": "A'策略·误判恢复，end_reason 保留追溯"})
        return jsonify({"ok": True, "data": {"session_no": row["session_no"], "status": "ended", "checkins": chk, "participants": part}})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@app.delete("/api/checkin/sessions/<int:session_id>")
@write_required
def delete_checkin_session(session_id):
    """End or cancel a session. Active → ended, Ended → cancelled (hidden)."""
    import sqlite3
    from datetime import datetime
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT id, status FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            conn.close()
            return jsonify({"ok": False, "error": "Session not found"}), 404
        if row["status"] == "cancelled":
            conn.close()
            return jsonify({"ok": False, "error": "Session already cancelled"}), 400
        now = datetime.now().isoformat()
        new_status = "ended" if row["status"] == "active" else "cancelled"

        # Fetch full session data before updating (for notification)
        session_row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()

        conn.execute("UPDATE sessions SET status = ?, end_time = COALESCE(end_time, ?) WHERE id = ?",
                     (new_status, now, session_id))
        conn.commit()

        # Send Feishu notification when force-ending (Active -> ended)
        if new_status == "ended" and session_row:
            try:
                import sys as _sys
                bot_path = "/opt/discord-checkin/backend"
                if bot_path not in _sys.path:
                    _sys.path.insert(0, bot_path)
                from notifier import notify_session_end

                start = session_row["start_time"]
                dur_min = 0
                if start:
                    try:
                        st = datetime.fromisoformat(start.replace(" ", "T"))
                        et = datetime.fromisoformat(now.replace(" ", "T"))
                        dur_min = int((et - st).total_seconds() / 60)
                    except:
                        pass
                hours = dur_min // 60
                mins = dur_min % 60
                dur_str = f"{hours}h {mins}m" if hours else f"{mins}m"

                checkin_rows = conn.execute(
                    "SELECT c.*, u.nickname as cached_nickname FROM checkins c "
                    "LEFT JOIN user_nicknames u ON c.user_id = u.user_id "
                    "WHERE c.session_id = ?", (session_id,)
                ).fetchall()
                checkins = []
                for c in checkin_rows:
                    nick = c["cached_nickname"] or c["nickname"] or c["user_id"]
                    checkins.append({"nickname": nick, "method": c.get("method", "button")})

                notify_session_end(
                    streamer_name=session_row["streamer_name"] or "Unknown",
                    session_no=session_row["session_no"],
                    duration=dur_str,
                    checkin_count=len(checkins),
                    checkins=checkins,
                    start_time=session_row.get("start_time", ""),
                    end_time=now,
                )
            except Exception as notify_err:
                print(f"[MA] Failed to send end notification: {notify_err}", flush=True)

        conn.close()
        return jsonify({"ok": True, "new_status": new_status})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


# --- Retro session start time ---


@app.route("/api/checkin/retro/<session_no>", methods=["POST"])
@write_required
def retro_session(session_no):
    """Retroactively fix session start_time to 2nd person's voice join time."""
    import sqlite3
    from datetime import datetime
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row

        # 1. Get session
        session = conn.execute(
            "SELECT * FROM sessions WHERE session_no = ?", (session_no,)
        ).fetchone()
        if not session:
            conn.close()
            return jsonify({"ok": False, "error": f"场次 {session_no} 不存在"}), 404

        if session["status"] != "active" and not session["end_time"]:
            conn.close()
            return jsonify({"ok": False, "error": "仅支持已结束的场次（end_time 不为空）"}), 400

        voice_channel_id = session["voice_channel_id"]
        if not voice_channel_id:
            conn.close()
            return jsonify({"ok": False, "error": "该场次没有关联语音频道"}), 400

        old_start = session["start_time"]
        creator_id = session["creator_id"]

        # 2. Get voice sessions ordered by join_time
        until = session["end_time"] or datetime.now().isoformat(sep=" ", timespec="seconds")
        rows = conn.execute(
            """SELECT user_id, MIN(join_time) as join_time FROM voice_sessions
               WHERE channel_id = ? AND join_time >= ? AND join_time < ?
               GROUP BY user_id
               ORDER BY join_time ASC""",
            (voice_channel_id, old_start, until),
        ).fetchall()

        if not rows:
            conn.close()
            return jsonify({"ok": False, "error": "场次期间没有语音进出记录"}), 400

        # 3. Find second person (skip creator)
        # 查找上一场次的结束时间，用于排除滞留用户
        prev_session = conn.execute(
            "SELECT end_time FROM sessions WHERE voice_channel_id = ? AND id < ? AND end_time IS NOT NULL ORDER BY id DESC LIMIT 1",
            (voice_channel_id, session["id"]),
        ).fetchone()
        prev_end_time = prev_session["end_time"] if prev_session else None

        second_user_id = None
        second_join = None
        for r in rows:
            uid = r["user_id"]
            if uid == creator_id:
                continue
            # 排除滞留用户：进入时间早于上一场次结束时间，说明是上一场次遗留
            if prev_end_time and r["join_time"] < prev_end_time:
                continue
            second_user_id = uid
            second_join = r["join_time"]
            break

        if second_user_id is None:
            conn.close()
            return jsonify({"ok": False, "error": "场次期间只有主播一人进入语音（无第二人）"}), 400

        new_start = second_join
        if new_start >= old_start:
            conn.close()
            return jsonify({"ok": False, "error": f"第二人进入时间 ({new_start}) 不早于当前 start_time ({old_start})，无需修正"}), 400

        # 4. Update start_time
        conn.execute(
            "UPDATE sessions SET start_time = ? WHERE id = ?",
            (new_start, session["id"]),
        )
        conn.commit()
        conn.close()

        return jsonify({
            "ok": True,
            "data": {
                "session_no": session_no,
                "old_start": old_start,
                "new_start": new_start,
                "second_user_id": second_user_id,
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] retro_session error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500
# --- Checkin settings API ---


@app.post("/api/checkin/sessions/<int:session_id>/checkins")
@write_required
def batch_add_checkins(session_id):
    """Batch add manual checkins to a session."""
    import sqlite3
    from datetime import datetime, date
    data = request.get_json(force=True, silent=True)
    if not data or "nicknames" not in data:
        return jsonify({"ok": False, "error": "缺少 nicknames 参数"}), 400
    nicknames = data["nicknames"]
    if not isinstance(nicknames, list) or not nicknames:
        return jsonify({"ok": False, "error": "nicknames 必须是非空列表"}), 400

    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not session:
            conn.close()
            return jsonify({"ok": False, "error": "Session not found"}), 404

        guild_id = session["guild_id"]
        channel_id = session["channel_id"] if session["channel_id"] else ""
        session_date = session["start_time"][:10] if session["start_time"] else date.today().isoformat()
        now = datetime.now().isoformat(sep=" ", timespec="seconds")

        added = []
        skipped = []
        for nickname in nicknames:
            nickname = nickname.strip()
            if not nickname:
                continue
            # Check duplicate
            existing = conn.execute(
                "SELECT 1 FROM checkins WHERE user_id = ? AND session_id = ?",
                (nickname, session_id),
            ).fetchone()
            if existing:
                skipped.append(nickname)
                continue
            conn.execute(
                """INSERT INTO checkins
                   (user_id, nickname, guild_id, channel_id, checkin_time, method, date, session_id)
                   VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)""",
                (nickname, nickname, guild_id, channel_id, now, session_date, session_id),
            )
            added.append(nickname)
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "data": {"added": added, "skipped": skipped}})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.delete("/api/checkin/sessions/<int:session_id>/checkins/<int:checkin_id>")
@write_required
def delete_session_checkin(session_id, checkin_id):
    """Delete a single checkin record from a session."""
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        checkin = conn.execute(
            "SELECT id FROM checkins WHERE id = ? AND session_id = ?",
            (checkin_id, session_id),
        ).fetchone()
        if not checkin:
            conn.close()
            return jsonify({"ok": False, "error": "Checkin not found"}), 404
        conn.execute("DELETE FROM checkins WHERE id = ?", (checkin_id,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/checkin/sessions/<int:session_id>/participants")
def get_session_participants(session_id):
    """语音参与者实算时长（含未达标者），供手动标记达标修复使用。
    时长口径与 bot 的 get_voice_durations_in_range 一致：各语音会话与场次时段取交集。"""
    import sqlite3
    from datetime import datetime
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not session:
            conn.close()
            return jsonify({"ok": False, "error": "Session not found"}), 404
        if not session["voice_channel_id"]:
            conn.close()
            return jsonify({"ok": True, "data": []})
        # 注意：SQL 比较必须用与库内一致的 'YYYY-MM-DD HH:MM:SS' 格式（空格），T 格式会导致字符串比较恒假
        since_raw = session["start_time"] or ""
        until_raw = session["end_time"] or datetime.now().isoformat(sep=" ", timespec="seconds")
        since_dt = datetime.fromisoformat(since_raw.replace(" ", "T"))
        until_dt = datetime.fromisoformat(until_raw.replace(" ", "T"))
        rows = conn.execute(
            """SELECT user_id, join_time, leave_time FROM voice_sessions
               WHERE channel_id = ? AND join_time < ? AND (leave_time IS NULL OR leave_time > ?)""",
            (session["voice_channel_id"], until_raw, since_raw),
        ).fetchall()
        totals = {}
        for r in rows:
            join_dt = datetime.fromisoformat(r["join_time"].replace(" ", "T"))
            leave_dt = datetime.fromisoformat(r["leave_time"].replace(" ", "T")) if r["leave_time"] else datetime.now()
            start = max(join_dt, since_dt)
            end = min(leave_dt, until_dt)
            mins = (end - start).total_seconds() / 60
            if mins > 0:
                totals[r["user_id"]] = totals.get(r["user_id"], 0) + mins
        creator = str(session["creator_id"] or "")
        participants = []
        for uid, mins in totals.items():
            nick_row = conn.execute("SELECT nickname FROM user_nicknames WHERE user_id = ?", (uid,)).fetchone()
            nickname = nick_row["nickname"] if nick_row else ("#" + uid[-6:] if str(uid).isdigit() else str(uid))
            # 兼容旧补签（user_id 存的是昵称）：按 user_id 或昵称任一命中即视为已签到
            checked = conn.execute(
                "SELECT 1 FROM checkins WHERE session_id = ? AND (user_id = ? OR nickname = ?)",
                (session_id, uid, nickname),
            ).fetchone()
            participants.append({
                "user_id": str(uid),
                "nickname": nickname,
                "minutes": int(round(mins)),
                "checked_in": bool(checked),
                "is_streamer": str(uid) == creator,
            })
        participants.sort(key=lambda x: -x["minutes"])
        conn.close()
        return jsonify({"ok": True, "data": participants})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_session_participants error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/checkin/sessions/<int:session_id>/mark-qualified")
@write_required
def mark_participant_qualified(session_id):
    """手动将某位语音参与者标记为达标（生成 method=manual 的签到记录）。
    用于修复 bot 宕机/重启导致的时长失真；不修改实际时长，幂等（已存在则跳过）。"""
    import sqlite3
    from datetime import datetime, date
    data = request.get_json(force=True, silent=True) or {}
    user_id = str(data.get("user_id") or "").strip()
    if not user_id:
        return jsonify({"ok": False, "error": "缺少 user_id 参数"}), 400
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not session:
            conn.close()
            return jsonify({"ok": False, "error": "Session not found"}), 404
        nick_row0 = conn.execute("SELECT nickname FROM user_nicknames WHERE user_id = ?", (user_id,)).fetchone()
        nick0 = nick_row0["nickname"] if nick_row0 else ("#" + user_id[-6:] if user_id.isdigit() else user_id)
        # 兼容旧补签：user_id 或昵称任一命中即视为已签到（幂等）
        existing = conn.execute(
            "SELECT id FROM checkins WHERE session_id = ? AND (user_id = ? OR nickname = ?)",
            (session_id, user_id, nick0),
        ).fetchone()
        if existing:
            conn.close()
            return jsonify({"ok": True, "data": {"added": False, "reason": "already_checked_in"}})
        nickname = nick0
        now = datetime.now().isoformat(sep=" ", timespec="seconds")
        session_date = (session["start_time"] or "")[:10] or date.today().isoformat()
        conn.execute(
            """INSERT INTO checkins
               (user_id, nickname, guild_id, channel_id, checkin_time, method, date, session_id)
               VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)""",
            (user_id, nickname, session["guild_id"], session["channel_id"] or "", now, session_date, session_id),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "data": {"added": True, "nickname": nickname}})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] mark_participant_qualified error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500



import subprocess, json

@app.route("/api/checkin/sync-nicknames")
@write_required
def sync_nicknames():
    import sys, os
    try:
        result = subprocess.run(
            [sys.executable, os.path.join(os.path.dirname(__file__), "sync_nicknames.py")],
            capture_output=True, text=True, timeout=300,
            env={**os.environ, "CHECKIN_DB_PATH": CHECKIN_DB_PATH}
        )
        out = result.stdout.strip()
        lines = out.split("\n")
        last_line = lines[-1].strip() if lines else ""
        if last_line.startswith("{"):
            data = json.loads(last_line)
            return jsonify({"ok": True, "data": data})
        return jsonify({"ok": True, "data": {"synced": 0, "detail": last_line if last_line else "ok"}})
    except subprocess.TimeoutExpired:
        return jsonify({"ok": False, "error": "sync timeout"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)})


@app.route("/api/checkin/user-nicknames")
@write_required
def get_user_nicknames():
    """返回本地缓存的昵称列表。"""
    import sqlite3
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT user_id, nickname, updated_at FROM user_nicknames ORDER BY nickname"
        ).fetchall()
        conn.close()
        items = [dict(r) for r in rows]
        return jsonify({"ok": True, "data": items})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)})


@app.route("/api/checkin/settings")
@write_required
def get_checkin_settings():
    """Get all checkin settings."""
    import sqlite3
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        settings = {r["key"]: r["value"] for r in rows}
        conn.close()
        return jsonify({"ok": True, "data": settings})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/checkin/settings", methods=["POST"])
@write_required
def update_checkin_settings():
    """Update checkin settings."""
    import sqlite3
    try:
        data = request.get_json()
        if not data or "key" not in data or "value" not in data:
            return jsonify({"ok": False, "error": "key and value required"}), 400
        # Log the save
        print(f"[MA] SAVE settings: key={data['key']!r} value={data['value']!r}", flush=True)
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                     (data["key"], data["value"]))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500

# --- Checkin daily report API ---

@app.route("/api/checkin/today")
@write_required
def get_checkin_today():
    import sqlite3
    from datetime import date, datetime
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        today = date.today().isoformat()
        guild_id = CHECKIN_GUILD_ID
        rows = conn.execute(
            "SELECT c.* FROM checkins c JOIN sessions s ON c.session_id = s.id "
            "WHERE c.date = ? AND s.guild_id = ? "
            "ORDER BY c.checkin_time ASC",
            (today, guild_id),
        ).fetchall()
        items = [dict(r) for r in rows]
        conn.close()
        return jsonify({"ok": True, "data": {"total": len(items), "date": today, "items": items}})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/checkin/history")
@write_required
def get_checkin_history():
    import sqlite3
    from datetime import datetime
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 50))
        from_date = request.args.get("from", "")
        to_date = request.args.get("to", "")
        guild_id = CHECKIN_GUILD_ID

        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        conditions = ["s.guild_id = ?", "s.status != 'cancelled'"]  # cancelled 隐藏：判定准确即无需 review
        params = [guild_id]
        if from_date:
            conditions.append("c.date >= ?")
            params.append(from_date)
        if to_date:
            conditions.append("c.date <= ?")
            params.append(to_date)
        where = " AND ".join(conditions)

        count_row = conn.execute(
            f"SELECT COUNT(*) as cnt FROM checkins c JOIN sessions s ON c.session_id = s.id WHERE {where}",
            params,
        ).fetchone()
        total = count_row["cnt"] if count_row else 0
        offset = (page - 1) * page_size
        rows = conn.execute(
            f"SELECT c.* FROM checkins c JOIN sessions s ON c.session_id = s.id "
            f"WHERE {where} ORDER BY c.checkin_time DESC LIMIT ? OFFSET ?",
            params + [page_size, offset],
        ).fetchall()
        items = [dict(r) for r in rows]
        conn.close()
        return jsonify({"ok": True, "data": {"items": items, "total": total, "page": page, "page_size": page_size}})
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/checkin/export")
@write_required
def export_checkin_csv():
    import sqlite3, csv, io
    from datetime import datetime
    try:
        date_str = request.args.get("date", "")
        guild_id = CHECKIN_GUILD_ID
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        if date_str:
            rows = conn.execute(
                "SELECT c.*, s.streamer_name, s.session_no FROM checkins c "
                "JOIN sessions s ON c.session_id = s.id "
                "WHERE c.date = ? AND s.guild_id = ? "
                "ORDER BY c.checkin_time ASC",
                (date_str, guild_id),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT c.*, s.streamer_name, s.session_no FROM checkins c "
                "JOIN sessions s ON c.session_id = s.id "
                "WHERE s.guild_id = ? ORDER BY c.checkin_time DESC LIMIT 1000",
                (guild_id,),
            ).fetchall()
        conn.close()

        output = io.StringIO()
        w = csv.writer(output)
        w.writerow(["checkin_time", "nickname", "method", "streamer_name", "session_no"])
        for r in rows:
            w.writerow([r["checkin_time"], r["nickname"], r["method"], r["streamer_name"], r["session_no"]])
        csv_content = output.getvalue()
        output.close()

        from flask import Response
        return Response(
            csv_content,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename=checkin_{date_str or 'all'}.csv"},
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[MA] get_checkin_settings error: {e}", flush=True)
        return jsonify({"ok": False, "error": str(e)}), 500


# ---------- 待认领人员（C' 方案③修复层：与 bot reconcile.py 共用同一口径源） ----------

def _reconcile_mod():
    """引入 bot 侧对账模块（MA 与 bot 共用未认领判定，保证两端清单一致）。"""
    import sys as _sys
    bot_path = "/opt/discord-checkin/backend"
    if bot_path not in _sys.path:
        _sys.path.insert(0, bot_path)
    import reconcile
    return reconcile


def _staff_watch_mod():
    """引入 bot 侧 staff 源头对账模块（新员工/疑似离职检测，与 04:50 定时同源）。"""
    import sys as _sys
    bot_path = "/opt/discord-checkin/backend"
    if bot_path not in _sys.path:
        _sys.path.insert(0, bot_path)
    import staff_watch
    return staff_watch


@app.post("/api/sync/staff-watch")
@write_required
def sync_staff_watch():
    """手动触发 staff 源头对账 → 写消息中心 inbox（幂等，重复点不重复造消息）。"""
    import traceback
    try:
        rc = _staff_watch_mod()
        res = rc.scan(members_db=MEMBER_ADMIN_DB)
        # 显式传 db_path=CHECKIN_DB_PATH：test 环境通过 .env 的 CHECKIN_DB 指向独立 test 库，
        # 避免 test 触发时写入 prod 共用 checkins.db（2026-09-12 垃圾消息事故）
        n = rc.write_inbox(res, db_path=CHECKIN_DB_PATH)
        return jsonify({"ok": True, "data": {
            "new_employees": len(res["new_employees"]),
            "offboard": len(res["offboard"]),
            "inbox_added": n}})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


def _split_ids(raw):
    return [x.strip() for x in str(raw or '').split(',') if x.strip().isdigit()]


def _attach_unclaimed_sessions(checkins_db, unclaimed):
    """为每条未认领 uid 补充近期参与场次（checkins→sessions JOIN，按场次去重，最多 6 场）。

    原地修改 unclaimed 列表元素，追加字段 sessions=[{session_no, streamer_name, date}]。
    """
    if not unclaimed:
        return unclaimed
    ids = [u['user_id'] for u in unclaimed if u.get('user_id')]
    if not ids:
        return unclaimed
    marks = ','.join('?' * len(ids))
    try:
        conn = sqlite3.connect(checkins_db)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                f"""SELECT c.user_id, s.session_no, s.streamer_name, s.start_time,
                           MAX(c.checkin_time) AS last_in
                    FROM checkins c JOIN sessions s ON c.session_id = s.id
                    WHERE c.user_id IN ({marks})
                    GROUP BY c.user_id, s.id
                    ORDER BY last_in DESC""", ids).fetchall()
        finally:
            conn.close()
    except Exception as e:
        print(f"[MA] _attach_unclaimed_sessions error: {e}", flush=True)
        return unclaimed
    by_uid = {}
    for r in rows:
        by_uid.setdefault(r['user_id'], []).append({
            'session_no': r['session_no'],
            'streamer_name': r['streamer_name'],
            'date': (r['start_time'] or r['last_in'] or '')[:10],
        })
    for u in unclaimed:
        u['sessions'] = (by_uid.get(u['user_id']) or [])[:6]
    return unclaimed


def _attach_renamed_prev(checkins_db, renamed):
    """为改名告警补 prev_nickname（该 uid 历史最近一次 ≠ 当前 的昵称，来自 checkins）。

    renamed 判定本身依赖 checkins 历史，故原昵称一定存在于 checkins；取最近一条非当前昵称。
    """
    if not renamed:
        return renamed
    ids = [r['user_id'] for r in renamed if r.get('user_id')]
    if not ids:
        return renamed
    marks = ','.join('?' * len(ids))
    try:
        conn = sqlite3.connect(checkins_db)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                f"""SELECT user_id, nickname, MAX(checkin_time) AS last_t
                    FROM checkins
                    WHERE user_id IN ({marks})
                    GROUP BY user_id, nickname
                    ORDER BY last_t DESC""", ids).fetchall()
        finally:
            conn.close()
    except Exception as e:
        print(f"[MA] _attach_renamed_prev error: {e}", flush=True)
        return renamed
    by_uid = {}
    for r in rows:
        by_uid.setdefault(r['user_id'], []).append((r['nickname'], r['last_t']))
    for r in renamed:
        cur_nick = (r.get('nickname') or '').strip()
        prev = None
        for nick, t in by_uid.get(r['user_id'], []):
            if nick and nick != cur_nick:
                prev = nick
                break
        r['prev_nickname'] = prev or ''
    return renamed


@app.get("/api/claim/pending")
@write_required
def claim_pending():
    """未认领 uid / 改名告警 / 疑似过期 ID 清单（口径 = 每日对账推送）。"""
    try:
        rc = _reconcile_mod()
        res = rc.scan(checkins_db=CHECKIN_DB_PATH, members_db=MEMBER_ADMIN_DB,
                      days=7, stale_days=14)
        _attach_unclaimed_sessions(CHECKIN_DB_PATH, res.get('unclaimed') or [])
        _attach_renamed_prev(CHECKIN_DB_PATH, res.get('renamed') or [])
        return jsonify({"ok": True, "data": res})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/claim/bind")
@write_required
def claim_bind():
    """绑定未认领 uid 到员工：追加进 live_employees.discord_user_id（只增不改，审计留痕）。

    防错：uid 已绑定其他员工 → 409 拒绝；同员工重复绑定 → 409 幂等提示。
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = str(data.get("user_id") or "").strip()
    emp_no = str(data.get("emp_no") or "").strip()
    nickname = str(data.get("nickname") or "").strip()
    if not user_id.isdigit() or not emp_no:
        return jsonify({"ok": False, "error": "user_id/emp_no 无效"}), 400
    try:
        rc = _reconcile_mod()
        known = rc.load_known(MEMBER_ADMIN_DB)
        cur_label = known["uids"].get(user_id)
        if cur_label and not str(cur_label).startswith(emp_no):
            return jsonify({"ok": False, "error": f"该 uid 已绑定 {cur_label}，请先解绑"}), 409
        db = get_db()
        emp = db.execute("SELECT * FROM live_employees WHERE emp_no = ?", (emp_no,)).fetchone()
        if not emp:
            return jsonify({"ok": False, "error": f"员工 {emp_no} 不存在"}), 404
        ids = _split_ids(emp["discord_user_id"]) + _split_ids(emp["discord_id"])
        if user_id in ids:
            return jsonify({"ok": False, "error": "该 uid 已在此员工映射中"}), 409
        new_val = (emp["discord_user_id"] or "").strip()
        new_val = f"{new_val},{user_id}" if new_val else user_id
        before = dict(emp)
        db.execute("UPDATE live_employees SET discord_user_id = ?, updated_at = ? WHERE id = ?",
                   (new_val, now(), emp["id"]))
        db.commit()
        after = dict(db.execute("SELECT * FROM live_employees WHERE id = ?", (emp["id"],)).fetchone())
        log_change(session["user"], "update", "live_employee", emp["id"],
                   f"{emp_no} 绑定 uid #{user_id[-6:]}", before=before, after=after, ip=client_ip())
        # 昵称侧兜底：把 player_mapping 同名行的归属与本次绑定员工对齐（避免同一 uid 被拆成两个主人）；
        # 若该昵称已在其他员工名下则不静默追加 uid（避免隐性多归属），收集进 conflicts 交前端提示。
        conflicts = []
        if nickname:
            row = db.execute("SELECT id, emp_no, discord_id FROM player_mapping WHERE player_name = ?",
                             (nickname,)).fetchone()
            if row:
                row_emp = (row["emp_no"] or "").strip()
                if row_emp in ("", emp_no):
                    upd = {}
                    if user_id not in _split_ids(row["discord_id"]):
                        pv = (row["discord_id"] or "").strip()
                        upd["discord_id"] = f"{pv},{user_id}" if pv else user_id
                    if row_emp != emp_no:
                        upd["emp_no"] = emp_no  # 归属空→对齐为本员工，保证与员工侧一致
                    if upd:
                        db.execute("UPDATE player_mapping SET {}, updated_at=? WHERE id=?".format(
                            ", ".join(k + "=?" for k in upd)),
                            list(upd.values()) + [now(), row["id"]])
                        db.commit()
                        log_change(session["user"], "update", "player_mapping", row["id"],
                                   f"{emp_no} 绑定 uid #{user_id[-6:]}（归属对齐）",
                                   before={"emp_no": row_emp},
                                   after=dict(db.execute("SELECT * FROM player_mapping WHERE id=?", (row["id"],)).fetchone()),
                                   ip=client_ip())
                else:
                    # 该昵称已在其他员工名下：不把 uid 塞进去（避免同一 uid 变成两个主人），交前端提示
                    conflicts.append({"id": row["id"], "player_name": nickname, "emp_no": row_emp})
            else:
                cur = db.execute(
                    "INSERT INTO player_mapping (player_name, emp_no, discord, discord_id, remark, created_at, updated_at)"
                    " VALUES (?,?,?,?,?,?,?)",
                    (nickname, emp_no, nickname, user_id, "绑定来源：待认领绑定", now(), now()))
                db.commit()
                log_change(session["user"], "create", "player_mapping", cur.lastrowid,
                           f"{emp_no} 绑定 uid #{user_id[-6:]}（新昵称行）",
                           after=dict(db.execute("SELECT * FROM player_mapping WHERE id=?", (cur.lastrowid,)).fetchone()),
                           ip=client_ip())
        return jsonify({"ok": True, "data": {"emp_no": emp_no, "discord_user_id": new_val, "conflicts": conflicts}})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/claim/foreign")
@write_required
def claim_foreign():
    """标记外聘/临时：player_mapping 补行（emp_no 空 + discord_id），对账不再告警；只增不改。"""
    data = request.get_json(force=True, silent=True) or {}
    user_id = str(data.get("user_id") or "").strip()
    nickname = str(data.get("nickname") or "").strip()
    if not user_id.isdigit() or not nickname:
        return jsonify({"ok": False, "error": "user_id/nickname 无效"}), 400
    try:
        db = get_db()
        row = db.execute("SELECT * FROM player_mapping WHERE player_name = ?", (nickname,)).fetchone()
        if row:
            if user_id in _split_ids(row["discord_id"]):
                return jsonify({"ok": False, "error": "该昵称行已含此 uid"}), 409
            new_val = (row["discord_id"] or "").strip()
            new_val = f"{new_val},{user_id}" if new_val else user_id
            before = dict(row)
            db.execute("UPDATE player_mapping SET discord_id = ?, updated_at = ? WHERE id = ?",
                       (new_val, now(), row["id"]))
            db.commit()
            after = dict(db.execute("SELECT * FROM player_mapping WHERE id = ?", (row["id"],)).fetchone())
            log_change(session["user"], "update", "player_mapping", row["id"],
                       f"{nickname} 标记外聘 uid #{user_id[-6:]}", before=before, after=after, ip=client_ip())
        else:
            cur = db.execute(
                "INSERT INTO player_mapping (player_name, emp_no, discord, discord_id, remark, created_at, updated_at)"
                " VALUES (?, '', '', ?, ?, ?, ?)",
                (nickname, user_id, "外聘/临时（待认领页标记）", now(), now()))
            db.commit()
            log_change(session["user"], "create", "player_mapping", cur.lastrowid,
                       nickname, before={}, after={"player_name": nickname, "discord_id": user_id},
                       ip=client_ip())
        return jsonify({"ok": True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/claim/exclude")
@write_required
def claim_exclude():
    """排除 uid：写入 checkins.db settings.excluded_user_ids（对账/展示均不再出现）。"""
    data = request.get_json(force=True, silent=True) or {}
    user_id = str(data.get("user_id") or "").strip()
    if not user_id.isdigit():
        return jsonify({"ok": False, "error": "user_id 无效"}), 400
    try:
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        row = conn.execute("SELECT value FROM settings WHERE key = 'excluded_user_ids'").fetchone()
        before_v = row[0] if row else ""
        ids = _split_ids(before_v)
        if user_id not in ids:
            ids.append(user_id)
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('excluded_user_ids', ?)",
                         (",".join(ids),))
            conn.commit()
        conn.close()
        log_change(session["user"], "update", "checkin_setting", 0,
                   f"排除 uid #{user_id[-6:]}",
                   before={"excluded_user_ids": before_v}, after={"excluded_user_ids": ",".join(ids)},
                   ip=client_ip())
        return jsonify({"ok": True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


# ---------- PID 全景（方案 B：live_player 全量 + 映射状态，只读） ----------


def _live_players():
    """源库 live_player 全量（id, player_name, nick_name）。连接失败抛异常（调用方处理）。"""
    conn = _source_staff_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, player_name, nick_name FROM live_player ORDER BY id")
        return list(cur.fetchall())
    finally:
        conn.close()


def _pids_panorama_rows():
    """PID 全景核心：live_player 全量 + player_mapping/live_employees 关联 + 陪玩明细最后出现时间。只读。"""
    players = _live_players()
    db = get_db()
    try:
        pm = [dict(r) for r in db.execute(
            "SELECT id, player_name, emp_no, discord, pd_id, remark, updated_at FROM player_mapping")]
        le = [dict(r) for r in db.execute(
            "SELECT emp_no, nickname, cn_name, discord, discord_user_id, discord_id FROM live_employees")]
    finally:
        db.close()
    # 陪玩明细最后出现时间（数据依据：MAX(live_date)）；源库连接复用，失败不阻塞全景
    last_seen_map = {}
    try:
        conn = _source_staff_conn()
        try:
            cur = conn.cursor()
            cur.execute("SELECT player_id, MAX(live_date) last_date FROM live_play_detail GROUP BY player_id")
            for r in cur.fetchall():
                last_seen_map[r["player_id"]] = str(r["last_date"] or "")
        finally:
            conn.close()
    except Exception as e:
        print(f"[MA] pids last_seen load error: {e}", flush=True)
    by_pd = {r["pd_id"]: r for r in pm if r.get("pd_id")}
    le_map = {r["emp_no"]: r for r in le if r.get("emp_no")}
    rows = []
    for p in players:
        pid = p["id"]
        name = p["player_name"] or ""
        nick = p["nick_name"] or ""
        mapping = by_pd.get(pid)
        emp_no = (mapping or {}).get("emp_no") or ""
        emp_label = ""
        emp_discord = ""
        emp_uid = ""
        if emp_no and emp_no in le_map:
            e = le_map[emp_no]
            emp_label = "%s %s" % (emp_no, e.get("nickname") or e.get("cn_name") or "")
            # Discord 信息以员工表为准（权威 uid 列优先），映射表 discord 仅兜底
            emp_disc = e.get("discord") or ""
            emp_uid = e.get("discord_user_id") or e.get("discord_id") or ""
        # 状态判定：只由数据事实决定（名字后缀≠身份）
        # ok=已映射且员工有效 / no_emp=已映射但员工空 / unmapped=无映射行 / left=已离职历史遗留
        if mapping:
            if emp_no == "LEFT":
                status = "left"
                emp_label = "已离职（历史遗留）"
            else:
                status = "ok" if emp_no and emp_label else "no_emp"
        else:
            status = "unmapped"
        rows.append({
            "pid": pid,
            "player_name": name,
            "nick_name": nick,
            "status": status,
            "mapping_id": (mapping or {}).get("id") or 0,
            "mapping_player_name": (mapping or {}).get("player_name") or "",
            "emp_no": emp_no,
            "emp_label": emp_label,
            "emp_disc": emp_disc,
            "emp_uid": emp_uid,
            # 展示优先员工表联动值，映射表 discord 仅作兜底（员工空/LEFT 时仍可见旧快照）
            "discord": emp_disc or (mapping or {}).get("discord") or "",
            "remark": (mapping or {}).get("remark") or "",
            "updated_at": (mapping or {}).get("updated_at") or "",
            "last_seen": last_seen_map.get(pid, ""),
        })
    return rows


@app.get("/api/pids/panorama")
@login_required
def pids_panorama():
    """PID 全景：源库 live_player 全量 + 本地映射/员工关联，缺映射标红、无员工标黄、FREE 标灰。只读。"""
    try:
        rows = _pids_panorama_rows()
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": "源库读取失败: %s" % e}), 502
    return jsonify({"ok": True, "data": {"items": rows, "total": len(rows)}})


@app.post("/api/pids/sync-fill")
@write_required
def pids_sync_fill():
    """映射同步补缺（只补缺不覆盖，幂等）：
    对每个 live_player：已映射（pd_id=pid）跳过；否则折叠名匹配空 pd 行则只补 pd_id，
    无匹配则新增一行（emp_no 空 + remark=自动补缺）。
    事务内只做数据变更；commit 后再统一写审计日志（避免 audit 新连接撞写锁）。
    """
    import traceback
    try:
        players = _live_players()
        db = get_db()
        updated, created, skipped = 0, 0, 0
        logs = []  # (action, entity_id, before, after, label) 待 commit 后审计
        try:
            pm_rows = [dict(r) for r in db.execute(
                "SELECT id, player_name, pd_id, emp_no, discord_id FROM player_mapping")]
            by_pd = {r["pd_id"]: r for r in pm_rows if r.get("pd_id")}
            cand_map = {_fold_name(r["player_name"]): r for r in pm_rows if not r.get("pd_id")}
            for p in players:
                pid = p["id"]
                if pid in by_pd:
                    skipped += 1
                    continue
                name = p["player_name"] or ""
                cand = cand_map.get(_fold_name(name))
                if not cand and p.get("nick_name"):
                    cand = cand_map.get(_fold_name(p["nick_name"]))
                if cand:
                    before = dict(cand)
                    db.execute("UPDATE player_mapping SET pd_id=?, updated_at=? WHERE id=?",
                               (pid, now(), cand["id"]))
                    after = dict(db.execute("SELECT * FROM player_mapping WHERE id=?", (cand["id"],)).fetchone())
                    logs.append(("update", cand["id"], before, after, f"PID同步补缺 #{pid} ({name})"))
                    updated += 1
                else:
                    cur = db.execute(
                        "INSERT INTO player_mapping (player_name, emp_no, discord, discord_id, remark, created_at, updated_at, pd_id)"
                        " VALUES (?,?,?,?,?,?,?,?)",
                        (name, "", "", "", "自动补缺：未关联员工", now(), now(), pid))
                    logs.append(("create", cur.lastrowid, None, dict(
                        db.execute("SELECT * FROM player_mapping WHERE id=?", (cur.lastrowid,)).fetchone()),
                        f"PID同步补缺 #{pid} ({name})"))
                    created += 1
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": "同步失败: %s" % e}), 500
    # commit 成功后统一写审计（新连接，此时无写锁冲突）
    for action, eid, before, after, label in logs:
        try:
            if action == "update":
                log_change(session["user"], "update", "player_mapping", eid, label,
                           before=before, after=after, ip=client_ip())
            else:
                log_change(session["user"], "create", "player_mapping", eid, label,
                           after=after, ip=client_ip())
        except Exception as e:
            print(f"[MA] pids sync audit fail: {e}", flush=True)
    return jsonify({"ok": True, "data": {"created": created, "updated": updated, "skipped": skipped}})


# ---------- Discord 绑定管理（方案 A 独立模块：全量视图 + 解绑，审计留痕） ----------

@app.get("/api/binding/employees")
@login_required
def binding_employees():
    """员工富信息列表（绑定选择器数据源）：返回可选员工的关键参考信息，供前端搜索+展示。"""
    db = get_db()
    rows = db.execute(
        "SELECT emp_no, nickname, alias, real_name, cn_name, gender, position, status,"
        " domain, discord, discord_id, discord_user_id, entry_date FROM live_employees"
        " ORDER BY emp_no").fetchall()
    db.close()
    items = []
    gmap = {"1": "男", "2": "女"}
    for r in rows:
        items.append({
            "emp_no": r["emp_no"],
            "nickname": r["nickname"] or "",
            "alias": r["alias"] or "",
            "real_name": r["real_name"] or "",
            "cn_name": r["cn_name"] or "",
            "gender": gmap.get(str(r["gender"]), ""),
            "position": r["position"] or "",
            "status": r["status"] or "",
            "domain": r["domain"] or "",
            "discord": r["discord"] or "",
            "discord_user_id": r["discord_user_id"] or "",
            "discord_id": r["discord_id"] or "",
            "entry_date": r["entry_date"] or "",
        })
    return jsonify({"ok": True, "data": items})


@app.get("/api/binding/list")
@login_required
def binding_list():
    """已绑定全量视图：聚合 live_employees.discord_id/discord_user_id + player_mapping.discord_id，标注来源。

    每行 = 一个 uid + 归属（员工编号/陪玩昵称）+ 来源表字段 + Discord 昵称（checkins.user_nicknames，
    对账实时昵称，优先；员工表 discord 列兜底）。解绑按 (uid, source, owner) 定位。
    """
    db = get_db()
    rows = []
    try:
        for r in db.execute("SELECT emp_no, nickname, alias, discord, discord_id, discord_user_id FROM live_employees"):
            owner = r["emp_no"] or r["nickname"] or r["alias"] or "?"
            for uid in _split_ids(r["discord_id"]):
                rows.append({"user_id": uid, "owner": owner, "discord": r["discord"] or "",
                             "source": "live_employees.discord_id",
                             "owner_key": r["emp_no"] or "",
                             "norm_owner": r["emp_no"] or ""})
            for uid in _split_ids(r["discord_user_id"]):
                rows.append({"user_id": uid, "owner": owner, "discord": r["discord"] or "",
                             "source": "live_employees.discord_user_id",
                             "owner_key": r["emp_no"] or "",
                             "norm_owner": r["emp_no"] or ""})
        for r in db.execute("SELECT player_name, emp_no, discord, discord_id FROM player_mapping"):
            for uid in _split_ids(r["discord_id"]):
                rows.append({"user_id": uid,
                             "owner": (r["emp_no"] or "外聘") + "/" + (r["player_name"] or "?"),
                             "discord": r["discord"] or "",
                             "source": "player_mapping.discord_id",
                             "owner_key": r["player_name"] or "",
                             "norm_owner": (r["emp_no"] or ("外聘/" + (r["player_name"] or "?")))})
    finally:
        db.close()
    # Discord 昵称增强：user_nicknames（checkins 库，对账实时昵称）优先，员工/映射表 discord 列兜底
    try:
        cdb = sqlite3.connect(CHECKIN_DB_PATH)
        cdb.row_factory = sqlite3.Row
        try:
            nick_map = {r["user_id"]: r["nickname"] for r in cdb.execute(
                "SELECT user_id, nickname FROM user_nicknames")}
        finally:
            cdb.close()
    except Exception as e:
        print(f"[MA] binding/list user_nicknames load error: {e}", flush=True)
        nick_map = {}
    for x in rows:
        if x["user_id"] in nick_map and nick_map[x["user_id"]]:
            x["discord_name"] = nick_map[x["user_id"]]
        else:
            x["discord_name"] = x.get("discord") or ""
    rows.sort(key=lambda x: (x["user_id"], x["source"]))
    return jsonify({"ok": True, "data": {"bound": rows}})


@app.post("/api/binding/unbind")
@write_required
def binding_unbind():
    """解绑 uid：从指定来源的指定行移除该 uid（只删该 uid，不影响其他 uid/字段）。审计留痕。

    source 支持：live_employees.discord_id / live_employees.discord_user_id / player_mapping.discord_id
    owner_key 定位行：员工用 emp_no，陪玩映射用 player_name。
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = str(data.get("user_id") or "").strip()
    source = str(data.get("source") or "").strip()
    owner_key = str(data.get("owner_key") or "").strip()
    if not user_id.isdigit() or not source or not owner_key:
        return jsonify({"ok": False, "error": "user_id/source/owner_key 无效"}), 400
    db = get_db()
    try:
        if source == "live_employees.discord_id" or source == "live_employees.discord_user_id":
            field = "discord_user_id" if source.endswith("discord_user_id") else "discord_id"
            row = db.execute("SELECT * FROM live_employees WHERE emp_no = ?", (owner_key,)).fetchone()
            if not row:
                return jsonify({"ok": False, "error": f"员工 {owner_key} 不存在"}), 404
            ids = _split_ids(row[field])
            if user_id not in ids:
                return jsonify({"ok": False, "error": "该员工此来源不含此 uid"}), 409
            before = dict(row)
            ids.remove(user_id)
            new_val = ",".join(ids)
            db.execute("UPDATE live_employees SET {} = ?, updated_at = ? WHERE id = ?".format(field),
                       (new_val, now(), row["id"]))
            db.commit()
            after = dict(db.execute("SELECT * FROM live_employees WHERE id = ?", (row["id"],)).fetchone())
            log_change(session["user"], "update", "live_employee", row["id"],
                       f"{owner_key} 解绑 uid #{user_id[-6:]}（{field}）",
                       before=before, after=after, ip=client_ip())
        elif source == "player_mapping.discord_id":
            row = db.execute("SELECT * FROM player_mapping WHERE player_name = ?", (owner_key,)).fetchone()
            if not row:
                return jsonify({"ok": False, "error": f"陪玩映射 {owner_key} 不存在"}), 404
            ids = _split_ids(row["discord_id"])
            if user_id not in ids:
                return jsonify({"ok": False, "error": "该映射行不含此 uid"}), 409
            before = dict(row)
            ids.remove(user_id)
            new_val = ",".join(ids)
            db.execute("UPDATE player_mapping SET discord_id = ?, updated_at = ? WHERE id = ?",
                       (new_val, now(), row["id"]))
            db.commit()
            after = dict(db.execute("SELECT * FROM player_mapping WHERE id = ?", (row["id"],)).fetchone())
            log_change(session["user"], "update", "player_mapping", row["id"],
                       f"{owner_key} 解绑 uid #{user_id[-6:]}",
                       before=before, after=after, ip=client_ip())
        else:
            return jsonify({"ok": False, "error": "未知 source"}), 400
        return jsonify({"ok": True, "data": {"user_id": user_id, "source": source}})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500
    finally:
        db.close()


# ---------- 数据校对报告 ----------

@app.route("/api/verify/reports", methods=["GET"])
@login_required
def list_verify_reports():
    page, page_size = _page_args()
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) as cnt FROM verify_reports").fetchone()["cnt"]
    rows = conn.execute(
        "SELECT * FROM verify_reports ORDER BY report_date DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    conn.close()
    return jsonify({
        "ok": True,
        "data": {
            "items": [dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    })


@app.route("/api/verify/reports/<date>", methods=["GET"])
@login_required
def get_verify_report(date):
    conn = get_db()
    row = conn.execute("SELECT * FROM verify_reports WHERE report_date = ?", (date,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"ok": False, "error": "报告不存在"}), 404
    return jsonify({"ok": True, "data": dict(row)})


@app.route("/api/verify/reports/run", methods=["POST"])
@write_required
def run_verify_report():
    data = request.get_json(force=True, silent=True) or {}
    date = data.get("date", "").strip()
    if not date:
        return jsonify({"ok": False, "error": "请提供日期"}), 400
    try:
        report = _generate_verify_report(date)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500
    conn = get_db()
    conn.execute(
        """INSERT INTO verify_reports (report_date, summary, content, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(report_date) DO UPDATE SET
             summary=excluded.summary,
             content=excluded.content,
             updated_at=excluded.updated_at""",
        (report["report_date"], report["summary"], report["content"], now(), now()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM verify_reports WHERE report_date = ?", (date,)).fetchone()
    conn.close()
    return jsonify({"ok": True, "data": dict(row)})


def _generate_verify_report(date):
    """按日期生成签到/陪玩映射校对报告（占位实现，具体规则需用户确认）。"""
    import sqlite3
    import json
    guild_id = CHECKIN_GUILD_ID
    conn = sqlite3.connect(CHECKIN_DB_PATH)
    conn.row_factory = sqlite3.Row

    sessions = conn.execute(
        """SELECT s.*,
                  (SELECT COUNT(*) FROM checkins WHERE session_id = s.id) as checkin_count
           FROM sessions s
           WHERE s.guild_id = ? AND date(s.start_time) = ?
           ORDER BY s.start_time""",
        (guild_id, date),
    ).fetchall()

    # 收集所有签到人员昵称
    all_nicknames = set()
    matched_nicknames = set()
    session_rows = []
    for s in sessions:
        sid = s["id"]
        checkins = conn.execute(
            "SELECT nickname, duration FROM checkins WHERE session_id = ? ORDER BY checkin_time",
            (sid,),
        ).fetchall()
        persons = []
        for c in checkins:
            nick = c["nickname"] or ""
            all_nicknames.add(nick)
            persons.append({"nickname": nick, "duration": c["duration"] or 0})
        session_rows.append({
            "session_no": s["session_no"] or "",
            "streamer": s["streamer_name"] or "",
            "start": s["start_time"] or "",
            "end": s["end_time"] or "",
            "persons": persons,
        })
    conn.close()

    # 用 player_mapping 匹配
    conn = get_db()
    mappings = conn.execute("SELECT player_name, emp_no, discord FROM player_mapping").fetchall()
    conn.close()
    name_to_emp = {}
    for m in mappings:
        key = (m["player_name"] or "").strip()
        if key:
            name_to_emp[key] = m

    matched = []
    unmatched = []
    for nick in sorted(all_nicknames):
        if nick in name_to_emp:
            matched.append({"nickname": nick, "emp_no": name_to_emp[nick]["emp_no"], "discord": name_to_emp[nick]["discord"]})
            matched_nicknames.add(nick)
        else:
            unmatched.append(nick)

    total_persons = len(all_nicknames)
    match_rate = round(len(matched) / total_persons * 100, 1) if total_persons else 0.0
    summary = {
        "sessions": len(sessions),
        "matched_persons": len(matched),
        "total_persons": total_persons,
        "match_rate": match_rate,
        "avg_diff": 0,
    }

    lines = [f"# 数据校对报告 {date}", ""]
    lines.append(f"- 场次数：{len(sessions)}")
    lines.append(f"- 参与人数：{total_persons}")
    lines.append(f"- 已匹配人数：{len(matched)} ({match_rate}%)")
    lines.append(f"- 未匹配人数：{len(unmatched)}")
    lines.append("")
    lines.append("## 场次明细")
    for sr in session_rows:
        lines.append(f"### {sr['streamer']} · {sr['session_no']} ({sr['start']} ~ {sr['end']})")
        if sr["persons"]:
            lines.append("| 昵称 | 语音时长(分钟) |")
            lines.append("|------|----------------|")
            for p in sr["persons"]:
                lines.append(f"| {p['nickname']} | {p['duration']} |")
        else:
            lines.append("_本场暂无签到记录_")
        lines.append("")
    if unmatched:
        lines.append("## 未匹配昵称")
        for nick in unmatched:
            lines.append(f"- {nick}")
    content = "\n".join(lines)
    return {"report_date": date, "summary": json.dumps(summary), "content": content}


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"ok": False, "error": f"文件超过 {MAX_UPLOAD_MB}MB 限制"}), 413


# ========== 消息中心 inbox（承接 staff_watch/reconcile 同步消息，bot checkins.db） ==========

@app.get("/api/inbox")
@write_required
def inbox_list():
    """消息中心列表。status=all|pending|done|dismissed，默认 pending。"""
    status = request.args.get("status", "pending") or "pending"
    limit = min(int(request.args.get("limit", 200) or 200), 500)
    try:
        import sqlite3
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
            if "inbox" not in tables:
                return jsonify({"ok": True, "data": {"items": [], "total": 0, "pending_count": 0}})
            cond, params = "", []
            if status != "all":
                cond = "WHERE status = ?"
                params = [status]
            items = conn.execute(
                f"SELECT * FROM inbox {cond} ORDER BY created_at DESC, id DESC LIMIT ?",
                params + [limit]).fetchall()
            total = conn.execute(f"SELECT COUNT(*) c FROM inbox {cond}", params).fetchone()["c"]
            pc = conn.execute("SELECT COUNT(*) c FROM inbox WHERE status='pending'").fetchone()["c"]
            return jsonify({"ok": True, "data": {
                "items": [dict(r) for r in items], "total": total, "pending_count": pc}})
        finally:
            conn.close()
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/inbox/<int:item_id>/status")
@write_required
def inbox_update_status(item_id):
    """标记消息为 done/dismissed（只进不退：处理后不浮回待办）。"""
    data = request.get_json(force=True, silent=True) or {}
    status = str(data.get("status") or "").strip()
    if status not in ("done", "dismissed"):
        return jsonify({"ok": False, "error": "status 仅支持 done/dismissed"}), 400
    try:
        import sqlite3
        conn = sqlite3.connect(CHECKIN_DB_PATH)
        try:
            cur = conn.execute(
                "UPDATE inbox SET status=?, resolved_at=datetime('now','localtime'), resolved_by=? "
                "WHERE id=? AND status='pending'",
                (status, session["user"], item_id))
            conn.commit()
            if cur.rowcount == 0:
                return jsonify({"ok": False, "error": "消息不存在或已处理"}), 404
            return jsonify({"ok": True, "data": {"id": item_id, "status": status}})
        finally:
            conn.close()
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/api/live_employees/<int:row_id>/vietqr")
@login_required
def employee_vietqr(row_id):
    """返回该直播员工的 VietQR 静态收款码 payload（仅账号+银行，无金额）。"""
    row = get_by_id("live_employees", row_id)
    if not row:
        return jsonify({"ok": False, "error": "员工不存在"}), 404
    account = str(row.get("account") or "").strip()
    bank = str(row.get("bank") or "").strip()
    if not account:
        return jsonify({"ok": False, "error": "该员工未填写收款账号"}), 400
    bin_code = vietqr.normalize_bank(bank)
    if not bin_code:
        return jsonify({"ok": False, "error": f"未识别收款银行：{bank or '(空)'}"}), 400
    payload = vietqr.build_payload(account, bin_code)
    return jsonify({"ok": True, "data": {
        "payload": payload, "account": account, "bank": bank, "bin": bin_code,
        "note": "静态收款码：仅含账号+收款银行，不含金额"
    }})


PAY_SPLIT_LIMIT = 100_000_000  # 银行单笔限额：超此金额拆成多笔收款码


def _pay_name(emp, emp_no):
    """收款人显示名：原名优先，昵称放括号（如有）。"""
    real = str(emp["real_name"] or "").strip() if emp else ""
    nick = str(emp["nickname"] or "").strip() if emp else ""
    if real and nick:
        return real + "（" + nick + "）"
    if real:
        return real
    if nick:
        return nick
    return str(emp_no or "")


def _split_pay_amount(amount):
    """将金额拆成 ≤PAY_SPLIT_LIMIT 的多个分片（每笔限额内）。"""
    if amount <= PAY_SPLIT_LIMIT:
        return [amount]
    parts = []
    while amount > 0:
        take = min(PAY_SPLIT_LIMIT, amount)
        parts.append(take)
        amount -= take
    return parts


@app.post("/api/paycode/generate")
@login_required
def paycode_generate():
    """Excel/CSV(员工编号+金额) -> 批量生成带金额 VietQR，并创建批次快照。
    成功行写入 pay_records（含 payload 快照），供批次历史重开二维码。"""
    try:
        rows = _paycode_read_rows()
        db = get_db()
        try:
            now_ts = now()
            cur = db.execute(
                "INSERT INTO pay_batches(created_at, created_by, total_rows, ok_rows, total_amount, remark) "
                "VALUES(?,?,?,?,?,'')", (now_ts, session["user"], len(rows), 0, 0))
            batch_id = cur.lastrowid
            results, ok_n, err_n, total_amt = [], 0, 0, 0
            for emp_no, amount in rows:
                emp_no = str(emp_no or "").strip()
                if not emp_no:
                    err_n += 1
                    results.append({"emp_no": emp_no, "ok": False, "error": "员工编号为空"})
                    continue
                try:
                    amount = int(float(str(amount).replace(",", "").strip() or 0))
                except (ValueError, TypeError):
                    err_n += 1
                    results.append({"emp_no": emp_no, "ok": False, "error": f"金额非法: {amount}"})
                    continue
                if amount <= 0:
                    err_n += 1
                    results.append({"emp_no": emp_no, "ok": False, "error": f"金额须大于0: {amount}"})
                    continue
                emp = db.execute("SELECT emp_no, nickname, real_name, account, bank FROM live_employees WHERE trim(emp_no)=?", (emp_no,)).fetchone()
                if not emp:
                    err_n += 1
                    results.append({"emp_no": emp_no, "ok": False, "error": "未找到该员工编号", "amount": amount})
                    continue
                account = str(emp["account"] or "").strip()
                bank = str(emp["bank"] or "").strip()
                name = _pay_name(emp, emp_no)
                if not account:
                    err_n += 1
                    results.append({"emp_no": emp_no, "name": name, "ok": False, "error": "该员工未填收款账号", "amount": amount})
                    continue
                bin_code = vietqr.normalize_bank(bank)
                if not bin_code:
                    err_n += 1
                    results.append({"emp_no": emp_no, "name": name, "ok": False, "error": f"未识别收款银行: {bank}", "amount": amount})
                    continue
                # 超单笔限额拆成多片，每片一张收款码
                parts = _split_pay_amount(amount)
                for idx, part in enumerate(parts):
                    payload = vietqr.build_payload(account, bin_code, amount=part)
                    cur2 = db.execute(
                        "INSERT INTO pay_records(batch_id, emp_no, amount, status, paid_at, paid_by, remark, payload, updated_at) "
                        "VALUES(?,?,?,'unpaid','','','',?,?)",
                        (batch_id, emp_no, part, payload, now_ts))
                    rid = cur2.lastrowid
                    items5 = {"id": rid, "emp_no": emp_no, "name": name,
                               "account": account, "bank": bank, "amount": part, "payload": payload,
                               "status": "unpaid", "paid_at": "", "paid_by": "", "remark": "", "ok": True}
                    if len(parts) > 1:
                        items5["split"] = {"idx": idx + 1, "total": len(parts)}
                    results.append(items5)
                ok_n += 1
                total_amt += amount
            db.execute("UPDATE pay_batches SET ok_rows=?, total_amount=? WHERE id=?", (ok_n, total_amt, batch_id))
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        return jsonify({"ok": True, "data": {
            "batch_id": batch_id, "items": results, "ok_count": ok_n, "err_count": err_n,
            "total_amount": total_amt, "total_rows": len(rows),
            "note": "扫码即带出收款账号+金额，请逐张核对后付款"}})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/api/paycode/records")
@login_required
def paycode_records_list():
    """工资代发「已发」记录（含批次/备注）。"""
    db = get_db()
    try:
        rows = db.execute("SELECT id, batch_id, emp_no, amount, status, paid_at, paid_by, remark, updated_at"
                          " FROM pay_records ORDER BY batch_id DESC, id ASC").fetchall()
        return jsonify({"ok": True, "data": [dict(r) for r in rows]})
    finally:
        db.close()


@app.get("/api/paycode/batches")
@login_required
def paycode_batches_list():
    """批次历史列表（含每批已发数）。"""
    db = get_db()
    try:
        rows = db.execute("""
            SELECT b.id, b.created_at, b.created_by, b.total_rows, b.ok_rows, b.total_amount, b.remark,
                   (SELECT COUNT(*) FROM pay_records r WHERE r.batch_id=b.id AND r.status='paid') AS paid_rows
            FROM pay_batches b ORDER BY b.id DESC""").fetchall()
        return jsonify({"ok": True, "data": [dict(r) for r in rows]})
    finally:
        db.close()


@app.get("/api/paycode/batches/<int:batch_id>")
@login_required
def paycode_batch_detail(batch_id):
    """某批次详情：批次信息 + 每笔记录（含 payload 快照，可重开二维码）。"""
    db = get_db()
    try:
        batch = db.execute("SELECT * FROM pay_batches WHERE id=?", (batch_id,)).fetchone()
        if not batch:
            return jsonify({"ok": False, "error": "批次不存在"}), 404
        rows = db.execute("SELECT id, emp_no, amount, status, paid_at, paid_by, remark, payload FROM pay_records "
                          "WHERE batch_id=? ORDER BY id ASC", (batch_id,)).fetchall()
        items = []
        for r in rows:
            emp = db.execute("SELECT nickname, real_name, bank FROM live_employees WHERE trim(emp_no)=?", (r["emp_no"],)).fetchone()
            items.append(dict(r))
            items[-1]["name"] = _pay_name(emp, r["emp_no"])
            items[-1]["bank"] = emp["bank"] if emp else ""
            items[-1]["has_emp"] = bool(emp)
        return jsonify({"ok": True, "data": {"batch": dict(batch), "items": items}})
    finally:
        db.close()


@app.post("/api/paycode/batches/<int:batch_id>/remark")
@write_required
def paycode_batch_remark(batch_id):
    """为批次添加/更新备注。"""
    data = request.get_json(force=True, silent=True) or {}
    remark = str(data.get("remark") or "").strip()
    db = get_db()
    try:
        cur = db.execute("UPDATE pay_batches SET remark=? WHERE id=?", (remark, batch_id))
        db.commit()
        if cur.rowcount == 0:
            return jsonify({"ok": False, "error": "批次不存在"}), 404
        return jsonify({"ok": True, "data": {"batch_id": batch_id, "remark": remark}})
    finally:
        db.close()


@app.post("/api/paycode/records")
@write_required
def paycode_records_update():
    """按记录 id 标记某笔为已发(paid)/未发(unpaid)。"""
    data = request.get_json(force=True, silent=True) or {}
    rec_id = data.get("id")
    status = str(data.get("status") or "").strip()
    try:
        rec_id = int(rec_id)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "id 必填且为数字"}), 400
    if status not in ("paid", "unpaid"):
        return jsonify({"ok": False, "error": "status 仅支持 paid/unpaid"}), 400
    now_ts = now()
    paid_at = now_ts if status == "paid" else ""
    paid_by = session["user"] if status == "paid" else ""
    db = get_db()
    try:
        cur = db.execute("UPDATE pay_records SET status=?, paid_at=?, paid_by=?, updated_at=? WHERE id=?",
                         (status, paid_at, paid_by, now_ts, rec_id))
        db.commit()
        if cur.rowcount == 0:
            return jsonify({"ok": False, "error": "记录不存在"}), 404
        return jsonify({"ok": True, "data": {"id": rec_id, "status": status, "paid_at": paid_at, "paid_by": paid_by}})
    finally:
        db.close()


def _paycode_read_rows():
    """从上传文件或 JSON 读取 [(emp_no, amount), ...]。"""
    f = request.files.get("file")
    if f:
        filename = (f.filename or "").lower()
        raw = f.read()
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            import openpyxl
            wb = openpyxl.load_workbook(BytesIO(raw), data_only=True)
            sh = wb.active
            grid = [["" if c is None else str(c).strip() for c in row] for row in sh.iter_rows(values_only=True)]
        else:
            text = raw.decode("utf-8-sig", errors="replace")
            sep = "\t" if "\t" in text and ("," not in text or text.count("\t") >= text.count(",")) else ","
            grid = [[c.strip() for c in line.split(sep)] for line in text.splitlines() if line.strip()]
        grid = [r for r in grid if any(c for c in r)]
        if not grid:
            return []
        header = [h.lower() for h in grid[0]]
        EMP_KEYS = ("员工编号", "工号", "员工号", "emp_no", "empno", "编号", "mã nhân viên")
        AMT_KEYS = ("金额", "工资", "应发", "实发", "amount", "salary", "lương", "tien")
        ei = next((i for i, h in enumerate(header) if h in EMP_KEYS or h.replace("_", "") == "empno"), None)
        ai = next((i for i, h in enumerate(header) if h in AMT_KEYS or h == "vnd"), None)
        if ei is None:
            ei = 0
        if ai is None:
            ai = ei + 1 if ei + 1 < len(header) else 0
        rows = []
        for r in grid[1:]:
            if ei >= len(r):
                continue
            emp = r[ei]
            amt = r[ai] if ai < len(r) else ""
            if emp == "" and amt == "":
                continue
            rows.append((emp, amt))
        return rows
    data = request.get_json(force=True, silent=True) or {}
    return [(str(x.get("emp_no") or "").strip(), x.get("amount")) for x in (data.get("rows") or [])]


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

