# Zalo 调起按钮逻辑说明

> 适用页面: `src/campaign/pages/landing-official/index.html`

## 1. 按钮点击入口

```javascript
// line 1345-1360
zaloBtn.addEventListener('click', function(e) {
    e.preventDefault();
    Analytics.track('cta_click', { 
        type: 'zalo_primary', 
        position: 'hero',
        webview_type: zaloLauncher.detectEnvironment().type
    });
    zaloLauncher.launch();  // 调起主逻辑
});
```

---

## 2. 环境检测 (`detectEnvironment`)

| 检测目标 | 判断逻辑 |
|---------|---------|
| TikTok WebView | UA 包含 `tiktok/musical_ly/bytedance/ttwebview/snssdk` 且不包含 `chrome/safari` |
| Facebook WebView | UA 包含 `fb_iab/fbav` 或存在 `window.FB_IAB` |
| Instagram | UA 包含 `instagram` |
| 微信 | UA 包含 `micromessenger` |
| 小米浏览器 | UA 包含 `miuibrowser/xiaomi` |
| Safari | UA 包含 `safari` 但不包含 `chrome/crios` |
| Chrome | UA 包含 `chrome` 但不包含 `edg/samsung` |
| Samsung | UA 包含 `samsungbrowser` |
| Cốc Cốc | UA 包含 `coccoc` |

---

## 3. 调起主逻辑 (`launch`)

```javascript
// line 1111-1127
launch() {
    const env = this.detectEnvironment();
    window._zaloLaunchStartTime = Date.now();
    
    Analytics.trackZaloLaunchAttempt(env.type, this.getLaunchMethod(env));
    
    if (env.isWebView) {
        // WebView 环境：显示引导层，阻断调起
        Analytics.trackZaloLaunchResult('webview_blocked', env.type);
        this.showWebViewGuide(env.type);
        return;
    }
    
    // 系统浏览器环境：执行调起
    this.launchInSystemBrowser(env);
}
```

---

## 4. 各环境调起方式

### 4.1 调起策略矩阵

| 环境 | 调起方式 | URL 格式 | 超时时间 |
|------|---------|---------|---------|
| **小米浏览器** | Scheme URL + 兜底 | `zalo://me/8618717777125` | 1200ms |
| **Safari** | Universal Link + `window.open` | `https://zalo.me/8618717777125` | 1000ms |
| **Android** | Intent URL | `intent://zalo.me/...#Intent;package=com.zing.zalo;...` | 800ms |
| **iOS 其他** | Universal Link | `https://zalo.me/8618717777125` | 800ms |

### 4.2 Intent URL 格式 (Android)

```
intent://zalo.me/8618717777125#Intent;
    scheme=https;
    package=com.zing.zalo;
    S.browser_fallback_url=https%3A%2F%2Fzalo.me%2F8618717777125;
end
```

---

## 5. 超时/未调起检测逻辑

### 5.1 标准检测流程

```javascript
// line 1172-1188
executeLaunch(url, env) {
    let hasBlurred = false;
    const onBlur = () => { hasBlurred = true };
    window.addEventListener('blur', onBlur);  // 监听窗口失焦事件
    
    window.location.href = url;  // 执行调起
    
    setTimeout(() => {
        window.removeEventListener('blur', onBlur);
        
        if (hasBlurred) {
            Analytics.trackZaloLaunchSuccess();  // ✅ 调起成功
        } else {
            Analytics.trackZaloLaunchResult('unknown', 'no_blur_event');  // ❌ 超时未调起
        }
    }, 800);  // 超时时间：800ms
}
```

### 5.2 Safari 专用检测

```javascript
// line 1191-1221
executeLaunchForSafari(url, env) {
    let hasBlurred = false;
    let hasVisibilityChanged = false;
    
    // 双重检测机制
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    
    // 优先尝试 popup 获取更好兼容性
    const popup = window.open(url, '_blank');
    if (!popup || popup.closed) {
        window.location.href = url;  // 被拦截则回退
    }
    
    setTimeout(() => {
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        
        if (hasBlurred || hasVisibilityChanged) {
            Analytics.trackZaloLaunchSuccess();
        } else {
            Analytics.trackZaloLaunchResult('unknown', 'safari_no_response');
        }
    }, 1000);  // Safari 超时：1000ms
}
```

### 5.3 小米浏览器兜底方案

```javascript
// line 1224-1242
executeLaunchWithFallback(url, env, fallbackFn) {
    let hasBlurred = false;
    window.addEventListener('blur', onBlur);
    
    window.location.href = url;
    
    setTimeout(() => {
        window.removeEventListener('blur', onBlur);
        
        if (hasBlurred) {
            Analytics.trackZaloLaunchSuccess();
        } else {
            Analytics.trackZaloLaunchResult('failed', 'mi_browser_blocked');
            // 执行兜底：显示二维码弹窗
            if (fallbackFn) fallbackFn();
        }
    }, 1200);  // 超时：1200ms
}
```

---

## 6. 失败/阻断后的页面表现

| 场景 | 处理方式 | 显示内容 |
|------|---------|---------|
| **WebView 环境** | 阻断调起，显示引导 Modal | 平台对应的"在外部浏览器打开"指引 |
| **小米浏览器失败** | 显示二维码兜底 | 二维码占位区 + Zalo 号码 |
| **其他超时** | 仅记录 Analytics | 无页面跳转，用户停留在原页面 |

### 6.1 WebView 引导层内容

| 平台 | 引导步骤 |
|------|---------|
| **TikTok** | 1. 点击分享按钮 (→)<br>2. 选择"在 Chrome 中打开"或"在 Safari 中打开"<br>3. 返回本页面点击添加 Zalo 按钮 |
| **Facebook** | 1. 点击右上角菜单按钮 (⋮)<br>2. 选择"在 Chrome 中打开"或"在浏览器中打开"<br>3. 返回本页面点击添加 Zalo 按钮 |
| **Instagram** | 1. 点击右上角菜单按钮 (⋮)<br>2. 选择"在浏览器中打开"<br>3. 返回本页面点击添加 Zalo 按钮 |
| **微信** | 同上 + 显示"已复制链接"提示 |

### 6.2 二维码兜底弹窗

当小米浏览器调起失败时显示：
- 图标: 📱
- 标题: "扫描二维码添加 Zalo"
- 内容: 200x200 二维码占位区
- Zalo 号码: `86-1871-7777-125`
- 关闭按钮

---

## 7. Analytics 事件

| 事件名 | 触发时机 | 参数 |
|--------|---------|------|
| `zalo_launch_attempt` | 调起尝试 | `webview_type`, `launch_method`, `phone`, `source` |
| `zalo_launch_result` | 调起结果 | `result`, `reason`, `time_since_attempt`, `source` |
| `zalo_launch_success` | 调起成功 | `time_to_success`, `source` |

---

## 8. 注意事项

1. **无主动跳转**: 除小米浏览器外，其他超时场景仅上报 Analytics，用户停留在当前页面
2. **WebView 阻断**: TikTok/Facebook/Instagram/微信内置浏览器会直接阻断调起，引导用户到外部浏览器
3. **超时时间差异**: 不同环境的超时检测时间不同 (800ms-1200ms)
4. **失焦检测**: 使用 `blur` 事件和 `visibilitychange` 事件双重检测调起是否成功
