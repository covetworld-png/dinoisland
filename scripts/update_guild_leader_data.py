#!/usr/bin/env python3
"""
scripts/update_guild_leader_data.py
从 monster_test 数据库拉取数据并更新 guild-leader-data.json

拉取内容:
  1. 每个团长最后登录时间
  2. 每个团 1-5 月每月充值数据 (VND)
  3. 每个团近 8 周新增用户分析 (新用户 vs 老用户换团)

用法:
  python scripts/update_guild_leader_data.py
"""

import json
import sys
from pathlib import Path
from datetime import datetime

import pymysql

ROOT = Path(__file__).parent.parent
DATA_PATH = ROOT / "src/tools/guild-leader-dashboard/data/guild-leader-data.json"

# 数据库配置 (从 secrets 读取或硬编码只读账号)
DB_HOST = "106.75.213.178"
DB_PORT = 13307
DB_USER = "robo"
DB_NAME = "monster_test"


def get_db_password() -> str:
    """从 secrets 文件读取密码"""
    secrets_path = ROOT / "memory/secrets.md"
    if secrets_path.exists():
        text = secrets_path.read_text()
        for line in text.split('\n'):
            if "password='" in line:
                # 匹配 password='xxx',
                m = line.strip().split("password='")[-1].split("'")[0]
                return m
    return None


def connect():
    password = get_db_password()
    if not password:
        print("❌ 无法读取数据库密码")
        sys.exit(1)
    return pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=password, database=DB_NAME,
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor
    )


def fetch_leader_last_login(conn, game_uid: int, server_id: str) -> str:
    """查询团长最后登录时间"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT MAX(createtime) as last_login
            FROM dino_game_logs
            WHERE game_uid = %s AND server_id = %s
        """, (game_uid, server_id))
        row = cur.fetchone()
        if row and row['last_login']:
            return row['last_login'].strftime('%Y-%m-%d %H:%M')
    return ''


def fetch_monthly_recharge(conn, guild_id: int, server_id: str, year: int, month: int) -> int:
    """查询某团某月充值金额 (VND)"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT IFNULL(SUM(p.amount), 0) as total
            FROM prod_orders p
            JOIN game_user_guilds g ON p.game_uid = g.game_uid
                AND p.server_id = g.server_id
            WHERE g.guild_id = %s
              AND g.server_id = %s
              AND p.status IN ('paid', 'shipped')
              AND YEAR(p.created_at) = %s
              AND MONTH(p.created_at) = %s
              AND p.created_at >= g.joined_at
        """, (guild_id, server_id, year, month))
        row = cur.fetchone()
        return int(row['total']) if row else 0


def fetch_weekly_new_users(conn, guild_id: int, server_id: str, year: int, week: int):
    """查询某团某周新增用户 (新用户 vs 换团)"""
    with conn.cursor() as cur:
        # 获取该周加入该团的所有用户
        cur.execute("""
            SELECT 
                g.game_uid,
                g.joined_at as join_time,
                EXISTS(
                    SELECT 1 FROM game_user_guilds g2
                    WHERE g2.game_uid = g.game_uid
                      AND g2.server_id = g.server_id
                      AND g2.joined_at < g.joined_at
                      AND g2.joined_at >= DATE_SUB(g.joined_at, INTERVAL 30 DAY)
                ) as had_recent_guild
            FROM game_user_guilds g
            WHERE g.guild_id = %s
              AND g.server_id = %s
              AND YEAR(g.joined_at) = %s
              AND WEEK(g.joined_at, 1) = %s
        """, (guild_id, server_id, year, week))
        
        rows = cur.fetchall()
        fresh = 0
        transferred = 0
        for row in rows:
            if row['had_recent_guild']:
                transferred += 1
            else:
                fresh += 1
        return {'new_fresh': fresh, 'transferred_in': transferred}


def update_all_data():
    if not DATA_PATH.exists():
        print(f"❌ 数据文件不存在: {DATA_PATH}")
        sys.exit(1)
    
    data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
    
    print("🔗 连接数据库...")
    conn = connect()
    
    try:
        # 1. 更新团长最后登录时间
        print("📅 更新团长最后登录时间...")
        for acc in data['accounts']:
            if acc.get('role') == 'leader' and acc.get('server_id'):
                last_login = fetch_leader_last_login(conn, acc['game_uid'], acc['server_id'])
                if last_login:
                    acc['last_login'] = last_login
        
        # 2. 更新军团充值数据 (1-5月)
        print("💰 拉取 1-5 月充值数据...")
        for g in data['guilds']:
            gid = g['guild_id']
            sid = g['server_id']
            for month in range(1, 6):
                key = f"2026-{month:02d}"
                amount = fetch_monthly_recharge(conn, gid, sid, 2026, month)
                g['monthly_recharge'][key] = amount
                print(f"  {g['guild_name']:16} | {key} | {amount:>12,} VND")
        
        # 3. 更新每周新增 (近 8 周)
        print("👥 拉取近 8 周新增用户...")
        from datetime import timedelta
        today = datetime.now()
        for g in data['guilds']:
            gid = g['guild_id']
            sid = g['server_id']
            g['weekly_new_users'] = []
            for i in range(7, -1, -1):
                week_date = today - timedelta(weeks=i)
                year = week_date.year
                week = int(week_date.strftime('%W'))
                result = fetch_weekly_new_users(conn, gid, sid, year, week)
                g['weekly_new_users'].append({
                    'week': f"{year}-W{week:02d}",
                    'new_fresh': result['new_fresh'],
                    'transferred_in': result['transferred_in'],
                })
        
        # 更新 meta
        data['meta']['updated_at'] = datetime.now().strftime('%Y-%m-%d %H:%M')
        
        DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f"✅ 已更新: {DATA_PATH}")
        
    finally:
        conn.close()


if __name__ == '__main__':
    update_all_data()
