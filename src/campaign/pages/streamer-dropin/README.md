# 主播空降活动页面 - 技术文档

> ⚠️ **开发待办：当前为前端静态页面，以下功能需技术开发完成**

| # | 待办项 | 当前状态 | 需完成工作 |
|---|--------|----------|------------|
| 1 | **用户登录** | Mock 前端模拟 | 接入正式登录 API，返回 `user_id` |
| 2 | **角色激活检测** | 前端状态模拟 | 调用后端接口验证用户是否已创建角色 |
| 3 | **阵营加入** | 仅前端状态记录 | 调后端 API 保存阵营选择，限制重复加入 |
| 4 | **数据埋点** | Mock API (console.log) | 接入正式数据分析平台，支持批量上报 |
| 5 | **支付购买** | 前端模拟成功 | 接入正式支付系统，完成订单创建、回调、发货 |
| 6 | **皮肤发放** | 前端弹窗模拟 | 活动结束后，后端触发皮肤发放到游戏背包 |
| 7 | **配置下发** | 本地 config.json | 支持从 CDN/接口动态加载配置，实现热更新 |
| 8 | **翻译确认** | 开发初稿 | 越南语需经专业翻译确认，更新 i18n.json |

**当前可演示功能**：页面静态效果、状态切换、测试按钮流程

---

## 1. 配置说明

### 1.1 配置文件结构

`config.json` 是活动的核心配置文件，支持热更新（修改后无需重新部署页面）。

```json
{
  "_meta": {
    "version": "1.0.0",
    "updatedAt": "2026-03-22T12:00:00+07:00",
    "notes": ["配置说明备注"]
  },
  "timings": {},      // 时间节点
  "skinState": {},    // 皮肤状态
  "factionResults": {}, // 阵营结果
  "pricing": {},      // 定价配置
  "links": {}         // 链接配置
}
```

### 1.2 配置项详解

#### 时间节点 (timings)

| 字段 | 格式 | 作用 |
|------|------|------|
| `registrationDeadline` | ISO 8601 | 报名截止时间，到达后显示"报名已截止" |
| `battleStartTime` | ISO 8601 | 对抗开始时间 |
| `skinRevealTime` | ISO 8601 | 皮肤公布时间，切换 revealed 状态 |
| `saleStartTime` | ISO 8601 | 开售开始时间，切换 onSale 状态 |
| `saleEndTime` | ISO 8601 | 开售结束时间，切换 eventEnded 状态 |

#### 皮肤状态 (skinState)

```json
{
  "current": "comingSoon",
  "allowedValues": ["comingSoon", "revealed", "onSale", "eventEnded", "skinDelivered"]
}
```

| 状态值 | 页面表现 | 触发条件 |
|--------|----------|----------|
| `comingSoon` | 占位图 + "即将揭晓"遮罩 | 默认状态，未达 revealTime |
| `revealed` | 正式图 + 原价显示，无购买按钮 | 到达 revealTime，未达 saleStartTime |
| `onSale` | 正式图 + 折扣价 + 购买按钮 | saleStartTime ≤ 当前 < saleEndTime |
| `eventEnded` | 显示"活动已结束" | 当前 ≥ saleEndTime |
| `skinDelivered` | 弹出"皮肤已发放"全屏提示 | 手动配置，活动结束后 |

#### 阵营结果 (factionResults)

```json
{
  "q": {
    "winner": "heni",           // 获胜方
    "discounts": {
      "heni": 54,              // 获胜方折扣约 54% (5888→2722)
      "ricon": 47              // 落败方折扣约 47% (5888→3110)
    }
  }
}
```

#### 定价配置 (pricing) - V2 版本

| 字段 | 说明 | 计算公式 |
|------|------|----------|
| `exchangeRate` | 金币:越南盾汇率 | 1 金币 = 1800 VND |
| `warrior.displayOriginal` | 勇士皮肤原价（显示用） | 5888 金币 |
| `warrior.finalPriceWinner` | 胜者最终价 | 2722 金币 (折扣 -54%) |
| `warrior.finalPriceLoser` | 败者最终价 | 3110 金币 (折扣 -47%) |
| `overlord.displayOriginal` | 霸主礼包原价 | 18888 金币 |
| `overlord.salePrice` | 霸主礼包售价 | 10888 金币 (折扣 -42%) |

