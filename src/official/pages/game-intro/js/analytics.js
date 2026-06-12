(function () {
  'use strict';

  const BUFFER_KEY = 'analytics_buffer_game_intro_v1';
  const SESSION_KEY = 'analytics_session_id';
  const MAX_BUFFER = 50;

  function generate16DigitId() {
    let id = '';
    for (let i = 0; i < 16; i++) {
      id += Math.floor(Math.random() * 10);
    }
    return id;
  }

  function setSessionStorage(key, value) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value);
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function getSessionStorage(key) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const value = sessionStorage.getItem(key);
        try { return JSON.parse(value); } catch { return value; }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function truncate(str, len) {
    if (typeof str !== 'string') return '';
    return str.length > len ? str.slice(0, len) : str;
  }

  const Analytics = {
    _endpoint: '',
    _buffer: [],
    _sessionId: null,
    _context: {},
    _traceMeta: {},
    _page: 'game-intro',

    init(endpoint, page) {
      this._endpoint = endpoint || '';
      if (page) this._page = page;
      this._sessionId = this.getSessionId();
      this.flushBuffer();
      this.track('page_view', {
        load_time_ms: Math.round(performance.now())
      });
    },

    setContext(ctx) {
      this._context = { ...this._context, ...ctx };
    },

    _getUrlParam(name) {
      if (typeof window === 'undefined' || !window.location) return '';
      try {
        const params = new URLSearchParams(window.location.search);
        return params.get(name) || '';
      } catch (e) { /* ignore */ }
      const match = (window.location.search || '').match(new RegExp('[?&]' + name + '=([^&]*)'));
      return match ? decodeURIComponent(match[1]) : '';
    },

    _getAccessId() {
      let aid = getSessionStorage('accessid');
      if (!aid) {
        aid = generate16DigitId();
        setSessionStorage('accessid', aid);
      }
      return aid;
    },

    getSessionId() {
      let sid = null;
      try {
        sid = localStorage.getItem(SESSION_KEY);
        if (!sid) {
          sid = sessionStorage.getItem(SESSION_KEY);
          if (sid) localStorage.setItem(SESSION_KEY, sid);
        }
        if (!sid) {
          sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem(SESSION_KEY, sid);
        }
      } catch (e) { /* ignore */ }
      return sid;
    },

    _makeTraceId() {
      return 'trace_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    _getPathUrl(url) {
      if (!url) return '';
      try {
        const u = new URL(url, window.location.href);
        return u.pathname + u.search;
      } catch (e) {
        return url;
      }
    },

    _buildPayload(event, params, traceId) {
      const ctx = this._context || {};
      const ext = {
        ua: truncate(navigator.userAgent || '', 60),
        referer: truncate(document.referrer || '', 40),
        url: this._getPathUrl(window.location.href),
        ...params
      };
      let extStr = JSON.stringify(ext);
      if (extStr.length > 250) {
        extStr = extStr.substring(0, 247) + '...';
      }
      return {
        page: this._page,
        accessid: this._getAccessId(),
        source: this._getUrlParam('source'),
        anchor: this._getUrlParam('anchor'),
        channel: this._getUrlParam('channel'),
        event: event,
        session_id: this._sessionId,
        trace_id: traceId || null,
        game_uid: ctx.game_uid || localStorage.getItem('game') || null,
        server_id: ctx.server_id || null,
        create_time: Date.now(),
        ext: extStr
      };
    },

    track(event, params) {
      const payload = this._buildPayload(event, params);
      this.send(payload);
    },

    startTrace(action, extraParams) {
      const traceId = this._makeTraceId();
      this._traceMeta[traceId] = { startTime: Date.now(), action };
      this.send(this._buildPayload('trace_start', { action, ...extraParams }, traceId));
      return traceId;
    },

    traceStep(traceId, event, params) {
      if (!traceId) {
        this.track(event, params);
        return;
      }
      this.send(this._buildPayload(event, params, traceId));
    },

    endTrace(traceId, result, params) {
      if (!traceId) return;
      const meta = this._traceMeta[traceId];
      const duration = meta ? (Date.now() - meta.startTime) : null;
      this.send(this._buildPayload('trace_end', { result, duration_ms: duration, ...params }, traceId));
      delete this._traceMeta[traceId];
    },

    send(payload) {
      if (!this._endpoint) return;
      try {
        fetch(this._endpoint, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' }
        }).catch(() => this._pushToBuffer(payload));
      } catch (e) {
        this._pushToBuffer(payload);
      }
    },

    _pushToBuffer(payload) {
      try {
        let buf = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]');
        buf.push(payload);
        if (buf.length > MAX_BUFFER) buf = buf.slice(-MAX_BUFFER);
        localStorage.setItem(BUFFER_KEY, JSON.stringify(buf));
      } catch (e) { /* ignore */ }
    },

    flushBuffer() {
      try {
        const buf = JSON.parse(localStorage.getItem(BUFFER_KEY) || '[]');
        if (!buf.length) return;
        localStorage.removeItem(BUFFER_KEY);
        buf.forEach(p => this.send(p));
      } catch (e) { /* ignore */ }
    }
  };

  window.Analytics = Analytics;
})();
