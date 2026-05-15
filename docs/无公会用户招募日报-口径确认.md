# 无公会用户招募日报 — 口径确认文档

> 生成脚本: `scripts/generate_guild_report.py`  
> 输出文件: `src/report/guild-recruitment.html`  
> 版本: v3.2  
> 日期: 2026-05-09

---

## 一、数据来源

| 项 | 值 |
|:---|:---|
| 数据库 | `monster_test` |
| 主机 | `106.75.213.178:13307` |
| 核心表 | `game_dau_hour`, `game_user_guilds`, `prod_users`, `game_guild_names`, `user_game_info` |

---

## 二、核心口径定义

### 2.1 新用户

| 字段 | 定义 |
|:-----|:-----|
| **判定条件** | `game_dau_hour` 中 `MIN(active_date) = 当日` |
| **等价表述** | 首次活跃日期等于统计日期的用户 |
| **排除项** | `prod_users.created_at` 不作为判定依据 |
| **SQL 逻辑** | `MIN(active_date) FROM game_dau_hour GROUP BY game_uid` |

```sql
SELECT game_uid, MIN(active_date) as first_active
FROM game_dau_hour
GROUP BY game_uid
HAVING first_active = '{date_str}'
```

### 2.2 老用户（无公会 + 当日活跃）

| 字段 | 定义 |
|:-----|:-----|
| **判定条件** | ① `first_active < 当日` ② 当日在 `game_dau_hour` 有记录 ③ 当日**之前**从未入过任何公会 |
| **排除项** | 退团后重新游离的老用户**不计入**（`NOT EXISTS game_user_guilds WHERE joined_at < 当日 00:00:00`） |
| **口径说明** | 仅统计"从未有过公会记录"的用户 |

```sql
WHERE dh.active_date = '{date_str}'
  AND ufa.first_active < '{date_str}'
  AND NOT EXISTS (
      SELECT 1 FROM game_user_guilds gug
      WHERE gug.game_uid = dh.game_uid
        AND gug.joined_at < CONCAT('{date_str}', ' 00:00:00')
  )
```

### 2.3 入团率

| 指标 | 公式 |
|:-----|:-----|
| 新用户入团率 | `新用户当日入团人数 / 新用户总数 × 100%` |
| 老用户入团率 | `老用户当日入团人数 / 老用户总数 × 100%` |
| 分母说明 | 入团率的分母是"当日该群体的总人数"，不是"当日该群体的无公会人数" |

### 2.4 内部团占比

| 指标 | 公式 |
|:-----|:-----|
| 新用户内部团占比 | `新用户入内部团人数 / 新用户总入团人数 × 100%` |
| 老用户内部团占比 | `老用户入内部团人数 / 老用户总入团人数 × 100%` |

---

## 三、8 个内部团（TARGET_GUILDS）

| 团长账号 | 显示名 | 公会名 | 服务器 | server_id |
|:---------|:-------|:-------|:-------|:----------|
| specter | SPECTER | Hoả Long | Q | 750748016054341 |
| sktti | SKTTI | GOD DINO | Q | 750748016054341 |
| chiuchiu | ChiuChiu | God King | Q | 750748016054341 |
| nguyetcung | NguyệtCung | NguyệtCung | Q | 750748016054341 |
| tutien | TUTien | Tu Tiên | Q | 750748016054341 |
| thien_co | Thiên Cơ | Thiên Cơ | K | 768538488131653 |
| hacam | Hắc Ám | Hắc Ám | K | 768538488131653 |
| nhatthuc | Nhật Thực | Nhật Thực | K | 768538488131653 |

> **技术细节**: 公会名比较时进行 Unicode NFC 规范化，避免 `Hắc Ám` (U+1EAF) 与 `Hắc Ám` (U+0103+U+0301) 匹配失败。

---

## 四、报表各模块口径

### 4.1 核心指标卡片

| 卡片 | 口径 |
|:-----|:-----|
| 新用户（首次活跃） | 当日 `game_dau_hour` 中首次活跃日期 = 当日的用户数 |
| 新用户入团数 | 上述新用户中，当日有 `game_user_guilds` 入团记录的人数 |
| 新用户入团率 | 新用户入团数 / 新用户总数 |
| 新用户内部团占比 | 新用户入 8 大内部团人数 / 新用户总入团数 |
| 老用户（无公会+活跃） | 当日 `game_dau_hour` 活跃 + 首次活跃 < 当日 + 之前从未入团 |
| 老用户入团数 | 上述老用户中，当日有 `game_user_guilds` 入团记录的人数 |
| 老用户入团率 | 老用户入团数 / 老用户总数 |
| 老用户内部团占比 | 老用户入 8 大内部团人数 / 老用户总入团数 |

### 4.2 入团人数与入团率组合图表

