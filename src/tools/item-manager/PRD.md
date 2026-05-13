> **这是什么**: 恐龙岛道具管理中心 (Item Manager) 的产品需求文档 (PRD)
> **谁应该读**: 产品经理、前端开发、后端开发、运营人员
> **最后更新**: 2026-05-11
> **依赖文档**: docs/frontend-guidelines.md、docs/design-system.yaml
> **状态**: 生效中
>
> ---

# 道具管理中心 PRD

## 1. 背景与目标

### 1.1 解决的问题

- 运营人员缺乏统一的道具发放/使用监控后台
- 道具使用状态无法实时感知跨服务器冲突
- 公告发布流程无审核节点，存在误操作风险

### 1.2 目标用户

| 角色 | 职责 | 使用场景 |
|------|------|----------|
| 运营人员 (Operator) | 监控道具状态、发布公告 | 日常运营、活动配置 |
| 前端玩家 (Player) | 使用道具改变游戏环境 | 天气卡、时间卡、体型变化卡 |
| 服务端 (Server) | 校验权限、持久化状态 | 道具扣减、锁竞争仲裁 |
| 构建脚本 (Build Script) | 源码同步、版本打包 | projects/ → src/ → dist/ |

### 1.3 成功指标

- 道具使用 → 状态生效延迟 < 1s（本地模拟）
- 跨服务器冲突感知延迟 < 15s
- 公告审核 → 发布全流程 < 5min（模拟）

### 1.4 约束条件

- 无真实后端 API，所有服务端交互为客户端模拟
- 状态持久化依赖浏览器 localStorage，按服务器隔离
- 默认语言为越南语 (vi)，支持中文 (cn) 切换
- 栈：Vanilla HTML/CSS/JS，无框架依赖

---

## 2. 参与方定义 (Actor Definition)

| 参与方 | 标识 | 职责 |
|--------|------|------|
| 玩家/运营 (Player/Operator) | Player | 触发道具使用、查看状态、发布公告 |
| 前端页面 (Frontend) | Frontend | 渲染 UI、响应用户输入、显示倒计时/冲突提示 |
| 前端脚本 (Frontend Script) | Script | ItemManager 类，管理状态、模拟服务端请求、跨标签同步 |
| 模拟服务端 (Mock Server) | Server | simulateServerUse() / simulateServerPoll()，模拟网络延迟与错误 |
| 构建脚本 (Build Script) | Pipeline | python3 build/pipeline.py item-manager |

---

## 3. 核心流程时序图

### 3.1 道具使用通用流程（天气卡 / 时间卡 / 时间流动卡 / 体型变化卡）

**流程说明**：
1. 玩家点击「使用」按钮
2. 前端脚本执行本地校验：库存 > 0？
3. 检查 globalLocks 是否存在冲突（同类型道具互斥）
4. 检查跨类型互斥（time 与 flow 互斥）
5. 调用 simulateServerUse(type) 模拟服务端请求（延迟 500-1000ms）
6. 服务端返回成功：扣减库存 → 写入 globalLocks → 添加历史记录 → 渲染 UI
7. 服务端返回失败：根据错误码显示对应 Toast，不扣库存

**参数约定**：

| 步骤 | 函数 | 输入参数 | 输出结果 |
|------|------|----------|----------|
| 1 | useWeatherCard() / useTimeCard() / useFlowCard() / useDinoSizeCard(sizeType) | 无 / selected / 无 / sizeType | — |
| 2 | 库存校验 | inventory[type] > 0 | boolean |
| 3 | checkConflict(type) | type: weather/time/flow/dinoSize | lock 对象或 null |
| 5 | simulateServerUse(type) | type | { success, code? } |
| 6 | saveUser() + saveState() | — | localStorage 持久化 |

### 3.2 体型变化卡专用流程

**流程说明**：
- 三种道具（+50% / +100% / -50%）共享一个 dinoSize 锁
- sizeType 与 inventoryKey 映射：
  - grow50 → dinoGrow50 → scale(1.5)
  - grow100 → dinoGrow100 → scale(2.0)
  - shrink50 → dinoShrink50 → scale(0.5)
