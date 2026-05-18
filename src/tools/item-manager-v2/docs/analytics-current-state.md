# 当前打点方案（已落地状态）

> **版本**: main.js?v=130  
> **生成时间**: 2026-05-18

---

## 一、SDK 初始化与上下文

| 位置 | 代码 | 说明 |
|------|------|------|
| `main.js:319` | `Analytics.init(endpoint)` | 初始化，传入实际上报地址 |
| `main.js:304-313` | `_updateAnalyticsContext()` | 设置 user_id / game_uid / server_id / lang / mode |
| `main.js:320` | `_updateAnalyticsContext()` 调用 | init 后自动调用 |
| `onServerSelect:28` | `_updateAnalyticsContext()` 调用 | 选服后更新 |
| `toggleLanguage:2730` | `_updateAnalyticsContext()` 调用 | 切语言后更新 |

---

## 二、普通事件埋点（track）

| # | 事件名 | 位置 | 触发时机 | 参数 |
|---|--------|------|----------|------|
| 1 | `login_success` | `login.html:166` | 登录成功 | `user_id`, `game_uid` |
| 2 | `logout` | `main.js:3104` | 点击退出 | `user_id` |
| 3 | `select_server` | `main.js:28` | 选择服务器 | `server_id`, `server_code` |
| 4 | `switch_language` | `main.js:2729` | 切换语言 | `from`, `to` |
| 5 | `switch_mode` | `main.js:3033` | 切换 API/模拟模式 | `mode` |
| 6 | `click_pay` | `main.js:2647` | 点击购买按钮 | `item_type`, `price` |
| 7 | `open_order_query` | `main.js:2326` | 打开订单查询 | — |
| 8 | `purchase_init` | `main.js:2151` | 创建订单成功 | `item_type`, `order_id`, `qty`, `total_price` |
| 9 | `purchase_init_fail` | `main.js:2157` | 创建订单失败 | `item_type`, `reason` |
| 10 | `purchase_result` | `main.js:2266` | 支付成功（模拟） | `item_type`, `result`, `qty`, `total_price` |
| 11 | `purchase_result` | `main.js:2512` | 支付失败（轮询） | `item_type`, `result`, `reason` |

---

## 三、Trace 链路（完整流程追踪）

### 3.1 支付流程（微信原有）

```
startTrace('purchase', { item_type, price })
  → traceStep('purchase_confirm')
  → track('purchase_init') / track('purchase_init_fail')
  → track('purchase_result')
  → endTrace('success' / 'fail')
```

| 事件 | 位置 | 说明 |
|------|------|------|
| `purchase_confirm` | `main.js:2114` | 用户确认购买 |
| `purchase_init` | `main.js:2151` | 订单创建成功 |
| `purchase_init_fail` | `main.js:2157` | 订单创建失败 |
| `purchase_result` | `main.js:2266/2506` | 支付结果 |
| `endTrace` | `main.js:2267/2507/2513` | trace 结束 |

### 3.2 道具使用流程（新增 5 条）

统一结构：
```
startTrace('use_item', { item_type, server_id, ... })
  → traceStep('apply_response', { code, message })
  → endTrace('success' / 'fail')
```

| 道具 | item_type | 位置 | 额外参数 |
|------|:---------|:-----|:---------|
| 天气卡 | `weather_card` | `main.js:787` | `weather_id` |
| 时间卡 | `time_card` | `main.js:933` | `time_hm` |
| 流动卡 | `flow_card` | `main.js:1070` | — |
| 体型卡 | `dino_grow_50` | `main.js:1186` | — |
| 公告 | `announcement` | `main.js:1362` | `content_length` |

失败原因分类：
- `conflict` (code: 118) - 与其他玩家冲突
- `no_item` (code: 119) - 道具不足
- `other` - 其他错误

---

## 四、Payload 公共字段

每条日志自动包含：
```json
{
  "event": "...",
  "session_id": "sess_xxx",
  "trace_id": "trace_xxx | null",
  "page": "item-manager-v2",
  "lang": "vi | cn",
  "mode": "api | mock",
  "user_id": "player_xxx | null",
  "game_uid": "xxx | null",
  "server_id": "Q | K | null",
  "server_code": "Q | K | null",
  "timestamp": 1234567890,
  "ua": "...",
  "screen": "1920x1080",
  "referrer": "..."
}
```

---

## 五、缺失项（待评估）

| 行为 | 状态 | 说明 |
|------|:----:|------|
| 页面加载 `page_view` | ⚠️ | `Analytics.init()` 内部自动触发，但缺少上下文（init 在 setContext 之前） |
| 全局点击监听 | ❌ | 未实现 |
| 调试面板操作 | ❌ | 未实现 |
| 订单查询内操作（重新查询） | ❌ | 未实现 |

---

## 六、上报通道

`analytics.js:196-229` 中 `sendBeacon`/`fetch` 被注释，当前只输出 `console.log`。

如需实际上报，需取消注释 `send()` 方法中的上报逻辑。
