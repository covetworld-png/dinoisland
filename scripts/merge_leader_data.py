#!/usr/bin/env python3
"""
scripts/merge_leader_data.py
整合分散数据源为规范化 guild-leader-data.json（v2.0）

数据模型 v2.0:
  - accounts: 按 game_uid 聚合，支持跨服多 profile
  - guilds: 团基本信息（含团长自然人信息）
  - guild_stats: 团运营数据（充值、活跃、新增）
"""

import csv
import json
import re
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "projects/003-运营/003-04-团长管理体系建设/data"
OUTPUT = ROOT / "src/tools/guild-leader-dashboard/data/guild-leader-data.json"

# 团名中文翻译
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

# 服务器ID映射
SERVER_ID_MAP = {
    'Q服': '750748016054341',
    'K服': '768538488131653',
}


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
                    row[h] = cells[i] if i < len(cells) else ''
                rows.append(row)
    return rows


def parse_accounts_md() -> dict[int, list[dict]]:
    """解析 accounts.md，返回 {game_uid: [profile, ...]}"""
    path = DATA_DIR / "leaders/accounts.md"
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
    
    rows = parse_markdown_table('\n'.join(table_lines))
    
    profiles = {}
    for row in rows:
        try:
            uid = int(row.get('账号(game_uid)', '').strip())
        except (ValueError, KeyError):
            continue
        
        status_map = {
            '在岗': 'normal',
            '空缺': 'normal',
            '封禁': 'banned',
            '团员': 'normal',
        }
        raw_status = row.get('状态', '').strip()
        
        profile = {
            'server_name': row.get('服务器', '').strip(),
            'server_id': SERVER_ID_MAP.get(row.get('服务器', '').strip(), ''),
            'nickname': row.get('昵称', '').strip(),
            'role': 'member' if raw_status == '团员' else 'leader',
            'guild_name': row.get('团名', '').strip(),
            'login': row.get('登录名', '').strip(),
            'password': row.get('密码', '').strip(),
            'status': status_map.get(raw_status, 'normal'),
            'notes': [row.get('备注', '').strip()] if row.get('备注', '').strip() and row.get('备注', '').strip() != '—' else [],
        }
        
        if uid not in profiles:
            profiles[uid] = []
        profiles[uid].append(profile)
    
    return profiles


def parse_accounts_extra_csv() -> dict[int, list[dict]]:
    """解析 accounts_extra.csv，返回 {game_uid: [profile, ...]}"""
    path = DATA_DIR / "leaders/accounts_extra.csv"
    extras = {}
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                uid = int(row.get('game_uid', '').strip())
            except ValueError:
                continue
            
            server = row.get('服务器', '').strip()
            login = row.get('prod登录名', '').strip() or row.get('users登录名', '').strip()
            pwd = row.get('prod密码', '').strip() or row.get('users密码', '').strip()
            
            profile = {
                'server_name': server,
                'server_id': SERVER_ID_MAP.get(server, ''),
                'nickname': row.get('昵称', '').strip() or '—',
                'role': 'member',
                'guild_name': row.get('所属团', '').strip(),
                'login': login if login != '—' else '',
                'password': pwd if pwd != '—' else '',
                'last_log': row.get('最后日志', '').strip(),
                'notes': [row.get('备注', '').strip()] if row.get('备注', '').strip() else [],
            }
            
            if uid not in extras:
                extras[uid] = []
            extras[uid].append(profile)
    return extras


