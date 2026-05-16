// ============================================
// Analytics SDK — 自包含埋点模块
// ============================================
(function() {
    'use strict';

    const BUFFER_KEY = 'analytics_buffer_v1';
    const SESSION_KEY = 'analytics_session_id';
    const MAX_BUFFER = 50;

    const Analytics = {
        _endpoint: '',
        _buffer: [],
        _sessionId: null,
        _context: {},
        _traceMeta: {}, // traceId -> { startTime, action }

        // 初始化，可选传入实际上报地址
        init(endpoint) {
            this._endpoint = endpoint || '';
            this._sessionId = this.getSessionId();
            this.flushBuffer();
            this.track('page_view', { load_time_ms: Math.round(performance.now()) });
        },

        // 设置公共上下文（userId, gameUid, serverId, serverCode, lang, mode）
        setContext(ctx) {
            this._context = { ...this._context, ...ctx };
        },

        getSessionId() {
            let sid = sessionStorage.getItem(SESSION_KEY);
            if (!sid) {
                sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                sessionStorage.setItem(SESSION_KEY, sid);
            }
            return sid;
        },

        _makeTraceId() {
            return 'trace_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },

        _buildPayload(event, params, traceId) {
            const ctx = this._context || {};
            return {
                event: event,
                session_id: this._sessionId,
                trace_id: traceId || null,
                page: 'item-manager-v2',
                lang: ctx.lang || (document.body ? (document.body.getAttribute('data-lang') || 'vi') : 'vi'),
                mode: ctx.mode || 'mock',
                user_id: ctx.user_id || null,
                game_uid: ctx.game_uid || null,
                server_id: ctx.server_id || null,
                server_code: ctx.server_code || null,
                timestamp: Date.now(),
                ua: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 120),
                screen: (typeof window !== 'undefined' && window.screen ? (window.screen.width + 'x' + window.screen.height) : ''),
                referrer: (typeof document !== 'undefined' ? (document.referrer || '') : ''),
                ...params
            };
        },

        track(event, params) {
            const payload = this._buildPayload(event, params);
            this.send(payload);
        },

        // 开始一个 trace，返回 traceId
        startTrace(action, extraParams) {
            const traceId = this._makeTraceId();
            this._traceMeta[traceId] = { startTime: Date.now(), action };
            const payload = this._buildPayload('trace_start', { action, ...extraParams }, traceId);
            this.send(payload);
            return traceId;
        },

        // trace 中的中间事件
        traceStep(traceId, event, params) {
            if (!traceId) {
                this.track(event, params);
                return;
            }
            const payload = this._buildPayload(event, params, traceId);
            this.send(payload);
        },

        // 结束 trace
        endTrace(traceId, result, params) {
            if (!traceId) return;
            const meta = this._traceMeta[traceId];
            const duration = meta ? (Date.now() - meta.startTime) : null;
            const payload = this._buildPayload('trace_end', {
                result,
                duration_ms: duration,
                ...params
            }, traceId);
            this.send(payload);
            delete this._traceMeta[traceId];
        },

        send(payload) {
            // 始终输出到控制台，便于调试
            console.log('[Analytics]', payload.event, payload);

            if (!this._endpoint) {
                return;
            }

            try {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
                    const ok = navigator.sendBeacon(this._endpoint, blob);
                    if (ok) return;
                }
            } catch (e) {
                // sendBeacon 失败，降级到 fetch
            }

            try {
                fetch(this._endpoint, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                    keepalive: true,
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