- 同一时刻只能存在一种体型变化
- 其他玩家不感知体型变化冲突（恐龙变大不冲突设计）

**参数约定**：

| sizeType | inventoryKey | CSS transform | 状态文案（中） | 状态文案（越） |
|----------|--------------|---------------|----------------|----------------|
| grow50 | dinoGrow50 | scale(1.5) | 体型已增大50%！ | Đã tăng kích thước 50%! |
| grow100 | dinoGrow100 | scale(2.0) | 体型已翻倍！ | Đã tăng gấp đôi kích thước! |
| shrink50 | dinoShrink50 | scale(0.5) | 体型已缩小50%！ | Đã giảm 50% kích thước! |

### 3.3 公告审核发布流程

**流程说明**：
1. 运营输入公告内容 → 点击「提交审核」
2. 校验内容非空 + 公告卡库存 > 0
3. 扣除库存 → announcements.unshift({ status: 'pending_review' })
4. 渲染 4 步审核流程（提交 → 审核 → 待发送 → 已发送）
5. 模拟审核：3-8s 后自动将 status 改为 'approved'
6. 显示「发送」按钮，运营手动点击后才变为 'sent'
7. 写入历史记录 → 4s 后自动清空用户公告列表

**状态流转**：

```
pending_review → approved → sent → (4s 后删除)
```

**参数约定**：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | generateId() 生成 |
| content | string | 公告内容，最大 200 字符 |
| status | string | pending_review / approved / sent |
| submitTime | number | 提交时间戳 |
| approveTime | number | 审核通过时间戳 |
| sendTime | number | 发送时间戳 |

### 3.4 登录过期 Mock 流程

**流程说明**：
1. 运营点击 🧪 打开调试面板
2. 勾选「模拟登录过期」→ localStorage.setItem('itemManager_mockExpired', '1')
3. 刷新页面 → checkAuth() 检测到标志
4. 显示 auth-banner（红色横幅）：🔒 您的登录已过期，请重新登录
5. 隐藏 #content（玩家信息、背包、历史等敏感内容）
6. 点击「重新登录」→ 清除标志 → location.reload()

**参数约定**：

| 字段 | 类型 | 说明 |
|------|------|------|
| itemManager_mockExpired | string | '1' 表示模拟过期，其他值或不存在表示正常 |
| itemManager_token | string | 真实登录令牌（当前演示模式不校验） |

### 3.5 跨服务器感知流程（simulateServerPoll）

**流程说明**：
1. 每 8-15s 轮询一次
2. 30% 概率触发其他服务器玩家使用道具
3. 通过 localStorage 跨标签/跨服务器写入状态
4. 当前页面收到 Toast 通知 + 面板刷新

**参数约定**：

| 参数 | 值 |
|------|-----|
| 轮询间隔 | 8000-15000ms（随机） |
| 触发概率 | 30% |
| 模拟服务器 | s1, s2, s3 |
| 模拟道具类型 | weather, time, flow（不含 dinoSize） |
| 冲突持续时间 | 30 分钟（flow 为 60 分钟） |



---

## 4. 数据模型

### 4.1 globalLocks 全局锁

```javascript
globalLocks: {
    weather: {
        userId: string,      // 使用者玩家ID
        username: string,    // 使用者昵称（越）
        usernameCn: string,  // 使用者昵称（中）
        startTime: number,   // 毫秒时间戳
        endTime: number,     // startTime + USE_DURATION (5min)
        detail: string,      // 原始选项值
        detailName: string   // 本地化显示名称
    },
    time: { /* 同 weather 结构 */ },
    flow: {
        userId: string,
        username: string,
        usernameCn: string,
        startTime: number,
        endTime: number,     // startTime + FLOW_DURATION (60min)
        detail: 'flow',
        gameTimeBase: 1200   // 12:00 HHMM，时间流动基准
    },
    dinoSize: {
        userId: string,
        username: string,
        usernameCn: string,
        startTime: number,
        endTime: number,
        sizeType: string,    // grow50 / grow100 / shrink50
        detail: string,
        detailName: string   // +50% / +100% / -50%
    }
}
```

