#!/usr/bin/env python3
"""
scripts/update_guild_leader_data.py
从 monster_test 数据库拉取动态数据并更新 guild-leader-data.json

拉取内容:
  1. 每个团 4-5 月每月充值数据 (VND)
  2. 每个团团长最后登录时间
  3. 每个团近 8 周新增用户分析 (新用户 vs 老用户换团)

用法:
  python scripts/update_guild_leader_data.py
"""

import json
import sys
from pathlib import Path
from datetime import datetime, timedelta

import pymysql

ROOT = Path(__file__).parent.parent
DATA_PATH = ROOT / "projects/004-工具/004-04-guild-leader-dashboard/data/guild-leader-data.json"
HTML_PATH = ROOT / "projects/004-工具/004-04-guild-leader-dashboard/index.html"

DB_HOST = "106.75.213.178"
DB_PORT = 13307
DB_USER = "robo"
DB_NAME = "monster_test"

SERVER_ID_MAP = {
    'Q服': '750748016054341',
    'K服': '768538488131653',
}


def get_db_password() -> str:
    secrets_path = ROOT / "memory/secrets.md"
    if secrets_path.exists():
        text = secrets_path.read_text()
        for line in text.split('\n'):
            if "password='" in line:
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


def fetch_all_leader_logins(conn, leader_uids: list[tuple[int, str]]) -> dict[tuple[int, str], str]:
    """批量查询团长最后登录时间"""
    if not leader_uids:
        return {}
    
    results = {}
    with conn.cursor() as cur:
        for uid, sid in leader_uids:
            cur.execute("""
                SELECT createtime FROM dino_game_logs
                WHERE game_uid = %s AND server_id = %s
                ORDER BY createtime DESC LIMIT 1
            """, (uid, sid))
            row = cur.fetchone()
            if row:
                results[(uid, sid)] = row['createtime'].strftime('%Y-%m-%d %H:%M')
    return results


def fetch_all_monthly_recharge(conn, guilds: list[dict]) -> dict[int, dict[str, int]]:
    """批量查询所有团 4-5 月充值（时点归属口径）
    
    口径: 订单发生时用户所在的团（created_at > joined_at ORDER BY joined_at DESC LIMIT 1）
    来源: data/DBSQL/SQL_KNOWLEDGE.md #时点归属SQL（推荐）
    """
    sid_list = ','.join(f"'{SERVER_ID_MAP.get(g['server_name'], g.get('server_id', ''))}'" for g in guilds)
    
    results = {g['guild_id']: {} for g in guilds}
    
    with conn.cursor() as cur:
        # 时点归属: 每笔订单归属到订单发生时用户所在的团
        cur.execute(f"""
            SELECT 
                p.amount,
                p.created_at,
                (SELECT guild_id FROM game_user_guilds g
                 WHERE g.game_uid = p.game_uid
                   AND g.server_id = p.server_id
                   AND p.created_at > g.joined_at
                 ORDER BY g.joined_at DESC LIMIT 1) as guild_id
            FROM prod_orders p
            WHERE p.status IN ('paid', 'shipped')
              AND p.created_at >= '2026-04-01' AND p.created_at < '2026-06-01'
              AND p.server_id IN ({sid_list})
        """)
        
        for row in cur.fetchall():
            gid = row['guild_id']
            if gid is None:
                continue
            month_key = row['created_at'].strftime('%Y-%m')
            if gid not in results:
                results[gid] = {}
            results[gid][month_key] = results[gid].get(month_key, 0) + int(row['amount'])
    
    return results


