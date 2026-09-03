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
    ("保险基数(K盾·直播)", "l_insurance_k", "insurance", True),
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
        # 以 emp_no 为值，供 player_mapping 等按编号关联场景使用
        rows = conn.execute(
            "SELECT emp_no, nickname, alias, position, status FROM live_employees"
            " ORDER BY emp_no").fetchall()
        items = [{"id": r["emp_no"],
                  "label": f'{r["nickname"] or r["alias"] or r["emp_no"]}（{r["position"] or "-"}·{r["status"] or "-"}）'} for r in rows]
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
        conditions = ["s.guild_id = ?", "s.status != 'cancelled'"]
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
        conditions = ["s.guild_id = ?", "s.status != 'cancelled'"]
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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