| 系列 | 口径 |
|:-----|:-----|
| 新用户入团数（柱状） | 每日新用户当日入团人数 |
| 老用户入团数（柱状） | 每日老用户当日入团人数 |
| 新用户入团率（折线） | 每日新用户入团率 |
| 老用户入团率（折线） | 每日老用户入团率 |
| 趋势天数 | 默认 7 天，可通过 `--days` 调整 |

### 4.3 分公会新用户响应速度趋势（折线图，对数轴）

| 项 | 口径 |
|:---|:---|
| **统计对象** | 仅"新用户"（`first_active = join_date`） |
| **响应时间** | `TIMESTAMPDIFF(MINUTE, prod_users.created_at, game_user_guilds.joined_at)` |
| **Y 轴** | 对数轴，刻度自动切换为 `h`（≥60分钟）或 `m` |
| **过滤条件** | `game_uid >= 13219600`（仅统计 5 月后新注册用户） |
| **空数据处理** | 无数据的日期显示为断点（`spanGaps: true`） |

### 4.4 新用户响应速度明细表

| 列 | 口径 |
|:---|:---|
| UID | `prod_users.game_uid` |
| 昵称 | `COALESCE(user_game_info.nick_name, prod_users.username)` |
| 公会 | `game_guild_names.guild_name` |
| 响应 | `TIMESTAMPDIFF(MINUTE, prod_users.created_at, game_user_guilds.joined_at)` |
| 排序 | 按响应时间升序 |

### 4.5 分公会新用户平均响应速度表

| 列 | 口径 |
|:---|:---|
| 公会 | 8 大内部团之一 |
| 人数 | 该公会当日新用户入团人数 |
| 平均响应 | `AVG(TIMESTAMPDIFF(MINUTE, created_at, joined_at))` |

### 4.6 内部团流入明细表

| 列 | 口径 |
|:---|:---|
| 公会 | 8 大内部团 |
| 团长 | 对应显示名 |
| 新用户 | `first_active = DATE(joined_at)` 的入团人数 |
| 老用户 | `first_active < DATE(joined_at)` 的入团人数 |
| 合计 | 新用户 + 老用户 |

### 4.7 历史数据表

| 列 | 口径 | SQL |
|:---|:---|:---|
| 日期 | 统计日期 | `'{date_str}'` |
| 新用户 | 当日首次活跃用户数 | `SELECT COUNT(DISTINCT dh.game_uid) FROM game_dau_hour dh JOIN (SELECT game_uid, MIN(active_date) AS first_active FROM game_dau_hour GROUP BY game_uid) ufa ON dh.game_uid = ufa.game_uid WHERE dh.active_date = '{date_str}' AND ufa.first_active = '{date_str}'` |
| 新入团 | 当日新用户入团数 | `SELECT COUNT(DISTINCT dh.game_uid) FROM game_dau_hour dh JOIN (SELECT game_uid, MIN(active_date) AS first_active FROM game_dau_hour GROUP BY game_uid) ufa ON dh.game_uid = ufa.game_uid JOIN game_user_guilds gug ON dh.game_uid = gug.game_uid WHERE dh.active_date = '{date_str}' AND ufa.first_active = '{date_str}' AND DATE(gug.joined_at) = '{date_str}'` |
| 新入团率 | 新入团 / 新用户 × 100% | 计算值 |
| 新内团 | 新用户入 8 大内部团数 | `SELECT COUNT(DISTINCT dh.game_uid) FROM game_dau_hour dh JOIN (SELECT game_uid, MIN(active_date) AS first_active FROM game_dau_hour GROUP BY game_uid) ufa ON dh.game_uid = ufa.game_uid JOIN game_user_guilds gug ON dh.game_uid = gug.game_uid LEFT JOIN game_guild_names gn ON gug.guild_id = gn.guild_id AND gug.server_id = gn.server_id WHERE dh.active_date = '{date_str}' AND ufa.first_active = '{date_str}' AND DATE(gug.joined_at) = '{date_str}' AND gn.guild_name IN (...TARGET_GUILDS...)` |
| 老用户 | 当日无公会活跃老用户数 | `SELECT COUNT(DISTINCT dh.game_uid) FROM game_dau_hour dh JOIN (SELECT game_uid, MIN(active_date) AS first_active FROM game_dau_hour GROUP BY game_uid) ufa ON dh.game_uid = ufa.game_uid WHERE dh.active_date = '{date_str}' AND ufa.first_active < '{date_str}' AND NOT EXISTS (SELECT 1 FROM game_user_guilds gug WHERE gug.game_uid = dh.game_uid AND gug.joined_at < CONCAT('{date_str}', ' 00:00:00'))` |
| 老入团 | 当日老用户入团数 | `SELECT COUNT(DISTINCT dh.game_uid) FROM game_dau_hour dh JOIN (SELECT game_uid, MIN(active_date) AS first_active FROM game_dau_hour GROUP BY game_uid) ufa ON dh.game_uid = ufa.game_uid JOIN game_user_guilds gug ON dh.game_uid = gug.game_uid WHERE dh.active_date = '{date_str}' AND ufa.first_active < '{date_str}' AND DATE(gug.joined_at) = '{date_str}' AND NOT EXISTS (SELECT 1 FROM game_user_guilds gug2 WHERE gug2.game_uid = dh.game_uid AND gug2.joined_at < CONCAT('{date_str}', ' 00:00:00'))` |
| 老入团率 | 老入团 / 老用户 × 100% | 计算值 |
| 老内团 | 老用户入 8 大内部团数 | `SELECT COUNT(DISTINCT dh.game_uid) FROM game_dau_hour dh JOIN (SELECT game_uid, MIN(active_date) AS first_active FROM game_dau_hour GROUP BY game_uid) ufa ON dh.game_uid = ufa.game_uid JOIN game_user_guilds gug ON dh.game_uid = gug.game_uid LEFT JOIN game_guild_names gn ON gug.guild_id = gn.guild_id AND gug.server_id = gn.server_id WHERE dh.active_date = '{date_str}' AND ufa.first_active < '{date_str}' AND DATE(gug.joined_at) = '{date_str}' AND NOT EXISTS (SELECT 1 FROM game_user_guilds gug2 WHERE gug2.game_uid = dh.game_uid AND gug2.joined_at < CONCAT('{date_str}', ' 00:00:00')) AND gn.guild_name IN (...TARGET_GUILDS...)` |

