# 主播空降恐龙岛活动页面

## 项目说明

活动落地页，支持玩家选择主播阵营、购买限定皮肤。

## 目录

- [多语言说明](#多语言说明)
- [配置文件](#配置文件)
- [数据埋点](#数据埋点)
- [本地开发](#本地开发)
- [构建打包](#构建打包)

---

## 多语言说明

### 翻译文件结构

```json
{
  "模块名": {
    "翻译键": {
      "vi": "越南语文本",
      "cn": "中文文本"
    }
  }
}
```

### 使用方式

HTML 中通过 `data-i18n` 属性标记：

```html
<span data-i18n="streamers.加入阵营_3">Tham gia</span>
```

JS 中通过 `getTranslation()` 获取：

```javascript
const text = getTranslation('streamers.加入阵营_3');
```

### 添加新翻译

1. 在 `i18n.json` 中添加键值对
2. 在 HTML 元素上添加 `data-i18n` 属性
3. 页面自动加载（无需修改 JS）

---

## 配置文件

### 配置项清单

| 配置项 | 类型 | 说明 |
|--------|------|------|
| `timings.registrationDeadline` | ISO Date | 报名截止时间 |
| `timings.battleStartTime` | ISO Date | 对抗开始时间 |
| `timings.skinRevealTime` | ISO Date | 皮肤公布时间 |
| `timings.saleStartTime` | ISO Date | 开售开始时间 |
| `timings.saleEndTime` | ISO Date | 开售结束时间 |
| `skinState.current` | String | 当前皮肤状态 |
| `factionResults.q.winner` | String | Q服获胜方 |
| `factionResults.q.discounts` | Object | Q服各主播折扣 |
| `factionResults.k.winner` | String | K服获胜方 |
| `factionResults.k.discounts` | Object | K服各主播折扣 |
| `pricing.exchangeRate` | Number | 金币:越南盾汇率 |
| `pricing.warrior.gold` | Number | 勇士皮肤金币价 |
| `pricing.overlord.gold` | Number | 霸主礼包金币价 |
| `pricing.overlord.discountPercent` | Number | 霸主礼包折扣 |
| `links.discord` | Object | Discord 链接配置 |
| `links.downloads` | Array | 下载源列表 |

### 配置示例

```json
{
  "_meta": {
    "version": "1.0.0",
    "updatedAt": "2026-03-22T12:00:00+07:00"
  },
  "timings": {
    "registrationDeadline": "2026-04-01T00:00:00+07:00",
    "battleStartTime": "2026-04-01T20:00:00+07:00"
  },
  "skinState": {
    "current": "comingSoon"
  },
  "factionResults": {
    "q": {
      "winner": "heni",
      "discounts": { "heni": 50, "ricon": 10 }
    }
  }
}
```

### 配置加载

```javascript
// 自动从 CDN 加载，本地缓存 5 分钟
const config = await loadCampaignConfig();
```

---

## 数据埋点

### 事件列表

| 事件 | 触发时机 | 数据字段 |
|------|---------|---------|
| `page_view` | 页面加载 | `url`, `referrer`, `screenSize`, `deviceType` |
| `login_click` | 点击登录按钮 | `position` |
| `login_error` | 登录失败 | `reason` |
| `login_success` | 登录成功 | `user_id`, `duration_ms` |
| `language_switch` | 切换语言 | `from`, `to` |
| `faction_join_click` | 点击加入阵营 | `server`, `streamer`, `status` |
| `faction_join_error` | 加入失败 | `reason`, `server`, `streamer` |
| `faction_join_success` | 成功加入 | `server`, `streamer`, `join_position` |
| `discord_click` | 点击 Discord | `server`, `streamer` |
| `download_modal_open` | 打开下载弹窗 | `trigger` |
| `download_click` | 点击下载链接 | `source`, `url` |
| `purchase_initiate` | 点击购买 | `item_type`, `item_id`, `price_vnd` |
| `purchase_select_server` | 选择服务器 | `server` |
| `purchase_complete` | 支付完成 | `order_id`, `item_type`, `server` |
| `user_identify` | 用户识别 | `anonymous_id`, `user_id` |

### 上报机制

- **批量上报**：队列满 10 条或每 30 秒自动上报
- **API 地址**：`https://analytics.mock.monster-lair.vn/collect`
- **失败重试**：最多 3 次，失败事件重新入队
- **匿名 ID**：未登录用户自动生成 `anon_xxx`

### 调试方法

```javascript
// 查看队列状态
Analytics.getQueueStatus()

// 查看待上报事件
Analytics.queue

// 强制上报
Analytics.flush()
```

---

## 本地开发

### 启动方式

```bash
# 进入目录
cd src/campaign/pages/streamer-dropin

# 使用任意静态服务器
python3 -m http.server 8080
# 或
npx serve .
```

访问 http://localhost:8080

### 调试配置

页面右上角有「测试模式」按钮，可模拟：
- 未登录 / 已登录未激活 / 已激活
- 报名截止状态
- 皮肤各阶段状态
- 阵营胜负结果

---

## 构建打包

### 输出目录

```
dist/streamer-dropin/
├── index.html
├── config.json
├── README.md          <-- 本文件
└── assets/
    ├── banner.png
    ├── streamer-skin-*.png
    └── ...
```

### 打包命令

```bash
# 复制必要文件到 dist
cp index.html dist/streamer-dropin/
cp config.json dist/streamer-dropin/
cp README.md dist/streamer-dropin/
cp -r assets dist/streamer-dropin/

# 或 npm 脚本
npm run build:campaign
```

### 部署验证

| 检查项 | 验证方式 |
|--------|---------|
| 页面加载 | 访问 URL，确认无 404 |
| 多语言 | 点击语言切换按钮 |
| 配置生效 | 修改 config.json，5 分钟后刷新 |
| 埋点上报 | 打开控制台查看 `[Analytics]` 日志 |

---

## 相关文档

- [PRD.md](./PRD.md) - 产品需求文档
- [i18n-README.md](./i18n-README.md) - 国际化详细说明
- [i18n-for-translation.md](./i18n-for-translation.md) - 翻译专用文档

## 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-03-22 | 初始版本，完整功能实现 |
