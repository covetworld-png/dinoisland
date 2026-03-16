# 增强记忆 - 004-video-downloader

> **记录时间**: 2026-03-16  
> **记录类型**: 操作指令

---

## 数据更新流程

### 方式一：快速同步（推荐）

```bash
cd projects/004-video-downloader
node scripts/sync_csv.js
```

### 方式二：监听模式（开发时使用）

```bash
node scripts/sync_csv.js --watch
# 监听 CSV 变化，自动同步到 js/csv_data.js
```

### 方式三：手动覆盖

```bash
# 1. 替换 CSV
cp {新CSV路径} data/videos.csv

# 2. 编码修复（如从 Windows/Excel 导出）
iconv -f GBK -t UTF-8 data/videos.csv > data/videos_utf8.csv
mv data/videos_utf8.csv data/videos.csv

# 3. 同步到 JS
node scripts/sync_csv.js
```

---

## 封面生成流程

```bash
# 1. 生成新封面（自动跳过已存在）
python3 scripts/generate_thumbnails.py

# 2. 检查完成率
ls data/thumbnails/*.jpg | wc -l
# 应等于 CSV 行数 - 1
```

---

## 完整更新流程（数据+封面）

```bash
cd projects/004-video-downloader

# Step 1: 替换 CSV（如需）
cp data/副本video_clips.csv data/videos.csv

# Step 2: 同步到 JS
node scripts/sync_csv.js

# Step 3: 生成新封面
python3 scripts/generate_thumbnails.py

# Step 4: 验证
echo "视频数: $(tail -n +2 data/videos.csv | wc -l)"
echo "封面数: $(ls data/thumbnails/*.jpg 2>/dev/null | wc -l)"
```

---

## 设计说明：为什么使用内嵌 JS

```
videos.csv ──► js/csv_data.js ──► index.html
     (数据源)        (内嵌)          (渲染)
```

| 方案 | 优点 | 缺点 |
|------|------|------|
| **内嵌 JS** (当前) | 双击即用，零配置 | 需同步脚本 |
| **fetch CSV** | 实时更新 | 需启动 HTTP 服务器 |

**核心原因**: 浏览器禁止 `file://` 协议下的 `fetch()` (CORS 限制)

---

## 命名规则速查

| 来源 | 命名格式 | 示例 |
|------|---------|------|
| 视频 URL | `vid_start_end.mp4` | `Z5klxK5CebQ_0103_0300.mp4` |
| 封面文件 | `{URL文件名}.jpg` | `Z5klxK5CebQ_0103_0300.jpg` |
| 唯一标识 | URL 最后一段（不含扩展名）| `Z5klxK5CebQ_0103_0300` |

---

## 关键检查点

- [ ] CSV 列名: `id,vid,url,title,start,duration,content,type,model,create_time`
- [ ] 编码: UTF-8（避免中文乱码）
- [ ] URL 格式: `https://qiwei.yuemei.info/video/vid_start_end.mp4`
- [ ] 同步后刷新浏览器（或强制刷新 `Cmd+Shift+R`）

---

## 关联文档

- [引用:004/claude.md]
- [引用:AGENTS.md#记忆系统]
