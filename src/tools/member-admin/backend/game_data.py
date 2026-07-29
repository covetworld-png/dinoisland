"""monster_test 只读关联查询：按 game_uid 聚合游戏数据。

查询依据 [引用:data/DBSQL/SQL_KNOWLEDGE.md]：
- 昵称来源 user_game_info.nick_name
- 登录名来源 prod_users.username
- 公会名来源 game_user_guilds.display_name（无退团字段，仅作参考）
"""
from config import MONSTER_DB

CONNECT_TIMEOUT = 5


def _connect():
    import pymysql
    return pymysql.connect(
        host=MONSTER_DB["host"], port=MONSTER_DB["port"],
        user=MONSTER_DB["user"], password=MONSTER_DB["password"],
        database=MONSTER_DB["database"], charset="utf8mb4",
        connect_timeout=CONNECT_TIMEOUT, read_timeout=CONNECT_TIMEOUT,
        cursorclass=pymysql.cursors.DictCursor,
    )


def get_game_data(game_uid):
    """返回 {ok, data|error}；任何失败都降级为错误提示，不抛异常"""
    if not game_uid:
        return {"ok": False, "error": "该账号未填写 game_uid"}
    if not MONSTER_DB["password"]:
        return {"ok": False, "error": "服务器未配置游戏数据库连接（MONSTER_DB_PASSWORD）"}
    try:
        uid = int(game_uid)
    except (TypeError, ValueError):
        return {"ok": False, "error": f"game_uid 非数字: {game_uid}"}

    try:
        conn = _connect()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT server_id, nick_name, game_amount, update_time "
                "FROM user_game_info WHERE game_uid = %s AND nick_name IS NOT NULL", (uid,))
            infos = cur.fetchall()

            cur.execute(
                "SELECT username, created_at, lastlogin_at FROM prod_users WHERE game_uid = %s", (uid,))
            user = cur.fetchone() or {}

            cur.execute(
                "SELECT COUNT(*) cnt, COALESCE(SUM(amount),0) total, MAX(created_at) last_paid "
                "FROM orders WHERE game_uid = %s AND status IN ('paid','shipped')", (uid,))
            recharge = cur.fetchone() or {}

            cur.execute(
                "SELECT server_id, display_name, joined_at FROM game_user_guilds "
                "WHERE game_uid = %s ORDER BY joined_at DESC LIMIT 5", (uid,))
            guilds = cur.fetchall()
        conn.close()
        return {"ok": True, "data": {
            "game_uid": uid,
            "servers": infos,
            "username": user.get("username", ""),
            "registered_at": str(user.get("created_at") or ""),
            "last_login_at": str(user.get("lastlogin_at") or ""),
            "recharge_count": recharge.get("cnt", 0),
            "recharge_total": recharge.get("total", 0),
            "last_paid_at": str(recharge.get("last_paid") or ""),
            "guild_history": [
                {"server_id": g["server_id"], "guild_name": g["display_name"],
                 "joined_at": str(g["joined_at"])} for g in guilds
            ],
        }}
    except Exception as e:  # noqa: BLE001 - 降级处理，不影响后台主功能
        return {"ok": False, "error": f"游戏数据库查询失败: {e}"}
