# 004-12 恐龙岛翻译器

> **规则生效标识**: 本文件规则已被读取并应用于当前任务。

## 项目信息

| 项目 | 内容 |
|------|------|
| 编号 | 004-12 |
| 名称 | dino-translator |
| 中文名称 | 恐龙岛翻译器（Mac 桌面版） |
| 用途 | Mac 置顶窗口中/越/英互译工具，供运营/客服日常翻译使用 |
| 当前版本 | v1.3.1（已部署；旧 ocrMode 残留自动回退 + 模式切换持久化；OCR 轮次/耗时/绿色状态栏；框选先隐藏主窗+扩展屏；queue 泵后台线程） |

## 功能

- 置顶窗口，中文 / 越南语 / 英文互译
- 翻译方向选项以**源语言→目标语言**表述，4 项：`越南语→中文`/`英语→中文`（默认越南语）+ `中文→越南语`/`中文→英语`；「⇄ 换方向」镜像互换（v1.2.5 确定表述）
- 术语表两级合并：基础表 `glossary.json`（脚本生成，只读） + 自定义表 `custom_glossary.json`（GUI 管理，同 zh 条目自定义优先）；管理窗口支持双击编辑/新增/删除，删除基础条目=停用（空覆盖）
- 🔁 回译验证：按镜像方向把译文翻回（v2z→z2v 等），对比输入原文核对语义；回译结果区默认折叠，回译后自动展开，清空时收起
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

### 本地 OCR 服务（mini 常驻，免费，App 可选接入）

> 2026-09-10 部署。历史沿革：原 Windows LangPlugin 时代 OCR 跑 EasyOCR（`ocrMode=remote` + `ocrRemoteModel=easyocr`，`10.241.11.11:8002`，已下线）；现升级为 PaddleOCR-VL，端口改 **8000**。

| 项 | 内容 |
|---|---|
| 地址 | `http://10.241.11.11:8000`（mini.local，EasyTier VPN 内可直连；Mac 本机不在网内需经跳板） |
| 模型 | PaddleOCR-VL **1.6**（OmniDocBench 96.33，111 语言；越南语/印尼语/菲律宾语实测精度好） |
| 接口 | `POST /ocr`（multipart: `file`+`task`）/ `POST /ocr_b64`（JSON: `image`=base64）→ 返回 `{"text": "..."}`；`GET /health` |
| task | `ocr` / `formula` / `table` / `chart` |
| 部署 | launchd 常驻 `com.local.paddleocr-vl-server`（KeepAlive 自启/自拉），pid 见 `launchctl` |
| 关键文件 | 服务 `/Volumes/TQP4000/AI/scripts/ocr_server.py`（`--model` 切 1.0/1.6）；权重 `/Volumes/TQP4000/AI/PaddleOCR-VL-1.6/`（1.8GB）；plist `~/Library/LaunchAgents/com.local.paddleocr-vl-server.plist`；日志 `~/Library/Logs/ocr_server.{log,err.log}`（launchd 无法写外接卷，故在本地盘） |
| 运维 | 重启 `launchctl kickstart -k gui/$(id -u)/com.local.paddleocr-vl-server`；停 `launchctl bootout ...`；注意 **外接卷未挂载则服务起不来** |
| 性能 | 与文字量线性相关：1 行 ≈9s，3 行 ≈44s（对照百炼 qwen-vl-plus ≈2-5s） |
| 跳板 | `http://139.196.23.48/ocr-819e6e57b39495423ba7da6a7a61bf2a`（2026-09-10 建，`/etc/nginx/sites-available/paddle-ocr-proxy`，include 于 guild-resource-apply；放行 GET /health + POST /ocr、/ocr_b64，body≤512k，读超时 300s） |
| App 状态 | ✅ v1.2.7 已接入：OCR 模式 `paddle-ocr`（**默认**），跳板 token URL 硬编码为 `PADDLE_OCR_URL`，设置窗口「免费 OCR (Paddle)」可改 `paddleOcrUrl` |

## 打包

```bash
# 需先安装: python3.11 -m pip install py2app Pillow certifi
# 一键: bash build/deploy.sh （打包+部署+签名+启动）
cd build && python3.11 setup.py py2app
# 产物: build/dist/恐龙岛翻译器.app
```