def parse_guild_list_md() -> list[dict]:
    """解析 guild-list.md，返回团基本信息列表"""
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
    
    rows = parse_markdown_table('\n'.join(table_lines))
    
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
        
        # 提取团长自然人名称（从"团长"列）
        leader_raw = row.get('团长', '').strip()
        leader_name = ''
        if '==' in leader_raw:
            # 格式: ==姓名==（微信...）
            m = re.search(r'==([^=]+)==', leader_raw)
            if m:
                leader_name = m.group(1).strip()
        elif leader_raw:
            leader_name = leader_raw.split('（')[0].strip()
        
        guilds.append({
            'guild_id': gid,
            'guild_name': row.get('团名', '').strip(),
            'display_name': GUILD_NAME_TRANSLATIONS.get(row.get('团名', '').strip(), row.get('团名', '').strip()),
            'server_id': SERVER_ID_MAP.get(server, server),
            'server_name': server,
            'leader_uid': uid,
            'leader_name': leader_name,
            'status': status_map.get(raw_status, 'vacant'),
            'notes': [],
        })
    return guilds


def parse_leader_profiles() -> tuple[dict[int, str], list[dict]]:
    """从 leader-profiles.md 提取团长自然人信息
    
    返回: (leader_name_map, leaders_list)
    - leader_name_map: {uid: name}
    - leaders_list: [{name, game_uid, guild_name, status, notes}]
    """
    path = DATA_DIR / "leaders/leader-profiles.md"
    text = path.read_text(encoding='utf-8')
    lines = text.split('\n')
    
    leader_names = {}
    leaders = []
    current_status = None
    headers = None
    
    for line in lines:
        stripped = line.strip()
        
        # 检测章节状态
        if stripped.startswith('###'):
            if '在岗' in stripped:
                current_status = 'active'
            elif '空缺' in stripped:
                current_status = 'vacant'
            headers = None  # 新章节重置表头
            continue
        
        # 跳过非表格行
        if not stripped.startswith('|') or not stripped.endswith('|'):
            continue
        if '---' in stripped:
            continue
        
        cells = [c.strip() for c in stripped[1:-1].split('|')]
        
        # 第一行是表头
        if headers is None:
            headers = cells
            continue
        
        # 数据行
        row = {}
        for i, h in enumerate(headers):
            row[h] = cells[i] if i < len(cells) else ''
        
        try:
            uid = int(row.get('账号(game_uid)', '').strip())
        except (ValueError, KeyError):
            continue
        
        name = row.get('团长', '').strip() or row.get('原团长', '').strip()
        guild_name = row.get('团名', '').strip()
        
        if name and uid:
            leader_names[uid] = name
        
        if name and uid and guild_name:
            notes = row.get('备注', '').strip()
            if notes == '—':
                notes = ''
            
            leaders.append({
                'name': name,
                'game_uid': uid,
                'guild_name': guild_name,
                'status': current_status or 'unknown',
                'notes': notes,
                'contact': '',
                'id_card': '',
                'bank_info': '',
                'onboard_date': '',
            })
    
    return leader_names, leaders


