# AGENTS.md

> **规则生效标识**: 本文件agents.md规则已被读取并应用于当前任务。

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
| 双语锚定 | 专业术语首次出现标注英文原词，如"检索增强生成 (Retrieval-Augmented Generation, RAG)" |

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
| 引用追溯规范 | 全局参数`[引用:AGENTS.md#章节.参数名]`，跨项目`[引用:编号/路径]`，外部文档`[引用:文档路径#章节]` |
| 规则继承 | 进入项目目录时，自动先读取根目录`AGENTS.md`，再读取项目`claude.md` |

## 6. 图片描述规范

图片特征提取使用 YAML 结构，字段定义如下：

| 字段 | 类型 | 说明 |
|------|------|------|
| `image.id` | string | 唯一标识 |
| `image.source` | string | 文件路径 |
| `image.dimensions` | [w, h] | 像素尺寸 |
| `image.content.type` | string | 主类型：scene/character/prop/ui/map/concept |
| `image.content.subject` | string | 主体描述 |
| `image.elements[].id` | string | 元素标识 |
| `image.elements[].type` | string | 元素类型：text/shape/icon/sprite/panel/button/progress_bar/particle |
| `image.elements[].position` | [x, y] | 归一化坐标 [0.0-1.0] |
| `image.elements[].bounds` | [x, y, w, h] | 边界框 |
| `image.elements[].style.color_fg` | #RRGGBB | 前景色 |
| `image.elements[].style.color_bg` | #RRGGBB | 背景色 |
| `image.elements[].text.content` | string | 文字内容 |
| `image.elements[].value.current` | number | 当前数值 |
| `image.elements[].value.max` | number | 最大数值 |
| `image.elements[].state` | string | 状态：normal/hover/active/disabled/warning/error |
| `image.hierarchy[].parent` | string | 父元素ID |
| `image.hierarchy[].children` | [string] | 子元素ID列表 |
| `image.spatial[].relation` | string | 空间关系：contains/left_of/right_of/above/below/overlaps |

## 7. 文档索引

| 文档路径 | 内容描述 |
|---------|---------|
| `docs/core-game.md` | 核心游戏设定：世界观、系统、操作、数值 |
| `docs/guild-leader.md` | 团长运营手册：PVP 运营、宣战流程、GM 活动 |
| `docs/design-system.yaml` | **设计系统规范** [引用:docs/design-system.yaml]：配色、字体、组件、动效等全项目设计参考 |

### 7.1 设计系统使用指南

当创建新的活动页面或 H5 推广页时，参考 [引用:docs/design-system.yaml]：

```yaml
# 在 prompt 中引用设计系统
design_reference: "[引用:docs/design-system.yaml]"
requirements:
  - "使用 design-system 中定义的配色方案"
  - "使用 design-system 中定义的字体搭配"
  - "遵循 design-system 中的组件规范"
  - "默认语言: vi (越南文)，支持 cn (中文) 切换"
```

**关键设计要素**：
- **视觉风格**: 史前丛林游戏风 (Prehistoric Jungle Gaming)
- **主色调**: 金色 (#FFD700) 用于奖励和 CTA
- **背景色**: 深绿丛林 (#0a1a15) + 青绿雾气 (#4a9a8a)
- **字体**: Cinzel (标题) + Inter (正文) + JetBrains Mono (代码)
- **卡片**: 玻璃态效果 (glassmorphism) + 模糊背景
- **按钮**: 药丸形状 (pill) + 金色渐变

## 8. 数据源

| 名称 | 地址 | 说明 |
|------|------|------|
| 恐龙岛日报数据 | https://monsteraccount.yuemei.info//dailyReport/a3a6e45d778a40f084aa18a296fc57b6 | 注册量、新增、日活、留存率等核心指标 |

## 8. claude.md 生成规范

### 8.1 强制标识规则

每生成一个新的 `claude.md` 文件，必须在文件头部（`# claude.md` 之后）添加规则生效标识：

```markdown
# claude.md

> **规则生效标识**: 本文件规则 [引用:projects/{编号}-{名称}/claude.md] 已被读取并应用于当前任务。

## 项目信息
```

### 8.2 标识格式

| 元素 | 格式 | 示例 |
|------|------|------|
| 标识语法 | `> **规则生效标识**: 本文件规则 [引用:路径] 已被读取并应用于当前任务。` | `> **规则生效标识**: 本文件规则 [引用:projects/002-meetings/claude.md] 已被读取并应用于当前任务。` |
| 位置 | 文件第 2-3 行，紧跟标题之后 | 不允许放在文件末尾或中间 |
| 引用路径 | 使用相对根目录的完整路径 | `projects/001-growNewUsers/claude.md` |

### 8.3 响应话术

当读取并采用任一 `claude.md` 规则时，在输出内容头部响应：

```
> **已采用规则**: [引用:projects/{编号}-{名称}/claude.md]
```

