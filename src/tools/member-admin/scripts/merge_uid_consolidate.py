#!/usr/bin/env python3
"""uid 合并脚本（2026-09-12）：跨员工同人合并 + player_mapping 冗余清理

前提：discord_id → discord_user_id 的 merge_discord_uid.py 已跑过（或在同一次执行中先跑）。

规则：
1. 跨员工同人合并：同一 uid 出现在多个员工（real_name 相同 = 同一人重复建档），
   只保留【在职】员工行的 discord_user_id，从【离职】员工行移除该 uid。
   - 特殊情形：若 uid 在多员工行且都非在职（异常），报错不自动处理。
2. player_mapping 冗余清理：PM 行 emp_no 非空 且 discord_id 中的 uid 已存在于
   该 emp_no 对应 live_employees 的 discord_user_id/discord_id（同员工已覆盖）→ 从 PM 移除。
   emp_no 为空 的行（如 CHAU）不动。
3. 幂等：重跑无变更（冲突 uid 已归在职后，离职行不再含 uid）。

用法：
    python3 merge_uid_consolidate.py <db> --dry-run   # 只打印
    python3 merge_uid_consolidate.py <db> --apply     # 写入
"""
import argparse
import sqlite3
import sys
from datetime import datetime


def split_ids(raw):
    return [x.strip() for x in str(raw or '').split(',') if x.strip().isdigit()]


def join_ids(ids):
    return ','.join(ids)


def load_emp(db, conn):
    """emp_no -> {status, real_name, nickname, discord_id, discord_user_id}"""
    emps = {}
    for r in conn.execute("SELECT emp_no, nickname, alias, real_name, status, discord_id, discord_user_id FROM live_employees"):
        emps[r['emp_no']] = dict(r)
    return emps


def consolidate(db_path, dry_run=True):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    changes = {'emp_remove': [], 'pm_remove': [], 'pm_full_clear': [], 'errors': []}
    try:
        emps = load_emp(db_path, conn)

        # ---- 1. 收集 uid -> 员工归属 ----
        uid_emps = {}  # uid -> [(emp_no, status)]
        for e, rec in emps.items():
            for col in ('discord_id', 'discord_user_id'):
                for uid in split_ids(rec[col]):
                    uid_emps.setdefault(uid, []).append((e, rec['status']))

        # ---- 2. 跨员工同人合并 ----
        for uid, hits in sorted(uid_emps.items()):
            emp_nos = sorted(set(e for e, _ in hits))
            if len(emp_nos) <= 1:
                continue
            # 各员工的 real_name 是否一致（同人判定）
            reals = {}
            for e in emp_nos:
                reals.setdefault(emps[e]['real_name'] or '(无真名)', []).append(e)
            if len(reals) > 1 or '(无真名)' in reals:
                changes['errors'].append(f"uid {uid} 涉及不同 real_name 员工 {emp_nos} {dict(reals)}，跳过")
                continue
            # 在职优先
            active = [e for e in emp_nos if emps[e]['status'] == '在职']
            leave = [e for e in emp_nos if emps[e]['status'] != '在职']
            keep = active[:1] if active else None
            if not active:
                changes['errors'].append(f"uid {uid} 涉及员工 {emp_nos} 均非在职，跳过（需人工）")
                continue
            keep_emp = active[0]
            remove_emps = [e for e in emp_nos if e != keep_emp]
            for e in remove_emps:
                rec = emps[e]
                for col in ('discord_id', 'discord_user_id'):
                    ids = split_ids(rec[col])
                    if uid in ids:
                        ids = [x for x in ids if x != uid]
                        changes['emp_remove'].append({'emp_no': e, 'col': col, 'uid': uid,
                                                      'before': rec[col], 'after': join_ids(ids)})
                        if not dry_run:
                            conn.execute(
                                f"UPDATE live_employees SET {col}=?, updated_at=? WHERE emp_no=?",
                                (join_ids(ids), datetime.now().isoformat(sep=' ', timespec='seconds'), e))
                            rec[col] = join_ids(ids)

        # ---- 3. player_mapping 冗余清理 ----
        for r in conn.execute("SELECT id, player_name, emp_no, discord_id FROM player_mapping WHERE emp_no != '' AND emp_no IS NOT NULL"):
            emp_no = r['emp_no']
            uid_list = split_ids(r['discord_id'])
            if not uid_list:
                continue
            emp_rec = emps.get(emp_no)
            if not emp_rec:
                changes['errors'].append(f"PM 行 {r['player_name']} 引用不存在员工 {emp_no}，保留")
                continue
            # 该员工已权威持有的 uid 集合
            held = set(split_ids(emp_rec['discord_user_id'])) | set(split_ids(emp_rec['discord_id']))
            redundant = [u for u in uid_list if u in held]
            if not redundant:
                continue
            keep_ids = [u for u in uid_list if u not in held]
            if keep_ids:
                changes['pm_remove'].append({'player_name': r['player_name'], 'emp_no': emp_no,
                                             'removed': redundant, 'after': join_ids(keep_ids)})
                if not dry_run:
                    conn.execute(
                        "UPDATE player_mapping SET discord_id=?, updated_at=? WHERE id=?",
                        (join_ids(keep_ids), datetime.now().isoformat(sep=' ', timespec='seconds'), r['id']))
            else:
                changes['pm_full_clear'].append({'player_name': r['player_name'], 'emp_no': emp_no,
                                                 'removed': redundant})
                if not dry_run:
                    conn.execute(
                        "UPDATE player_mapping SET discord_id='', updated_at=? WHERE id=?",
                        (datetime.now().isoformat(sep=' ', timespec='seconds'), r['id']))

        if not dry_run:
            conn.commit()
    finally:
        conn.close()

    # 打印
    tag = 'DRY-RUN' if dry_run else 'APPLY'
    print(f"[{tag}] 员工移除 {len(changes['emp_remove'])} | PM 部分移除 {len(changes['pm_remove'])} | PM 清空 {len(changes['pm_full_clear'])} | 错误 {len(changes['errors'])}")
    for c in changes['emp_remove']:
        print(f"  LE移除: {c['emp_no']}.{c['col']} uid {c['uid']}  {c['before']} → {c['after']}")
    for c in changes['pm_remove']:
        print(f"  PM部分: {c['player_name']}({c['emp_no']}) 移除 {c['removed']} → {c['after']}")
    for c in changes['pm_full_clear']:
        print(f"  PM清空: {c['player_name']}({c['emp_no']}) 移除全部 {c['removed']}")
    for c in changes['errors']:
        print(f"  !!错误: {c}")
    return changes


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='uid 跨员工合并 + PM 冗余清理')
    ap.add_argument('db')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    consolidate(args.db, dry_run=not args.apply)
    sys.exit(0)