**价格显示规则：**
- 页面价格区域**仅显示金币**
- 越南盾价格仅在**购买按钮**上显示
- 原价使用删除线样式，最终价高亮显示

### 1.3 配置加载机制

```javascript
// 页面自动从 CDN 加载配置
const config = await loadCampaignConfig();

// 缓存策略：
// - 首次加载：从 CDN 获取，存入 localStorage
// - 后续加载：优先使用 localStorage 缓存（5分钟内）
// - 5分钟后：重新从 CDN 拉取
```

---

## 2. 测试按钮

### 2.1 功能说明

页面右上角齿轮图标（`.test-mode-btn`）为开发和测试提供快速状态切换。

**生产环境注意**：部署前应隐藏或移除测试按钮。

### 2.2 测试选项清单

| 选项 | 功能 | 页面表现 |
|------|------|----------|
| **未登录** | 重置为访客状态 | VS 卡片 + "请先登录"提示 |
| **未进游戏** | 模拟已登录但未激活 | VS 卡片 + "下载游戏"提示 |
| **已进游戏** | 模拟已激活 | 显示阵营选择卡片 |
| **报名已截止** | 模拟倒计时结束 | 隐藏倒计时，显示"报名已截止" |
| **即将上线** | 皮肤状态：comingSoon | 占位图 + "即将揭晓"遮罩 |
| **已公开皮肤** | 皮肤状态：revealed | 正式图 + 原价，无购买按钮 |
| **开放销售中** | 皮肤状态：onSale | 正式图 + 折扣价 + 购买按钮 |
| **切换Q服结果** | 切换 heni/ricon 获胜 | 测试折扣价格显示变化 |
| **切换K服结果** | 切换 Sữa Chua/MiuMiu 获胜 | 测试折扣价格显示变化 |
| **皮肤发放结束** | 皮肤状态：eventEnded | 显示"活动已结束" |
| **已发放皮肤检查** | 皮肤状态：skinDelivered | 弹出"皮肤已发放"全屏弹窗 |

### 2.3 隐藏测试按钮

```css
/* 生产环境添加 */
.test-mode-btn {
  display: none !important;
}
```

---

## 3. Mock 数据替换清单

### 3.1 需要替换的 Mock 数据

| # | 位置 | 当前状态 | 替换方式 |
|---|------|----------|----------|
| 1 | `assets/overlord-preview.mp4` | 占位视频 | 替换为最终版霸主礼包宣传视频 |
| 2 | `Analytics.config.endpoint` | Mock API | 替换为正式数据上报接口 |
| 3 | `config.json` 加载地址 | 本地文件 | 替换为 CDN 地址 |
| 4 | 登录接口 | 前端模拟 | 接入正式登录 API |
| 5 | 支付接口 | 前端模拟 | 接入正式支付系统 |

### 3.2 无需替换的内容

| 资源 | 说明 |
|------|------|
| `warrior-gold.png` | 皮肤未公开时的占位图，正常使用 |
| `streamer-skin-*.png` | 4款主播皮肤最终图，已确认 |

---

## 4. 多语言配置

### 4.1 翻译文件结构

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

### 4.2 使用方法

**HTML 中使用：**
```html
<span data-i18n="streamers.加入阵营_3">Tham gia</span>
```

**JS 中使用：**
```javascript
const text = getTranslation('streamers.加入阵营_3');
```

### 4.3 添加新翻译

1. 在 `i18n.json` 中添加键值对：
```json
{
  "common": {
    "新键": {
      "vi": "越南语",
      "cn": "中文"
    }
  }
}
```

2. 在 HTML 元素上添加属性：
```html
<span data-i18n="common.新键">默认文本</span>
```

3. 刷新页面生效（无需修改 JS）

### 4.4 翻译确认工作流

**当前状态：越南语翻译为初稿，未经专业翻译确认。**

完整翻译流程：

```
┌─────────────┐     export      ┌─────────────────┐
│  i18n.json  │ ───────────────►│ i18n-for-translation.md │
│  (开发维护)  │                 │  (发送给翻译确认)        │
└─────────────┘                 └─────────────────┘
         ▲                                 │
         │         开发手动更新              │ 翻译标注修改
         └─────────────────────────────────┘
         │
         ▼
┌─────────────┐     embed       ┌─────────────┐
│  i18n.json  │ ───────────────►│ index.html  │
│  (更新后)    │                 │ (内嵌翻译)   │
└─────────────┘                 └─────────────┘
```

