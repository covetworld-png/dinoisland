# 邀请人专属页面原型提示词

> **已采用规则**: [引用:projects/001-growNewUsers/claude.md]

---

```markdown
# Role
You are a world-class UI/UX engineer and frontend developer, specializing in creating immersive game-themed mobile web interfaces. You excel at blending gaming aesthetics with functional UI design, creating engaging user experiences for player reward and referral systems.

# Task
Create a high-fidelity prototype (HTML + Tailwind CSS) for a dinosaur-themed game referral dashboard.
Design style must follow a custom "Prehistoric Gaming" theme inspired by the game's dinosaur world setting, with core keywords: adventurous, rewarding, prehistoric atmosphere, gold coin emphasis, clear status indicators.

The page serves as the invitee's exclusive management interface where players can:
1. View their unique invitation code and shareable link
2. Track invited players with activation and first-recharge status
3. Monitor cumulative gold coin rewards (pending and claimed)
4. Generate shareable posters and copy templates

# Tech Stack
- Single HTML file (index.html) containing all sections
- Tailwind CSS (CDN: https://cdn.tailwindcss.com)
- FontAwesome for icons (CDN: https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css)
- Google Fonts: "Cinzel" for headings (prehistoric feel), "Inter" for body text
- Simulate mobile viewport: 375px width, centered on screen
- Include device frame with rounded corners (20px radius) and subtle shadow
- Real placeholder images from Unsplash for dinosaur/game-themed backgrounds

# Visual Design Requirements

## 1. Color Palette

**Primary Colors:**
- Gold Primary: #FFD700 (gold coins, primary rewards, active states)
- Gold Dark: #B8860B (gold shadows, pressed states)
- Amber Accent: #FF8C00 (secondary actions, highlights)

**Prehistoric Theme Colors:**
- Jungle Green: #2D5016 (primary brand, headers)
- Forest Dark: #1A3009 (dark backgrounds, navigation)
- Earth Brown: #8B4513 (borders, accents)
- Stone Gray: #708090 (secondary elements)

**Status Colors:**
- Success Green: #10b981 (activated, completed) - High contrast on dark
- Warning Orange: #f59e0b (pending, processing) - High contrast on dark
- Error Red: #ef4444 (failed, inactive)
- Info Blue: #3b82f6 (tips, links)

**Neutral Colors:**
- Background Main: #0a0f1c (deep navy-dark jungle)
- Background Card: #151b2b (card surfaces)
- Background Elevated: #1e293b (elevated cards, hover states)
- Text Primary: #f1f5f9 (slate-100 for maximum readability)
- Text Secondary: #94a3b8 (slate-400 for muted text)
- Text Disabled: #64748b (slate-500 for disabled states)
- Divider: #1f2937 (gray-800 subtle borders)

## 2. UI Style Characteristics

**Card Design:**
- Background: #151b2b with subtle gradient
- Border Radius: 12-16px (rounded-xl to rounded-2xl)
- Border: 1px solid #1f2937 with subtle inner glow
- Shadow: 0 4px 6px rgba(0,0,0,0.3)
- Spacing: 16-20px padding, 12-16px gap between cards
- Hover: translateY(-2px), enhanced shadow 0 8px 25px rgba(0,0,0,0.4)

**Buttons:**
- Primary Button: Gradient #FFD700 → #B8860B, text #0a0f1c (dark for contrast), height 48px, radius 24px (pill shape)
- Secondary Button: Transparent with #FFD700 border (2px), #FFD700 text
- Active State: Scale 0.98, brightness 110%, transition 150ms ease
- Disabled State: Opacity 50%, grayscale filter, cursor-not-allowed
- Hover: Enhanced brightness, subtle glow effect

**Icons:**
- Style: FontAwesome solid icons with gold accent
- Primary Icon Color: #FFD700
- Sizes: 20px (inline), 24px (list items), 32px (feature icons), 48px (hero icons)
- Containers: 48px circular with #2D5016 background for feature icons

**Status Badges:**
- Activated: Green dot (#10b981) + "已激活" text with high contrast
- Pending: Orange dot (#f59e0b) + "待激活" text with high contrast
- First Recharge Complete: Gold coin icon + "已首充" 
- No Recharge: Gray dash + "未首充"

**Gold Coin Display:**
- Large display: 32px bold, #FFD700 with text-shadow glow
- Medium display: 20px semibold
- Small inline: 14px with coin icon prefix

## 3. Layout Structure (Mobile View - 375px)

**Top Navigation Bar (56px):**
- Title: "我的邀请" (My Invitations), centered, 18px bold, #f1f5f9
- Left: Back arrow icon (24px) with cursor-pointer
- Right: Help/Info icon (24px) with cursor-pointer
- Background: #1A3009 with subtle gradient
- Border: 1px bottom border #1f2937

**Hero Stats Section (180px):**
- Background: Gradient with subtle dinosaur pattern overlay (5% opacity)
- Two-column layout for reward stats:
  - Left: "待领取金币" (Pending) - Large number display
  - Right: "已领取金币" (Claimed) - Large number display
- Center: "一键领取" (Claim All) primary button
- Decorative: Gold coin particles animation (CSS only)

**Invitation Code Card (140px):**
- Section title: "我的专属邀请码" with copy icon
- Large code display: "DINO-7X9K2M" in monospace font, 24px
- Two action buttons: "复制邀请码" | "复制链接"
- Subtext: "分享给好友，双方都得金币奖励"

**Quick Share Grid (120px):**
- 4-column grid:
  - 生成海报 (Generate Poster) - image icon
  - 分享话术 (Copy Message) - message icon
  - 分享到群 (Share to Group) - users icon
  - 更多方式 (More Options) - ellipsis icon
- Icon size: 32px in 48px circular container
- Text: 12px below icon

**Invited Players List Header (44px):**
- Title: "已邀请好友" (12人) - 12px count badge
- Filter tabs: "全部" | "已激活" | "待激活"
- Right: Sort dropdown icon

**Invited Player List Items (76px each):**
- Avatar: 48px circle with dinosaur egg placeholder or first letter
- Middle section:
  - Player name: 15px bold
  - Status row: Registration date + Status badges
- Right section:
  - Reward amount if activated: "+30金币"
  - First recharge bonus if applicable: "+首充返点"
- Divider: 1px #1f2937 with left indent 72px
- Hover: Background lighten to #1e293b

**Empty State (when no invites):**
- Illustration: Empty nest/dinosaur egg icon (64px)
- Text: "还没有邀请好友" / "分享邀请码，和好友一起探索恐龙世界"
- CTA: "立即邀请" button

**Bottom Action Bar (64px, Fixed):**
- Background: #1A3009 with top border
- Two buttons side by side:
  - Left: "查看规则" (secondary style)
  - Right: "去邀请" (primary style with glow effect)

## 4. Specific Page Content

**Page Title:** 我的邀请 (My Invitations)

**Section 1: Hero Reward Stats**
```
待领取金币 (Pending)
├─ Amount: 1,250
├─ Icon: fa-coins (animated subtle pulse)
└─ Label: 可领取

