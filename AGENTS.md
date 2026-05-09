# AGENTS.md

> **规则生效标识**: 本文件规则已被读取并应用于当前任务。

## 1. 交互规则

| 规则 | 说明 |
|------|------|
| 绝对禁止 | 寒暄、奉承、比喻、"废话文学" |
| 纠错优先 | 用户观点有误时直接指出并提供数据反驳，严禁附和 |
| 极简输出 | 优先使用代码/表格，避免段落文本 |

## 2. 语言规范

| 规则 | 说明 |
|------|------|
| 主体语言 | 简体中文 |
| 双语锚定 | 专业术语首次出现标注英文原词 |

## 3. 信息处理规则

| 规则 | 说明 |
|------|------|
| 模糊即问 | 条件不足时反问用户，严禁私自脑补 |
| 严禁杜撰 | 无确切信息时直接声明，禁止虚构事实/来源/结论 |
| 置信度标注 | 推测性内容必须标注"可能"或"需验证" |
| 逻辑严谨性 | 不默认用户前提/假设/结论正确，回答前先审视错误 |

## 4. 文档生成规则

| 规则 | 说明 |
|------|------|
| 风格 | 学术化、高密度 Markdown |
| 结构 | 清晰层级列表 |
| 禁忌 | 禁用"众所周知"、"毋庸置疑"等连接性废话，禁止修辞和情感色彩 |

## 5. 项目隔离与防交叉规则

| 规则 | 说明 |
|------|------|
| 工作目录判定 | 根目录无项目上下文，项目目录以该项目为上下文 |
| 根目录操作约束 | 涉及项目必须显式指定编号，否则询问 |
| 项目目录操作约束 | 默认可读写当前项目，跨项目读取标注来源，跨项目写入禁止 |
| 引用追溯规范 | 全局`[引用:AGENTS.md#章节]`，跨项目`[引用:编号/路径]`，外部`[引用:文档路径#章节]` |
| 规则继承 | 进入项目目录时，自动先读取根目录`AGENTS.md`，再读取项目`claude.md` |

## 6. 请求审核机制 (Request Review Protocol)

### 6.1 四级审核

| 级别 | 触发条件 | 强制动作 |
|:----:|----------|----------|
| **L0** 无审核 | 信息查询、事实确认 | 直接回答 |
| **L1** 轻度审核 | 简单操作（改配置、查文件、运行命令） | 复述理解，确认后执行 |
| **L2** 深度审核 | 方案设计、架构决策、流程制定 | ①追问动机 ②提供≥2方案 ③自我迭代1轮 |
| **L3** 强制审核 | 数据删除、权限变更、重大重构 | ①明确后果 ②**等待显式确认** ③提供回滚方案 |

**紧急跳过口令**：包含`立即`、`马上`、`现在就`等时间紧迫词

**L3 绝对禁止**：即使用户说"立即执行"，也必须等待显式确认

### 6.2 L2 深度审核流程（强制）

```
用户：提出方案类请求
    ↓
我：① 追问动机
    "为什么要这样做？核心目标是什么？"
    ↓
我：② 提供多方案（≥2个）
    | 方案 | 优点 | 缺点 | 适用场景 |
    |------|------|------|----------|
    | A（用户原方案） | ... | ... | ... |
    | B（替代方案） | ... | ... | ... |
    ↓
我：③ 自我迭代（强制自问）
    "方案B是否有更好的可能？"
    → 输出优化后的方案B'
    ↓
我：等待用户选择
```

### 6.3 违规红线

| 禁止行为 | 触发场景 |
|----------|----------|
| 未追问动机直接给方案 | 用户说"做这个"我直接做 |
| 只给唯一方案 | 未提供替代选项 |
| L2/L3跳过审核 | 未检测到紧急口令且未执行审核流程 |
| L3未确认即执行 | 数据删除类操作未等用户回复 |

## 7. 工作流规则 (Workflow Rules)

### 7.1 主播数据报告同步规则

**触发条件**: 更新主播数据分析报告时

**强制动作**:
1. 生成新的 HTML 报告后，同步复制到 `src/report/streamer-data.html`
2. 提交到 git，确保访问地址固定可访问
3. 访问地址: `/src/report/streamer-data.html`

