/**
 * Common Utilities
 * 全项目通用工具函数（官网 + 活动页）
 */

// ============================================
// DOM Utilities
// ============================================

/**
 * 等待 DOM 加载完成
 */
export function onReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
}

/**
 * 平滑滚动到指定元素
 */
export function smoothScrollTo(selector) {
  const target = document.querySelector(selector);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * 节流函数
 */
export function throttle(fn, wait) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

// ============================================
// Intersection Observer Helper
// ============================================

/**
 * 创建滚动进入视口动画
 * @param {string} selector - CSS 选择器
 * @param {string} animateClass - 动画类名
 * @param {Object} options - IO 配置
 */
export function createScrollAnimation(selector, animateClass = 'animate-in', options = {}) {
  const defaultOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1,
    ...options
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add(animateClass);
      }
    });
  }, defaultOptions);
  
  document.querySelectorAll(selector).forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
  
  // 添加动画类样式
  if (!document.getElementById('common-animate-styles')) {
    const style = document.createElement('style');
    style.id = 'common-animate-styles';
    style.textContent = `.${animateClass} { opacity: 1 !important; transform: translateY(0) !important; }`;
    document.head.appendChild(style);
  }
}

// ============================================
// Console Branding
// ============================================

export function consoleBranding(title, subtitle, url) {
  console.log(`%c${title}`, 'font-size: 24px; font-weight: bold; color: #FFD700;');
  if (subtitle) console.log(`%c${subtitle}`, 'font-size: 14px; color: #4a9a8a;');
  if (url) console.log(`%c${url}`, 'font-size: 12px; color: #7171c6;');
}
