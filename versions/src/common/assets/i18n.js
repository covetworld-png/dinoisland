/**
 * Internationalization (i18n)
 * 全项目通用多语言支持
 */

// ============================================
// Language Messages
// ============================================

export const I18N_MESSAGES = {
  zh_CN: {
    // Common
    loading: '正在加载...',
    
    // Nav
    nav: {
      home: '首页',
      features: '特色',
      download: '下载',
      news: '新闻',
      recharge: '充值',
      register: '注册',
      login: '登录',
      userCenter: '个人中心'
    },
    
    // Common Actions
    actions: {
      confirm: '确认',
      cancel: '取消',
      submit: '提交',
      download: '立即下载',
      learnMore: '了解更多'
    }
  },
  
  vi: {
    // Common
    loading: 'Đang tải...',
    
    // Nav
    nav: {
      home: 'Trang chủ',
      features: 'Tính năng',
      download: 'Tải game',
      news: 'Tin tức',
      recharge: 'Nạp tiền',
      register: 'Đăng ký',
      login: 'Đăng nhập',
      userCenter: 'Trung tâm cá nhân'
    },
    
    // Common Actions
    actions: {
      confirm: 'Xác nhận',
      cancel: 'Hủy',
      submit: 'Gửi',
      download: 'Tải ngay',
      learnMore: 'Tìm hiểu thêm'
    }
  }
};

// ============================================
// I18n Manager
// ============================================

export class I18nManager {
  constructor(defaultLang = 'vi') {
    this.currentLang = localStorage.getItem('language') || defaultLang;
    this.messages = I18N_MESSAGES;
    this.listeners = [];
  }
  
  getLang() {
    return this.currentLang;
  }
  
  setLang(lang) {
    if (this.messages[lang]) {
      this.currentLang = lang;
      localStorage.setItem('language', lang);
      this.notify();
      return true;
    }
    return false;
  }
  
  toggle() {
    const newLang = this.currentLang === 'vi' ? 'zh_CN' : 'vi';
    this.setLang(newLang);
    return newLang;
  }
  
  t(key) {
    const keys = key.split('.');
    let value = this.messages[this.currentLang];
    
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) return key;
    }
    
    return value;
  }
  
  onChange(callback) {
    this.listeners.push(callback);
  }
  
  notify() {
    this.listeners.forEach(cb => cb(this.currentLang));
  }
}

// 全局实例
export const i18n = new I18nManager();