---

## 五、阶段标注

| 阶段 | 日期范围 | 说明 |
|:-----|:---------|:-----|
| 基线 | ≤ 2026-05-07 | 看板上线前（5/5-5/7） |
| 过渡 | 2026-05-08 | 看板上线，短信通知未开启 |
| 干预 | ≥ 2026-05-09 | 看板 + 短信通知 |

---

## 六、数据过滤与限制

| 项 | 值 | 说明 |
|:---|:---|:-----|
| `game_uid` 下限 | `>= 13219600` | 排除 5 月前的老注册用户，避免响应时间异常偏大 |
| 响应时间下限 | `joined_at >= created_at` | 排除时间倒流的数据 |
| 公会名匹配 | Unicode NFC 规范化 | 解决越南语字符编码差异 |
| 日期格式 | `YYYY-MM-DD` | 所有日期比较使用 `DATE()` 函数提取日期部分 |

---

## 七、已知数据异常

| 异常 | 说明 | 状态 |
|:-----|:-----|:-----|
| `dino_game_logs log_type=2,3` 断流 | 5/2 后登录日志仅 3 条，活跃数据已切换至 `game_dau_hour` | 已修复 |
| Nhật Thực 5/8 响应速度 2667 分钟 | 明细表显示 3 人平均约 90 分钟，趋势图显示 2667 分钟（约 44 小时） | **待排查** — 可能 `first_active` 取到了非当日的日期 |
| Hắc Ám Unicode 匹配失败 | 已修复，通过 NFC 规范化解决 | 已修复 |
| God King / Tu Tiên 零数据 | 5/2-5/8 期间无入团记录 | 数据事实 |

---

## 八、待数据分析师确认项

1. **新用户口径**: 以 `game_dau_hour` 首次活跃日期为准，不以 `prod_users.created_at` 为准，是否正确？
2. **老用户口径**: "从未有过公会记录"（`NOT EXISTS game_user_guilds WHERE joined_at < 当日`），是否应包含"退团后重新游离"的用户？
3. **响应速度口径**: 仅统计 `first_active = join_date` 的新用户，老用户入团不计入，是否正确？
4. **入团率分母**: 入团率 = 入团人数 / 该群体总人数（含已有公会用户），是否应改为 / 该群体无公会人数？
5. **`game_uid >= 13219600` 过滤**: 该过滤是否过于粗暴？是否应改用 `created_at >= '2026-05-01'`？
6. **Nhật Thực 5/8 数据异常**: 趋势图 avg=2667 分钟与明细表 90 分钟不符，需核查 SQL 逻辑。

---

## 九、定时任务配置

```bash
# Mac Mini launchd 定时任务
# 每天 00:30 执行
30 0 * * * cd /Volumes/TQP4000/Sync/Work/dino_pd && bash scripts/guild-report-launcher.sh
```

| 配置项 | 值 |
|:-------|:---|
| 执行时间 | 每日 00:30（统计昨日数据） |
| 输出路径 | `src/report/guild-recruitment.html` |
| 自动推送 | `--push` 参数触发 `git add → commit → push` |
| 日志路径 | `logs/guild-report-YYYYMMDD.log` |
