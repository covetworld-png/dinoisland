# 页面按钮点击事件清单

> **范围**: index.html 所有 `onclick`  
> **统计**: 34 个按钮

---

## 一、导航栏（4 个）

| # | 按钮 | 事件函数 | 是否打点 | 说明 |
|---|------|----------|:--------:|------|
| 1 | 退出 | `doApiLogout()` | ✅ | logout track |
| 2 | 调试面板 🧪 | `toggleDebugPanel()` | ❌ | 调试功能，非玩家路径 |
| 3 | 订单查询 | `openOrderQueryModal()` | ✅ | open_order_query track |
| 4 | 语言切换 | `toggleLanguage()` | ✅ | switch_language trace |

---

## 二、调试面板（4 个）

| # | 按钮 | 事件函数 | 是否打点 | 说明 |
|---|------|----------|:--------:|------|
| 5 | 刷新数据 | `refreshApiData()` | ❌ | 调试功能 |
| 6 | 重置库存 | `resetInventory()` | ❌ | 调试功能 |
| 7 | 强制清理 | `forceClearRecords()` | ❌ | 调试功能 |
| 8 | 重置库存 | `resetInventory()` | ❌ | 调试功能 |

---

## 三、账号区域（2 个）

| # | 按钮 | 事件函数 | 是否打点 | 说明 |
|---|------|----------|:--------:|------|
| 9 | 重新登录 | `handleRelogin()` | — | 未实现打点，跳转 login.html |
| 10 | 登录 | `doApiLogin()` | — | 跳转 login.html，login 打在 login.html |

---

## 四、库存栏 - 购买按钮（5 个）

| # | 按钮 | 事件函数 | 是否打点 | 说明 |
|---|------|----------|:--------:|------|
| 11 | 购买天气卡 | `openPurchaseModal('weather')` | ✅ | click_pay track + purchase trace 起点 |
| 12 | 购买时间卡 | `openPurchaseModal('time')` | ✅ | click_pay track + purchase trace 起点 |
| 13 | 购买公告 | `openPurchaseModal('announcement')` | ✅ | click_pay track + purchase trace 起点 |
| 14 | 购买流动卡 | `openPurchaseModal('flow')` | ✅ | click_pay track + purchase trace 起点 |
| 15 | 购买体型卡 | `openPurchaseModal('dinoGrow50')` | ✅ | click_pay track + purchase trace 起点 |

---

## 五、库存栏 - 快速使用按钮（5 个）

| # | 按钮 | 事件函数 | 是否打点 | 说明 |
|---|------|----------|:--------:|------|
| 16 | 快速使用天气卡 | `quickUseWeather()` | ✅ | track('quick_use', { item_type: 'weather' }) |
| 17 | 快速使用时间卡 | `quickUseTime()` | ✅ | track('quick_use', { item_type: 'time' }) |
| 18 | 快速使用公告 | `quickUseAnnouncement()` | ✅ | track('quick_use', { item_type: 'announcement' }) |
| 19 | 快速使用流动卡 | `quickUseFlow()` | ✅ | track('quick_use', { item_type: 'flow' }) |
| 20 | 快速使用体型卡 | `quickUseDinoGrow()` | ✅ | track('quick_use', { item_type: 'dinoGrow50' }) |

---

## 六、道具面板 - 使用按钮（7 个）

| # | 按钮 | 事件函数 | 是否打点 | 说明 |
|---|------|----------|:--------:|------|
| 21 | 使用天气卡 | `useWeatherCard()` | ✅ | use_item trace |
| 22 | 时间 −1h | `adjustTime(-60)` | — | 纯前端滑块调整 |
| 23 | 时间 +1h | `adjustTime(60)` | — | 纯前端滑块调整 |
| 24 | 使用时间卡 | `useTimeCard()` | ✅ | use_item trace |
| 25 | 发送公告 | `submitAnnouncement()` | ✅ | use_item trace |
| 26 | 使用流动卡 | `useFlowCard()` | ✅ | use_item trace |
| 27 | 停止流动卡 | `stopFlowCard()` | ✅ | stop_flow trace |
| 28 | 使用体型卡 | `useDinoSizeCard()` | ✅ | use_item trace |

---

## 七、弹窗关闭/确认（6 个）

| # | 按钮 | 事件函数 | 是否打点 | 说明 |
|---|------|----------|:--------:|------|
| 29 | 关闭购买弹窗 | `closePurchaseModal()` | — | 纯 UI 关闭 |
| 30 | 确认购买 | `confirmPurchase()` | ✅ | purchase trace 续上 |
| 31 | 关闭支付成功 | `closePaySuccessModal()` | — | 纯 UI 关闭 |
| 32 | 关闭支付失败 | `closePayFailModal()` | — | 纯 UI 关闭 |
| 33 | 刷新页面 | `location.reload()` | — | 纯 UI 操作 |
| 34 | 关闭订单查询 | `closeOrderQueryModal()` | — | 纯 UI 关闭 |

---

## 八、统计汇总

| 类别 | 数量 | 已打点 | 未打点 |
|------|:----:|:------:|:------:|
| 导航栏 | 4 | 3 | 1（调试面板） |
| 调试面板 | 4 | 0 | 4 |
| 账号区域 | 2 | 0 | 2（跳转页面） |
| 库存栏购买 | 5 | 5 | 0 |
| 库存栏快速使用 | 5 | 0 | 5（仅切换 tab） |
| 道具面板使用 | 7 | 6 | 1（时间调整） |
| 弹窗关闭/确认 | 6 | 1 | 5（纯 UI） |
| **合计** | **33** | **15** | **18** |
