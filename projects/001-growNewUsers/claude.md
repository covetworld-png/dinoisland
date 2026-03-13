# claude.md

> **规则生效标识**: 本文件规则 [引用:projects/001-growNewUsers/claude.md] 已被读取并应用于当前任务。

## 项目信息

| 项目 | 内容 |
|------|------|
| 编号 | 001 |
| 名称 | growNewUsers |
| 用途 | 新增用户相关方案 |
| 创建时间 | 2026-03-12 |

## 目录结构

```
📁 001-growNewUsers/
├── 📄 claude.md                     ← 本文件（项目级规则）
├── 📁 [父项目编号]-[子项目编号]-[名称]/  ← 子项目目录
│   ├── 📄 README.md                 ← 子项目说明
│   ├── 📄 claude.md                 ← 子项目上下文（可选）
│   ├── 📁 docs/                     ← 产品文档
│   ├── 📁 designs/                  ← 设计稿
│   └── 📁 frontend/                 ← 前端页面（HTML+CSS+JS）
│       ├── 📁 css/
│       ├── 📁 js/
│       ├── 📁 assets/
│       └── 📄 index.html
└── 📁 shared/                       ← 子项目间共享资源（可选）
    ├── 📁 assets/                   ← 图片/字体等
    └── 📁 components/               ← 公共组件
```

## 边界约束

| 规则 | 说明 |
|------|------|
| **禁止根目录建文档** | 所有文档必须建立在子项目下 |
| **子项目自治** | 每个子项目独立管理自己的产品文档、设计稿、前端页面 |
| **静态资源分离** | 前端使用 HTML+CSS+JS 结构，CSS/JS 按目录分离 |
| **子项目编号** | 两位数自增，格式：`[父项目编号]-[子项目编号两位数]-[名称]`，如 `001-01-referral-activity` |

## 子项目创建流程

1. 用户提出新方案需求
2. AI 在 `001-growNewUsers/` 下创建子目录
3. 子目录内自动生成标准结构
4. 子项目 `claude.md` 记录该方案专属上下文

## 前端规范

| 类型 | 路径 | 说明 |
|------|------|------|
| 入口 | `frontend/index.html` | 单页或多页入口 |
| 样式 | `frontend/css/` | 按模块拆分，禁止内联样式 |
| 脚本 | `frontend/js/` | 按功能拆分，模块化组织 |
| 资源 | `frontend/assets/` 或 `shared/assets/` | 图片、字体等 |

## 当前目标

[待填充]

## 待办事项

- [ ]

## 跨项目引用

### 设计系统

| 资源 | 路径 | 说明 |
|------|------|------|
| 恐龙岛设计系统 | [引用:projects/001-growNewUsers/001-01-referral-activity/docs/design-system.yaml] | 游戏活动页视觉规范，包含配色、字体、组件、动效等 |

### 设计系统适用范围

- **视觉风格**: 史前丛林游戏风 (Prehistoric Jungle Gaming)
- **配色方案**: 深绿丛林 + 金色奖励强调 + 青绿雾气
- **字体搭配**: Cinzel (标题) + Inter (正文) + JetBrains Mono (代码)
- **组件规范**: 玻璃态卡片、药丸按钮、状态标签
- **默认语言**: 越南文 (vi)，支持中文 (cn) 切换

### 引用示例

```yaml
# 在新项目中引用设计系统
design_system:
  ref: "projects/001-growNewUsers/001-01-referral-activity/docs/design-system.yaml"
  version: "1.0.0"
  
# 使用配色
colors:
  primary: "${design_system.colors.primary.gold.DEFAULT}"  # #FFD700
  background: "${design_system.colors.jungle.900}"         # #0a1a15
  
# 使用字体
typography:
  heading: "${design_system.typography.families.display.name}"  # Cinzel
  body: "${design_system.typography.families.body.name}"        # Inter
```

