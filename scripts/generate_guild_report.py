#!/usr/bin/env python3
"""
无公会用户招募效果日报生成器 v3.4
口径：新用户 = prod_users 注册日期(create_time) = 当日；老用户 = 注册日期 < 当日 + 当日活跃 + 无公会
"""

import argparse
import json
import os
import unicodedata
from datetime import datetime, timedelta

import pymysql

DB_HOST = '106.75.213.178'
DB_PORT = 13307
DB_USER = 'root'
DB_PASS = 'M8!9kL7#2pQ8&5sR9'
DB_NAME = 'monster_test'

LEADERS = [
    {"account": "specter",   "name": "SPECTER",     "guild": "Hoả Long",     "server": "Q"},
    {"account": "sktti",     "name": "SKTTI",       "guild": "GOD DINO",     "server": "Q"},
    {"account": "chiuchiu",  "name": "ChiuChiu",    "guild": "God King",     "server": "Q"},
    {"account": "nguyetcung","name": "NguyệtCung",  "guild": "NguyệtCung",   "server": "Q"},
    {"account": "tutien",    "name": "TUTien",      "guild": "Tu Tiên",      "server": "Q"},
    {"account": "thien_co",  "name": "Thiên Cơ",    "guild": "Thiên Cơ",     "server": "K"},
    {"account": "hacam",     "name": "Hắc Ám",      "guild": "Hắc Ám",       "server": "K"},
    {"account": "nhatthuc",  "name": "Nhật Thực",   "guild": "Nhật Thực",    "server": "K"},
]
def norm(s):
    return unicodedata.normalize('NFC', s) if s else s

TARGET_GUILDS = [norm(l["guild"]) for l in LEADERS]

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src/report')
OUTPUT_FILENAME = 'guild-recruitment.html'


def get_conn():
    return pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS,
        database=DB_NAME, charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor
    )


def phase_label(date_str):
    d = datetime.strptime(date_str, '%Y-%m-%d').date()
    if d <= datetime(2026, 5, 7).date(): return "基线"
    elif d == datetime(2026, 5, 8).date(): return "过渡"
    else: return "干预"


def query_daily(conn, date_str):
    cur = conn.cursor()
    
    # ---- 新用户：prod_users 注册日期 = 当日 ----
    cur.execute(f"""
        SELECT COUNT(DISTINCT dh.game_uid) as cnt
        FROM game_dau_hour dh
        JOIN prod_users pu ON dh.game_uid = pu.game_uid
        WHERE dh.active_date = '{date_str}' AND DATE(pu.create_time) = '{date_str}'
    """)
    new_users = cur.fetchone()['cnt'] or 0
    
    # 新用户当日入团
    cur.execute(f"""
        SELECT COUNT(DISTINCT dh.game_uid) as cnt
        FROM game_dau_hour dh
        JOIN prod_users pu ON dh.game_uid = pu.game_uid
        JOIN game_user_guilds gug ON dh.game_uid = gug.game_uid
        WHERE dh.active_date = '{date_str}' AND DATE(pu.create_time) = '{date_str}'
          AND DATE(gug.joined_at) = '{date_str}'
    """)
    new_joined = cur.fetchone()['cnt'] or 0
    
    # 新用户入内部团
    cur.execute(f"""
        SELECT COUNT(DISTINCT dh.game_uid) as cnt
        FROM game_dau_hour dh
        JOIN prod_users pu ON dh.game_uid = pu.game_uid
        JOIN game_user_guilds gug ON dh.game_uid = gug.game_uid
        LEFT JOIN game_guild_names gn ON gug.guild_id = gn.guild_id AND gug.server_id = gn.server_id
        WHERE dh.active_date = '{date_str}' AND DATE(pu.create_time) = '{date_str}'
          AND DATE(gug.joined_at) = '{date_str}'
          AND gn.guild_name IN ({','.join(["'"+g+"'" for g in TARGET_GUILDS])})
    """)
    new_internal = cur.fetchone()['cnt'] or 0
    
    # ---- 老用户：注册日期 < 当日 + 当日活跃 + 当日无公会 ----
    cur.execute(f"""
        SELECT COUNT(DISTINCT dh.game_uid) as cnt
        FROM game_dau_hour dh
        JOIN prod_users pu ON dh.game_uid = pu.game_uid
        WHERE dh.active_date = '{date_str}'
          AND DATE(pu.create_time) < '{date_str}'
          AND NOT EXISTS (
              SELECT 1 FROM game_user_guilds gug
              WHERE gug.game_uid = dh.game_uid
                AND gug.joined_at < CONCAT('{date_str}', ' 00:00:00')
          )
    """)
    old_users = cur.fetchone()['cnt'] or 0
    
    # 老用户当日入团
    cur.execute(f"""
        SELECT COUNT(DISTINCT dh.game_uid) as cnt
        FROM game_dau_hour dh
        JOIN prod_users pu ON dh.game_uid = pu.game_uid
        JOIN game_user_guilds gug ON dh.game_uid = gug.game_uid
        WHERE dh.active_date = '{date_str}'
          AND DATE(pu.create_time) < '{date_str}'
          AND DATE(gug.joined_at) = '{date_str}'
          AND NOT EXISTS (
              SELECT 1 FROM game_user_guilds gug2
              WHERE gug2.game_uid = dh.game_uid
                AND gug2.joined_at < CONCAT('{date_str}', ' 00:00:00')
          )
    """)
    old_joined = cur.fetchone()['cnt'] or 0
    
    # 老用户入内部团
    cur.execute(f"""
        SELECT COUNT(DISTINCT dh.game_uid) as cnt
        FROM game_dau_hour dh
        JOIN prod_users pu ON dh.game_uid = pu.game_uid
        JOIN game_user_guilds gug ON dh.game_uid = gug.game_uid
        LEFT JOIN game_guild_names gn ON gug.guild_id = gn.guild_id AND gug.server_id = gn.server_id
        WHERE dh.active_date = '{date_str}'
          AND DATE(pu.create_time) < '{date_str}'
          AND DATE(gug.joined_at) = '{date_str}'
          AND NOT EXISTS (
              SELECT 1 FROM game_user_guilds gug2
              WHERE gug2.game_uid = dh.game_uid
                AND gug2.joined_at < CONCAT('{date_str}', ' 00:00:00')
          )
          AND gn.guild_name IN ({','.join(["'"+g+"'" for g in TARGET_GUILDS])})
    """)
    old_internal = cur.fetchone()['cnt'] or 0
    
    cur.close()
    
    return {
        'date': date_str,
        'phase': phase_label(date_str),
        'new_users': new_users,
        'new_joined': new_joined,
        'new_rate': round(new_joined / new_users * 100, 1) if new_users > 0 else 0,
        'new_internal': new_internal,
        'new_internal_rate': round(new_internal / new_joined * 100, 1) if new_joined > 0 else 0,
        'old_users': old_users,
        'old_joined': old_joined,
        'old_rate': round(old_joined / old_users * 100, 1) if old_users > 0 else 0,
        'old_internal': old_internal,
        'old_internal_rate': round(old_internal / old_joined * 100, 1) if old_joined > 0 else 0,
    }


