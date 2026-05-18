# 前端打点最终方案（已确认）

> **确认时间**: 2026-05-18  
> **确认人**: 用户  
> **执行状态**: 待执行

---

## 一、关键决策记录

| 决策项 | 结论 |
|--------|------|
| traceId 是否放 URL query 传给后端 | ✅ **放**，URL 后拼 `?trace_id=xxx`，后端目前忽略，未来可直接启用 |
| 串联方式 | ✅ **前端自洽**，同一个 traceId 贯穿行为 + API 调用 |
| sessionId 存储 | ✅ **localStorage**（替代 sessionStorage），跨标签页/跨会话保留 |
| traceId 持久化 | ✅ **关键 trace（purchase）** 存 localStorage，支付跳转后恢复 |
| 点击监听方式 | ✅ **按钮绑定**，不用全局监听 |
| 方案选型 | ✅ **方案 C**（A + B 结合） |

---

## 二、6 条核心 trace 链路

### 链路 1：页面加载

```
trace_start: page_enter
  → getBenefits()      → traceStep(api_request) → traceStep(api_response)
  → getRecords()       → traceStep(api_request) → traceStep(api_response)
  → getNickname()      → traceStep(api_request) → traceStep(api_response)
→ trace_end: success / fail
```

### 链路 2：登录

```
trace_start: login
  → login(username)    → traceStep(api_request) → traceStep(api_response)
→ trace_end: success / fail
```

### 链路 3：选择服务器

```
trace_start: select_server
  → getNickname(server_id) → traceStep(api_request) → traceStep(api_response)
→ trace_end: success / fail
```

### 链路 4：购买道具

```
trace_start: purchase
  → traceStep(purchase_confirm)
  → userOrderApply(product_id, count) → traceStep(api_request) → traceStep(api_response)
  → userOrderCheck(order_id)          → traceStep(api_request) → traceStep(api_response)
→ trace_end: success / fail
```

**traceId 持久化**：支付跳转前写入 localStorage，支付回来后读取续上。

### 链路 5：使用道具（5 种通用）

```
trace_start: use_item
  → apply(skill_id + 参数) → traceStep(api_request) → traceStep(api_response)
→ trace_end: success / fail
```

### 链路 5.5：快速使用（库存栏）

```
track('quick_use', { item_type })
```

**说明**：点击库存栏的"使用"按钮，仅切换 tab，无 API 请求。

| 道具 | skill_id | 请求参数 |
|------|:--------:|:---------|
| 天气卡 | 2 | weather_id |
| 时间卡 | 5 | time_hm |
| 流动卡 | 3 | time_hm=0 |
| 体型卡 | 1 | — |
| 公告 | 4 | content |

### 链路 6：切换语言

```
trace_start: switch_language
  → traceStep: from=vi, to=cn
→ trace_end: success
```

**说明**：纯前端操作，无 API 请求，记录切换前后的语言即可。

### 链路 7：停止时间流动

```
trace_start: stop_flow
  → apply(skill_id=3, time_hm=1200) → traceStep(api_request) → traceStep(api_response)
→ trace_end: success / fail
```

**说明**：点击"停止"按钮触发，调用 API 停止流动卡效果。

### 链路 8：重新查询订单

```
trace_start: requery_order
  → userOrderCheck(order_id) → traceStep(api_request) → traceStep(api_response)
→ trace_end: success / fail
```

---

## 三、api-client.js 改造逻辑

所有方法增加可选 `traceId` 参数：

- 传入 traceId 时：
  - **URL 后拼 `?trace_id=${traceId}`**
  - 请求前发送 `traceStep(api_request, { api, method, url, params })`
  - 响应后发送 `traceStep(api_response, { code, message })`
- 未传入 traceId 时：方法内部自己创建 trace，请求结束后 endTrace

**traceId 传后端方式**：URL query，如 `POST /api/login?trace_id=trace_123456`

涉及方法：login / getBenefits / getRecords / apply / gmSuccess / getNickname / userOrderApply / userOrderCheck / userOrderQueryAll

---

## 四、sessionId 与 traceId 存储策略

| 数据 | 存储位置 | 说明 |
|------|----------|------|
| sessionId | localStorage | 替代 sessionStorage，同域名永久保留 |
| purchase traceId | localStorage（带 30min 过期） | 支付跳转前保存，回来后读取 |
| 其他 traceId | 内存 | 不持久化，随页面关闭消失 |

**清理逻辑**：页面加载时检查 localStorage 中的 traceId，超过 30 分钟则删除。

---

## 五、排除项（不打点）

| 功能 | 原因 |
|------|------|
| 调试面板操作 | 非玩家路径 |
| 切换模式 | 辅助功能 |
| 退出登录 | 辅助功能 |
| 打开弹窗（无实际请求） | 仅 UI 交互 |

---

## 六、执行清单

| # | 任务 | 文件 | 状态 |
|---|------|------|:----:|
| 1 | sessionId 改 localStorage | analytics.js | 待执行 |
| 2 | 兼容迁移（旧 sessionStorage → localStorage） | analytics.js | 待执行 |
| 3 | api-client.js 方法加 traceId 参数 + traceStep | api-client.js | 待执行 |
| 4 | init() 创建 page_enter trace | main.js | 待执行 |
| 5 | login.html 创建 login trace | login.html | 待执行 |
| 6 | onServerSelect 创建 select_server trace | main.js | 待执行 |
| 7 | openPurchaseModal 创建 purchase trace + 持久化 | main.js | 待执行 |
| 8 | confirmPurchase 传入 traceId 给 userOrderApply | main.js | 待执行 |
| 9 | 轮询逻辑传入 traceId 给 userOrderCheck | main.js | 待执行 |
| 10 | 5 个道具方法传入 traceId 给 apply | main.js | 待执行 |
| 11 | 重新查询订单创建 requery_order trace | main.js | 待执行 |
| 12 | 页面加载时清理过期 traceId | main.js | 待执行 |
| 13 | 递增版本号 | index.html | 待执行 |
| 14 | pipeline sync | — | 待执行 |