已领取金币 (Claimed)
├─ Amount: 890
├─ Icon: fa-check-circle
└─ Label: 累计已获得

主按钮: 一键领取全部 (Claim 1,250 Gold)
```

**Section 2: Invitation Code**
```
标题: 我的专属邀请码
邀请码: DINO-7X9K2M (monospace, letter-spacing 2px)
按钮组:
  ├─ 复制邀请码 (copy icon)
  └─ 复制链接 (link icon)
提示文字: 新玩家注册时填写此邀请码，双方各得50金币
```

**Section 3: Quick Actions (4-Grid)**
```
生成海报: fa-image
分享话术: fa-comment-dots
分享到群: fa-users
更多方式: fa-ellipsis-h
```

**Section 4: Invited Players List (示例数据)**
```
好友 1: 龙骑士_Alex
├─ 注册时间: 2026-03-10
├─ 状态: 已激活 (green badge)
├─ 首充: 已首充 ¥68 (gold badge)
└─ 我的奖励: +30金币 | +13金币返点

好友 2: 霸王龙小王子
├─ 注册时间: 2026-03-11
├─ 状态: 已激活 (green badge)
├─ 首充: 未首充 (gray)
└─ 我的奖励: +30金币

好友 3: 迅猛龙猎手
├─ 注册时间: 2026-03-11
├─ 状态: 待激活 (orange badge)
├─ 首充: --
└─ 我的奖励: 待发放