def query_range(conn, start_date, end_date):
    results = []
    cur = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    while cur <= end:
        d = cur.strftime('%Y-%m-%d')
        results.append(query_daily(conn, d))
        cur += timedelta(days=1)
    return results


def query_guild_inflow(conn, date_str):
    """分公会流入明细，区分新/老用户"""
    cur = conn.cursor()
    
    # 新用户流入（注册日期 = join_date）
    cur.execute(f"""
        SELECT COALESCE(gn.guild_name, '未知') as guild_name, COUNT(DISTINCT gug.game_uid) as cnt
        FROM game_user_guilds gug
        LEFT JOIN game_guild_names gn ON gug.guild_id = gn.guild_id AND gug.server_id = gn.server_id
        JOIN prod_users pu ON gug.game_uid = pu.game_uid
        WHERE DATE(gug.joined_at) = '{date_str}'
          AND gn.guild_name IN ({','.join(["'"+g+"'" for g in TARGET_GUILDS])})
          AND DATE(pu.create_time) = DATE(gug.joined_at)
        GROUP BY gn.guild_name
    """)
    new_rows = {norm(r['guild_name']): r['cnt'] for r in cur.fetchall()}
    
    # 老用户流入（注册日期 < join_date）
    cur.execute(f"""
        SELECT COALESCE(gn.guild_name, '未知') as guild_name, COUNT(DISTINCT gug.game_uid) as cnt
        FROM game_user_guilds gug
        LEFT JOIN game_guild_names gn ON gug.guild_id = gn.guild_id AND gug.server_id = gn.server_id
        JOIN prod_users pu ON gug.game_uid = pu.game_uid
        WHERE DATE(gug.joined_at) = '{date_str}'
          AND gn.guild_name IN ({','.join(["'"+g+"'" for g in TARGET_GUILDS])})
          AND DATE(pu.create_time) < DATE(gug.joined_at)
        GROUP BY gn.guild_name
    """)
    old_rows = {norm(r['guild_name']): r['cnt'] for r in cur.fetchall()}
    cur.close()
    
    result = []
    for l in LEADERS:
        g = norm(l['guild'])
        new_cnt = new_rows.get(g, 0)
        old_cnt = old_rows.get(g, 0)
        result.append({
            'guild': l['guild'], 'server': l['server'], 'leader': l['name'],
            'new_cnt': new_cnt, 'old_cnt': old_cnt, 'total': new_cnt + old_cnt
        })
    return result


