import os
import json
import uuid
from functools import wraps

from flask import Flask, request, session, jsonify, send_file, abort
from werkzeug.security import generate_password_hash, check_password_hash

from config import (SECRET_KEY, SESSION_COOKIE_NAME, SESSION_COOKIE_PATH,
                    UPLOAD_DIR, MAX_UPLOAD_MB, ALLOWED_IMAGE_EXT, META)
import models
from models import (init_db, get_db, get_by_id, insert_row, update_row, delete_row,
                    list_rows, TABLE_FIELDS, ENTITY_LABEL_FIELD, now)
from audit import log_change, list_logs
from game_data import get_game_data
from query_engine import run_query, run_commission, list_leaders

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config["SESSION_COOKIE_NAME"] = SESSION_COOKIE_NAME
app.config["SESSION_COOKIE_PATH"] = SESSION_COOKIE_PATH
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

os.makedirs(UPLOAD_DIR, exist_ok=True)
init_db()

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


def client_ip():
    return request.headers.get("X-Real-IP") or request.remote_addr or ""


@app.post("/api/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    conn = get_db()
    user = conn.execute("SELECT * FROM admin_users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"ok": False, "error": "用户名或密码错误"}), 401
    role = user["role"] if "role" in user.keys() else "admin"
    session["user"] = username
    session["role"] = role
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
    "payment_accounts": {"keyword_fields": ["account_name", "remark"],
                         "filter_fields": ["account_type", "employee_id"]},
    "sql_scripts": {"keyword_fields": ["name", "description"],
                    "filter_fields": []},
    "commission_snapshots": {"keyword_fields": ["month", "remark", "created_by"],
                             "filter_fields": ["month"]},
}

ENTITY_TYPE_MAP = {
    "employees": "employee", "guilds": "guild",
    "game_accounts": "account", "payment_accounts": "payment_account",
    "sql_scripts": "sql_script",
    "commission_snapshots": "commission_snapshot",
}


def _page_args():
    page = max(int(request.args.get("page", 1) or 1), 1)
    page_size = min(max(int(request.args.get("page_size", 20) or 20), 1), 200)
    return page, page_size


def _register_crud(table):
    cfg = ENTITY_CONFIG[table]
    entity_type = ENTITY_TYPE_MAP[table]
    label_field = ENTITY_LABEL_FIELD[table]

    def list_view():
        filters = {f: request.args.get(f) for f in cfg["filter_fields"]}
        exclude = {k: v for k, v in (cfg.get("default_exclude") or {}).items()
                   if not filters.get(k)}
        page, page_size = _page_args()
        rows, total = list_rows(table, filters, request.args.get("keyword", "").strip(),
                                cfg["keyword_fields"], page, page_size, exclude=exclude)
        return jsonify({"ok": True, "data": {"items": rows, "total": total,
                                             "page": page, "page_size": page_size}})

    def create_view():
        data = request.get_json(force=True, silent=True) or {}
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
        "SELECT a.*, g.name AS guild_name FROM game_accounts a "
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
        rows = conn.execute("SELECT id, name, server, status FROM guilds ORDER BY name").fetchall()
        items = [{"id": r["id"], "label": f'{r["name"]}（{r["server"]}·{r["status"]}）'} for r in rows]
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
@login_required
def query_run():
    data = request.get_json(force=True, silent=True) or {}
    result = run_query(data.get("sql"), data.get("params") or {})
    log_change(session["user"], "query", "sql_script", data.get("script_id") or 0,
               (data.get("name") or "")[:80], after={"sql": (data.get("sql") or "")[:500]},
               ip=client_ip())
    return jsonify(result)


@app.get("/api/commission/leaders")
@login_required
def commission_leaders():
    from config import DATABASE_PATH
    return jsonify({"ok": True, "data": list_leaders(DATABASE_PATH)})


@app.post("/api/commission/run")
@login_required
def commission_run():
    from config import DATABASE_PATH
    data = request.get_json(force=True, silent=True) or {}
    emp_ids = data.get("employee_ids")
    if emp_ids is not None:
        emp_ids = [int(x) for x in emp_ids if str(x).isdigit()]
    result = run_commission(data.get("month", ""), DATABASE_PATH, employee_ids=emp_ids)
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
    result = run_commission(month, DATABASE_PATH, employee_ids=emp_ids)
    if not result.get("ok"):
        return jsonify(result)
    payload = {
        "month": month,
        "remark": (data.get("remark") or "").strip(),
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


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"ok": False, "error": f"文件超过 {MAX_UPLOAD_MB}MB 限制"}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
