/**
 * 怪兽岛 - Home/Recharge Page Scripts
 */

import { onReady } from '../../../../common/assets/utils.js';

// ============================================
// Loading Screen
// ============================================
onReady(() => {
  setTimeout(() => {
    document.body.classList.add('loaded');
  }, 500);
});

// ============================================
// Product Selection
// ============================================
onReady(() => {
  const proItems = document.querySelectorAll('.pro-item');
  
  proItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove selected from all
      proItems.forEach(i => i.classList.remove('selected'));
      
      // Add selected to clicked
      item.classList.add('selected');
      
      // Get product info
      const name = item.querySelector('.pro-name').textContent;
      const price = item.dataset.price;
      const coins = item.dataset.coins;
      
      console.log('Selected:', { name, price, coins });
      
      // Show alert for demo
      // alert(`您选择了：${name}\n价格：${price} VND\n金币：${coins}`);
    });
  });
});

// ============================================
// Language Switcher
// ============================================
onReady(() => {
  const langSwitcher = document.getElementById('langSwitcher');
  
  if (langSwitcher) {
    langSwitcher.addEventListener('click', () => {
      const currentLang = document.documentElement.lang;
      const newLang = currentLang === 'zh-CN' ? 'vi' : 'zh-CN';
      document.documentElement.lang = newLang;
      
      // Reload page with new lang (demo)
      console.log('Language switched to:', newLang);
    });
  }
});

// ============================================
// Server Select Dropdown
// ============================================
onReady(() => {
  const serverSelect = document.querySelector('.el-select__wrapper');
  
  if (serverSelect) {
    serverSelect.addEventListener('click', () => {
      console.log('Server select clicked');
      // In real implementation, show dropdown
    });
  }
});

// ============================================
// Invite Button Tracking
// ============================================
onReady(() => {
  const inviteBtn = document.querySelector('.invite-btn');
  
  if (inviteBtn) {
    inviteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Invite button clicked');
      // Navigate to invite page
      // window.location.href = '/invite';
    });
  }
});

console.log('🏝️ 怪兽岛 - 充值页面已加载');