def fetch_all_weekly_new_users(conn, guilds: list[dict]) -> tuple[dict[int, list[dict]], dict[int, dict]]:
    """批量查询所有团近 8 周 + 近 7 天新增用户"""
    today = datetime.now()
    week_start = today - timedelta(weeks=8)
    day7_start = today - timedelta(days=7)
    
    gid_list = ','.join(str(g['guild_id']) for g in guilds)
    
    # 一次性查询所有团近 8 周的入团记录
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT 
                g.guild_id,
                g.game_uid,
                g.server_id,
                g.joined_at,
                EXISTS(
                    SELECT 1 FROM game_user_guilds g2
                    WHERE g2.game_uid = g.game_uid
                      AND g2.server_id = g.server_id
                      AND g2.joined_at < g.joined_at
                ) as had_prior_guild
            FROM game_user_guilds g
            WHERE g.guild_id IN ({gid_list})
              AND g.joined_at >= %s
        """, (week_start,))
        
        rows = cur.fetchall()
    
    from collections import defaultdict
    weekly_data = defaultdict(lambda: defaultdict(lambda: {'new_fresh': 0, 'transferred_in': 0}))
    recent_7d = defaultdict(lambda: {'new_fresh': 0, 'transferred_in': 0})
    
    for row in rows:
        gid = row['guild_id']
        joined = row['joined_at']
        days_ago = (today - joined).days
        week_idx = days_ago // 7
        
        # 近7天统计
        if days_ago < 7:
            if row['had_prior_guild']:
                recent_7d[gid]['transferred_in'] += 1
            else:
                recent_7d[gid]['new_fresh'] += 1
        
        # 8周统计
        if week_idx <= 7:
            if row['had_prior_guild']:
                weekly_data[gid][week_idx]['transferred_in'] += 1
            else:
                weekly_data[gid][week_idx]['new_fresh'] += 1
    
    weekly_results = {}
    for g in guilds:
        gid = g['guild_id']
        week_list = []
        for i in range(7, -1, -1):
            ws = today - timedelta(weeks=i+1)
            we = today - timedelta(weeks=i)
            label = ws.strftime('%m/%d') + '~' + we.strftime('%m/%d')
            d = weekly_data[gid].get(i, {'new_fresh': 0, 'transferred_in': 0})
            week_list.append({
                'week': label,
                'new_fresh': d['new_fresh'],
                'transferred_in': d['transferred_in'],
            })
        weekly_results[gid] = week_list
    
    return weekly_results, dict(recent_7d)


def fetch_user_game_info(conn, uids: list[int]) -> dict[int, list[dict]]:
    """查询用户游戏信息：昵称、所属团"""
    if not uids:
        return {}
    
    uid_str = ','.join(str(u) for u in uids)
    results = {}
    
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT game_uid, server_id, nick_name, guild_id
            FROM user_game_info
            WHERE game_uid IN ({uid_str})
        """)
        for row in cur.fetchall():
            uid = row['game_uid']
            if uid not in results:
                results[uid] = []
            results[uid].append({
                'server_id': row['server_id'],
                'nick_name': row['nick_name'] or '',
                'guild_id': row['guild_id'] or 0,
            })
    
    return results


def fetch_user_ban_status_from_notes(account: dict) -> int:
    """从 account.notes 中解析封禁状态：0=封禁, 1=正常
    
    规则:
      - notes 中包含'已封禁'/'已经封禁' → 封禁
      - notes 中包含'已经解禁' → 正常
      - 无相关备注 → 默认正常
    """
    notes = account.get('notes', [])
    for n in notes:
        content = n.get('content', '')
        if '已经解禁' in content or '已解禁' in content:
            return 1
        if '已封禁' in content or '已经封禁' in content or '暂时封禁' in content:
            return 0
    return 1


def fetch_prop_names(conn) -> dict[int, str]:
    """查询道具名称映射"""
    results = {}
    with conn.cursor() as cur:
        cur.execute("SELECT prop_id, prop_name FROM game_prop_names")
        for row in cur.fetchall():
            results[row['prop_id']] = row['prop_name']
    return results