def query_response(conn, date_str):
    """新用户响应速度：注册日期 = 入团日期"""
    cur = conn.cursor()
    cur.execute(f"""
        SELECT 
            pu.game_uid,
            COALESCE(ui.nick_name, pu.username) as nick_name,
            gn.guild_name,
            TIMESTAMPDIFF(MINUTE, pu.created_at, gug.joined_at) as diff_minutes
        FROM prod_users pu
        JOIN game_user_guilds gug ON pu.game_uid = gug.game_uid
        LEFT JOIN game_guild_names gn ON gug.guild_id = gn.guild_id AND gug.server_id = gn.server_id
        LEFT JOIN user_game_info ui ON pu.game_uid = ui.game_uid AND ui.server_id = gug.server_id
        WHERE DATE(gug.joined_at) = '{date_str}'
          AND gn.guild_name IN ({','.join(["'"+g+"'" for g in TARGET_GUILDS])})
          AND DATE(pu.create_time) = DATE(gug.joined_at)
          AND gug.joined_at >= pu.created_at
          AND pu.game_uid >= 13219600
        ORDER BY diff_minutes
    """)
    rows = cur.fetchall()
    cur.close()
    return rows


def query_response_by_guild(conn, date_str):
    """分公会平均响应速度（仅新用户：注册日期 = 入团日期）"""
    cur = conn.cursor()
    cur.execute(f"""
        SELECT gn.guild_name, COUNT(*) as cnt,
               ROUND(AVG(TIMESTAMPDIFF(MINUTE, pu.created_at, gug.joined_at)), 0) as avg_min
        FROM prod_users pu
        JOIN game_user_guilds gug ON pu.game_uid = gug.game_uid
        LEFT JOIN game_guild_names gn ON gug.guild_id = gn.guild_id AND gug.server_id = gn.server_id
        WHERE DATE(gug.joined_at) = '{date_str}'
          AND gn.guild_name IN ({','.join(["'"+g+"'" for g in TARGET_GUILDS])})
          AND DATE(pu.create_time) = DATE(gug.joined_at)
          AND gug.joined_at >= pu.created_at
          AND pu.game_uid >= 13219600
        GROUP BY gn.guild_name
        ORDER BY avg_min
    """)
    rows = cur.fetchall()
    cur.close()
    return rows


def query_response_trend(conn, start_date, end_date):
    cur = conn.cursor()
    cur.execute(f"""
        SELECT DATE(gug.joined_at) as day, gn.guild_name,
               ROUND(AVG(TIMESTAMPDIFF(MINUTE, pu.created_at, gug.joined_at)), 0) as avg_min
        FROM prod_users pu
        JOIN game_user_guilds gug ON pu.game_uid = gug.game_uid
        LEFT JOIN game_guild_names gn ON gug.guild_id = gn.guild_id AND gug.server_id = gn.server_id
        WHERE DATE(gug.joined_at) BETWEEN '{start_date}' AND '{end_date}'
          AND gn.guild_name IN ({','.join(["'"+g+"'" for g in TARGET_GUILDS])})
          AND DATE(pu.create_time) = DATE(gug.joined_at)
          AND gug.joined_at >= pu.created_at
          AND pu.game_uid >= 13219600
        GROUP BY DATE(gug.joined_at), gn.guild_name
        ORDER BY day, avg_min
    """)
    rows = cur.fetchall()
    for r in rows:
        if r['avg_min'] is not None:
            r['avg_min'] = int(r['avg_min'])
        r['guild_name'] = norm(r['guild_name'])
    cur.close()
    return rows


def fmt_min(m):
    if m is None: return '-'
    return f"{m//60}h{m%60}m"


