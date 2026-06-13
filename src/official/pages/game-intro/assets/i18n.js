/**
 * i18n.js — Dynamic language loader for Đảo Khủng Long / 恐龙岛 / Dinosaur Island
 *
 * Usage in HTML:
 *   <span data-i18n="nav.evolution"></span>
 *   <img data-i18n-src="logo.cn" alt="">
 *
 * Language determined by:
 *   1. URL ?lang=vi or ?lang=en
 *   2. localStorage.getItem('lang')
 *   3. Browser language detection
 *   4. Fallback: en
 */
(function () {
  const I18N_PATH = 'assets/i18n.json';
  const STORAGE_KEY = 'dino-lang';
  let _translations = null;
  let _currentLang = 'en';

  function detectLang() {
    const params = new URLSearchParams(window.location.search);
    const param = params.get('lang');
    if (param && ['zh', 'en', 'vi'].includes(param)) return param;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['zh', 'en', 'vi'].includes(stored)) return stored;

    const nav = navigator.language || navigator.userLanguage || 'en';
    if (nav.toLowerCase().startsWith('vi')) return 'vi';
    if (nav.toLowerCase().startsWith('zh')) return 'zh';
    return 'en';
  }

  function loadTranslations() {
    return fetch(I18N_PATH)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load i18n.json');
        return r.json();
      })
      .then(data => {
        _translations = data;
        return data;
      });
  }

  function apply(lang) {
    if (!_translations) return;
    const t = _translations[lang];
    if (!t) { console.warn('No translations for', lang); return; }
    _currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);

    // Update active button
    document.querySelectorAll('.lang-switcher button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    // textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (t[key] !== undefined) el.textContent = t[key];
    });

    // HTML (supports inline elements)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.dataset.i18nHtml;
      if (t[key] !== undefined) el.innerHTML = t[key];
    });

    // src attributes (for images/videos)
    document.querySelectorAll('[data-i18n-src]').forEach(el => {
      const key = el.dataset.i18nSrc;
      if (t[key] !== undefined) el.src = t[key];
    });

    // alt attributes
    document.querySelectorAll('[data-i18n-alt]').forEach(el => {
      const key = el.dataset.i18nAlt;
      if (t[key] !== undefined) el.alt = t[key];
    });

    // page title
    if (t['meta.title']) document.title = t['meta.title'];

    // logo per language
    const logoImg = document.querySelector('.hero-logo img');
    if (logoImg) {
      logoImg.src = lang === 'vi' ? 'assets/logo.png' : 'assets/logo-v1.png';
    }
  }

  function init() {
    const lang = detectLang();
    loadTranslations().then(() => {
      apply(lang);
    });
  }

  // Expose globally
  window.i18n = {
    setLang: function (lang) {
      if (!_translations || !['zh', 'en', 'vi'].includes(lang)) return;
      // Update URL without reload
      const url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      window.history.replaceState({}, '', url);
      apply(lang);
    },
    getLang: () => _currentLang,
    t: function (key) {
      if (!_translations || !_translations[_currentLang]) return key;
      return _translations[_currentLang][key] || key;
    }
  };

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