def fetch_mail_rewards(conn, uids: list[int], prop_names: dict[int, str]) -> dict[int, dict]:
    """查询邮件领取的福利：兽币、恐龙、皮肤（强化卡等道具不计入）"""
    if not uids:
        return {}
    
    uid_str = ','.join(str(u) for u in uids)
    results = {}
    
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT game_uid, data_id, data_type, SUM(data_num) as total
            FROM dino_op_logs
            WHERE source = 2
              AND game_uid IN ({uid_str})
            GROUP BY game_uid, data_id, data_type
        """)
        
        for row in cur.fetchall():
            uid = row['game_uid']
            if uid not in results:
                results[uid] = {'gold': 0, 'dinosaurs': [], 'skins': []}
            
            data_id = row['data_id']
            data_type = row['data_type']
            total = int(row['total'])
            name = prop_names.get(data_id, f'ID:{data_id}')
            
            if data_type == 4 and data_id == 9001:
                # 兽币
                results[uid]['gold'] += total
            elif data_type == 1 and 1000 <= data_id < 2000:
                # 恐龙
                results[uid]['dinosaurs'].append({
                    'prop_id': data_id,
                    'name': name,
                    'count': total,
                })
            elif data_type == 2 and 2000 <= data_id < 3000:
                # 皮肤
                results[uid]['skins'].append({
                    'prop_id': data_id,
                    'name': name,
                    'count': total,
                })
            # data_type=2 且 data_id>=4000 的是道具（强化卡等），不计入
    
    # 按数量排序
    for uid in results:
        results[uid]['dinosaurs'].sort(key=lambda x: x['count'], reverse=True)
        results[uid]['skins'].sort(key=lambda x: x['count'], reverse=True)
    
    return results


def sync_html_data(data: dict):
    """将 JSON 数据同步到 index.html 的 <script id='guild-data'> 标签"""
    if not HTML_PATH.exists():
        print(f"⚠️  HTML 文件不存在: {HTML_PATH}")
        return
    
    html = HTML_PATH.read_text(encoding='utf-8')
    start_marker = '<script type="application/json" id="guild-data">'
    end_marker = '</script>'
    
    start = html.find(start_marker)
    if start == -1:
        print("⚠️  找不到 <script id='guild-data'> 标签，跳过 HTML 同步")
        return
    
    content_start = start + len(start_marker)
    end = html.find(end_marker, content_start)
    if end == -1:
        print("⚠️  找不到 </script> 结束标签，跳过 HTML 同步")
        return
    
    json_text = json.dumps(data, ensure_ascii=False, indent=2)
    new_html = html[:content_start] + '\n' + json_text + '\n' + html[end:]
    HTML_PATH.write_text(new_html, encoding='utf-8')
    print(f"✅ 已同步 HTML: {HTML_PATH}")


def update_all_data():
    if not DATA_PATH.exists():
        print(f"❌ 数据文件不存在: {DATA_PATH}")
        sys.exit(1)
    
    data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
    
    print("🔗 连接数据库...")
    conn = connect()
    
    try:
        guild_stats = data.get('guild_stats', {})
        guilds = data['guilds']
        
        # 初始化 guild_stats
        for g in guilds:
            gsid = str(g['guild_id'])
            if gsid not in guild_stats:
                guild_stats[gsid] = {
                    'monthly_recharge': {},
                    'weekly_new_users': [],
                    'active_count': {'7d': 0, '30d': 0},
                    'leader_last_login': '',
                }
        
        # 1. 批量拉取 4-5 月充值
        print("💰 拉取 4-5 月充值数据...")
        recharge_data = fetch_all_monthly_recharge(conn, guilds)
        for g in guilds:
            gid = g['guild_id']
            gsid = str(gid)
            for key, amount in recharge_data.get(gid, {}).items():
                guild_stats[gsid]['monthly_recharge'][key] = amount
                print(f"  {g['guild_name']:16} | {key} | {amount:>12,} VND")
        
        # 2. 批量拉取团长最后登录
        print("\n📅 拉取团长最后登录时间...")
        leader_uids = []
        for g in guilds:
            luid = g.get('leader_uid')
            sid = SERVER_ID_MAP.get(g['server_name'], g.get('server_id', ''))
            if luid and sid:
                leader_uids.append((luid, sid))
        
        login_data = fetch_all_leader_logins(conn, leader_uids)
        for g in guilds:
            luid = g.get('leader_uid')
            sid = SERVER_ID_MAP.get(g['server_name'], g.get('server_id', ''))
            key = (luid, sid)
            if key in login_data:
                guild_stats[str(g['guild_id'])]['leader_last_login'] = login_data[key]
                print(f"  {g['guild_name']:16} | {login_data[key]}")
        
        # 3. 批量拉取近 8 周 + 近 7 天新增
        print("\n👥 拉取近 8 周 / 近 7 天新增用户...")
        weekly_data, recent_7d_data = fetch_all_weekly_new_users(conn, guilds)
        for g in guilds:
            gid = g['guild_id']
            gsid = str(gid)
            guild_stats[gsid]['weekly_new_users'] = weekly_data[gid]
            guild_stats[gsid]['recent_7d'] = recent_7d_data.get(gid, {'new_fresh': 0, 'transferred_in': 0})
            weeks = weekly_data[gid]
            total_new = sum(w['new_fresh'] for w in weeks)
            total_trans = sum(w['transferred_in'] for w in weeks)
            d7 = recent_7d_data.get(gid, {'new_fresh': 0, 'transferred_in': 0})
            print(f"  {g['guild_name']:16} | 8周:新+{total_new}转+{total_trans} | 7天:新+{d7['new_fresh']}转+{d7['transferred_in']}")
        
        data['guild_stats'] = guild_stats
        
        # 4. 拉取账号游戏信息、封禁状态、邮件福利
        print("\n👤 拉取账号详细信息...")
        all_uids = [a['game_uid'] for a in data['accounts']]
        
        game_info = fetch_user_game_info(conn, all_uids)
        prop_names = fetch_prop_names(conn)
        mail_rewards = fetch_mail_rewards(conn, all_uids, prop_names)
        
        # 构建 guild_id -> guild_name 映射（用于显示所属团名）
        guild_name_map = {g['guild_id']: g['guild_name'] for g in guilds}
        self_operated_gids = set(g['guild_id'] for g in guilds)
        
        for account in data['accounts']:
            uid = account['game_uid']
            
            # 封禁状态：从 notes 中解析（而非数据库 users.status）
            account['ban_status'] = fetch_user_ban_status_from_notes(account)
            
            # 邮件福利
            account['mail_rewards'] = mail_rewards.get(uid, {'gold': 0, 'dinosaurs': [], 'skins': []})
            
            # 补充 profiles 的昵称和所属团
            profiles = account.get('profiles', [])
            info_list = game_info.get(uid, [])
            info_map = {info['server_id']: info for info in info_list}
            
            for profile in profiles:
                sid = profile.get('server_id', '')
                info = info_map.get(sid)
                if info:
                    old_nick = profile.get('nick_name', '')
                    new_nick = info['nick_name']
                    # 昵称变更追踪
                    if old_nick and old_nick != new_nick:
                        history = profile.get('nick_name_history', [])
                        history.append({
                            'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
                            'old': old_nick,
                            'new': new_nick,
                        })
                        profile['nick_name_history'] = history
                        print(f"  📝 UID {uid} {profile.get('server_name', '')}: '{old_nick}' → '{new_nick}'")
                    profile['nick_name'] = new_nick
                    profile['guild_id'] = info['guild_id']
                    profile['guild_name'] = guild_name_map.get(info['guild_id'], '')
                    profile['is_self_operated'] = info['guild_id'] in self_operated_gids
                else:
                    profile['nick_name'] = ''
                    profile['guild_id'] = 0
                    profile['guild_name'] = ''
                    profile['is_self_operated'] = False
            
            # 统计有福利的账号
            rewards = account['mail_rewards']
            has_rewards = rewards['gold'] > 0 or rewards['dinosaurs'] or rewards['skins']
            if has_rewards:
                dino_count = sum(d['count'] for d in rewards['dinosaurs'])
                skin_count = sum(s['count'] for s in rewards['skins'])
                print(f"  UID {uid:>10} | 兽币 {rewards['gold']:>10,} | 恐龙 {dino_count:>4} | 皮肤 {skin_count:>3}")
        
        data['meta']['updated_at'] = datetime.now().strftime('%Y-%m-%d %H:%M')
        
        json_text = json.dumps(data, ensure_ascii=False, indent=2)
        DATA_PATH.write_text(json_text, encoding='utf-8')
        print(f"\n✅ 已更新: {DATA_PATH}")
        
        # 同步到 index.html 内嵌标签
        sync_html_data(data)
        
    finally:
        conn.close()


if __name__ == '__main__':
    update_all_data()