def generate_html(stats_list, today_stats, today_guild_inflow, today_response,
                  today_response_by_guild, response_trend, report_date, start_date, all_days_data):
    
    baseline = [s for s in stats_list if s['phase'] == '基线']
    avg_new_rate = round(sum(s['new_rate'] for s in baseline) / len(baseline), 1) if baseline else 0
    avg_old_rate = round(sum(s['old_rate'] for s in baseline) / len(baseline), 1) if baseline else 0
    
    labels = [s['date'][5:] + f"\n({s['phase']})" for s in stats_list]
    new_joined_js = [s['new_joined'] for s in stats_list]
    old_joined_js = [s['old_joined'] for s in stats_list]
    new_rate_js = [s['new_rate'] for s in stats_list]
    old_rate_js = [s['old_rate'] for s in stats_list]
    
    trend_labels = sorted(list(set(r['day'].strftime('%m-%d') for r in response_trend)))
    guild_colors = {
        'Hoả Long': '#4ade80', 'GOD DINO': '#60a5fa', 'God King': '#a78bfa',
        'NguyệtCung': '#f472b6', 'Tu Tiên': '#fb923c', 'Thiên Cơ': '#22d3ee',
        'Hắc Ám': '#f87171', 'Nhật Thực': '#FFD700',
    }
    guild_colors = {norm(k): v for k, v in guild_colors.items()}
    trend_datasets = []
    for l in LEADERS:
        guild = l['guild']
        data = []
        has_data = False
        for day in trend_labels:
            val = None
            for r in response_trend:
                if r['day'].strftime('%m-%d') == day and r['guild_name'] == norm(guild):
                    val = r['avg_min']
                    has_data = True
                    break
            data.append(val)
        if has_data:
            trend_datasets.append({
                'label': guild, 'data': data,
                'borderColor': guild_colors.get(guild, '#999'),
                'backgroundColor': guild_colors.get(guild, '#999'),
                'borderWidth': 2, 'pointRadius': 4,
                'spanGaps': True, 'tension': 0.3
            })
    
    labels_json = json.dumps(labels)
    new_joined_json = json.dumps(new_joined_js)
    old_joined_json = json.dumps(old_joined_js)
    new_rate_json = json.dumps(new_rate_js)
    old_rate_json = json.dumps(old_rate_js)
    trend_labels_json = json.dumps(trend_labels)
    trend_datasets_json = json.dumps(trend_datasets)
    all_days_data_json = json.dumps(all_days_data, default=str)
    
    response_rows = ""
    for r in today_response:
        response_rows += f"<tr><td>{r['game_uid']}</td><td>{r['nick_name'] or '-'}</td><td>{r['guild_name']}</td><td class='num'>{fmt_min(r['diff_minutes'])}</td></tr>\n"
    if not response_rows:
        response_rows = "<tr><td colspan='4' style='text-align:center;color:#7aa89a;'>无数据</td></tr>"
    
    guild_response_rows = ""
    for r in today_response_by_guild:
        guild_response_rows += f"<tr><td>{r['guild_name']}</td><td class='num'>{r['cnt']}</td><td class='num'>{fmt_min(r['avg_min'])}</td></tr>\n"
    if not guild_response_rows:
        guild_response_rows = "<tr><td colspan='3' style='text-align:center;color:#7aa89a;'>无数据</td></tr>"
    
    guild_inflow_rows = ""
    for g in today_guild_inflow:
        server_color = '#4ade80' if g['server'] == 'Q' else '#60a5fa'
        guild_inflow_rows += f"<tr><td><span style='color:{server_color};font-size:11px;'>[{g['server']}]</span> {g['guild']}</td><td>{g['leader']}</td><td class='num'>{g['new_cnt']}</td><td class='num'>{g['old_cnt']}</td><td class='num' style='font-weight:600;'>{g['total']}</td></tr>\n"
    
    history_rows = ""
    for s in reversed(stats_list):
        phase_badge = {'基线': 'badge-baseline', '过渡': 'badge-transition', '干预': 'badge-intervention'}[s['phase']]
        history_rows += f"""<tr data-date="{s['date']}">
            <td><span class="badge {phase_badge}">{s['phase']}</span> {s['date']}</td>
            <td class="num">{s['new_users']}</td>
            <td class="num highlight">{s['new_joined']}</td>
            <td class="num">{s['new_rate']}%</td>
            <td class="num">{s['new_internal']}</td>
            <td class="num">{s['old_users']}</td>
            <td class="num highlight">{s['old_joined']}</td>
            <td class="num">{s['old_rate']}%</td>
            <td class="num">{s['old_internal']}</td>
        </tr>"""
    
    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>无公会用户招募日报 - {report_date}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
:root {{
  --bg: #0a1a15;
  --bg-card: rgba(10, 30, 25, 0.9);
  --border: rgba(74, 154, 138, 0.2);
  --text: #e8f5f0;
  --text-muted: #7aa89a;
  --accent: #FFD700;
  --green: #4ade80;
  --red: #f87171;
  --blue: #60a5fa;
  --orange: #fb923c;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  padding: 20px;
}}
.container {{ max-width: 1200px; margin: 0 auto; }}
header {{
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border);
}}
h1 {{ font-size: 22px; font-weight: 600; }}
h1 span {{ color: var(--accent); }}
.meta {{ color: var(--text-muted); font-size: 13px; }}

.date-picker-wrap {{
  position: relative;
  display: inline-flex;
  align-items: center;
}}
.date-picker-wrap svg {{
  position: absolute;
  left: 12px;
  width: 18px;
  height: 18px;
  fill: var(--accent);
  pointer-events: none;
  z-index: 1;
}}
.date-picker {{
  background: var(--bg-card);
  border: 1.5px solid rgba(255, 215, 0, 0.4);
  border-radius: 10px;
  padding: 10px 14px 10px 38px;
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  min-width: 140px;
  transition: border-color 0.2s, box-shadow 0.2s;
}}
.date-picker:hover {{
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.15);
}}
.date-picker:focus {{
  border-color: var(--accent);
  box-shadow: 0 0 0 4px rgba(255, 215, 0, 0.2);
}}
.date-picker::-webkit-calendar-picker-indicator {{
  opacity: 0;
  cursor: pointer;
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}}