好友 4: 三角龙坦克
├─ 注册时间: 2026-03-12
├─ 状态: 待激活 (orange badge)
├─ 首充: --
└─ 我的奖励: 待发放
```

**Section 5: Share Message Templates (Modal/Sheet)**
```
话术模板 1:
"快来加入恐龙世界！用我的邀请码 DINO-7X9K2M 注册，
我们都能获得50金币奖励！一起探索史前世界吧！"

话术模板 2:
"发现一款超好玩的恐龙游戏！注册填我的邀请码 DINO-7X9K2M，
新手礼包+50金币直接到账！"

话术模板 3:
"组队探险缺队友！用邀请码 DINO-7X9K2M 加入，
开局就有金币奖励，快来一起称霸恐龙岛！"
```

**Section 6: Poster Preview (Modal)**
- Full-screen modal with poster preview
- Poster contains: Game logo, invitation code, QR code, reward info
- Actions: 保存海报 | 分享海报

## 5. Implementation Details

- Page width: max-w-[375px], centered with mx-auto
- Background: #0a0f1c with subtle radial gradient from center
- Layout: Flexbox column, gap-3 between sections
- Navigation: sticky top-0 z-50
- Bottom bar: fixed bottom-0 z-50
- Content padding: pb-24 to account for fixed bottom bar
- Typography: 
  - Headings: Cinzel font, weights 600-700
  - Body: Inter font, weights 400-600
- Interactive states:
  - Buttons: active:scale-[0.98] transition-all duration-150
  - List items: hover:bg-[#1e293b] transition-colors duration-200
  - Cards: hover:translate-y-[-2px] hover:shadow-xl transition-all duration-250
- Icons: FontAwesome 6.4.0 solid style
- Borders: All borders use #1f2937
- Scrollbar: Custom thin scrollbar in theme colors
- Touch targets: Minimum 44px for all interactive elements
- Cursor: cursor-pointer on all clickable elements

## 6. Tailwind Config

```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'jungle': {
          900: '#0a0f1c',
          800: '#151b2b',
          700: '#1e293b',
          600: '#2D5016',
          500: '#1f2937',
        },
        'gold': {
          DEFAULT: '#FFD700',
          dark: '#B8860B',
          light: '#FFE55C',
        },
        'prehistoric': {
          cream: '#f1f5f9',
          muted: '#94a3b8',
          stone: '#708090',
          earth: '#8B4513',
        }
      },
      fontFamily: {
        'display': ['Cinzel', 'serif'],
        'body': ['Inter', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        }
      }
    }
  }
}
```

## 7. Content Structure & Hierarchy

邀请人专属页面
├─ 顶部导航栏 (56px)
│  ├─ 返回按钮
│  ├─ 页面标题: 我的邀请
│  └─ 帮助按钮
│
├─ 主内容区 (scrollable)
│  ├─ 金币统计卡片 (Hero)
│  │  ├─ 待领取金币: 1,250
│  │  ├─ 已领取金币: 890
│  │  └─ 一键领取按钮
│  │
│  ├─ 邀请码卡片
│  │  ├─ 标题: 我的专属邀请码
│  │  ├─ 邀请码: DINO-7X9K2M
│  │  ├─ 复制按钮组
│  │  └─ 提示文字
│  │
│  ├─ 快捷操作网格 (4列)
│  │  ├─ 生成海报
│  │  ├─ 分享话术
│  │  ├─ 分享到群
│  │  └─ 更多方式
│  │
│  ├─ 已邀请好友列表
│  │  ├─ 列表头部 (标题 + 筛选)
│  │  └─ 好友条目 (4条示例)
│  │     ├─ 头像
│  │     ├─ 昵称 + 注册时间
│  │     ├─ 状态标签 (已激活/待激活)
│  │     ├─ 首充标签 (已首充/未首充)
│  │     └─ 奖励金额
│  │
│  └─ 活动规则入口
│
├─ 底部固定操作栏 (64px)
│  ├─ 查看规则按钮
│  └─ 去邀请按钮
│
└─ 模态框 (条件渲染)
   ├─ 话术模板选择
   ├─ 海报预览
   └─ 规则说明

## 8. Special Requirements

**Prehistoric Gaming Theme Key Points:**
- Use dark navy-jungle (#0a0f1c) as primary background for immersion
- Gold (#FFD700) is the hero color for rewards and CTAs
- Subtle dinosaur/palm leaf patterns as background texture (low opacity)
- Rounded pill-shaped buttons evoke organic, prehistoric feel
- Card borders should feel like carved stone (subtle inner shadow)

**Gold Coin Application Scenarios:**
- All reward amounts displayed in gold color with coin icon
- Primary CTA buttons use gold gradient
- Active/selected states use gold accent
- Achievement badges use gold borders

**Status Indicator Logic:**
- 待激活 (Pending): Orange dot + text, player registered but no game activity
- 已激活 (Activated): Green dot + text, player has game activity data
- 未首充 (No Recharge): Gray text, no first purchase
- 已首充 ¥X (Recharged): Gold badge with amount, shows 20% rebate calculation

**Interaction Details:**
- Copy actions: Show toast notification "已复制到剪贴板" (auto-dismiss 2s)
- Claim rewards: Button shows loading state, then success animation
- List pull-to-refresh: Standard iOS-style spinner in theme colors
- Poster generation: Show loading skeleton, then fade-in preview
- Card hover: translateY(-2px) with enhanced shadow
- Button press: Scale 0.98 with 150ms transition

**Accessibility:**
- Touch targets minimum 44px
- Color contrast ratio 4.5:1 for all text (verified: #f1f5f9 on #0a0f1c = 15.8:1)
- Status indicators use both color AND icon/text
- Focus states visible for keyboard navigation (2px gold outline)
- All interactive elements have cursor-pointer

**Performance:**
- Lazy load player avatars
- Use CSS animations instead of JS where possible
- Modal content rendered on-demand
- will-change: transform on animated elements

**Anti-patterns to Avoid:**
- No emojis as icons (use FontAwesome SVG)
- No light gray text on light backgrounds
- No instant transitions (always add 150-250ms easing)
- No layout shift on hover (use transform, not margin/padding)

## 9. Output Format

Please output complete index.html code, ensuring:
1. Perfect display on 375px width mobile viewport
2. All interactive elements have proper hover/active states with transitions
3. Realistic sample data for 4 invited players with various states
4. Include modal/sheet UI for share templates and poster preview
5. Show empty state variation (commented or as separate view)
6. Gold coin visual effects (CSS glow/shadow)
7. Proper Vietnamese game context (currency shown as 金币)
8. All buttons are functional (console.log or alert for demo)
9. Toast notification system for copy/claim actions
10. Smooth animations (150-250ms) on all state changes

The output should be immediately viewable in a browser and represent a polished, game-ready referral dashboard interface.
```

