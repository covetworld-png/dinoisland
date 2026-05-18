# 方案 C 评估：复杂性与风险

## 方案 C 是什么

- **A**：sessionId 从 `sessionStorage` 改到 `localStorage`
- **B**：关键 traceId（如 purchase）在支付跳转前持久化到 `localStorage`，支付回来后读取续上
- **C = A + B**

---

## 一、复杂性评估

| 改动点 | 改什么 | 代码量 | 难度 |
|--------|--------|:------:|:----:|
| analytics.js `getSessionId()` | `sessionStorage` → `localStorage` | 3 行 | 🟢 低 |
| 支付前保存 traceId | 打开支付页前把 traceId 写入 `localStorage` | 2 行 | 🟢 低 |
| 支付回来后恢复 traceId | 页面加载时从 `localStorage` 读回 traceId | 3 行 | 🟢 低 |
| 过期清理 | 页面加载时清理超过 30 分钟的残留 traceId | 5 行 | 🟢 低 |
| 兼容迁移 | 首次切换时，把旧的 `sessionStorage` sessionId 读到 `localStorage` | 3 行 | 🟢 低 |

**总体复杂度：低。总计约 15 行代码，不涉及业务逻辑改动。**

---

## 二、风险清单

| # | 风险 | 概率 | 影响 | 缓解措施 |
|---|------|:----:|:----:|:---------|
| 1 | localStorage 数据残留（未完成支付的 traceId 一直留着） | 中 | 低 | 加 30 分钟过期时间，页面加载时自动清理 |
| 2 | 同一浏览器多账号登录，sessionId 混淆 | 低 | 中 | 退出登录时清除 sessionId，重新生成 |
| 3 | 用户手动清除 localStorage，session 重置 | 低 | 低 | 正常现象，重新生成即可 |
| 4 | 首次切换时，旧 sessionStorage 的 sessionId 丢失 | 中 | 低 | 兼容迁移逻辑：先读 localStorage，没有则读 sessionStorage |
| 5 | traceId 恢复后，原 trace 已过期（超过 30 分钟才回来） | 低 | 低 | 判断时间戳，超期则丢弃，不续 trace |

**核心风险只有 1 个：数据残留。加过期清理即可解决。**

---

## 三、不做的代价

如果不做方案 C，保持现状（sessionStorage）：

| 场景 | 后果 |
|------|------|
| 用户新标签页打开支付页 | purchase trace 和支付结果无法关联 |
| 用户支付后 30 分钟才回来 | 订单查询结果无法关联到原购买行为 |
| 关闭浏览器再打开 | 全新 session，所有历史行为断链 |

**结论：不做的话，支付链路永远串不起来。**

---

## 四、建议

| 维度 | 评估 |
|------|------|
| 复杂度 | 🟢 **低**，15 行代码 |
| 风险 | 🟢 **低**，唯一风险是数据残留，加过期即可 |
| 收益 | 🔴 **高**，支付链路能完整串联 |
| **结论** | **建议做** |
