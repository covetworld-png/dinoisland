#!/usr/bin/env python3
"""
scripts/merge_leader_data.py
整合 5 个分散数据源为规范化 guild-leader-data.json

数据源:
  - projects/003-运营/003-04-团长管理体系建设/data/leaders/accounts.md
  - projects/003-运营/003-04-团长管理体系建设/data/leaders/accounts_extra.csv
  - projects/003-运营/003-04-团长管理体系建设/data/leaders/leader-profiles.md
  - projects/003-运营/003-04-团长管理体系建设/data/guilds/guild-list.md
  - projects/003-运营/003-04-团长管理体系建设/data/guilds/guild-stats.md

输出:
  - src/tools/guild-leader-dashboard/data/guild-leader-data.json
"""

import csv
import json
import re
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "projects/003-运营/003-04-团长管理体系建设/data"
OUTPUT = ROOT / "src/tools/guild-leader-dashboard/data/guild-leader-data.json"


def parse_markdown_table(md_text: str) -> list[dict]:
    """解析 Markdown 表格为字典列表"""
    lines = md_text.strip().split('\n')
    rows = []
    headers = None
    for line in lines:
        line = line.strip()
        if not line or line.startswith('>') or line.startswith('#') or line.startswith('---') or line.startswith('*') or line.startswith('**'):
            continue
        if line.startswith('|') and line.endswith('|'):
            cells = [c.strip() for c in line[1:-1].split('|')]
            if headers is None and '---' not in line:
                headers = cells
            elif '---' in line:
                continue
            elif headers:
                row = {}
                for i, h in enumerate(headers):
                    if i < len(cells):
                        row[h] = cells[i]
                    else:
                        row[h] = ''
                rows.append(row)
    return rows


def parse_accounts_md() -> dict[int, dict]:
    """解析 accounts.md，返回 {game_uid: account_data}"""
    path = DATA_DIR / "leaders/accounts.md"
    text = path.read_text(encoding='utf-8')
    # 找到表格部分
    lines = text.split('\n')
    table_lines = []
    in_table = False
    for line in lines:
        if line.strip().startswith('| 团名'):
            in_table = True
        if in_table:
            table_lines.append(line)
            if line.strip() == '':
                break
    
    table_text = '\n'.join(table_lines)
    rows = parse_markdown_table(table_text)
    
    accounts = {}
    for row in rows:
        try:
            uid = int(row.get('账号(game_uid)', '').strip())
        except (ValueError, KeyError):
            continue
        
        status_map = {
            '在岗': 'active',
            '空缺': 'vacant', 
            '封禁': 'banned',
            '团员': 'member',
        }
        raw_status = row.get('状态', '').strip()
        
        accounts[uid] = {
            'game_uid': uid,
            'server_name': row.get('服务器', '').strip(),
            'nickname': row.get('昵称', '').strip(),
            'role': 'member' if raw_status == '团员' else 'leader',
            'status': status_map.get(raw_status, raw_status.lower()),
            'guild_name': row.get('团名', '').strip(),
            'login': row.get('登录名', '').strip(),
            'password': row.get('密码', '').strip(),
            'notes': [row.get('备注', '').strip()] if row.get('备注', '').strip() and row.get('备注', '').strip() != '—' else [],
        }
    return accounts


def parse_accounts_extra_csv() -> dict[int, dict]:
    """解析 accounts_extra.csv，返回 {game_uid: extra_data}"""
    path = DATA_DIR / "leaders/accounts_extra.csv"
    extras = {}
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                uid = int(row.get('game_uid', '').strip())
            except ValueError:
                continue
            
            # 处理跨服重复 game_uid（如 13229964 同时有 Q服和K服记录）
            server = row.get('服务器', '').strip()
            key = f"{uid}_{server}"
            
            # 合并登录信息（优先有值的字段）
            login = row.get('prod登录名', '').strip() or row.get('users登录名', '').strip()
            pwd = row.get('prod密码', '').strip() or row.get('users密码', '').strip()
            
            if uid not in extras:
                extras[uid] = []
            extras[uid].append({
                'server_name': server,
                'guild_name': row.get('所属团', '').strip(),
                'nickname': row.get('昵称', '').strip() or '—',
                'login': login if login != '—' else '',
                'password': pwd if pwd != '—' else '',
                'last_log': row.get('最后日志', '').strip(),
                'notes': row.get('备注', '').strip(),
            })
    return extras


