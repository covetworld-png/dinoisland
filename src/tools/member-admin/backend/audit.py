"""审计日志：所有写操作记录字段级 before/after diff"""
import json

from models import get_db, now


def log_change(actor, action, entity_type, entity_id, entity_label="",
               before=None, after=None, ip=""):
    changes = {}
    if action == "create" and after:
        changes = {k: {"before": None, "after": v} for k, v in after.items()
                   if k not in ("created_at", "updated_at", "feishu_record_id")}
    elif action == "update" and before and after:
        for k, v in after.items():
            if k in ("created_at", "updated_at"):
                continue
            if before.get(k) != v:
                changes[k] = {"before": before.get(k), "after": v}
    elif action == "delete" and before:
        changes = {k: {"before": v, "after": None} for k, v in before.items()
                   if k not in ("created_at", "updated_at", "feishu_record_id")}

    conn = get_db()
    conn.execute(
        "INSERT INTO audit_logs (actor, action, entity_type, entity_id, entity_label, changes, ip, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (actor, action, entity_type, entity_id, entity_label,
         json.dumps(changes, ensure_ascii=False), ip, now()),
    )
    conn.commit()
    conn.close()


def list_logs(entity_type=None, actor=None, date_from=None, date_to=None, page=1, page_size=50):
    where, params = [], []
    if entity_type:
        where.append("entity_type = ?")
        params.append(entity_type)
    if actor:
        where.append("actor = ?")
        params.append(actor)
    if date_from:
        where.append("created_at >= ?")
        params.append(date_from + " 00:00:00")
    if date_to:
        where.append("created_at <= ?")
        params.append(date_to + " 23:59:59")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) c FROM audit_logs {where_sql}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM audit_logs {where_sql} ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows], total