.history-row.active {{ background: rgba(255, 215, 0, 0.08); }}

.legend-bar {{
  display: flex; gap: 16px; font-size: 12px; margin-bottom: 16px;
}}
.legend-item {{ display: flex; align-items: center; gap: 6px; }}
.legend-dot {{ width: 10px; height: 10px; border-radius: 2px; }}
.dot-baseline {{ background: rgba(74, 154, 138, 0.3); border: 1px solid rgba(74, 154, 138, 0.5); }}
.dot-transition {{ background: rgba(255, 215, 0, 0.3); border: 1px solid rgba(255, 215, 0, 0.5); }}
.dot-intervention {{ background: rgba(248, 113, 113, 0.3); border: 1px solid rgba(248, 113, 113, 0.5); }}

.cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }}
.card {{
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}}
.card-label {{ font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }}
.card-value {{ font-size: 26px; font-weight: 700; color: var(--accent); }}
.card-sub {{ font-size: 12px; color: var(--text-muted); margin-top: 4px; }}
.card-value.green {{ color: var(--green); }}
.card-value.red {{ color: var(--red); }}

.charts {{ display: grid; grid-template-columns: 1fr; gap: 16px; margin-bottom: 24px; }}
.chart-box {{
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}}
.chart-title {{ font-size: 14px; color: var(--text-muted); margin-bottom: 12px; }}
.chart-wrap {{ position: relative; height: 280px; }}

.section {{ margin-bottom: 24px; }}
.section-title {{ font-size: 16px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }}
.section-title::before {{ content: ""; display: inline-block; width: 4px; height: 16px; background: var(--accent); border-radius: 2px; }}
table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
th, td {{ padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); }}
th {{ color: var(--text-muted); font-weight: 500; background: rgba(255,255,255,0.02); }}
tr:hover {{ background: rgba(255,255,255,0.03); }}
.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
.highlight {{ color: var(--accent); font-weight: 600; }}

.badge {{
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}}
.badge-baseline {{ background: rgba(74, 154, 138, 0.15); color: var(--green); }}
.badge-transition {{ background: rgba(255, 215, 0, 0.15); color: var(--accent); }}
.badge-intervention {{ background: rgba(248, 113, 113, 0.15); color: var(--red); }}

.two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
@media (max-width: 768px) {{
  .two-col {{ grid-template-columns: 1fr; }}
}}

.note {{
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 16px;
}}
.note strong {{ color: var(--text); }}
</style>
</head>
<body>
<div class="container">
  <header>
    <div>
      <h1>🦖 无公会用户招募 <span>日报</span></h1>
      <div class="meta">统计日期: <span id="current-date">{report_date}</span> | 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}</div>
    </div>
    <div>
      <div class="date-picker-wrap">
        <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z"/></svg>
        <input type="date" id="datePicker" class="date-picker" value="{report_date}" min="{start_date}" max="{report_date}">
      </div>
    </div>
  </header>

  <div class="legend-bar">
    <div class="legend-item"><div class="legend-dot dot-baseline"></div>基线期 (5/5-5/7)</div>
    <div class="legend-item"><div class="legend-dot dot-transition"></div>过渡期 (5/8)</div>
    <div class="legend-item"><div class="legend-dot dot-intervention"></div>干预期 (5/9+)</div>
  </div>

  <div class="note">
    <strong>口径：</strong>新用户 = prod_users 注册日期 = 当日；老用户 = 注册日期 < 当日 + 当日活跃 + 当日无公会。
    入团率 = 当日入团 / 该群体人数；内部团占比 = 入内部团 / 该群体入团总数。
    基线期平均新用户入团率: {avg_new_rate}%，老用户入团率: {avg_old_rate}%
  </div>

  <div class="section">
    <div class="section-title" id="section-title">{report_date} 核心指标</div>
    <div class="cards">
      <div class="card">
        <div class="card-label">新用户（当日注册）</div>
        <div class="card-value" id="card-new-users">{today_stats['new_users']}</div>
        <div class="card-sub" id="card-new-sub">入团 <span id="card-new-joined">{today_stats['new_joined']}</span> | 率 <span id="card-new-rate">{today_stats['new_rate']}</span>%</div>
      </div>
      <div class="card">
        <div class="card-label">新用户内部团占比</div>
        <div class="card-value" id="card-new-internal-rate">{today_stats['new_internal_rate']}%</div>
        <div class="card-sub">内部团 <span id="card-new-internal">{today_stats['new_internal']}</span> / 总入团 <span id="card-new-joined2">{today_stats['new_joined']}</span></div>
      </div>
      <div class="card">
        <div class="card-label">老用户（无公会+活跃）</div>
        <div class="card-value" id="card-old-users">{today_stats['old_users']}</div>
        <div class="card-sub" id="card-old-sub">入团 <span id="card-old-joined">{today_stats['old_joined']}</span> | 率 <span id="card-old-rate">{today_stats['old_rate']}</span>%</div>
      </div>
      <div class="card">
        <div class="card-label">老用户内部团占比</div>
        <div class="card-value" id="card-old-internal-rate">{today_stats['old_internal_rate']}%</div>
        <div class="card-sub">内部团 <span id="card-old-internal">{today_stats['old_internal']}</span> / 总入团 <span id="card-old-joined2">{today_stats['old_joined']}</span></div>
      </div>
    </div>
  </div>

  <div class="charts">
    <div class="chart-box">
      <div class="chart-title">📊 入团人数（柱状）与入团率（折线）</div>
      <div class="chart-wrap"><canvas id="chartMain"></canvas></div>
    </div>
    <div class="chart-box">
      <div class="chart-title">⏱️ 分公会新用户响应速度趋势（分钟，对数轴）</div>
      <div class="chart-wrap"><canvas id="chartResponse"></canvas></div>
    </div>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-title" id="response-title">新用户响应速度明细 ({report_date})</div>
      <table>
        <thead><tr><th>UID</th><th>昵称</th><th>公会</th><th class="num">响应</th></tr></thead>
        <tbody id="response-tbody">{response_rows}</tbody>
      </table>
    </div>
    <div class="section">
      <div class="section-title" id="guild-response-title">分公会新用户平均响应速度 ({report_date})</div>
      <table>
        <thead><tr><th>公会</th><th class="num">人数</th><th class="num">平均响应</th></tr></thead>
        <tbody id="guild-response-tbody">{guild_response_rows}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title" id="inflow-title">内部团流入明细 ({report_date})</div>
    <table>
      <thead><tr><th>公会</th><th>团长</th><th class="num">新用户</th><th class="num">老用户</th><th class="num">合计</th></tr></thead>
      <tbody id="inflow-tbody">{guild_inflow_rows}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">历史数据</div>
    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th class="num">新用户</th>
            <th class="num">新入团</th>
            <th class="num">新入团率</th>
            <th class="num">新内团</th>
            <th class="num">老用户</th>
            <th class="num">老入团</th>
            <th class="num">老入团率</th>
            <th class="num">老内团</th>
          </tr>
        </thead>
        <tbody id="history-tbody">{history_rows}</tbody>
      </table>
    </div>
  </div>