**签名（2026-09-10 起）**：钥匙串自签代码签名证书 `DinoTranslator Local Dev`（SHA-1 `394826E0…E91`，10 年期，openssl 生成 + `security import`/`add-trusted-cert -r trustRoot` 导入；首次使用需在弹窗输登录密码点「始终允许」）。**deep 签名对 py2app 产物会报 invalid format，必须逐组件签**：先 Frameworks 下 dylib + Python.framework，再签主体。TCC 按（BundleID+证书）识别，授权跨升级保持，部署不再需要 `tccutil reset`。Bundle ID 固定 `info.yuemei.dinoisland.translator`，含 `NSScreenCaptureUsageDescription`。

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
| 2026-09-10 | v1.2.3：① 翻译方向简化为 3 项目标语言（→中文默认/→越南语/→英文），源语言由模型自动识别，⇄ 按钮循环切换；② 术语替换改为按目标语言触发（to_vn 时生效）；③ 回译改为启发式语言检测回翻（detect_target） |
| 2026-09-10 | v1.2.4：方向语义改为按**源语言**表达（用户澄清）：4 项 v2z/e2z/z2v/z2e，⇄ 镜像互换，prompt 加源语言消歧，术语替换仅 z2v 生效，回译用镜像方向；废弃 detect_target；fix: 下拉框显示中文标签（原显示内部 key） |
| 2026-09-10 | v1.2.5：① 方向标签改为「越南语→中文」式箭头表述；② 修复 OCR 框选 bug：去除 `-fullscreen` 属性（macOS 上触发系统 Space 切换自动跳第二屏），改无边框窗口覆盖主屏 + topmost |
| 2026-09-10 | v1.2.6：修复网络请求阻塞 UI（框选自动 OCR 后 App 无响应）：翻译/回译/OCR 请求全部移入后台 daemon 线程（`_run_async` + `root.after` 回主线程），界面不再卡死；OCR 循环遇错弹窗后继续下一轮；停止 OCR 在途请求结果丢弃；加 `_busy` 标志防并发触发；注：HTTP timeout 120s 原本已存在，根因是主线程同步调用 |
| 2026-09-10 | v1.2.7：接入 mini 本地 PaddleOCR-VL 1.6 作为**默认 OCR**（`paddle-ocr` 模式，跳板 token URL → `10.241.11.11:8000/ocr_b64`），翻译仍走跳板 Ollama → **截图翻译全链路零 Key 零费用**；百炼 OCR/Vision 保留为可选项（需 Key）；新增 `ocr_with_paddle()`（返回 text+mime+b64 供复用）与 `translate_image_with_bailian_b64()`；设置窗口加「免费 OCR (Paddle)」`paddleOcrUrl` 项；跳板 nginx 新增 `paddle-ocr-proxy`（GET /health + POST /ocr、/ocr_b64，body≤512k，read_timeout 300s） |
| 2026-09-10 | v1.2.8：① 框选支持扩展屏：CoreGraphics（ctypes 零依赖）枚举显示器 + 鼠标所在屏定位遮罩（`mac_displays()` / `mac_mouse_location()`），框选/截图/背景全程全局坐标系（跨屏负坐标兼容，左侧扩展屏 -1920 实测）；② 修 TCC 授权失效：固定 BundleID `info.yuemei.dinoisland.translator` + `NSScreenCaptureUsageDescription` + 打包后 ad-hoc codesign（写入打包流程）；已知限制：无证书签名的包每次重打包 cdhash 变化，可能需重新勾选录屏授权 |
| 2026-09-10 | v1.2.9：① 框选流程重整：先隐藏主窗口（withdraw，置顶临时解除）→ 鼠标所在屏遮罩框选（跨屏）→ 完成/取消/拖拽过小均恢复主窗口；② 授权死条目占坑：部署流程固化 `tccutil reset ScreenCapture <bundleid>`，自动清旧条目，替代手动删除；RegionSelector 加 `on_cancel` 回调防主窗口丢失；自签证书方案（授权跨升级保持）列为待办 |
| 2026-09-10 | v1.3.0：**修严重 bug：v1.2.6 起后台任务结果全部丢失**——`_run_async` 在 worker 线程直接调 `root.after()`，Tcl/Tk 非线程安全，跨线程 after 静默丢失（不报错不执行）→ 翻译/回译/OCR 结果永不回显、自动 OCR 循环永不排程、状态卡在「正在执行」。改为标准 tkinter 线程模式：结果入 `queue.Queue`，主线程 `_pump_ui_queue` 每 80ms 泵出回调。12 项状态机冒烟测试（/tmp/test_auto_ocr.py，mock 全依赖）全过：启动拒绝分支/循环/停止/重启按钮全链路 |
| 2026-09-10 | v1.3.1：修「点自动 OCR 无反应」真因：config 残留旧 LangPlugin `ocrMode='remote'`，每次启动前置检查拒绝。① 启动时非法 ocrMode 自动回退 `paddle-ocr` 并写回 config（`_valid_ocr_mode`）；② 模式切换下拉时持久化（`_persist_ocr_mode`，此前切换不保存）；③ 运行状态显性化：轮次计数 + 每轮耗时 + 绿色状态栏（运行期 fg=#4ade80）+ 下一轮倒计提示 |
| 2026-09-10 | 签名体系升级：自签证书 `DinoTranslator Local Dev` 导入钥匙串并信任；踩坑：① `--deep` 签 py2app 产物报 `invalid or unsupported format for signature`（.cstemp 子组件冲突），必须逐组件签（dylib→Python.framework→主体）；② 私钥 ACL 未放行时 codesign 报 `errSecInternalComponent` 或挂起等弹窗，首次弹窗输登录密码点「始终允许」后永久放行；deploy.sh v2 落地逐组件签名，TCC 授权自此跨升级保持 |