### 4.2 库存 (inventory)

```javascript
inventory: {
    weatherCard: number,      // 天气卡库存，默认 3
    timeCard: number,         // 时间卡库存，默认 3
    announcementCard: number, // 公告卡库存，默认 3
    flowCard: number,         // 时间流动卡库存，默认 3
    dinoGrow50: number,       // 体型+50% 库存，默认 3
    dinoGrow100: number,      // 体型+100% 库存，默认 2
    dinoShrink50: number      // 体型-50% 库存，默认 3
}
```

### 4.3 历史记录 (history)

```javascript
history: [
    {
        id: string,           // 唯一标识 generateId()
        type: string,         // weather / time / flow / dinoGrow50 / dinoGrow100 / dinoShrink50 / announcement
        userId: string,
        username: string,
        usernameCn: string,
        detail: string,       // 详情描述
        startTime: number,    // 开始时间戳
        endTime: number,      // 结束时间戳
        status: string        // active / completed
    }
]
```

---

## 5. 异常处理

| 异常场景 | 触发条件 | 前端表现 | 处理方式 |
|----------|----------|----------|----------|
| 库存不足 | inventory[type] <= 0 | Toast: 道具不足（红色） | 禁用按钮，阻止请求 |
| 冲突占用 | globalLocks[type] 存在且未过期 | Toast: 其他玩家正在使用（黄色） | 显示冲突横幅，显示剩余时间 |
| 跨类型互斥 | time 与 flow 同时请求 | Toast: 时间卡/流动卡互斥（黄色） | 阻止第二个道具使用 |
| 服务端冲突 | mockError = CONFLICT | Toast: 服务端返回冲突（黄色） | 不扣库存，提示重试 |
| 道具数量不足 | mockError = NO_ITEM | Toast: 道具数量不足（红色） | 不扣库存 |
| 系统异常 | mockError = SYSTEM_ERROR / 网络错误 | Toast: 系统错误，请联系管理员（红色） | 兜底提示，不暴露内部错误 |
| 登录过期 | mockExpired = 1 或 token 缺失 | 显示 auth-banner，隐藏敏感内容 | 提示重新登录并刷新页面 |

---

## 6. 构建与部署流程

```
开发者
  │
  ▼
编辑源码 projects/003-运营/003-xx-道具管理/
  │
  ▼
python3 build/pipeline.py item-manager
  │
  ▼
同步到 src/tools/item-manager/
  │
  ▼
git add src/tools/item-manager/ && git commit && git push
  │
  ▼
GitHub Pages 自动部署
  │
  ▼
https://covetworld-png.github.io/dinoisland/src/tools/item-manager/index.html
```

| 步骤 | 命令 | 说明 |
|------|------|------|
| 源码编辑 | vim projects/003-运营/003-xx-道具管理/ | 开发工作区 |
| 同步到 src | python3 build/pipeline.py item-manager | projects/ → src/tools/item-manager/ |
| 提交发布 | git add src/tools/item-manager/ && git commit && git push | 仅提交 src/ 目录 |
| 访问地址 | https://covetworld-png.github.io/dinoisland/... | GitHub Pages |

---

## 7. 视觉反馈参数

| 道具类型 | 视觉元素 | 激活状态 | 失效状态 |
|----------|----------|----------|----------|
| 天气卡 | 天气图标 + 背景色 | 显示选中天气效果 | 恢复默认 |
| 时间卡 | 天空渐变 + 太阳/月亮位置 | updateSky(hh, mm) | 恢复 12:00 |
| 时间流动 | flow-sky 区域 + 时间数字 | 每秒递增，金色边框发光 | 停止，恢复静态 |
| 体型+50% | dino-character transform | scale(1.5)，金色光环 | scale(1)，正常 |
| 体型+100% | dino-character transform | scale(2.0)，金色光环 | scale(1)，正常 |
| 体型-50% | dino-character transform | scale(0.5)，蓝色光环 | scale(1)，正常 |

---

## 变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-05-11 | 初始版本：道具使用、体型变化、公告审核、登录过期 Mock、构建流程 |
