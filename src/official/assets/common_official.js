/**
 * Official Site Common Scripts
 * 所有官网页面共用脚本
 */

import { i18n } from '../../../common/assets/i18n.js';
import { onReady, throttle, consoleBranding } from '../../../common/assets/utils.js';

// ============================================
// Loading Screen
// ============================================
onReady(() => {
  setTimeout(() => {
    document.body.classList.add('loaded');
  }, 1500);
});

// ============================================
// Header Scroll Effect
// ============================================
onReady(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  
  const handleScroll = throttle(() => {
    const currentScroll = window.pageYOffset;
    if (currentScroll > 100) {
      header.style.background = 'rgba(10, 26, 21, 0.95)';
    } else {
      header.style.background = 'rgba(10, 26, 21, 0.8)';
    }
  }, 100);
  
  window.addEventListener('scroll', handleScroll);
});

// ============================================
// Smooth Scroll for Anchor Links
// ============================================
onReady(() => {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});

// ============================================
// Language Switcher
// ============================================
onReady(() => {
  const langSwitcher = document.querySelector('.lang-switcher');
  if (!langSwitcher) return;
  
  // Initialize display
  updateLangSwitcher(i18n.getLang());
  
  // Click handler
  langSwitcher.addEventListener('click', () => {
    const newLang = i18n.toggle();
    updateLangSwitcher(newLang);
    updatePageContent();
  });
  
  // Listen for changes from other components
  i18n.onChange((lang) => {
    updateLangSwitcher(lang);
  });
});

function updateLangSwitcher(lang) {
  const switcher = document.querySelector('.lang-switcher');
  if (switcher) {
    switcher.textContent = lang === 'zh_CN' ? 'CN' : 'VI';
    switcher.dataset.lang = lang;
  }
}

// Override this function in page-specific scripts
function updatePageContent() {
  // Page-specific implementation should override this
  console.log('Language changed to:', i18n.getLang());
}

// ============================================
// Active Nav Link on Scroll
// ============================================
onReady(() => {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');
  
  if (!sections.length || !navLinks.length) return;
  
  const handleScroll = throttle(() => {
    let current = '';
    
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      if (pageYOffset >= sectionTop - 200) {
        current = section.getAttribute('id');
      }
    });
    
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === `#${current}`) {
        link.classList.add('active');
      }
    });
  }, 100);
  
  window.addEventListener('scroll', handleScroll);
});

// ============================================
// Exports for page-specific use
// ============================================
export { i18n, onReady, consoleBranding };