</div>

<script>
const allDaysData = {all_days_data_json};
const labels = {labels_json};
const newJoined = {new_joined_json};
const oldJoined = {old_joined_json};
const newRate = {new_rate_json};
const oldRate = {old_rate_json};

new Chart(document.getElementById('chartMain'), {{
  type: 'bar',
  data: {{
    labels: labels,
    datasets: [
      {{
        type: 'bar',
        label: '新用户入团数',
        data: newJoined,
        backgroundColor: 'rgba(74, 154, 138, 0.4)',
        borderColor: 'rgba(74, 154, 138, 0.7)',
        borderWidth: 1,
        yAxisID: 'y',
        order: 2,
        pointStyle: 'rect',
        pointRadius: 0
      }},
      {{
        type: 'bar',
        label: '老用户入团数',
        data: oldJoined,
        backgroundColor: 'rgba(255, 215, 0, 0.35)',
        borderColor: 'rgba(255, 215, 0, 0.6)',
        borderWidth: 1,
        yAxisID: 'y',
        order: 3,
        pointStyle: 'rect',
        pointRadius: 0
      }},
      {{
        type: 'line',
        label: '新用户入团率 (%)',
        data: newRate,
        borderColor: '#4ade80',
        backgroundColor: '#4ade80',
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: '#0a1a15',
        pointBorderColor: '#4ade80',
        pointBorderWidth: 2,
        pointStyle: 'line',
        yAxisID: 'y1',
        tension: 0.3,
        order: 0
      }},
      {{
        type: 'line',
        label: '老用户入团率 (%)',
        data: oldRate,
        borderColor: '#FFD700',
        backgroundColor: '#FFD700',
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: '#0a1a15',
        pointBorderColor: '#FFD700',
        pointBorderWidth: 2,
        pointStyle: 'line',
        yAxisID: 'y1',
        tension: 0.3,
        order: 1
      }}
    ]
  }},
  options: {{
    responsive: true,
    maintainAspectRatio: false,
    plugins: {{
      legend: {{
        labels: {{ color: '#e8f5f0', usePointStyle: true }},
        position: 'top'
      }},
      tooltip: {{
        callbacks: {{
          label: function(ctx) {{
            return ctx.dataset.label + ': ' + ctx.parsed.y;
          }}
        }}
      }}
    }},
    scales: {{
      x: {{
        ticks: {{ color: '#7aa89a', maxRotation: 0 }},
        grid: {{ color: 'rgba(74,154,138,0.1)' }}
      }},
      y: {{
        position: 'left',
        type: 'linear',
        ticks: {{ color: '#7aa89a' }},
        grid: {{ color: 'rgba(74,154,138,0.1)' }},
        title: {{ display: true, text: '入团人数', color: '#7aa89a' }}
      }},
      y1: {{
        position: 'right',
        type: 'linear',
        ticks: {{ color: '#FFD700' }},
        grid: {{ display: false }},
        title: {{ display: true, text: '入团率 (%)', color: '#FFD700' }}
      }}
    }}
  }}
}});