def parse_guild_stats() -> dict[int, dict]:
    """解析 guild-stats.md，返回 {guild_id: stats}"""
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
    
    rows = parse_markdown_table('\n'.join(table_lines))
    
    # 需要 guild_name 到 guild_id 的映射
    guild_list = parse_guild_list_md()
    name_to_id = {g['guild_name']: g['guild_id'] for g in guild_list}
    
    stats = {}
    for row in rows:
        name = row.get('团名', '').strip()
        gid = name_to_id.get(name)
        if not gid:
            continue
        
        def parse_num(val):
            val = val.strip().replace(',', '')
            try:
                return int(val)
            except ValueError:
                return 0
        
        stats[gid] = {
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


def build_accounts(accounts_md: dict, accounts_extra: dict, leader_names: dict, guilds: list) -> list[dict]:
    """构建聚合账号列表"""
    all_uids = set(accounts_md.keys()) | set(accounts_extra.keys())
    
    # 构建 guild_id 查找表
    guild_lookup = {}
    for g in guilds:
        guild_lookup[g['guild_name']] = g
    
    result = []
    for uid in sorted(all_uids):
        profiles = []
        
        # 合并 accounts.md 和 accounts_extra.csv 中的 profile
        md_profiles = accounts_md.get(uid, [])
        extra_profiles = accounts_extra.get(uid, [])
        
        # 以 server_name 为 key 合并
        profile_map = {}
        for p in md_profiles + extra_profiles:
            server = p.get('server_name', '')
            if not server or server == '—':
                continue
            
            if server not in profile_map:
                profile_map[server] = {
                    'server_name': server,
                    'server_id': p.get('server_id', ''),
                    'nickname': p.get('nickname', '—'),
                    'role': p.get('role', 'member'),
                    'guild_name': p.get('guild_name', ''),
                    'login': p.get('login', ''),
                    'password': p.get('password', ''),
                    'last_login': p.get('last_log', ''),
                }
            else:
                # 补充缺失字段
                existing = profile_map[server]
                if not existing.get('login') and p.get('login'):
                    existing['login'] = p['login']
                if not existing.get('password') and p.get('password'):
                    existing['password'] = p['password']
                if not existing.get('last_login') and p.get('last_log'):
                    existing['last_login'] = p['last_log']
            
            # 关联 guild_id
            gname = p.get('guild_name', '')
            if gname in guild_lookup:
                profile_map[server]['guild_id'] = guild_lookup[gname]['guild_id']
        
        profiles = list(profile_map.values())
        
        # 账号状态：只要有一个 profile 是 leader 且在岗，或者没有被封禁
        # 从所有 profile 的 notes 中提取账号级别的备注
        all_notes = []
        for p in md_profiles + extra_profiles:
            if p.get('notes'):
                all_notes.extend(p['notes'])
        
        # 判断账号是否被封禁
        account_status = 'normal'
        for p in md_profiles:
            if p.get('status') == 'banned':
                account_status = 'banned'
                break
        
        # 构建备注历史（带时间戳）
        notes_history = []
        for note in all_notes:
            if note and note != '—':
                notes_history.append({
                    'time': datetime.now().strftime('%Y-%m-%d'),
                    'content': note,
                })
        
        result.append({
            'game_uid': uid,
            'status': account_status,
            'profiles': profiles,
            'notes': notes_history,
        })
    
    return result


def merge_data() -> dict:
    """合并所有数据源为规范化 JSON v2.0"""
    accounts_md = parse_accounts_md()
    accounts_extra = parse_accounts_extra_csv()
    guilds = parse_guild_list_md()
    leader_names, leaders = parse_leader_profiles()
    stats = parse_guild_stats()
    
    # 补充团长自然人名称到 guilds
    for g in guilds:
        luid = g['leader_uid']
        if luid in leader_names and not g['leader_name']:
            g['leader_name'] = leader_names[luid]
    
    accounts = build_accounts(accounts_md, accounts_extra, leader_names, guilds)
    
    # 构建 guild_stats
    guild_stats = {}
    for g in guilds:
        gid = g['guild_id']
        s = stats.get(gid, {})
        guild_stats[str(gid)] = {
            'monthly_recharge': {'2026-05': s.get('amount_30d', 0)},
            'weekly_new_users': [],
            'active_count': {'7d': s.get('active_7d', 0), '30d': s.get('active_30d', 0)},
        }
    
    return {
        'meta': {
            'version': '2.0',
            'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'source_files': [
                'data/leaders/accounts.md',
                'data/leaders/accounts_extra.csv',
                'data/leaders/leader-profiles.md',
                'data/guilds/guild-list.md',
                'data/guilds/guild-stats.md',
            ]
        },
        'accounts': accounts,
        'guilds': guilds,
        'leaders': leaders,
        'guild_stats': guild_stats,
    }


def main():
    data = merge_data()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"✅ 已生成: {OUTPUT}")
    print(f"   账号数: {len(data['accounts'])}")
    print(f"   军团数: {len(data['guilds'])}")
    
    # 打印账号聚合情况
    for a in data['accounts']:
        profiles = ', '.join([f"{p['server_name']}/{p['nickname']}" for p in a['profiles']])
        print(f"   UID {a['game_uid']}: {profiles} [{a['status']}]")


if __name__ == '__main__':
    main()