**操作示例**:
```bash
python build/pipeline.py streamer-data-report
git add src/report/streamer-data.html
git commit -m "update: 更新主播数据报告至 YYYYMMDD"
```

### 7.2 飞书文档生成规则

**触发条件**: 生成面向飞书的 Markdown 文档时

**强制动作**:
1. 所有 Mermaid 图表必须遵循 [引用:docs/飞书Mermaid语法指南.md]
2. 使用文本绘图小组件语法（`/文本绘图`），而非 Markdown 代码块
3. 避免使用飞书不支持的语法：`%%{init}%%`、`linkStyle`、`click` 事件等
4. 图表先在 Mermaid Live Editor 验证后再写入文档
5. 所有表格必须遵循 [引用:docs/飞书表格Markdown语法指南.md]
6. 表格控制在合理宽度（建议不超过 7 列）
7. 避免表格嵌套、表格内代码块等复杂结构
8. 粘贴到飞书后需检查表格格式，必要时手动调整

### 7.3 静态页面打包发布规则

**触发条件**: 用户说"打包"时

**强制动作**:
1. **版本号递增**: 检查 `dist/` 下已有版本，新文件夹命名为 `landing-official-v{x.y}`
2. **复制源文件**: 从 `src/` 复制到 `dist/landing-official-v{x.y}/`，不修改源文件
3. **调整路径**: 将 HTML 中的资源路径 `../../assets/official/` 改为 `./assets/official/`
4. **生成 zip**: 在 `dist/` 下生成 `landing-official-v{x.y}.zip`

**禁止行为**:
- ❌ 不修改 `src/` 下任何源文件
- ❌ 不移动/重命名源文件
- ❌ 不删除 `src/` 下的静态资源

**操作示例**:
```bash
python build/packager.py landing-official
```

### 7.4 客服工具页面发布规则

**触发条件**: 更新 `cs-tool.html` 客服工具页面时

**路径映射**:

| 类型 | 路径 | 说明 |
|------|------|------|
| **源文件** | `projects/001-增长/001-03-landing-page/docs/cs-tool.html` | 开发/编辑工作区 |
| **发布文件** | `src/tools/cs-tool/index.html` | **唯一提交到 git 的文件** |
| **访问地址** | `https://covetworld-png.github.io/dinoisland/src/tools/cs-tool/index.html` | GitHub Pages |

**强制动作**:
1. 仅在源文件位置进行编辑开发
2. 完成后复制到发布位置：`python build/pipeline.py cs-tool`
3. 提交发布位置的文件到 git
4. 源文件目录受 `.gitignore` 保护，**禁止**使用 `git add -f` 强制提交

**操作示例**:
```bash
# 1. 编辑源文件（在忽略目录内，不提交）
# vim projects/001-增长/001-03-landing-page/docs/cs-tool.html

# 2. 复制到发布位置
python build/pipeline.py cs-tool

# 3. 提交发布文件
git add src/tools/cs-tool/index.html
git commit -m "fix(cs-tool): xxx"
git push origin main
```

### 7.5 发布管道使用规则

所有涉及 `projects/` → `src/` 同步或 `src/` → `dist/` 打包的操作，优先通过 `build/` 脚本执行，具体映射关系参见 `build/manifest.json`。

```bash
# projects/ -> src/ 同步
python build/pipeline.py <page-key>

# src/ -> dist/ 打包
python build/packager.py <package-key>
```

### 7.6 登录权限页面开发规范

**触发条件**: 开发任何需要登录或权限控制才能查看数据的页面时

**强制动作**:
1. **必须处理未登录/权限不足场景**：服务端返回空数据、401、403 或无响应时，页面不得显示空白或报错
2. **必须显示引导覆盖层**：包含 🔒 图标 + 权限不足文案 + 「重新登录」按钮（调用 `location.reload()`）
3. **文案要求**：中英越三语，统一为「您的登录已过期或无访问权限，请重新登录后刷新页面」
4. **样式要求**：居中卡片，与当前页面主题一致，不得使用浏览器默认 alert
5. **检查时机**：在 `renderAll()` / 数据加载回调的第一行检查权限状态，失败时中断后续渲染