def parse_guild_list_md() -> list[dict]:
    """解析 guild-list.md，返回军团列表"""
    path = DATA_DIR / "guilds/guild-list.md"
    text = path.read_text(encoding='utf-8')
    lines = text.split('\n')
    table_lines = []
    in_table = False
    for line in lines:
        if line.strip().startswith('| 团名'):
            in_table = True
        if in_table:
            table_lines.append(line)
            if line.strip() == '':
                break
    
    table_text = '\n'.join(table_lines)
    rows = parse_markdown_table(table_text)
    
    server_id_map = {
        'Q服': '750748016054341',
        'K服': '768538488131653',
    }
    
    status_map = {
        '✅ 在岗': 'active',
        '✅ 临时在岗': 'temp_active',
        '❌ 空缺': 'vacant',
        '❌ 解散': 'dissolved',
    }
    
    guilds = []
    for row in rows:
        try:
            gid = int(row.get('guild_id', '').strip())
            uid = int(row.get('game_uid', '').strip())
        except (ValueError, KeyError):
            continue
        
        server = row.get('服务器', '').strip()
        raw_status = row.get('状态', '').strip()
        
        guilds.append({
            'guild_name': row.get('团名', '').strip(),
            'guild_id': gid,
            'server_id': server_id_map.get(server, server),
            'server_name': server,
            'leader_uid': uid,
            'status': status_map.get(raw_status, 'vacant'),
            'leader_nickname': '',  # 后面从 accounts 补充
            'active_count': {'7d': 0, '30d': 0},
            'monthly_recharge': {},
            'weekly_new_users': [],
            'notes': [row.get('备注', '').strip()] if row.get('备注', '').strip() and row.get('备注', '').strip() != '—' else [],
        })
    return guilds


def parse_guild_stats_md() -> dict[str, dict]:
    """解析 guild-stats.md，返回 {guild_name: stats}"""
    path = DATA_DIR / "guilds/guild-stats.md"
    text = path.read_text(encoding='utf-8')
    lines = text.split('\n')
    table_lines = []
    in_table = False
    for line in lines:
        if line.strip().startswith('| 服务器'):
            in_table = True
        if in_table:
            table_lines.append(line)
            if line.strip() == '':
                break
    
    table_text = '\n'.join(table_lines)
    rows = parse_markdown_table(table_text)
    
    stats = {}
    for row in rows:
        name = row.get('团名', '').strip()
        if not name:
            continue
        
        def parse_num(val):
            val = val.strip().replace(',', '')
            try:
                return int(val)
            except ValueError:
                return 0
        
        stats[name] = {
            'active_30d': parse_num(row.get('5月活跃', '0')),
            'recharge_users_30d': parse_num(row.get('5月充值人', '0')),
            'orders_30d': parse_num(row.get('5月订单', '0')),
            'amount_30d': parse_num(row.get('5月金额(VND)', '0')),
            'active_7d': parse_num(row.get('7天活跃', '0')),
            'recharge_users_7d': parse_num(row.get('7天充值人', '0')),
            'orders_7d': parse_num(row.get('7天订单', '0')),
            'amount_7d': parse_num(row.get('7天金额(VND)', '0')),
            'leader_last_login': row.get('团长最后登录', '').strip(),
        }
    return stats


# 团名中文翻译映射
GUILD_NAME_TRANSLATIONS = {
    'TOP.Legend': 'TOP.Legend',
    'Hoả Long': 'Hoả Long(火龙)',
    'NguyệtCung': 'NguyệtCung(月宫)',
    'Tu Tiên': 'Tu Tiên(修仙)',
    'GOD DINO': 'GOD DINO',
    'Thiên Đế': 'Thiên Đế(天帝)',
    'Long Chiến': 'Long Chiến(龙战)',
    'Thiên Cơ': 'Thiên Cơ(天机)',
    'Hắc Ám': 'Hắc Ám(黑暗)',
    'Nhật Thực': 'Nhật Thực(日食)',
}