const trendLabels = {trend_labels_json};
const trendDatasets = {trend_datasets_json};

new Chart(document.getElementById('chartResponse'), {{
  type: 'line',
  data: {{
    labels: trendLabels,
    datasets: trendDatasets
  }},
  options: {{
    responsive: true,
    maintainAspectRatio: false,
    plugins: {{
      legend: {{
        labels: {{ color: '#e8f5f0', usePointStyle: true, boxWidth: 8 }},
        position: 'top'
      }},
      tooltip: {{
        callbacks: {{
          label: function(ctx) {{
            let v = ctx.parsed.y;
            return ctx.dataset.label + ': ' + (v ? Math.round(v) + ' 分钟' : '无数据');
          }}
        }}
      }}
    }},
    scales: {{
      x: {{
        ticks: {{ color: '#7aa89a' }},
        grid: {{ color: 'rgba(74,154,138,0.1)' }}
      }},
      y: {{
        type: 'logarithmic',
        ticks: {{
          color: '#7aa89a',
          callback: function(value) {{
            if (value >= 60) return Math.round(value/60) + 'h';
            return value + 'm';
          }}
        }},
        grid: {{ color: 'rgba(74,154,138,0.1)' }},
        title: {{ display: true, text: '响应时间（对数轴）', color: '#7aa89a' }}
      }}
    }}
  }}
}});

// 日期切换功能
function fmtMin(m) {{
  if (m === null || m === undefined) return '-';
  return (m >= 60 ? Math.floor(m/60) + 'h' : '') + (m % 60) + 'm';
}}

function renderDate(date) {{
  const data = allDaysData[date];
  if (!data) return;
  const st = data.stats;
  const gi = data.guild_inflow;
  const resp = data.response;
  const respGuild = data.response_by_guild;
  
  // 更新标题
  document.getElementById('current-date').textContent = date;
  document.getElementById('section-title').textContent = date + ' 核心指标';
  document.getElementById('response-title').textContent = '新用户响应速度明细 (' + date + ')';
  document.getElementById('guild-response-title').textContent = '分公会新用户平均响应速度 (' + date + ')';
  document.getElementById('inflow-title').textContent = '内部团流入明细 (' + date + ')';
  
  // 更新核心指标卡片
  document.getElementById('card-new-users').textContent = st.new_users;
  document.getElementById('card-new-joined').textContent = st.new_joined;
  document.getElementById('card-new-rate').textContent = st.new_rate;
  document.getElementById('card-new-sub').innerHTML = '入团 <span id="card-new-joined">' + st.new_joined + '</span> | 率 <span id="card-new-rate">' + st.new_rate + '</span>%';
  document.getElementById('card-new-internal-rate').textContent = st.new_internal_rate + '%';
  document.getElementById('card-new-internal').textContent = st.new_internal;
  document.getElementById('card-new-joined2').textContent = st.new_joined;
  
  document.getElementById('card-old-users').textContent = st.old_users;
  document.getElementById('card-old-joined').textContent = st.old_joined;
  document.getElementById('card-old-rate').textContent = st.old_rate;
  document.getElementById('card-old-sub').innerHTML = '入团 <span id="card-old-joined">' + st.old_joined + '</span> | 率 <span id="card-old-rate">' + st.old_rate + '</span>%';
  document.getElementById('card-old-internal-rate').textContent = st.old_internal_rate + '%';
  document.getElementById('card-old-internal').textContent = st.old_internal;
  document.getElementById('card-old-joined2').textContent = st.old_joined;
  
  // 更新响应速度明细表
  let respHtml = '';
  if (resp && resp.length > 0) {{
    for (const r of resp) {{
      respHtml += '<tr><td>' + r.game_uid + '</td><td>' + (r.nick_name || '-') + '</td><td>' + r.guild_name + '</td><td class="num">' + fmtMin(r.diff_minutes) + '</td></tr>';
    }}
  }} else {{
    respHtml = '<tr><td colspan="4" style="text-align:center;color:#7aa89a;">无数据</td></tr>';
  }}
  document.getElementById('response-tbody').innerHTML = respHtml;
  
  // 更新分公会平均响应表
  let respGuildHtml = '';
  if (respGuild && respGuild.length > 0) {{
    for (const r of respGuild) {{
      respGuildHtml += '<tr><td>' + r.guild_name + '</td><td class="num">' + r.cnt + '</td><td class="num">' + fmtMin(r.avg_min) + '</td></tr>';
    }}
  }} else {{
    respGuildHtml = '<tr><td colspan="3" style="text-align:center;color:#7aa89a;">无数据</td></tr>';
  }}
  document.getElementById('guild-response-tbody').innerHTML = respGuildHtml;
  
  // 更新内部团流入明细表
  const colors = {{'Q': '#4ade80', 'K': '#60a5fa'}};
  let inflowHtml = '';
  for (const g of gi) {{
    const sc = colors[g.server] || '#999';
    inflowHtml += '<tr><td><span style="color:' + sc + ';font-size:11px;">[' + g.server + ']</span> ' + g.guild + '</td><td>' + g.leader + '</td><td class="num">' + g.new_cnt + '</td><td class="num">' + g.old_cnt + '</td><td class="num" style="font-weight:600;">' + g.total + '</td></tr>';
  }}
  document.getElementById('inflow-tbody').innerHTML = inflowHtml;
  
  // 历史表高亮
  document.querySelectorAll('#history-tbody tr').forEach(tr => {{
    tr.classList.toggle('active', tr.dataset.date === date);
  }});
}}