---

## 使用说明

1. 将上述提示词提供给 Claude Code 或其他 AI 代码生成工具
2. 生成的 HTML 文件可直接在浏览器中预览
3. 如需调整，可修改颜色值、示例数据或布局尺寸

## 关键设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 主题风格 | 史前丛林游戏风 | 与恐龙世界观一致，增强沉浸感 |
| 主色调 | 深海军蓝绿 + 金色 | 深背景确保金色奖励突出，对比度 15.8:1 |
| 邀请码展示 | 大字体 + 独立卡片 | 核心功能，需要突出 |
| 状态标签 | 彩色圆点 + 文字 | 清晰区分激活/首充状态 |
| 快捷操作 | 4宫格图标 | 降低分享门槛，一目了然 |
| 奖励统计 | 顶部 Hero 区 | 用户最关心的信息，优先展示 |
| 卡片悬停 | translateY(-2px) | 专业微交互，不引起布局抖动 |
| 按钮反馈 | scale(0.98) + 150ms | 即时响应感，游戏化体验 |

## 优化记录

| 时间 | 优化项 | 来源 |
|------|--------|------|
| 2026-03-12 | 颜色对比度提升 | UI/UX Pro Max - 无障碍标准 |
| 2026-03-12 | 添加卡片悬停动效 | UI/UX Pro Max - Dashboard Analytics 模式 |
| 2026-03-12 | 统一过渡时间 150-250ms | UI/UX Pro Max - 动效规范 |
| 2026-03-12 | 添加反模式警告 | UI/UX Pro Max - 专业 UI 检查清单 |