**操作步骤：**

1. **生成翻译文档**
   ```bash
   node i18n-tool.js export
   # 生成 i18n-for-translation.md
   ```

2. **发送给翻译**
   - 将 `i18n-for-translation.md` 发送给越南语翻译
   - 翻译在文档中标注修改建议（加粗/删除线/批注）

3. **更新翻译源文件**
   - 根据翻译返回的标注，手动修改 `i18n.json`
   - 注意：目前是开发手动同步，可考虑开发脚本自动导入

4. **同步到页面**
   ```bash
   node i18n-tool.js embed
   # 将 i18n.json 内容嵌入到 index.html
   ```

5. **验证并部署**
   - 刷新页面查看翻译效果
   - 确认无误后部署

### 4.5 当前翻译模块

| 模块 | 用途 |
|------|------|
| `common` | 通用文案（登录、下载、按钮等） |
| `streamers` | 阵营相关文案 |
| `skins` | 皮肤相关文案 |
| `rules` | 活动规则文案 |
| `modals` | 弹窗文案 |

---

## 5. 状态详解

### 5.1 用户状态

| 状态 | 条件 | 页面表现 |
|------|------|----------|
| 未登录 | `isLoggedIn = false` | VS 卡片 + 登录提示 |
| 已登录未激活 | `isLoggedIn = true, hasCharacter = false` | VS 卡片 + 下载提示 |
| 已激活未选阵营 | `hasCharacter = true, registrations = {q: null, k: null}` | 阵营选择卡片 |
| 已加入阵营 | `registrations.q or registrations.k` 不为 null | 已选状态 + Discord 入口 |

### 5.2 皮肤展示状态

见 [配置说明 - 皮肤状态](#皮肤状态-skinstate)

---

## 6. 数据埋点

### 6.1 事件清单

| 事件名 | 触发时机 | 数据字段 |
|--------|----------|----------|
| `page_view` | 页面加载 | `url`, `referrer`, `deviceType` |
| `login_click` | 点击登录按钮 | `position` |
| `login_success` | 登录成功 | `user_id`, `duration_ms` |
| `language_switch` | 切换语言 | `from`, `to` |
| `faction_join_click` | 点击加入阵营 | `server`, `streamer`, `status` |
| `faction_join_success` | 确认加入 | `server`, `streamer`, `join_position` |
| `discord_click` | 点击 Discord | `server`, `streamer` |
| `download_click` | 点击下载链接 | `source` |
| `purchase_initiate` | 点击购买 | `item_type`, `price_vnd` |
| `purchase_select_server` | 选择服务器 | `server` |
| `purchase_complete` | 支付完成 | `order_id`, `final_price` |

### 6.2 上报机制

```javascript
// 批量上报配置
const Analytics = {
  config: {
    endpoint: 'https://analytics.monster-lair.vn/collect', // Mock，需替换
    batchSize: 10,        // 满 10 条上报
    flushInterval: 30000  // 或每 30 秒上报
  }
};

// 失败重试：最多 3 次
// 用户标识：未登录使用 anonymous_id，登录后关联 user_id
```

### 6.3 调试方法

```javascript
// 查看队列状态
Analytics.getQueueStatus()
// {pending: 5, userId: "anon_xxx", sessionId: "sid_xxx"}

// 强制上报
Analytics.flush()
```

---

## 7. 本地开发

### 7.1 启动命令

```bash
# 进入项目目录
cd src/campaign/pages/streamer-dropin

# 安装依赖（可选，用于 serve）
npm install

# 启动本地服务器
npm run serve
# 或
python3 -m http.server 8080

# 访问 http://localhost:8080
```

### 7.2 构建命令

```bash
# 构建生产包
npm run build

# 输出到 dist/streamer-dropin/
```

---

## 8. 部署检查清单

- [ ] `config.json` 已上传到 CDN
- [ ] `overlord-preview.mp4` 已替换为最终版
- [ ] 数据上报 API 地址已替换为正式接口
- [ ] 测试按钮已隐藏（`.test-mode-btn { display: none }`）
- [ ] 登录/支付接口已接入正式系统
- [ ] 所有静态资源已上传 CDN
