# 004-video-downloader

> **项目类型**: 专属页面 | **访问控制**: 密码保护 | **部署方式**: 本地/Vercel

## 快速开始

```bash
# 本地使用（无需服务器）
# 1. 用浏览器直接打开 index.html
# 2. 输入密码: 1111 (可在 js/app.js 修改)

# 或启动本地服务器
python3 -m http.server 8080
# 然后访问 http://localhost:8080

# Vercel 部署
# 1. 推送到 GitHub
# 2. 在 vercel.com 导入仓库
# 3. 自动获得 HTTPS 域名
```

## 项目结构

```
004-video-downloader/
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式（暗黑主题）
├── js/
│   └── app.js          # 逻辑（登录 + CSV解析 + 播放器）
├── data/
│   └── videos.csv      # 视频数据源
└── claude.md           # 本文件
```

## 功能特性

| 功能 | 说明 |
|------|------|
| 密码保护 | sessionStorage 存储登录状态，密码在 CONFIG.PASSWORD 配置 |
| 卡片布局 | 响应式网格，PC 4列/平板 2列/手机 1列 |
| 实时筛选 | 支持标题/内容搜索 + 类型筛选 |
| 视频播放 | 点击卡片弹层播放，带加载状态，失败可重试或新标签页打开 |
| 视频封面 | 本地缩略图优先显示，无封面时 fallback 到渐变色卡片 |
| 主题风格 | 明亮白色主题，背景图来自 `public/pic/森林雪山.jpg` |
| 单视频下载 | 鼠标悬停卡片右上角显示下载按钮 |
| 批量下载 | 勾选多个视频，底部出现批量下载栏，支持全选/清空/批量下载 |
| 视图切换 | 卡片/列表双模式，偏好自动保存到 localStorage |

## 数据源格式

`data/videos.csv` 需包含以下列：

| 列名 | 说明 |
|------|------|
| id | 唯一标识 |
| vid | 视频编号 |
| url | 视频直链地址 |
| title | 标题 |
| start | 切片起始时间(秒) |
| duration | 视频时长(秒) |
| content | 内容描述 |
| type | 分类标签 |
| model | 模型（可选） |
| create_time | 创建时间 |

## 修改密码

编辑 `js/app.js`：

```javascript
const CONFIG = {
  PASSWORD: '你的新密码',
  CSV_PATH: 'data/videos.csv'
};
```

## Vercel 是什么

| 属性 | 说明 |
|------|------|
| 类型 | 前端托管平台（PaaS） |
| 核心能力 | 自动部署 Git、CDN 加速、HTTPS 域名 |
| 费用 | 个人免费 |
| 适用场景 | 需要外网访问、团队协作、自动更新 |
| 限制 | 代码需公开、国内访问可能慢 |

## 部署对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| 本地文件 | 零配置、完全离线 | 需手动分发 |
| Vercel | 自动部署、URL 分享 | 代码公开、国内慢 |

## 生成视频封面

```bash
# 安装 FFmpeg
brew install ffmpeg  # macOS

# 生成所有视频封面
cd projects/004-video-downloader
python3 scripts/generate_thumbnails.py

# 封面将保存在 data/thumbnails/{vid}.jpg
```

### 封面使用方法

1. 生成封面后，上传到 CDN/S3
2. 在 CSV 中新增 `thumbnail` 列
3. 修改 `js/app.js` 中的渲染逻辑，显示真实封面

## 后续可扩展

- [x] 缩略图生成工具
- [ ] 下载按钮（原链接添加 download 属性）
- [ ] 分页加载（视频数量 > 100 时）
