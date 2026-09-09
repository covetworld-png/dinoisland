# 004-12 恐龙岛翻译器

> **规则生效标识**: 本文件规则已被读取并应用于当前任务。

## 项目信息

| 项目 | 内容 |
|------|------|
| 编号 | 004-12 |
| 名称 | dino-translator |
| 中文名称 | 恐龙岛翻译器（Mac 桌面版） |
| 用途 | Mac 置顶窗口中/越/英互译工具，供运营/客服日常翻译使用 |
| 当前版本 | v1.2.2（已部署 `/Applications/恐龙岛翻译器.app`；v1.2.2 新增翻译历史、修复按钮行溢出致图钉不可见、回译区加大） |

## 功能

- 置顶窗口，中文 / 越南语 / 英文互译
- 「⇄ 换方向」仅切换翻译方向，不改动输入/输出框内容（v1.2.0 行为变更：原「⇅ 交换」会交换两个框内容）
- 术语表两级合并：基础表 `glossary.json`（脚本生成，只读） + 自定义表 `custom_glossary.json`（GUI 管理，同 zh 条目自定义优先）；管理窗口支持双击编辑/新增/删除，删除基础条目=停用（空覆盖）
- 🔁 回译验证：将翻译结果按反向方向译回，对比输入原文核对是否准确表达原意；回译结果区默认折叠，回译后自动展开，清空时收起
- 支持本地 Ollama 与在线模型（Kimi / DeepSeek / 火山方舟）
- 翻译后自动复制到剪贴板；右键结果框可「复制到输入框」
- 设置窗口可改 API key、模型名、Ollama 地址

## 结构

```
004-12-恐龙岛翻译器/
├── src/
│   └── translator_app_mac.py   # 唯一源文件（Tkinter 单文件应用）
├── tools/
│   └── build_glossary.py       # 基础术语表生成（002-02-翻译 md → glossary.json）
├── build/
│   └── setup.py                # py2app 打包配置
├── dist/                       # 打包产物（git 忽略）
│   ├── MacTranslator-v1.1.1.zip  # 迁移时的原始完整 App 存档
│   └── broken-app-backup-20260909/  # 残缺旧 App 备份
├── .gitignore
├── README.md
└── claude.md
```

## 运行依赖

| 依赖 | 说明 |
|---|---|
| Python 3.11 | 打包内嵌版本；本机开发需同版本 |
| tkinter | Python 标准库（macOS 自带） |
| Pillow | 图像支持（可缺省，缺失时自动降级） |
| certifi | HTTPS 证书（可缺省，缺失时用系统证书） |

### 运行时外部数据（不在本仓库）

| 路径 | 用途 | 状态 |
|---|---|---|
| `~/LangPlugin/data/glossary.json` | 基础术语表（运行时派生物，只读） | ✅ 由 `tools/build_glossary.py` 生成（139 条） |
| `~/LangPlugin/data/custom_glossary.json` | 自定义术语表（GUI 管理） | ✅ v1.2.0 新增，App 内「📖 术语表」维护 |
| `~/LangPlugin/data/config.json` | 用户配置（API key 等） | 存在 |

### 术语表数据流

```
projects/002-内容/002-02-翻译/docs/terminology-glossary.md  (权威源，翻译子项目维护)
    └─> python3 tools/build_glossary.py  ─>  ~/LangPlugin/data/glossary.json
```

md 更新后需重新执行同步脚本；JSON 为派生物，不手工编辑。

## 打包

```bash
# 需先安装: python3.11 -m pip install py2app Pillow certifi
cd build && python3.11 setup.py py2app
# 产物: build/dist/Mac恐龙岛翻译器.app
```

## 约束

- 源码修改后必须重新打包才能更新 `/Applications` 中的 App
- ⚠️ 历史遗留：`/Applications/Mac 恐龙岛翻译器.app`（残缺版）已备份至 `dist/broken-app-backup-20260909/`，不再使用
- 当前部署：`/Applications/恐龙岛翻译器.app`（v1.2.0 新版）与 `/Applications/MacTranslator.app`（v1.1.1 旧版）共存，两者共用同一份外部数据目录
- 术语表与配置文件路径写死在源码常量 `GLOSSARY_PATH` / `CONFIG_PATH`，修改路径需改源码

## 变更日志

| 日期 | 变更 |
|---|---|
| 2026-09-09 | 项目建立：源码自 `MacTranslator.zip` (v1.1.1) 迁移入库 |
| 2026-09-09 | 新增 `tools/build_glossary.py`，从 002-02-翻译 权威术语表生成 `~/LangPlugin/data/glossary.json`（139 条） |
| 2026-09-09 | v1.2.0：① 交换按钮改为仅切方向不换内容；② 新增术语表管理窗口（基础只读+自定义可编辑，合并生效）；③ 新增回译验证功能 |
| 2026-09-10 | v1.2.1：① 默认引擎改为阿里云跳板→内网 Ollama（hy-mt1.5，OpenAI 兼容端点 `/v1/chat/completions`，直连 host 自动补 `/v1`）；② 清空源码硬编码 key（分发安全），其余引擎用户自配存本机；③ 移除 OLLAMA_HOST 环境变量覆盖（防目标机器残留环境变量劫持默认值） |
| 2026-09-10 | v1.2.2：① 新增翻译历史（`history.json`，上限 200，🕘 历史窗口：翻阅/详情/双击回填/复制/清空，手动+OCR 翻译均记录）；② 修复 v1.2.0 按钮行溢出致图钉不可见（按钮拆两行，窗口 560×700）；③ 回译结果区 height 3→6 |