document.getElementById('datePicker').addEventListener('change', function(e) {{
  renderDate(e.target.value);
}});

// 初始高亮当前日期
document.querySelectorAll('#history-tbody tr').forEach(tr => {{
  tr.classList.toggle('active', tr.dataset.date === '{report_date}');
}});
</script>
</body>
</html>'''
    
    return html


def git_commit_push(output_path, report_date):
    """自动提交并推送到 GitHub"""
    import subprocess
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        # 检查是否有变更
        result = subprocess.run(
            ['git', 'diff', '--quiet', '--', output_path],
            cwd=repo_root, capture_output=True
        )
        if result.returncode == 0:
            print(f"  文件无变更，跳过 git 提交")
            return
        
        subprocess.run(['git', 'add', output_path], cwd=repo_root, check=True)
        subprocess.run(
            ['git', 'commit', '-m', f'update(guild-report): 日报 {report_date}'],
            cwd=repo_root, check=True
        )
        subprocess.run(
            ['git', '-c', 'http.version=HTTP/1.1', 'push', 'origin', 'main'],
            cwd=repo_root, check=True
        )
        print(f"  ✓ 已推送至 GitHub")
    except subprocess.CalledProcessError as e:
        print(f"  ✗ git 操作失败: {e}")


def main():
    parser = argparse.ArgumentParser(description='生成无公会用户招募日报 v3.4')
    parser.add_argument('--date', help='指定日期 (YYYY-MM-DD)，默认当日')
    parser.add_argument('--days', type=int, default=7, help='趋势图天数')
    parser.add_argument('--output', help='输出路径')
    parser.add_argument('--push', action='store_true', help='生成后自动 git commit + push')
    args = parser.parse_args()
    
    report_date = args.date or datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.strptime(report_date, '%Y-%m-%d') - timedelta(days=args.days-1)).strftime('%Y-%m-%d')
    output_path = args.output or os.path.join(OUTPUT_DIR, OUTPUT_FILENAME)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    print(f"正在生成 {report_date} 的报告...")
    print(f"趋势范围: {start_date} ~ {report_date}")
    
    conn = get_conn()
    try:
        stats_list = query_range(conn, start_date, report_date)
        response_trend = query_response_trend(conn, start_date, report_date)
        
        # 查询趋势范围内每一天的完整数据（供前端日期切换）
        all_days_data = {}
        cur_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(report_date, '%Y-%m-%d')
        while cur_dt <= end_dt:
            d = cur_dt.strftime('%Y-%m-%d')
            print(f"  查询 {d} 的数据...")
            all_days_data[d] = {
                'stats': query_daily(conn, d),
                'guild_inflow': query_guild_inflow(conn, d),
                'response': query_response(conn, d),
                'response_by_guild': query_response_by_guild(conn, d),
            }
            cur_dt += timedelta(days=1)
        
        today_stats = all_days_data[report_date]['stats']
        today_guild_inflow = all_days_data[report_date]['guild_inflow']
        today_response = all_days_data[report_date]['response']
        today_response_by_guild = all_days_data[report_date]['response_by_guild']
        
        html = generate_html(stats_list, today_stats, today_guild_inflow,
                             today_response, today_response_by_guild, response_trend,
                             report_date, start_date, all_days_data)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        
        print(f"✓ 已生成: {output_path}")
        print(f"  新用户（当日注册）: {today_stats['new_users']} | 入团 {today_stats['new_joined']} ({today_stats['new_rate']}%)")
        print(f"  老用户（无公会活跃）: {today_stats['old_users']} | 入团 {today_stats['old_joined']} ({today_stats['old_rate']}%)")
        
        if args.push:
            git_commit_push(output_path, report_date)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