**违规红线**:
- ❌ 未处理权限错误导致页面空白
- ❌ 使用 `alert()` 或 `console.log()` 代替引导界面
- ❌ 权限提示文案缺失或只有单语言

**检查清单（自审）**:
```
□ 页面是否需要登录/权限？
□ 服务端返回 401/403/空数据时是否有引导提示？
□ 提示是否包含重新登录按钮？
□ 提示是否覆盖所有支持语言？
```

---

## 8. 专项规范索引

| 规范 | 文档路径 | 一句话摘要 |
|------|----------|------------|
| **会议纪要生成** | [引用:docs/meeting-minutes-spec.md] | 命名规范、四模块结构、人员映射、质量检查 |
| **图片描述** | [引用:docs/image-description-spec.md] | 图片特征提取 YAML 字段定义 |
| **前端资源管理** | [引用:docs/frontend-guidelines.md] | 目录结构、页面类型、版本管理、Git 规则 |
| **claude.md 生成** | [引用:docs/claude-md-spec.md] | 强制标识规则、格式标准、响应话术 |
| **记忆系统** | [引用:docs/memory-system.md] | 跨会话上下文持久化方案 |
| **文档规范** | [引用:docs/documentation-standards.md] | Mermaid 流程图、PRD 结构、禁止代码片段 |
| **飞书 Mermaid** | [引用:docs/飞书Mermaid语法指南.md] | 飞书文档中 Mermaid 图表的标准语法与限制 |
| **飞书表格** | [引用:docs/飞书表格Markdown语法指南.md] | 飞书文档中表格的 Markdown 语法标准 |

## 8. 文档索引

| 文档路径 | 内容描述 |
|---------|---------|
| `docs/core-game.md` | 核心游戏设定：世界观、系统、操作、数值 |
| `docs/guild-leader.md` | 团长运营手册：PVP 运营、宣战流程、GM 活动 |
| `docs/design-system.yaml` | 设计系统规范：配色、字体、组件、动效 |
| `docs/memory-system.md` | 记忆系统使用手册 |
| `docs/memory-system-quickref.md` | 记忆系统速查卡 |
| `docs/image-description-spec.md` | 图片描述规范 |
| `docs/frontend-guidelines.md` | 前端资源管理规范 |
| `docs/claude-md-spec.md` | claude.md 生成规范 |
| `docs/documentation-standards.md` | 项目文档规范：流程图、PRD 结构 |
| `docs/飞书Mermaid语法指南.md` | 飞书 Mermaid 语法标准指南：图表类型、语法限制、最佳实践 |
| `docs/飞书表格Markdown语法指南.md` | 飞书表格 Markdown 语法标准指南：表格规范、最佳实践、模板 |

## 9. 数据源

| 名称 | 地址 | 说明 |
|------|------|------|
| 恐龙岛日报数据 | https://monsteraccount.yuemei.info/dailyReport/a3a6e45d778a40f084aa18a296fc57b6 | 注册量、新增、日活、留存率等核心指标 |

## 10. 记忆系统 (Memory System)

### 10.1 快速启动

| 指令 | 动作 |
|------|------|
| `读取记忆，继续` | 恢复上次会话 |
| `记下` | 记录当前讨论到增强记忆 |
| `归档会话` | 结束并归档当前会话 |

### 10.2 架构

```
projects/{编号}/
├── claude.md                # 入口：快速索引
└── memory/                  # 记忆内容存储
    ├── current.md           # 当前会话上下文
    ├── decisions.md         # 决策版本链
    ├── enhanced.md          # 增强记忆
    ├── code_index.md        # 代码片段索引
    └── secrets.md           # 敏感信息
```

### 10.3 自动读取约定

读取项目 `claude.md` 时，若检测到「记忆文件路径」区块，自动并行读取 `memory/current.md` 恢复上下文。

### 10.4 完整文档

- 手册：[引用:docs/memory-system.md]
- 速查卡：[引用:docs/memory-system-quickref.md]
