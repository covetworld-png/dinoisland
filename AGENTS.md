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

> 业务特定的工作流（主播报告、飞书文档、客服工具、登录权限）详见 [引用:docs/workflow-rules.md]。本节只保留通用规则。

### 7.1 静态页面打包发布规则

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

### 7.2 发布管道使用规则

所有涉及 `projects/` → `src/` 同步或 `src/` → `dist/` 打包的操作，优先通过 `build/` 脚本执行，具体映射关系参见 `build/manifest.json`。

```bash
# projects/ -> src/ 同步
python build/pipeline.py <page-key>

# src/ -> dist/ 打包
python build/packager.py <package-key>
```

### 7.3 Git 提交保护规则

**触发条件**: 任何已同步到 `src/` 目录的项目文件发生修改时

**强制动作**:
1. 每次修改并同步到 `src/` 后，**必须**执行 `git add` + `git commit` 到本地仓库
2. Commit message 格式: `<type>(<scope>): <描述>`
3. **`git push` 必须等待显式指令**，禁止自主 push
4. 提交前检查清单：
   - `git status` 确认只包含预期文件
   - 确认未包含受 `.gitignore` 保护的源文件目录

**违规红线**:
- ❌ 修改 `src/` 后未 commit，导致后续回滚操作丢失全部工作
- ❌ 未经确认自主 `git push`
- ❌ 使用 `git add -f` 强制添加 `.gitignore` 目录内的文件

**操作示例**:
```bash
# 1. 修改源文件 + 同步到 src/
cp projects/003-运营/003-xx-道具管理/js/main.js src/tools/item-manager-v2/js/main.js

# 2. 本地提交（必须）
git add src/tools/item-manager-v2/js/main.js
git commit -m "fix(item-manager-v2): xxx"

# 3. 等待用户指令后再 push（禁止自主执行）
# git push origin main   ← 必须等待用户说 "push"
```

### 7.4 游戏数据更新工作流

**触发条件**: 用户要求在 `docs/` 下新增或修改游戏数据

**动作**: 修改 `docs/game-data-summary.md` → 执行 `python build/update-game-data.py` → `git commit`（push 需用户显式确认）

**详情**: 参见 [docs/game-data-update-workflow.md](docs/game-data-update-workflow.md)

---

## 8. 数据库查询信息

> **⚠️ 密码位置**：`memory/secrets.md`（`.gitignore` 保护，禁止提交）

### 8.1 连接信息

| 字段 | 值 |
|------|-----|
| Host | `106.75.213.178` |
| Port | `13307` |
| 数据库 | `monster_test` |
| 用户名 | `robo` |
| 权限 | 只读（SELECT, REFERENCES, SHOW VIEW） |

### 8.2 表结构与字典

| 位置 | 说明 |
|------|------|
| `data/DBSQL/schemas/monster_test.md` | 自动采集的表结构文档 |
| `data/DBSQL/dicts/` | ID 字典表（道具、服务器、渠道、公会等） |
| `data/DBSQL/RULES.md` | SQL 编写规范、权限边界、大表 LIMIT 规则 |
| `data/DBSQL/SQL_KNOWLEDGE.md` | 小号判定、击杀因果链、用户身份查询等分析规则 |

### 8.3 分析任务触发规则

涉及 `data/DBSQL/` 下的 SQL 分析任务，自动查阅：
- `[引用:data/DBSQL/README.md#分析场景触发规则]`
- `[引用:data/DBSQL/SQL_KNOWLEDGE.md]`

---

## 9. 文档与规范索引

| 文档路径 | 类型 | 内容描述 |
|---------|------|---------|
| `docs/api-testing-methodology.md` | 规范 | 双层验证模型：批量脚本筛查 + 浏览器控制台根因确认 |
| `docs/meeting-minutes-spec.md` | 规范 | 命名规范、四模块结构、人员映射、质量检查 |
| `docs/image-description-spec.md` | 规范 | 图片特征提取 YAML 字段定义 |
| `docs/frontend-guidelines.md` | 规范 | 目录结构、页面类型、版本管理、Git 规则 |
| `docs/claude-md-spec.md` | 规范 | 强制标识规则、格式标准、响应话术 |
| `docs/memory-system.md` | 规范 | 跨会话上下文持久化方案 |
| `docs/memory-system-quickref.md` | 规范 | 记忆系统速查卡 |
| `docs/documentation-standards.md` | 规范 | Mermaid 流程图、PRD 结构、禁止代码片段 |
| `docs/飞书Mermaid语法指南.md` | 规范 | 飞书文档中 Mermaid 图表的标准语法与限制 |
| `docs/飞书表格Markdown语法指南.md` | 规范 | 飞书文档中表格的 Markdown 语法标准 |
| `docs/llm-coding-behavior.md` | 规范 | LLM 编码行为准则：思考、简洁、精准、目标驱动 |
| `docs/feishu-cli-guide.md` | 规范 | 飞书 CLI 跨项目快速调用速查：Skill 列表、命令模板、权限清单 |
| `docs/analytics-sdk-spec.md` | 规范 | 前端打点 SDK 接入规范：字段精简、ext 长度控制、事件类型定义 |
| `docs/core-game.md` | 参考 | 核心游戏设定：世界观、系统、操作、数值 |
| `docs/guild-leader.md` | 参考 | 团长运营手册：PVP 运营、宣战流程、GM 活动 |
| `docs/design-system.yaml` | 参考 | 设计系统规范：配色、字体、组件、动效 |

## 10. 数据源

| 名称 | 地址 | 说明 |
|------|------|------|
| 恐龙岛日报数据 | https://monsteraccount.yuemei.info/dailyReport/a3a6e45d778a40f084aa18a296fc57b6 | 注册量、新增、日活、留存率等核心指标 |

> **DBSQL 分析任务触发规则**：涉及 `data/DBSQL/` 下的 SQL 分析、小号识别、击杀关系、昵称查询等任务，自动查阅 `[引用:data/DBSQL/README.md#分析场景触发规则]` 和 `[引用:data/DBSQL/SQL_KNOWLEDGE.md]`。

## 11. 记忆系统 (Memory System)

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