def merge_data() -> dict:
    """合并所有数据源为规范化 JSON"""
    accounts = parse_accounts_md()
    extras = parse_accounts_extra_csv()
    guilds = parse_guild_list_md()
    stats = parse_guild_stats_md()
    
    # 服务器ID映射
    server_id_map = {
        'Q服': '750748016054341',
        'K服': '768538488131653',
    }
    
    # 整合账号数据
    all_accounts = {}
    
    # 1. 从 accounts.md 导入
    for uid, acc in accounts.items():
        all_accounts[uid] = acc
    
    # 2. 从 extras 补充（处理跨服重复账号）
    for uid, extra_list in extras.items():
        for extra in extra_list:
            server = extra['server_name']
            if uid in all_accounts and all_accounts[uid].get('server_name') == server:
                # 补充缺失字段
                if not all_accounts[uid].get('login') and extra.get('login'):
                    all_accounts[uid]['login'] = extra['login']
                if not all_accounts[uid].get('password') and extra.get('password'):
                    all_accounts[uid]['password'] = extra['password']
                if extra.get('last_log') and extra['last_log'] != '—':
                    all_accounts[uid]['last_login'] = extra['last_log']
            elif uid not in all_accounts:
                # 新增账号（如 GameMaster 等）
                all_accounts[uid] = {
                    'game_uid': uid,
                    'server_name': server,
                    'nickname': extra.get('nickname', '—'),
                    'role': 'member',
                    'status': 'active',
                    'guild_name': extra.get('guild_name', '无团'),
                    'login': extra.get('login', ''),
                    'password': extra.get('password', ''),
                    'notes': [extra['notes']] if extra.get('notes') else [],
                }
    
    # 3. 从 guilds 补充 leader_nickname 和确认 guild_id
    guild_lookup = {}
    for g in guilds:
        guild_lookup[g['guild_name']] = g
        guild_lookup[g['guild_id']] = g
    
    for uid, acc in all_accounts.items():
        gname = acc.get('guild_name', '')
        if gname in guild_lookup:
            acc['guild_id'] = guild_lookup[gname]['guild_id']
            acc['server_id'] = guild_lookup[gname]['server_id']
        else:
            acc['guild_id'] = None
            acc['server_id'] = server_id_map.get(acc.get('server_name', ''), '')
    
    # 4. 整合军团数据（从 stats 补充活跃/充值/登录）
    for g in guilds:
        gname = g['guild_name']
        g['display_name'] = GUILD_NAME_TRANSLATIONS.get(gname, gname)
        if gname in stats:
            s = stats[gname]
            g['active_count'] = {'7d': s['active_7d'], '30d': s['active_30d']}
            g['monthly_recharge']['2026-05'] = s['amount_30d']
            g['leader_last_login'] = s['leader_last_login']
        
        # 补充团长昵称
        luid = g['leader_uid']
        if luid in all_accounts:
            g['leader_nickname'] = all_accounts[luid].get('nickname', '')
    
    # 5. 补充账号的最后登录时间（从 stats 中的团长数据，或 extras 中的最后日志）
    for uid, acc in all_accounts.items():
        gname = acc.get('guild_name', '')
        acc['guild_display_name'] = GUILD_NAME_TRANSLATIONS.get(gname, gname)
        if gname in stats:
            # 如果是团长，用团长的最后登录
            if acc.get('role') == 'leader':
                acc['last_login'] = stats[gname].get('leader_last_login', '')
    
    # 转换为列表
    account_list = list(all_accounts.values())
    
    return {
        'meta': {
            'version': '1.0',
            'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'source_files': [
                'data/leaders/accounts.md',
                'data/leaders/accounts_extra.csv',
                'data/leaders/leader-profiles.md',
                'data/guilds/guild-list.md',
                'data/guilds/guild-stats.md',
            ]
        },
        'accounts': account_list,
        'guilds': guilds,
    }


def main():
    data = merge_data()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"✅ 已生成: {OUTPUT}")
    print(f"   账号数: {len(data['accounts'])}")
    print(f"   军团数: {len(data['guilds'])}")


if __name__ == '__main__':
    main()
