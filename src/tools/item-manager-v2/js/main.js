// ============================================
// Trung Tâm Đạo Cụ - Item Manager
// LocalStorage-based state with cross-tab sync
// ============================================


// Server-scoped localStorage keys
function getServerId() {
    return localStorage.getItem('itemManager_serverId') || '';
}
function lsKeyState() { return `itemManager_state_v1_${getServerId()}`; }
function lsKeyUser()  { return `itemManager_user_v1_${getServerId()}`; }
function lsKeyLogs()   { return `itemManager_logs_v1_${getServerId()}`; }

// 服务器切换
function switchServer(sid) {
    localStorage.setItem('itemManager_serverId', sid);
    location.reload();
}

// 用户手动选择服务器后触发
function onServerSelect(sid) {
    if (!sid) return;
    localStorage.setItem('itemManager_serverId', sid);
    const serverSelect = document.getElementById('server-select');
    if (serverSelect) serverSelect.value = sid;
    if (window.itemManager) {
        window.itemManager.fetchNickname();
    }
}

// 时间天空效果：根据 HH:MM 渲染太阳/月亮位置和天空颜色
function updateSky(hh, mm, prefix) {
    prefix = prefix || 'sky';
    const skyBg = document.getElementById(prefix + '-bg');
    const periodEl = document.getElementById(prefix + '-period');
    const timeEl = document.getElementById(prefix + '-time');
    if (!skyBg) return;

    const hour = hh + mm / 60;
    // 越南河内5月近似日出日落
    const sunrise = 5.33;  // 05:20
    const sunset = 18.25;  // 18:15

    // 光源弧形轨迹：从左地平线 → 天顶 → 右地平线
    function lightPos(pct) {
        const x = 5 + pct * 90;                      // 5% ~ 95%
        const y = 88 - Math.sin(pct * Math.PI) * 78; // 底部88% → 顶部10% → 底部88%
        return { x, y };
    }

    let periodText = '';

    if (hour >= sunrise && hour <= sunset) {
        // 白天
        const pct = (hour - sunrise) / (sunset - sunrise);
        const p = lightPos(pct);
        const elevation = Math.sin(pct * Math.PI); // 0→1→0

        // 天空基色随太阳高度变化
        const r = Math.round(8 + elevation * 35);
        const g = Math.round(18 + elevation * 85);
        const b = Math.round(16 + elevation * 125);

        // 多层径向渐变模拟光源：暖色核心 → 过渡光环 → 天空基色
        const coreOpacity = 0.25 + elevation * 0.35;
        const haloOpacity = 0.08 + elevation * 0.12;
        skyBg.style.background =
            'radial-gradient(circle at ' + p.x + '% ' + p.y + '%, rgba(255,230,150,' + coreOpacity + ') 0%, transparent 35%), ' +
            'radial-gradient(ellipse 70% 55% at ' + p.x + '% ' + Math.min(95, p.y + 25) + '%, rgba(255,190,80,' + haloOpacity + ') 0%, transparent 60%), ' +
            'linear-gradient(180deg, rgb(' + Math.round(r*1.2) + ',' + Math.round(g*1.1) + ',' + Math.round(b*1.3) + ') 0%, rgb(' + r + ',' + g + ',' + b + ') 40%, rgb(' + Math.round(r*0.5) + ',' + Math.round(g*0.55) + ',' + Math.round(b*0.65) + ') 100%)';

        if (hour < 7) periodText = '<span class="lang-vi">Bình minh</span><span class="lang-cn">清晨</span>';
        else if (hour < 17) periodText = '<span class="lang-vi">Ban ngày</span><span class="lang-cn">白天</span>';
        else periodText = '<span class="lang-vi">Hoàng hôn</span><span class="lang-cn">黄昏</span>';
    } else {
        // 夜晚
        let pct;
        if (hour > sunset) {
            pct = (hour - sunset) / (24 - sunset + sunrise);
        } else {
            pct = (hour + 24 - sunset) / (24 - sunset + sunrise);
        }
        const p = lightPos(pct);

        // 夜空：冷色调光源
        skyBg.style.background =
            'radial-gradient(circle at ' + p.x + '% ' + p.y + '%, rgba(200,220,255,0.15) 0%, transparent 30%), ' +
            'radial-gradient(ellipse 60% 45% at ' + p.x + '% ' + Math.min(95, p.y + 20) + '%, rgba(120,160,200,0.08) 0%, transparent 55%), ' +
            'linear-gradient(180deg, #0c1420 0%, #080f18 50%, #04080f 100%)';
        periodText = '<span class="lang-vi">Đêm khuya</span><span class="lang-cn">深夜</span>';
    }

    if (periodEl) periodEl.innerHTML = periodText;
}

// 模拟服务端轮询：跨服务器感知其他玩家操作
function simulateServerPoll(manager) {
    const servers = ['s1','s2','s3'];
    const current = getServerId();
    const otherServers = servers.filter(s => s !== current);
    
    // 每轮随机挑选一个其他服务器，模拟该服务器上有玩家使用了道具
    const target = otherServers[Math.floor(Math.random() * otherServers.length)];
    const types = ['weather','time','flow'];
    const type = types[Math.floor(Math.random() * types.length)];
    const bots = [
        {vi:'Người chơi 7723', cn:'玩家7723'},
        {vi:'Người chơi 8844', cn:'玩家8844'},
        {vi:'Người chơi 5566', cn:'玩家5566'},
        {vi:'Người chơi 3399', cn:'玩家3399'},
        {vi:'Người chơi 1122', cn:'玩家1122'}
    ];
    const bot = bots[Math.floor(Math.random() * bots.length)];
    
    // 只在 30% 概率触发，避免过于频繁
    if (Math.random() > 0.7) {
        const stateKey = `itemManager_state_v1_${target}`;
        let state = localStorage.getItem(stateKey);
        if (!state) {
            state = { globalLocks:{weather:null,time:null,flow:null,dinoSize:null}, announcements:[], history:[] };
        } else {
            state = JSON.parse(state);
        }
        
        const now = Date.now();
        const duration = 30 * 60 * 1000; // 30 min
        
        if (type === 'flow') {
            state.globalLocks.flow = {
                startTime: now, endTime: now + 60 * 60 * 1000,
                username: bot.vi, usernameCn: bot.cn, server: target
            };
        } else {
            state.globalLocks[type] = {
                startTime: now, endTime: now + duration,
                username: bot.vi, usernameCn: bot.cn, server: target
            };
        }
        
        state.history.unshift({
            type, item: type, username: bot.vi, usernameCn: bot.cn,
            server: target, timestamp: now
        });
        if (state.history.length > 30) state.history.pop();
        
        localStorage.setItem(stateKey, JSON.stringify(state));
        
        // 如果当前面板打开，刷新显示
        const tab = document.querySelector(`.tab-btn[data-tab="${type}"]`);
        if (tab && tab.classList.contains('active')) {
            manager.renderPanel(type);
        }
        
        // 显示跨服务器通知
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];
        const name = lang === 'vi' ? bot.vi : bot.cn;
        const itemNames = {weather:t.items.weather, time:t.items.time, flow:t.items.flow};
        const msg = lang === 'vi'
            ? `${name} (${target}) đã sử dụng ${itemNames[type]}`
            : `${name} (${target}) 使用了 ${itemNames[type]}`;
        showToast(msg, 'info');
    }
}

// Time conversion helpers (game value 0-2400 ↔ natural minutes 0-1439)
function gameValToMinutes(gv) {
    const hh = Math.floor(gv / 100);
    const mm = Math.round((gv % 100) * 0.6);
    return hh * 60 + mm;
}
function minutesToGameVal(minutes) {
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    return hh * 100 + Math.round(mm * 100 / 60);
}
function minutesToHHMM(minutes) {
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}
function parseHHMM(str) {
    const m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
}

// Simulated server-polling interval (ms)
const SERVER_POLL_INTERVAL = 8000;

// Fake other-player names for server simulation
const BOT_NAMES = [
    { vi: 'Người chơi 7723', cn: '玩家7723' },
    { vi: 'Người chơi 9142', cn: '玩家9142' },
    { vi: 'Người chơi 3301', cn: '玩家3301' },
    { vi: 'Người chơi 5528', cn: '玩家5528' },
];


// Utility
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDateTime(date) {
    const d = new Date(date);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// State Management
class ItemManager {
    constructor() {
        this.api = window.apiClient || new ApiClient();
        this.mode = APP_MODE.mode;
        this.user = this.loadUser();
        this.state = this.loadState();
        this.countdowns = { weather: null, time: null, flow: null };
        this.cooldowns = {};
        this.dinoCdInterval = null;
        this.currentTab = 'weather';
        this.selectedOptions = { weather: null, time: 1200 };
        this.init();
    }

    loadUser() {
        let user = localStorage.getItem(lsKeyUser());
        if (user) {
            user = JSON.parse(user);
            // Merge new fields for backward compatibility
            if (!user.inventory) user.inventory = {};
            if (user.inventory.flowCard === undefined) user.inventory.flowCard = 3;
            if (user.inventory.dinoGrow50 === undefined) user.inventory.dinoGrow50 = 3;
            if (!user.inventoryVisibility) {
                user.inventoryVisibility = {
                    weather: true, time: true, announcement: true,
                    flow: true, dinoGrow50: true
                };
            }
            // 用户名由 fetchNickname 设置，此处不再覆盖
            localStorage.setItem(lsKeyUser(), JSON.stringify(user));
            return user;
        }
        user = {
            userId: '',
            username: '',
            usernameCn: '',
            nicknameStatus: 'pending',
            inventory: {},
            inventoryVisibility: (() => {
                const vis = {};
                Object.keys(ITEM_CONFIG).forEach(type => {
                    vis[type] = true;
                });
                return vis;
            })()
        };
        localStorage.setItem(lsKeyUser(), JSON.stringify(user));
        return user;
    }

    loadState() {
        const state = localStorage.getItem(lsKeyState());
        if (state) {
            const parsed = JSON.parse(state);
            if (!parsed.globalLocks) parsed.globalLocks = {};
            if (parsed.globalLocks.flow === undefined) parsed.globalLocks.flow = null;
            return parsed;
        }
        return {
            globalLocks: { weather: null, time: null, flow: null, dinoSize: null },
            announcements: [],
            history: []
        };
    }

    saveState() {
        localStorage.setItem(lsKeyState(), JSON.stringify(this.state));
    }

    saveUser() {
        localStorage.setItem(lsKeyUser(), JSON.stringify(this.user));
    }

    init() {
        if (typeof checkAuth === 'function' && !checkAuth()) return;

        // API模式：优先从服务端同步数据
        if (APP_MODE.isApi()) {
            if (!this.api.isLoggedIn()) {
                // 未登录：清空状态，渲染空面板
                this.user.inventory = (() => {
                    const inv = {};
                    Object.keys(ITEM_CONFIG).forEach(type => {
                        inv[ITEM_CONFIG[type].inventoryKey] = 0;
                    });
                    return inv;
                })();
                this.state.globalLocks = { weather: null, time: null, flow: null, dinoSize: null };
                this.saveUser();
                this.saveState();
                this.cleanupHistory();
                updatePlayerIdentityDisplay();
                this.renderInventory();
                this.syncInvVisibilityUI();
                this.renderAllPanels();
                this.renderHistory();
                this.startCountdowns();
                this.processAnnouncements();
                this.setupEventListeners();
                this.setupStorageSync();
                this.setupTimeSetter();
                setupDebugMock();
                this.updateAuthUI();
                return;
            }

            // 已登录但未选择服务器：等待用户选择
            const currentServer = getServerId();
            if (!currentServer) {
                this.user.nicknameStatus = 'pending_server';
                this.saveUser();
                updatePlayerIdentityDisplay();
                this.renderInventory();
                this.syncInvVisibilityUI();
                this.renderAllPanels();
                this.renderHistory();
                this.startCountdowns();
                this.processAnnouncements();
                this.setupEventListeners();
                this.setupStorageSync();
                this.setupTimeSetter();
                setupDebugMock();
                this.updateAuthUI();
                return;
            }

            // 已登录且已选择服务器：查询昵称
            this.fetchNickname().then(() => {
                if (this.user.nicknameStatus === 'ok') {
                    this.syncFromApi().then(() => {
                        this.cleanupHistory();
                        updatePlayerIdentityDisplay();
                        this.renderInventory();
                        this.syncInvVisibilityUI();
                        this.renderAllPanels();
                        this.renderHistory();
                        this.startCountdowns();
                        this.processAnnouncements();
                        this.setupEventListeners();
                        this.setupStorageSync();
                        this.setupTimeSetter();
                        setupDebugMock();
                        this.updateAuthUI();
                    });
                    this._startApiPolling();
                } else {
                    // 昵称查询失败：显示错误，锁定道具
                    updatePlayerIdentityDisplay();
                    this.renderInventory();
                    this.syncInvVisibilityUI();
                    this.renderAllPanels();
                    this.renderHistory();
                    this.startCountdowns();
                    this.processAnnouncements();
                    this.setupEventListeners();
                    this.setupStorageSync();
                    this.setupTimeSetter();
                    setupDebugMock();
                    this.updateAuthUI();
                }
            });
            return;
        }

        this.cleanupHistory();
        updatePlayerIdentityDisplay();
        this.renderInventory();
        this.syncInvVisibilityUI();
        this.renderAllPanels();
        this.renderHistory();
        this.startCountdowns();
        this.processAnnouncements();
        this.setupEventListeners();
        this.setupStorageSync();
        this.setupTimeSetter();
        this.startServerPolling();
        setupDebugMock();
        this.updateAuthUI();
    }

    _startApiPolling() {
        if (this._apiPollInterval) clearInterval(this._apiPollInterval);
        this._apiPollInterval = setInterval(() => {
            if (APP_MODE.isApi() && this.api.isLoggedIn()) {
                this.syncFromApi().catch(e => console.error('[API poll] failed:', e));
            }
        }, 60000);
    }

    _stopApiPolling() {
        if (this._apiPollInterval) {
            clearInterval(this._apiPollInterval);
            this._apiPollInterval = null;
        }
    }

    async syncFromApi() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        try {
            // 先清除所有非乐观锁（避免模拟模式旧数据残留）
            Object.keys(this.state.globalLocks).forEach(key => {
                const lock = this.state.globalLocks[key];
                if (lock && !lock.optimistic) {
                    this.state.globalLocks[key] = null;
                }
            });
            const benefitsRes = await this.api.getBenefits();
            console.log('[syncFromApi] benefitsRes:', benefitsRes);
            if (benefitsRes.code === 91) {
                this.api.logout();
                this.updateAuthUI();
                showToast(t.loginExpired, 'warning');
                return false;
            }
            if (benefitsRes.code === 0 && benefitsRes.extra) {
                const benefits = benefitsRes.extra.benefits || [];
                console.log('[syncFromApi] benefits:', benefits);
                this.user.inventory = mapApiBenefitsToInventory(benefits);
                if (this.api.gameUid && this.user.userId !== 'player_' + this.api.gameUid) {
                    this.user.userId = 'player_' + this.api.gameUid;
                }
                this.user.username = this.user.username || I18N[lang].defaultUsername;
                this.user.usernameCn = this.user.usernameCn || I18N[lang].defaultUsername;
                this.saveUser();
                updatePlayerIdentityDisplay();
                if (benefits.length === 0) {
                    showToast(I18N[lang].inventoryEmpty, 'info');
                }
            }
            const recordsRes = await this.api.getRecords();
            console.log('[syncFromApi] recordsRes:', recordsRes);
            if (recordsRes.code === 0 && recordsRes.extra) {
                const rawRecords = recordsRes.extra.records || [];
                console.log('[syncFromApi] raw records:', JSON.stringify(rawRecords));
                const locks = mapApiRecordsToLocks(rawRecords, this.user.userId);
                // 过滤服务端返回的已过期记录
                Object.keys(locks).forEach(key => {
                    if (locks[key] && locks[key].endTime !== Infinity && Date.now() >= locks[key].endTime) {
                        locks[key] = null;
                    }
                });
                // 先清除所有非乐观锁（避免模拟模式旧数据残留），保留乐观锁
                Object.keys(this.state.globalLocks).forEach(key => {
                    const lock = this.state.globalLocks[key];
                    if (lock && !lock.optimistic) {
                        this.state.globalLocks[key] = null;
                    }
                });
                // 设置服务端明确返回的 doing 记录（覆盖乐观锁，但忽略已过期）
                Object.keys(locks).forEach(key => {
                    if (locks[key] !== null) {
                        this.state.globalLocks[key] = locks[key];
                    }
                });
                // 清理过期的乐观锁
                Object.keys(this.state.globalLocks).forEach(key => {
                    const lock = this.state.globalLocks[key];
                    if (lock && lock.optimistic && lock.endTime !== Infinity && Date.now() >= lock.endTime) {
                        this.state.globalLocks[key] = null;
                    }
                });
                this.saveState();
            }
            return true;
        } catch (e) {
            console.error('API sync failed:', e);
            showToast(t.apiSyncFailed + e.message, 'error');
            return false;
        }
    }

    async fetchNickname() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const serverId = SERVER_ID_MAP[getServerId()] || '';
        if (!serverId) {
            this.user.nicknameStatus = 'pending_server';
            this.saveUser();
            return;
        }
        this.user.nicknameStatus = 'loading';
        this.saveUser();
        updatePlayerIdentityDisplay();

        const res = await this.api.getNickname(serverId);
        console.log('[fetchNickname] res:', res);
        if (res.code === 0 && res.extra && res.extra.nickname) {
            this.user.nicknameStatus = 'ok';
            this.user.username = res.extra.nickname;
            this.user.usernameCn = res.extra.nickname;
            if (res.extra.game_uid) {
                this.user.userId = 'player_' + res.extra.game_uid;
            }
            this.saveUser();
            updatePlayerIdentityDisplay();
            this.renderInventory();
        } else if (res.code === 122 || res.code === 123) {
            this.user.nicknameStatus = 'not_found';
            this.saveUser();
            updatePlayerIdentityDisplay();
            this.renderInventory();
            showToast(getApiErrorMessage(res.code, lang) || res.message, 'warning');
        } else {
            this.user.nicknameStatus = 'error';
            this.saveUser();
            updatePlayerIdentityDisplay();
            this.renderInventory();
            showToast(res.message || I18N[lang].apiSyncFailed, 'warning');
        }
    }

    updateAuthUI() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const panel = document.getElementById('auth-panel-inline');
        const status = document.getElementById('auth-status');
        const logoutBtn = document.getElementById('auth-logout');
        const modeSelect = document.getElementById('mode-select');
        if (modeSelect) modeSelect.value = APP_MODE.mode;
        if (APP_MODE.isApi()) {
            if (this.api.isLoggedIn()) {
                if (panel) panel.style.display = 'flex';
                if (status) { status.style.display = 'inline'; status.textContent = I18N[lang].apiConnected; status.style.color = 'var(--green)'; }
                if (logoutBtn) logoutBtn.style.display = 'inline-flex';
            } else {
                if (panel) panel.style.display = 'none';
                if (status) status.style.display = 'none';
                if (logoutBtn) logoutBtn.style.display = 'none';
            }
        } else {
            if (panel) panel.style.display = 'none';
            if (status) { status.style.display = 'inline'; status.textContent = I18N[lang].mockModeActive; status.style.color = 'var(--gold)'; }
            if (logoutBtn) logoutBtn.style.display = 'none';
        }
        updatePlayerIdentityDisplay();
    }

    startServerPolling() {
        // 每 8-15 秒模拟一次其他服务器玩家操作
        const poll = () => {
            simulateServerPoll(this);
            const next = 8000 + Math.random() * 7000;
            setTimeout(poll, next);
        };
        setTimeout(poll, 5000);
    }

    setupTimeSetter() {
        const slider = document.getElementById('time-slider');
        const skyTime = document.getElementById('sky-time');
        const presets = document.querySelectorAll('#time-presets .preset-btn');
        if (!slider) return;

        const updateFromMinutes = (minutes) => {
            minutes = Math.max(0, Math.min(1439, minutes));
            const gv = minutesToGameVal(minutes);
            const hhmm = minutesToHHMM(minutes);
            slider.value = minutes;
            if (skyTime) skyTime.textContent = hhmm;
            this.selectedOptions.time = gv;
            const hh = Math.floor(minutes / 60);
            const mm = minutes % 60;
            console.log('[updateFromMinutes]', hh, mm);
            updateSky(hh, mm);
        };

        slider.addEventListener('input', () => {
            const minutes = parseInt(slider.value, 10) || 0;
            console.log('[time-slider] input', minutes);
            updateFromMinutes(minutes);
            presets.forEach(b => b.classList.remove('selected'));
        });
        presets.forEach(btn => {
            btn.addEventListener('click', () => {
                presets.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                const gv = parseInt(btn.dataset.value, 10);
                updateFromMinutes(gameValToMinutes(gv));
            });
        });
    }

    cleanupHistory() {
        let changed = false;
        const now = Date.now();
        this.state.history.forEach(item => {
            if (item.status === 'active' && item.endTime && now >= item.endTime) {
                item.status = 'completed';
                changed = true;
            }
        });
        if (changed) {
            this.saveState();
        }
    }

    // Conflict Check
    checkConflict(type) {
        const lock = this.state.globalLocks[type];
        if (!lock) return null;
        const now = Date.now();
        if (now >= lock.endTime) {
            // Auto cleanup expired lock
            this.state.globalLocks[type] = null;
            this.saveState();
            return null;
        }
        // API 模式下 globalLocks 只包含自己的锁或服务端返回的 records
        // 不保证能看到其他玩家的真实占用，因此不依赖它做跨玩家冲突预判
        return lock;
    }

    // Simulate server request with loading state
    async simulateServerUse(type) {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        // Show loading toast
        const loadingToast = document.createElement('div');
        loadingToast.className = 'toast info loading';
        loadingToast.innerHTML = `<span>⏳</span><span>${t.connectingServer}</span>`;
        const container = document.getElementById('toast-container');
        if (container) container.appendChild(loadingToast);

        try {
            // Simulate network delay
            await new Promise(r => setTimeout(r, 500 + Math.random() * 500));

            // Remove loading toast
            if (loadingToast.parentNode) loadingToast.remove();

            // Check mock error (set via window.mockNextError or debug UI)
            if (window.__mockServerError) {
                const err = window.__mockServerError;
                window.__mockServerError = null;
                return err;
            }

            // Default: success
            return { success: true };
        } catch (e) {
            // AGENTS.md §7.6：500/网络错误兜底
            if (loadingToast.parentNode) loadingToast.remove();
            return { success: false, code: 'SYSTEM_ERROR' };
        }
    }

    // Simulate server restore (type=0) command with highest priority
    async simulateServerRestore(type) {
        await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
        return { success: true };
    }

    // Auto-restore when timed item expires: generate type=0 command
    autoRestore(type) {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];
        
        // 1. Clear local lock immediately (prevent duplicate restore)
        this.state.globalLocks[type] = null;
        
        // 2. Update history
        const historyItem = this.state.history.find(h => 
            h.type === type && h.userId === this.user.userId && h.status === 'active'
        );
        if (historyItem) {
            historyItem.status = 'completed';
            historyItem.endTime = Date.now();
        }
        this.saveState();
        
        // 3. Update UI
        this.renderPanel(type);
        this.renderHistory();
        showToast(t.timeUp, 'info');
        
        // 4. Notify server (type=0, highest priority) — fire and forget
        this.simulateServerRestore(type);
    }

    // Use Weather Card
    async useWeatherCard() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        if (!checkNicknameReady()) return;

        if (this.user.inventory.weatherCard <= 0) {
            showToast(t.noItem, 'error');
            return;
        }

        const selected = this.selectedOptions.weather;
        if (!selected) {
            showToast(t.selectOption, 'warning');
            return;
        }

        const conflict = this.checkConflict('weather');
        if (conflict) {
            const remaining = conflict.endTime - Date.now();
            const name = lang === 'vi' ? conflict.username : (conflict.usernameCn || conflict.username);
            showToast(t.conflictWeather(name, formatTime(remaining)), 'warning');
            return;
        }

        // API模式：调用真实接口
        if (APP_MODE.isApi()) {
            const weatherId = WEATHER_ID_MAP[selected];
            if (!weatherId || weatherId < 1 || weatherId > 10) {
                showToast(t.invalidOption || I18N[lang].invalidWeather, 'error');
                return;
            }
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            const res = await this.api.apply(2, serverId, { weather_id: weatherId });
            if (res.code === 0) {
                showToast(t.submittedWaiting, 'info');
                const now = Date.now();
                // 1. 乐观锁
                this.state.globalLocks.weather = {
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    startTime: now,
                    endTime: now + DURATION_WEATHER,
                    detail: selected,
                    detailName: t.weatherNames[selected] || selected,
                    optimistic: true
                };
                // 2. 历史记录
                this.state.history.unshift({
                    id: generateId(),
                    type: 'weather',
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    detail: selected,
                    startTime: now,
                    endTime: now + DURATION_WEATHER,
                    status: 'active'
                });
                if (this.state.history.length > 30) this.state.history.pop();
                this.saveState();
                // 3. UI 更新
                this.startCountdowns();
                this.renderAllPanels();
                await this.syncFromApi();
                this.renderInventory();
                this.renderHistory();
            } else if (res.code === 118) {
                showToast(t.serverErrorConflict, 'warning');
                // syncFromApi 拿不到其他玩家的全局状态，不执行无意义的刷新
            } else if (res.code === 119) {
                showToast(t.serverErrorNoItem, 'error');
            } else {
                showToast(res.message || t.useFailed, 'error');
            }
            return;
        }

        // Simulate server request
        const serverResult = await this.simulateServerUse('weather');
        if (!serverResult.success) {
            if (serverResult.code === 'CONFLICT') {
                showToast(t.serverErrorConflict, 'warning');
            } else if (serverResult.code === 'NO_ITEM') {
                showToast(t.serverErrorNoItem, 'error');
            } else if (serverResult.code === 'SYSTEM_ERROR') {
                showToast(t.serverErrorSystem(), 'error');
            }
            return;
        }

        // Deduct inventory
        this.user.inventory.weatherCard--;
        this.saveUser();

        // Set global lock
        const now = Date.now();
        const detail = t.weatherNames[selected] || selected;
        this.state.globalLocks.weather = {
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            startTime: now,
            endTime: now + DURATION_WEATHER,
            detail: selected,
            detailName: detail
        };

        // Add history
        this.state.history.unshift({
            id: generateId(),
            type: 'weather',
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            detail: detail,
            startTime: now,
            endTime: now + DURATION_WEATHER,
            status: 'active'
        });

        this.saveState();
        this.renderInventory();
        this.renderWeatherPanel();
        this.renderHistory();
        this.startCountdowns();
        showToast(t.useSuccess(t.history.weather), 'success');
    }

    // Use Time Card
    async useTimeCard() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        if (!checkNicknameReady()) return;

        if (this.user.inventory.timeCard <= 0) {
            showToast(t.noItem, 'error');
            return;
        }

        const selected = this.selectedOptions.time;
        if (selected === null || selected === undefined) {
            showToast(t.selectOption, 'warning');
            return;
        }

        const conflict = this.checkConflict('time');
        if (conflict) {
            const remaining = conflict.endTime - Date.now();
            const name = lang === 'vi' ? conflict.username : (conflict.usernameCn || conflict.username);
            showToast(t.conflictTime(name, formatTime(remaining)), 'warning');
            return;
        }

        // Time and Flow are mutually exclusive
        const flowLock = this.checkConflict('flow');
        if (flowLock) {
            const remaining = flowLock.endTime - Date.now();
            showToast(t.conflictTimeByFlow(formatTime(remaining)), 'warning');
            return;
        }

        // API模式
        if (APP_MODE.isApi()) {
            if (typeof selected !== 'number' || selected < 0 || selected > 2400) {
                showToast(t.invalidOption || I18N[lang].invalidTime, 'error');
                return;
            }
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            const res = await this.api.apply(5, serverId, { time_hm: selected });
            if (res.code === 0) {
                const hh = Math.floor(selected / 100);
                const mm = Math.round((selected % 100) * 0.6);
                const detail = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
                showToast(t.submittedWaiting, 'info');
                const now = Date.now();
                // 1. 乐观锁
                this.state.globalLocks.time = {
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    startTime: now,
                    endTime: now + DURATION_TIME,
                    detail: selected,
                    detailName: detail,
                    optimistic: true
                };
                // 2. 历史记录
                this.state.history.unshift({
                    id: generateId(),
                    type: 'time',
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    detail: detail,
                    startTime: now,
                    endTime: now + DURATION_TIME,
                    status: 'active'
                });
                if (this.state.history.length > 30) this.state.history.pop();
                this.saveState();
                // 3. UI 更新
                this.startCountdowns();
                this.renderAllPanels();
                await this.syncFromApi();
                this.renderInventory();
                this.renderHistory();
            } else if (res.code === 118) {
                showToast(t.serverErrorConflict, 'warning');
            } else if (res.code === 119) {
                showToast(t.serverErrorNoItem, 'error');
            } else {
                showToast(res.message || t.useFailed, 'error');
            }
            return;
        }

        // Simulate server request
        const serverResult = await this.simulateServerUse('time');
        if (!serverResult.success) {
            if (serverResult.code === 'CONFLICT') {
                showToast(t.serverErrorConflict, 'warning');
            } else if (serverResult.code === 'NO_ITEM') {
                showToast(t.serverErrorNoItem, 'error');
            } else if (serverResult.code === 'SYSTEM_ERROR') {
                showToast(t.serverErrorSystem(), 'error');
            }
            return;
        }

        this.user.inventory.timeCard--;
        this.saveUser();

        const now = Date.now();
        const hh = Math.floor(selected / 100);
        const mm = Math.round((selected % 100) * 0.6);
        const detail = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
        this.state.globalLocks.time = {
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            startTime: now,
            endTime: now + DURATION_TIME,
            detail: selected,
            detailName: detail
        };

        this.state.history.unshift({
            id: generateId(),
            type: 'time',
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            detail: detail,
            startTime: now,
            endTime: now + DURATION_TIME,
            status: 'active'
        });

        this.saveState();
        this.renderInventory();
        this.renderTimePanel();
        this.renderHistory();
        this.startCountdowns();
        showToast(t.useSuccess(`${t.history.time} (${detail})`), 'success');
    }

    // Use Flow Card
    async useFlowCard() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        if (!checkNicknameReady()) return;

        if (this.user.inventory.flowCard <= 0) {
            showToast(t.noItem, 'error');
            return;
        }

        const conflict = this.checkConflict('flow');
        if (conflict) {
            const remaining = conflict.endTime - Date.now();
            const name = lang === 'vi' ? conflict.username : (conflict.usernameCn || conflict.username);
            showToast(t.conflictFlow(name, formatTime(remaining)), 'warning');
            return;
        }

        // Time and Flow are mutually exclusive
        const timeLock = this.checkConflict('time');
        if (timeLock) {
            const remaining = timeLock.endTime - Date.now();
            showToast(t.conflictFlowByTime(formatTime(remaining)), 'warning');
            return;
        }

        // API模式：flow 使用 skill_id=3，time_hm=0 表示流动
        if (APP_MODE.isApi()) {
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            const res = await this.api.apply(3, serverId, { time_hm: 0 });
            if (res.code === 0) {
                showToast(t.submittedWaiting, 'info');
                const now = Date.now();
                // 1. 乐观锁
                this.state.globalLocks.flow = {
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    startTime: now,
                    endTime: now + DURATION_FLOW,
                    detail: 'flow',
                    gameTimeBase: 1200,
                    optimistic: true
                };
                // 2. 历史记录
                this.state.history.unshift({
                    id: generateId(),
                    type: 'flow',
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    detail: '12:00 → 24h',
                    startTime: now,
                    endTime: now + DURATION_FLOW,
                    status: 'active'
                });
                if (this.state.history.length > 30) this.state.history.pop();
                this.saveState();
                // 3. UI 更新
                this.startCountdowns();
                this.renderAllPanels();
                await this.syncFromApi();
                this.renderInventory();
                this.renderHistory();
            } else if (res.code === 118) {
                showToast(t.serverErrorConflict, 'warning');
            } else if (res.code === 119) {
                showToast(t.serverErrorNoItem, 'error');
            } else {
                showToast(res.message || t.useFailed, 'error');
            }
            return;
        }

        // Simulate server request
        const serverResult = await this.simulateServerUse('flow');
        if (!serverResult.success) {
            if (serverResult.code === 'CONFLICT') {
                showToast(t.serverErrorConflict, 'warning');
            } else if (serverResult.code === 'NO_ITEM') {
                showToast(t.serverErrorNoItem, 'error');
            } else if (serverResult.code === 'SYSTEM_ERROR') {
                showToast(t.serverErrorSystem(), 'error');
            }
            return;
        }

        this.user.inventory.flowCard--;
        this.saveUser();

        const now = Date.now();
        this.state.globalLocks.flow = {
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            startTime: now,
            endTime: now + DURATION_FLOW,
            detail: 'flow',
            gameTimeBase: 1200 // 12:00 in HHMM format
        };

        this.state.history.unshift({
            id: generateId(),
            type: 'flow',
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            detail: '12:00 → 24h',
            startTime: now,
            endTime: now + DURATION_FLOW,
            status: 'active'
        });

        this.saveState();
        this.renderInventory();
        this.renderFlowPanel();
        this.renderHistory();
        this.startCountdowns();
        showToast(t.useSuccess(t.history.flow), 'success');
    }

    // Use Dino Size Card
    async useDinoSizeCard() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        if (!checkNicknameReady()) return;
        const inventoryKey = 'dinoGrow50';

        if (this.user.inventory[inventoryKey] <= 0) {
            showToast(t.noItem, 'error');
            return;
        }

        // API模式
        if (APP_MODE.isApi()) {
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            const res = await this.api.apply(1, serverId);
            if (res.code === 0) {
                showToast(t.submittedWaiting, 'info');
                const now = Date.now();
                // 乐观设置临时锁（体型变化无固定过期）
                this.state.globalLocks.dinoSize = {
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    startTime: now,
                    endTime: now + DURATION_DINO,
                    detail: 'grow50',
                    detailName: t.history.dinoGrow50,
                    sizeType: 'grow50',
                    optimistic: true
                };
                // 历史记录
                this.state.history.unshift({
                    id: generateId(),
                    type: 'dinoGrow50',
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    detail: lang === 'vi' ? 'Tăng 50%' : I18N[lang].sizeIncrease50,
                    startTime: now,
                    endTime: null,
                    status: 'active'
                });
                if (this.state.history.length > 30) this.state.history.pop();
                this.saveState();
                this.startCountdowns();
                this.renderAllPanels();
                await this.syncFromApi();
                this.renderInventory();
                this.renderHistory();
            } else if (res.code === 118) {
                showToast(t.serverErrorConflict, 'warning');
            } else if (res.code === 119) {
                showToast(t.serverErrorNoItem, 'error');
            } else {
                showToast(res.message || t.useFailed, 'error');
            }
            return;
        }

        const serverResult = await this.simulateServerUse('dinoSize');
        if (!serverResult.success) {
            if (serverResult.code === 'CONFLICT') {
                showToast(t.serverErrorConflict, 'warning');
            } else if (serverResult.code === 'NO_ITEM') {
                showToast(t.serverErrorNoItem, 'error');
            } else if (serverResult.code === 'SYSTEM_ERROR') {
                showToast(t.serverErrorSystem(), 'error');
            }
            return;
        }

        this.user.inventory.dinoGrow50--;
        this.saveUser();

        const now = Date.now();
        this.state.globalLocks.dinoSize = {
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            startTime: now,
            endTime: now + DURATION_DINO,
            sizeType: 'grow50',
            detail: 'grow50',
            detailName: I18N[lang].sizeIncrease50Title
        };

        this.state.history.unshift({
            id: generateId(),
            type: 'dinoGrow50',
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            detail: lang === 'vi' ? 'Tăng 50%' : I18N[lang].sizeIncrease50,
            startTime: now,
            endTime: null,
            status: 'active'
        });
        this.saveState();
        this.renderInventory();
        this.renderDinoSizePanel();
        this.renderHistory();
        this.startCountdowns();
    }

    async stopFlowCard() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];
        const lock = this.state.globalLocks.flow;

        if (!lock || lock.userId !== this.user.userId) {
            showToast(t.useFailed, 'error');
            return;
        }

        const confirmMsg = lang === 'vi'
            ? 'Bạn có chắc muốn dừng dòng chảy thờ gian? Thẻ sẽ bị tiêu hao và không hoàn lại.'
            : I18N[lang].confirmStopFlow;
        if (!confirm(confirmMsg)) return;

        // API模式：调用 skill_id=3, time_hm=1200 停止时间流动
        if (APP_MODE.isApi()) {
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            try {
                const res = await this.api.apply(3, serverId, { time_hm: 1200 });
                if (res.code !== 0) {
                    showToast((res.message || t.useFailed), 'error');
                    return;
                }
            } catch (e) {
                showToast(t.useFailed, 'error');
                return;
            }
        }

        // Clear lock
        this.state.globalLocks.flow = null;

        // Update history
        const activeItem = this.state.history.find(h => h.type === 'flow' && h.status === 'active' && h.userId === this.user.userId);
        if (activeItem) {
            activeItem.status = 'completed';
            activeItem.endTime = Date.now();
        }

        this.saveState();
        this.renderInventory();
        this.renderFlowPanel();
        this.renderHistory();
        this.startCountdowns();
        updateSky(12, 0, 'flow-sky');
        showToast(I18N[lang].timeUp, 'info');
    }

    // Submit Announcement
    async submitAnnouncement(content) {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        if (!checkNicknameReady()) return;

        if (this.user.inventory.announcementCard <= 0) {
            showToast(t.noItem, 'error');
            return;
        }

        const trimmed = content.trim();
        if (!trimmed) {
            showToast(t.enterContent, 'warning');
            return;
        }
        if (trimmed.length < 2) {
            showToast(t.contentTooShort, 'warning');
            return;
        }
        if (trimmed.length > 100) {
            showToast(t.contentTooLong, 'warning');
            return;
        }

        // API模式
        if (APP_MODE.isApi()) {
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            const res = await this.api.apply(4, serverId, { content: content.trim() });
            if (res.code === 0) {
                showToast(t.sent || I18N[lang].sentStatus, 'success');
                const now = Date.now();
                // 添加历史记录
                this.state.history.unshift({
                    id: generateId(),
                    type: 'announcement',
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    detail: content.trim().substring(0, 30) + (content.trim().length > 30 ? '...' : ''),
                    startTime: now,
                    endTime: now,
                    status: 'completed'
                });
                if (this.state.history.length > 30) this.state.history.pop();
                this.saveState();
                await this.syncFromApi();
                this.renderInventory();
                this.renderAllPanels();
                this.renderHistory();
                this.startCountdowns();
            } else if (res.code === 118) {
                showToast(t.serverErrorConflict, 'warning');
            } else if (res.code === 119) {
                showToast(t.serverErrorNoItem, 'error');
            } else {
                // 大模型审核失败或参数不规范：直接显示服务端返回的 message
                showToast(res.message || t.useFailed, 'error');
            }
            return;
        }

        // 模拟模式：直接标记为已发送
        this.user.inventory.announcementCard--;
        this.saveUser();

        const now = Date.now();
        const announcement = {
            id: generateId(),
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            content: content.trim(),
            status: 'sent',
            submitTime: now,
            sendTime: now
        };

        this.state.announcements.unshift(announcement);
        this.saveState();

        this.renderInventory();
        this.renderAnnouncementPanel();
        this.renderHistory();
        showToast(t.sent || I18N[lang].sentStatus, 'success');
    }

    resetInventory() {
        this.user.inventory = {
            ...(Object.keys(ITEM_CONFIG).reduce((acc, type) => {
                acc[ITEM_CONFIG[type].inventoryKey] = 3;
                return acc;
            }, {}))
        };
        this.saveUser();
        this.renderInventory();
        this.renderAllPanels();
        const lang = document.body.getAttribute('data-lang') || 'vi';
        showToast(lang === 'vi' ? 'Đã khôi phục đạo cụ!' : I18N[lang].inventoryReset, 'success');
    }

    // Countdown Management
    startCountdowns() {
        ['weather', 'time', 'flow'].forEach(type => {
            if (this.countdowns[type]) {
                clearInterval(this.countdowns[type]);
                this.countdowns[type] = null;
            }
        });

        const tick = () => {
            ['weather', 'time', 'flow'].forEach(type => {
                const lock = this.checkConflict(type);
                const banner = document.getElementById(`countdown-${type}`);
                const value = document.getElementById(`countdown-value-${type}`);
                const options = document.getElementById(`options-${type}`);
                const btn = document.getElementById(`btn-use-${type}`);
                const statusDot = document.querySelector(`#status-${type} .status-dot`);
                const statusText = document.querySelector(`#status-${type} .status-text`);
                const conflictBanner = document.getElementById(`conflict-${type}`);
                const lang = document.body.getAttribute('data-lang') || 'vi';
                const t = I18N[lang];

                if (!banner || !value) return;

                if (lock) {
                    const remaining = lock.endTime - Date.now();
                    const isMine = lock.userId === this.user.userId;

                    // Dino size countdown only shows for current user (no conflict)
                    if (remaining > 0 && type === 'dinoSize' && !isMine) {
                        banner.style.display = 'none';
                    } else if (remaining > 0) {
                        banner.style.display = type === 'dinoSize' ? 'none' : 'flex';
                        if (lock.optimistic) {
                            value.textContent = I18N[lang].activeStatus + formatTime(remaining);
                        } else {
                            value.textContent = type === 'dinoSize' ? '' : formatTime(remaining);
                        }
                        banner.className = isMine 
                            ? 'countdown-banner' 
                            : 'countdown-banner';

                        if (statusDot) {
                            statusDot.className = 'status-dot ' + (isMine ? 'active' : 'busy');
                        }
                        if (statusText) {
                            if (lock.optimistic) {
                                statusText.innerHTML = `<span class="lang-vi">Đang chờ hiệu lực</span><span class="lang-cn">生效中...</span>`;
                            } else {
                                statusText.innerHTML = `<span class="lang-vi">${isMine ? 'Đang sử dụng' : 'Đang bận'}</span><span class="lang-cn">${isMine ? '使用中' : '占用中'}</span>`;
                            }
                        }

                        // Flow-specific: update game time display
                        if (type === 'flow') {
                            const elapsedSec = (Date.now() - lock.startTime) / 1000;
                            const gameMinutes = (720 + elapsedSec * 0.4) % 1440;
                            const hh = Math.floor(gameMinutes / 60);
                            const mm = Math.floor(gameMinutes % 60);
                            const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                            const timeDisplay = document.getElementById('flow-sky-time');
                            const stopBtn = document.getElementById('btn-stop-flow');
                            const useBtn = document.getElementById('btn-use-flow');
                            const display = document.getElementById('flow-sky');
                            if (timeDisplay) timeDisplay.textContent = timeStr;
                            if (stopBtn) stopBtn.style.display = isMine ? 'block' : 'none';
                            if (useBtn) useBtn.style.display = 'none';
                            if (display) display.classList.add('active');
                            updateSky(hh, mm, 'flow-sky');
                        }

                        if (options) {
                            options.querySelectorAll('.option-btn').forEach(btn => {
                                btn.disabled = true;
                            });
                        }
                        // Dino size does not conflict with other players
                        if (btn && type === 'dinoSize') {
                            const hasLock = !!this.checkConflict('dinoSize');
                            if (btn.id === 'btn-use-dino-grow-50') btn.disabled = this.user.inventory.dinoGrow50 <= 0 || hasLock;
                            else btn.disabled = true;
                        } else if (btn) {
                            btn.disabled = true;
                        }

                        // Time setter controls disable during conflict
                        if (type === 'time') {
                            const timeSlider = document.getElementById('time-slider');
                            if (timeSlider) timeSlider.disabled = true;
                            document.querySelectorAll('#time-presets .preset-btn').forEach(b => b.disabled = true);
                        }

                        // Dino size visual effect during active (only for current user)
                        if (type === 'dinoSize' && isMine) {
                            const dinoChar = document.getElementById('dino-character');
                            const dinoAura = document.getElementById('dino-aura');
                            const dinoStatus = document.getElementById('dino-status');
                            if (dinoChar) {
                                dinoChar.classList.add('grown');
                                setTimeout(() => dinoChar.classList.add('breathing'), 700);
                            }
                            if (dinoAura) dinoAura.classList.add('active');
                            if (dinoStatus) {
                                dinoStatus.classList.add('grown');
                                dinoStatus.innerHTML = '<span class="lang-vi">Đã tăng kích thước 50%!</span><span class="lang-cn">体型已增大50%！</span>';
                            }
                        }

                        if (conflictBanner) {
                            // Dino size does not conflict with other players
                            if (isMine || type === 'dinoSize') {
                                conflictBanner.style.display = 'none';
                            } else {
                                conflictBanner.style.display = 'flex';
                                const name = lang === 'vi' ? lock.username : (lock.usernameCn || lock.username);
                                let detail = '';
                                if (type === 'flow') {
                                    detail = I18N[lang].flowCardTitle;
                                } else {
                                    const namesMap = type === 'weather' 
                                        ? (lang === 'vi' ? I18N.vi.weatherNames : I18N.cn.weatherNames)
                                        : (lang === 'vi' ? I18N.vi.timeNames : I18N.cn.timeNames);
                                    detail = namesMap[lock.detail] || lock.detailName || lock.detail;
                                }
                                const textEl = document.getElementById(`conflict-text-${type}`);
                                if (textEl) {
                                    let msg = '';
                                    if (type === 'weather') msg = t.conflictWeather(name, formatTime(remaining));
                                    else if (type === 'time') msg = t.conflictTime(name, formatTime(remaining));
                                    else if (type === 'flow') msg = t.conflictFlow(name, formatTime(remaining));
                                    textEl.textContent = msg + (detail ? ` (${detail})` : '');
                                }
                            }
                        }
                    } else if (type !== 'dinoSize') {
                        // Time's up - auto restore (generate type=0 command, highest priority)
                        this.autoRestore(type);
                    }
                } else {
                    // Cross-type mutual exclusion: time ↔ flow
                    const crossLock = type === 'time' ? this.checkConflict('flow') : type === 'flow' ? this.checkConflict('time') : null;
                    if (crossLock) {
                        const remaining = crossLock.endTime - Date.now();
                        if (statusDot) statusDot.className = 'status-dot busy';
                        if (statusText) {
                            statusText.innerHTML = `<span class="lang-vi">Đang bận</span><span class="lang-cn">占用中</span>`;
                        }
                        if (conflictBanner) {
                            conflictBanner.style.display = 'flex';
                            const textEl = document.getElementById(`conflict-text-${type}`);
                            if (textEl) {
                                const msg = type === 'time'
                                    ? t.conflictTimeByFlow(formatTime(remaining))
                                    : t.conflictFlowByTime(formatTime(remaining));
                                textEl.textContent = msg;
                            }
                        }
                        if (btn) btn.disabled = true;
                        if (type === 'time') {
                            const timeSlider = document.getElementById('time-slider');
                            if (timeSlider) timeSlider.disabled = true;
                            document.querySelectorAll('#time-presets .preset-btn').forEach(b => b.disabled = true);
                        }
                    } else {
                        if (statusDot) statusDot.className = 'status-dot idle';
                        if (statusText) {
                            statusText.innerHTML = `<span class="lang-vi">${t.ready}</span><span class="lang-cn">${t.ready}</span>`;
                        }
                        if (conflictBanner) conflictBanner.style.display = 'none';
                        if (btn) {
                            if (type === 'dinoSize') {
                                const hasLock = !!this.checkConflict('dinoSize');
                                if (btn.id === 'btn-use-dino-grow-50') btn.disabled = this.user.inventory.dinoGrow50 <= 0 || hasLock;
                            } else {
                                btn.disabled = (type === 'weather' && this.user.inventory.weatherCard <= 0) ||
                                               (type === 'time' && this.user.inventory.timeCard <= 0) ||
                                               (type === 'flow' && this.user.inventory.flowCard <= 0);
                            }
                        }
                        // Time setter controls re-enable when no conflict
                        if (type === 'time') {
                            const timeSlider = document.getElementById('time-slider');
                            const hasCards = this.user.inventory.timeCard > 0;
                            if (timeSlider) timeSlider.disabled = !hasCards;
                            document.querySelectorAll('#time-presets .preset-btn').forEach(b => b.disabled = !hasCards);
                        }
                    }

                    banner.style.display = 'none';
                    if (options) {
                        options.querySelectorAll('.option-btn').forEach(btn => {
                            btn.disabled = false;
                        });
                    }

                    // Dino size reset visual
                    if (type === 'dinoSize') {
                        const dinoChar = document.getElementById('dino-character');
                        const dinoAura = document.getElementById('dino-aura');
                        const dinoStatus = document.getElementById('dino-status');
                        if (dinoChar) {
                            dinoChar.classList.remove('grown');
                            dinoChar.classList.remove('breathing');
                            dinoChar.style.transform = '';
                        }
                        if (dinoAura) dinoAura.classList.remove('active');
                        if (dinoStatus) {
                            dinoStatus.classList.remove('grown');
                            dinoStatus.innerHTML = '<span class="lang-vi">Kích thước bình thường</span><span class="lang-cn">正常体型</span>';
                        }
                    }

                    // Flow-specific: reset game time display
                    if (type === 'flow' && !crossLock) {
                        const timeDisplay = document.getElementById('flow-sky-time');
                        const stopBtn = document.getElementById('btn-stop-flow');
                        const useBtn = document.getElementById('btn-use-flow');
                        const display = document.getElementById('flow-sky');
                        const period = document.getElementById('flow-sky-period');
                        if (timeDisplay) timeDisplay.textContent = '12:00';
                        if (stopBtn) stopBtn.style.display = 'none';
                        if (useBtn) useBtn.style.display = 'block';
                        if (display) display.classList.remove('active');
                        if (period) period.innerHTML = '<span class="lang-vi">Thời gian đang đứng yên tại 12:00</span><span class="lang-cn">时间静止在 12:00</span>';
                        updateSky(12, 0, 'flow-sky');
                    }
                }
            });

            // Dino size 冷却倒计时更新
            this.renderDinoSizePanel();
        };

        tick();
        const interval = setInterval(tick, 1000);
        ['weather', 'time', 'flow'].forEach(type => {
            this.countdowns[type] = interval;
        });
    }

    processAnnouncements() {
        // Cleanup any stuck announcements
        this.loadState();
        // 模拟模式下公告直接标记为 sent，无需清理
        this.saveState();
        this.renderAnnouncementPanel();
    }

    // Render Methods
    renderInventory() {
        const isApiNotLoggedIn = APP_MODE.isApi() && (!this.api || !this.api.isLoggedIn());
        const nicknameOk = this.user && this.user.nicknameStatus === 'ok';
        const inv = isApiNotLoggedIn ? {} : (this.user.inventory || {});
        const visibility = this.user.inventoryVisibility || {};
        console.log('[renderInventory]', isApiNotLoggedIn ? I18N[lang].apiNotLoggedIn : inv);

        // 根据 ITEM_CONFIG 动态生成库存映射
        const invMap = Object.keys(ITEM_CONFIG).map(type => ({
            type: ITEM_CONFIG[type].tabId,
            key: ITEM_CONFIG[type].inventoryKey,
            cfg: type
        }));
        invMap.forEach(({ type, key, cfg }) => {
            const card = document.getElementById(`inv-${type}`);
            const count = isApiNotLoggedIn ? 0 : (this.user.inventory[key] || 0);
            const visible = visibility[cfg] !== false;
            if (card) {
                card.style.display = visible ? '' : 'none';
                if (visible) {
                    const countEl = document.getElementById(`count-${type}`);
                    if (countEl) countEl.textContent = '×' + count;
                    const btn = document.getElementById(`btn-slot-${type}`);
                    if (btn) btn.disabled = count <= 0 || !nicknameOk;
                }
            }
        });
        const bar = document.querySelector('.inventory-bar');
        if (bar) {
            bar.classList.add('loaded');
            if (!nicknameOk && APP_MODE.isApi() && this.api.isLoggedIn()) {
                bar.classList.add('nickname-locked');
                const lockMsg = (document.body.getAttribute('data-lang') || 'vi') === 'vi'
                    ? 'Vui lòng chọn máy chủ và tra cứu biệt danh'
                    : '请选择服务器并查询昵称';
                bar.setAttribute('data-lock-msg', lockMsg);
            } else {
                bar.classList.remove('nickname-locked');
                bar.removeAttribute('data-lock-msg');
            }
        }
    }

    renderAllPanels() {
        this.renderWeatherPanel();
        this.renderTimePanel();
        this.renderAnnouncementPanel();
        this.renderFlowPanel();
        this.renderDinoSizePanel();
    }

    toggleInvVisibility(itemKey, visible) {
        if (!this.user.inventoryVisibility) {
            // 根据 ITEM_CONFIG 动态初始化可见性
            this.user.inventoryVisibility = {};
            Object.keys(ITEM_CONFIG).forEach(type => {
                this.user.inventoryVisibility[type] = true;
            });
        }
        this.user.inventoryVisibility[itemKey] = visible;
        this.saveUser();
        this.renderInventory();
    }

    syncInvVisibilityUI() {
        const v = this.user.inventoryVisibility || {};
        const map = {
            weather: 'toggle-weather',
            time: 'toggle-time',
            announcement: 'toggle-announcement',
            flow: 'toggle-flow',
            dinoGrow50: 'toggle-dino-grow'
        };
        for (const [key, id] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (el) el.checked = v[key] !== false;
        }
    }

    renderPanel(type) {
        if (type === 'weather') this.renderWeatherPanel();
        else if (type === 'time') this.renderTimePanel();
        else if (type === 'announcement') this.renderAnnouncementPanel();
        else if (type === 'flow') this.renderFlowPanel();
        else if (type === 'dino-grow') this.renderDinoSizePanel();
    }

    renderWeatherPanel() {
        const container = document.getElementById('options-weather');
        if (!container) return;
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];
        const hasLock = !!this.checkConflict('weather');

        container.querySelectorAll('.option-btn').forEach(btn => {
            btn.disabled = hasLock;
            btn.onclick = () => {
                if (btn.disabled) return;
                container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedOptions.weather = btn.dataset.value;
            };
        });
    }

    renderTimePanel() {
        const container = document.getElementById('panel-time');
        if (!container) return;

        const slider = document.getElementById('time-slider');
        const skyTime = document.getElementById('sky-time');
        const presets = container.querySelectorAll('.preset-btn');
        const lock = this.checkConflict('time');
        const flowLock = this.checkConflict('flow');

        // 同步选中值到UI（内部 gameVal → 前端自然时间）
        const sel = this.selectedOptions.time;
        if (sel !== null && sel !== undefined && slider) {
            const minutes = gameValToMinutes(sel);
            const hhmm = minutesToHHMM(minutes);
            slider.value = minutes;
            if (skyTime) skyTime.textContent = hhmm;
            const hh = Math.floor(minutes / 60);
            const mm = minutes % 60;
            updateSky(hh, mm);
        }

        // 更新预设按钮选中状态
        presets.forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.value,10) === sel);
        });

        // 如果有冲突或被flow互斥，禁用所有时间设置控件
        const disabled = !!lock || !!flowLock;
        if (slider) slider.disabled = disabled;
        presets.forEach(btn => { btn.disabled = disabled; });
    }

    renderFlowPanel() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];
        const lock = this.checkConflict('flow');
        const timeLock = this.checkConflict('time');
        const btn = document.getElementById('btn-use-flow');
        const stopBtn = document.getElementById('btn-stop-flow');
        const display = document.getElementById('flow-sky');
        const period = document.getElementById('flow-sky-period');

        if (btn) {
            btn.disabled = this.user.inventory.flowCard <= 0 || !!lock || !!timeLock;
        }
        if (stopBtn) {
            stopBtn.style.display = lock && lock.userId === this.user.userId ? 'block' : 'none';
        }
        if (display) {
            display.classList.toggle('active', !!lock);
        }
        if (period) {
            if (lock) {
                // Period text is updated by countdown tick via updateSky
            } else {
                period.innerHTML = '<span class="lang-vi">Thời gian đang đứng yên tại 12:00</span><span class="lang-cn">时间静止在 12:00</span>';
                updateSky(12, 0, 'flow-sky');
            }
        }
    }

    renderDinoSizePanel() {
        const lock = this.checkConflict('dinoSize');
        const myLock = lock && lock.userId === this.user.userId;
        const btn50 = document.getElementById('btn-use-dino-grow-50');
        const dinoChar = document.getElementById('dino-character');
        const dinoAura = document.getElementById('dino-aura');
        const dinoStatus = document.getElementById('dino-status');
        const lang = document.body.getAttribute('data-lang') || 'vi';

        // 清除旧倒计时
        if (this.dinoCdInterval) {
            clearInterval(this.dinoCdInterval);
            this.dinoCdInterval = null;
        }

        if (btn50) {
            const hasLock = !!myLock;
            btn50.disabled = this.user.inventory.dinoGrow50 <= 0 || hasLock;
            if (hasLock && lock) {
                const updateBtn = () => {
                    const left = lock.endTime - Date.now();
                    if (left > 0) {
                        const sec = Math.ceil(left / 1000);
                        btn50.textContent = lang === 'vi' ? `Chờ ${sec}s` : `冷却 ${sec}s`;
                    } else {
                        btn50.disabled = this.user.inventory.dinoGrow50 <= 0;
                        btn50.innerHTML = '<span class="lang-vi">Sử dụng Thẻ Tăng Kích Thước</span><span class="lang-cn">使用体型变大卡</span>';
                        if (this.dinoCdInterval) {
                            clearInterval(this.dinoCdInterval);
                            this.dinoCdInterval = null;
                        }
                    }
                };
                updateBtn();
                this.dinoCdInterval = setInterval(updateBtn, 1000);
            } else {
                btn50.innerHTML = '<span class="lang-vi">Sử dụng Thẻ Tăng Kích Thước</span><span class="lang-cn">使用体型变大卡</span>';
            }
        }

        if (lock) {
            if (dinoChar) {
                dinoChar.classList.add('grown');
                dinoChar.style.transform = '';
            }
            if (dinoAura) dinoAura.classList.add('active');
            if (dinoStatus) {
                dinoStatus.classList.add('grown');
                dinoStatus.innerHTML = '<span class="lang-vi">Đã tăng kích thước 50%!</span><span class="lang-cn">体型已增大50%！</span>';
            }
        } else {
            if (dinoChar) {
                dinoChar.classList.remove('grown');
                dinoChar.classList.remove('breathing');
                dinoChar.style.transform = '';
            }
            if (dinoAura) dinoAura.classList.remove('active');
            if (dinoStatus) {
                dinoStatus.classList.remove('grown');
                dinoStatus.innerHTML = '<span class="lang-vi">Kích thước bình thường</span><span class="lang-cn">正常体型</span>';
            }
        }
    }

    renderAnnouncementPanel() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        // API 模式下无本地公告列表；模拟模式下显示已发送记录
        const myAnnouncements = this.state.announcements.filter(a => a.userId === this.user.userId);
        const section = document.getElementById('my-announcements-section');
        const list = document.getElementById('announcement-list');
        if (!section || !list) return;

        if (APP_MODE.isApi()) {
            section.style.display = 'none';
            return;
        }

        // 模拟模式：只显示已发送的公告
        const sentAnnouncements = myAnnouncements.filter(a => a.status === 'sent');
        if (sentAnnouncements.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = sentAnnouncements.map(ann => {
            const timeStr = formatDateTime(ann.submitTime);
            return `
                <div class="announcement-item">
                    <div class="announcement-content">${escapeHtml(ann.content)}</div>
                    <div class="announcement-meta">
                        <span class="status-badge sent">${t.status.sent || I18N[lang].sentStatus}</span>
                        <span class="announcement-time">${timeStr}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderHistory() {
        const list = document.getElementById('history-list');
        const empty = document.getElementById('history-empty');
        if (!list || !empty) return;

        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        const myHistory = this.state.history.filter(h => h.userId === this.user.userId);

        if (myHistory.length === 0) {
            empty.style.display = 'block';
            list.style.display = 'none';
            return;
        }

        empty.style.display = 'none';
        list.style.display = 'flex';
        list.innerHTML = myHistory.slice(0, 30).map(item => {
            const icon = item.type === 'weather' ? '🌦️' : item.type === 'time' ? '🕐' : item.type === 'flow' ? '⏳' : item.type.startsWith('dino') ? '🦖' : '📢';
            const title = t.history[item.type] || item.type;
            const timeStr = formatDateTime(item.startTime);
            const statusLabel = t.status[item.status] || item.status;
            const statusClass = item.status === 'active' ? 'pending' : item.status === 'completed' ? 'success' : 'info';
            // 根据类型生成更易读的 detail 描述
            let detailText = escapeHtml(item.detail);
            if (item.type === 'flow') {
                detailText = lang === 'vi' ? '1 giờ thực = 1 ngày game' : '现实1小时 = 游戏1天';
            } else if (item.type === 'time' && /^\d{3,4}$/.test(item.detail)) {
                const hm = parseInt(item.detail, 10);
                const hh = Math.floor(hm / 100);
                const mm = Math.round((hm % 100) * 0.6);
                detailText = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
            } else if (item.type === 'dinoSize' || item.type === 'dinoGrow50') {
                detailText = lang === 'vi' ? 'Tăng kích thước 50%' : '体型增大50%';
            } else if (item.type === 'weather') {
                const key = item.detail;
                if (I18N[lang].weatherNames[key]) {
                    detailText = I18N[lang].weatherNames[key];
                } else {
                    // 旧记录存储的是名称，反向查找 key
                    const foundKey = Object.keys(I18N.vi.weatherNames).find(k => I18N.vi.weatherNames[k] === key)
                        || Object.keys(I18N.cn.weatherNames).find(k => I18N.cn.weatherNames[k] === key);
                    detailText = foundKey ? I18N[lang].weatherNames[foundKey] : escapeHtml(key);
                }
            }

            return `
                <div class="history-item ${item.type}">
                    <span class="history-icon">${icon}</span>
                    <div class="history-info">
                        <span class="history-title">${title} — ${detailText}</span>
                    </div>
                    <span class="history-time">${timeStr}</span>
                    <span class="history-status status-badge ${statusClass}">${statusLabel}</span>
                </div>
            `;
        }).join('');
    }

    setupEventListeners() {
        // Textarea char count
        const textarea = document.getElementById('announcement-content');
        const charCount = document.getElementById('char-count');
        const charCountWrap = document.getElementById('char-count-wrap');
        if (textarea && charCount) {
            textarea.addEventListener('input', () => {
                const len = textarea.value.length;
                charCount.textContent = len;
                if (charCountWrap) {
                    const valid = len >= 2 && len <= 100;
                    charCountWrap.style.color = valid ? '' : 'var(--red)';
                }
            });
        }

        // Update player identity display
        const playerNameEl = document.getElementById('player-id-name');
        const serverSelect = document.getElementById('server-select');
        const sid = getServerId();
        if (playerNameEl) {
            const lang = document.body.getAttribute('data-lang') || 'vi';
            const fallback = lang === 'vi' ? 'Người Bí Ẩn' : I18N[lang].defaultUsername;
            playerNameEl.textContent = this.user.username || this.user.usernameCn || fallback;
        }
        if (serverSelect) {
            serverSelect.value = sid;
        }
    }

    setupStorageSync() {
        window.addEventListener('storage', (e) => {
            if (e.key === lsKeyState()) {
                this.loadState();
                this.renderAllPanels();
                this.renderHistory();
                this.startCountdowns();
            }
        });
    }

    // ========== Purchase Modal ==========
    openPurchaseModal(itemType) {
        const cfg = PURCHASE_CONFIG[itemType];
        if (!cfg) return;
        window.currentPurchaseItem = itemType;
        window.currentPurchaseQty = 1;

        const icon = document.getElementById('purchase-icon');
        const title = document.getElementById('purchase-title');
        const desc = document.getElementById('purchase-desc');
        const unitPrice = document.getElementById('purchase-unit-price');
        const qty = document.getElementById('purchase-qty');

        if (icon) icon.src = cfg.icon;
        if (title) title.innerHTML = '<span class="lang-vi">' + cfg.nameVi + '</span><span class="lang-cn">' + cfg.nameCn + '</span>';
        if (desc) desc.innerHTML = '<span class="lang-vi">' + cfg.descVi + '</span><span class="lang-cn">' + cfg.descCn + '</span>';
        if (unitPrice) unitPrice.textContent = this.formatVND(cfg.price);
        if (qty) qty.textContent = '1';
        this.updatePurchaseTotal();

        const overlay = document.getElementById('purchase-overlay');
        if (overlay) overlay.style.display = 'flex';
    }

    updatePurchaseTotal() {
        const itemType = window.currentPurchaseItem;
        if (!itemType) return;
        const cfg = PURCHASE_CONFIG[itemType];
        const qty = window.currentPurchaseQty || 1;
        const total = cfg.price * qty;
        const el = document.getElementById('purchase-total');
        if (el) el.textContent = this.formatVND(total);
    }

    formatVND(amount) {
        return amount.toLocaleString('vi-VN') + ' VND';
    }

    async confirmPurchase() {
        const itemType = window.currentPurchaseItem;
        if (!itemType) return;
        const cfg = PURCHASE_CONFIG[itemType];
        const qty = window.currentPurchaseQty || 1;
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const traceId = window.currentPurchaseTraceId;
        const itemCfg = ITEM_CONFIG[itemType];
        const skillId = itemCfg ? itemCfg.skillId : null;

        if (typeof Analytics !== 'undefined' && traceId) {
            Analytics.traceStep(traceId, 'purchase_confirm', {
                item_type: itemType,
                item_skill_id: skillId,
                qty: qty,
                total_price: cfg.price * qty
            });
        }

        closePurchaseModal();

        // ========== 真实支付模式 ==========
        if (PAYMENT_MODE.isReal() && this.api.isLoggedIn()) {
            showToast(I18N[lang].payCreatingOrder, 'info');
            const res = await this.api.userOrderApply(cfg.productId, qty);
            if (res.code === 0 && res.extra && res.extra.order_id && res.extra.pay_url) {
                const orderId = res.extra.order_id;
                const payUrl = res.extra.pay_url;

                // 保存待支付信息
                const pending = {
                    orderId, itemType, qty, cfg, traceId, skillId,
                    manager: this, payUrl, isReal: true
                };
                window.pendingPayment = pending;
                localStorage.setItem('itemManager_pending_payment', JSON.stringify({
                    orderId, itemType, qty, traceId, skillId, payUrl, isReal: true,
                    createdAt: Date.now()
                }));

                // 打开支付页（新标签页）
                window.open(payUrl, '_blank');

                // 启动轮询
                startRealPaymentPolling(orderId, pending);

                if (typeof Analytics !== 'undefined') {
                    Analytics.track('purchase_init', { item_type: itemType, order_id: orderId, qty: qty, total_price: cfg.price * qty });
                }
            } else {
                const errMsg = (res.message || I18N[lang].payCreateFailed);
                showToast(errMsg, 'error');
                if (typeof Analytics !== 'undefined') {
                    Analytics.track('purchase_init_fail', { item_type: itemType, reason: errMsg });
                }
            }
            return;
        }

        // ========== 模拟支付模式 ==========
        const orderId = generateOrderId();
        const order = {
            orderId, itemType,
            nameVi: cfg.nameVi, nameCn: cfg.nameCn,
            qty, amount: this.formatVND(cfg.price * qty),
            createdAt: Date.now(), status: 'unpaid'
        };
        addMockOrder(order);

        window.pendingPayment = {
            orderId, itemType, qty, cfg, traceId, skillId,
            manager: this
        };

        const mockStatus = getMockPaymentStatus();
        localStorage.setItem('mockPaymentStatus', mockStatus);

        const callbackUrl = location.pathname + '?paySuc=1&orderId=' + encodeURIComponent(orderId);
        window.location.href = callbackUrl;
    }
}

// ========== 支付结果弹窗 & 订单查询 ==========

window.mockOrderHistory = window.mockOrderHistory || JSON.parse(localStorage.getItem('mockOrderHistory') || '[]');
function addMockOrder(order) {
    window.mockOrderHistory.unshift(order);
    if (window.mockOrderHistory.length > 50) window.mockOrderHistory.pop();
    localStorage.setItem('mockOrderHistory', JSON.stringify(window.mockOrderHistory));
}

function generateOrderId() {
    return 'ORD' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

function getMockPaymentStatus() {
    const el = document.querySelector('input[name="mock-payment"]:checked');
    if (el) return el.value;
    const saved = localStorage.getItem('mockPaymentStatus');
    return saved || 'success';
}

async function mockQueryOrder(orderId) {
    await new Promise(r => setTimeout(r, 800));
    const mockStatus = getMockPaymentStatus();
    if (mockStatus === 'success') {
        return { success: true, orderId, status: 'paid' };
    } else {
        return { success: false, orderId, status: 'not_found', message: 'no_record' };
    }
}

// 真实支付轮询
function startRealPaymentPolling(orderId, pending) {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    const maxAttempts = 30;
    const interval = 3000;
    let attempts = 0;
    let stopped = false;

    function stop() { stopped = true; }
    window._stopPaymentPoll = stop;

    async function poll() {
        if (stopped) return;
        attempts++;
        if (attempts > maxAttempts) {
            showToast(I18N[lang].payPollingTimeout, 'warning');
            window.pendingPayment = null;
            localStorage.removeItem('itemManager_pending_payment');
            return;
        }

        const res = await window.apiClient.userOrderCheck(orderId);
        if (res.code === 0 && res.extra) {
            const status = res.extra.status;
            if (status === 'shipped') {
                stop();
                finishRealPaymentSuccess(pending);
                return;
            }
        }
        setTimeout(poll, interval);
    }

    poll();
}

function finishRealPaymentSuccess(pending) {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    const order = pending;
    if (!order || !order.manager) {
        showToast(I18N[lang].payNoRecordTitle, 'warning');
        return;
    }

    order.manager.user.inventory[order.cfg.inventoryKey] = (order.manager.user.inventory[order.cfg.inventoryKey] || 0) + order.qty;
    order.manager.saveUser();
    order.manager.renderInventory();
    openPaySuccessModal(order.itemType, order.qty);

    if (typeof Analytics !== 'undefined') {
        Analytics.track('purchase_result', { item_type: order.itemType, result: 'success', qty: order.qty, total_price: order.cfg.price * order.qty });
        if (order.traceId) Analytics.endTrace(order.traceId, 'success', { qty: order.qty, total_price: order.cfg.price * order.qty });
    }

    window.pendingPayment = null;
    window.currentPurchaseTraceId = null;
    localStorage.removeItem('itemManager_pending_payment');
}

function formatOrderTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString('vi-VN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// 支付成功弹窗
function openPaySuccessModal(itemType, qty) {
    const cfg = PURCHASE_CONFIG[itemType];
    const lang = document.body.getAttribute('data-lang') || 'vi';
    const t = I18N[lang];
    document.getElementById('pay-success-title').textContent = t.paySuccessTitle;
    document.getElementById('pay-success-content').innerHTML =
        '<img src="' + cfg.icon + '" alt=""><span>' + (lang === 'vi' ? cfg.nameVi : cfg.nameCn) + ' x' + qty + '</span>';
    const successBtn = document.getElementById('pay-success-btn');
    if (successBtn) successBtn.textContent = t.payConfirm;
    document.getElementById('pay-success-overlay').style.display = 'flex';
}
function closePaySuccessModal() {
    document.getElementById('pay-success-overlay').style.display = 'none';
}

// 无记录弹窗
function openPayFailModal() {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    const t = I18N[lang];
    document.getElementById('pay-fail-title').textContent = t.payNoRecordTitle;
    document.getElementById('pay-fail-desc').textContent = t.payNoRecordDesc;
    const btns = document.querySelectorAll('#pay-fail-overlay .result-actions button');
    if (btns[0]) btns[0].textContent = t.payRefresh;
    const footer = document.getElementById('pay-fail-footer');
    if (footer) {
        const smalls = footer.querySelectorAll('small');
        if (smalls[0]) smalls[0].textContent = t.csContact;
        if (smalls[1]) smalls[1].textContent = t.csZalo;
    }
    document.getElementById('pay-fail-overlay').style.display = 'flex';
}
function closePayFailModal() {
    document.getElementById('pay-fail-overlay').style.display = 'none';
}

function openCsContact() {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    showToast(I18N[lang].csContact + ': Zalo 8618717777125', 'info');
}

// 订单查询弹窗
function openOrderQueryModal() {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    const t = I18N[lang];
    document.getElementById('order-query-title').textContent = t.orderQueryTitle;
    const closeBtn = document.getElementById('order-query-close-btn');
    if (closeBtn) closeBtn.textContent = t.orderClose;
    renderOrderList();
    document.getElementById('order-query-overlay').style.display = 'flex';
}
function closeOrderQueryModal() {
    document.getElementById('order-query-overlay').style.display = 'none';
}

// 根据 product_id 查找道具配置
function findProductById(productId) {
    for (var key in PURCHASE_CONFIG) {
        if (PURCHASE_CONFIG[key].productId === productId) {
            return { type: key, cfg: PURCHASE_CONFIG[key] };
        }
    }
    return null;
}

function renderOrderList() {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    const t = I18N[lang];
    const listEl = document.getElementById('order-list');
    const emptyEl = document.getElementById('order-empty');

    // 真实模式：调用服务端接口
    if (PAYMENT_MODE.isReal() && window.apiClient && window.apiClient.isLoggedIn()) {
        renderRealOrderList(listEl, emptyEl, t, lang);
        return;
    }

    // 模拟模式：读取本地记录
    const orders = window.mockOrderHistory || [];
    if (orders.length === 0) {
        if (listEl) listEl.style.display = 'none';
        if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.textContent = t.orderQueryEmpty; }
        return;
    }
    if (listEl) listEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = orders.map(function(o) {
        const isPaid = o.status === 'paid';
        const statusText = isPaid ? t.orderStatusPaid : t.orderStatusUnpaid;
        const productName = lang === 'vi' ? o.nameVi : o.nameCn;
        const actionBtn = !isPaid
            ? '<button class="btn btn-sm" onclick="requeryOrder(\'' + o.orderId + '\')">' + t.orderRequery + '</button>'
            : '';
        return '<div class="order-item ' + (isPaid ? 'paid' : 'unpaid') + '">' +
            '<div class="col-product">' + productName + '</div>' +
            '<div class="col-amount">' + o.amount + '</div>' +
            '<div class="col-status">' + statusText + '</div>' +
            '<div class="col-action">' + actionBtn + '</div>' +
            '</div>' +
            '<div class="order-meta">' + o.orderId + ' · ' + formatOrderTime(o.createdAt) + '</div>';
    }).join('');
}

async function renderRealOrderList(listEl, emptyEl, t, lang) {
    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);">' + t.loading + '</div>';
    const res = await window.apiClient.userOrderQueryAll();
    console.log('[renderRealOrderList] userOrderQueryAll res:', res);
    if (res.code !== 0 || !res.extra || !res.extra.orders) {
        if (listEl) listEl.style.display = 'none';
        if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.textContent = t.orderQueryEmpty; }
        return;
    }
    const orders = res.extra.orders;
    if (orders.length === 0) {
        if (listEl) listEl.style.display = 'none';
        if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.textContent = t.orderQueryEmpty; }
        return;
    }
    if (listEl) listEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = orders.map(function(o) {
        const isPaid = o.status === 'shipped';
        const statusText = isPaid ? t.orderStatusPaid : t.orderStatusUnpaid;
        const prod = findProductById(o.product_id);
        const productName = prod ? (lang === 'vi' ? prod.cfg.nameVi : prod.cfg.nameCn) : ('ID:' + o.product_id);
        const price = prod ? prod.cfg.price : 0;
        const amount = (price * o.count).toLocaleString('vi-VN') + ' VND';
        const actionBtn = !isPaid
            ? '<button class="btn btn-sm" onclick="requeryOrder(\'' + o.order_id + '\')">' + t.orderRequery + '</button>'
            : '';
        return '<div class="order-item ' + (isPaid ? 'paid' : 'unpaid') + '">' +
            '<div class="col-product">' + productName + ' x' + o.count + '</div>' +
            '<div class="col-amount">' + amount + '</div>' +
            '<div class="col-status">' + statusText + '</div>' +
            '<div class="col-action">' + actionBtn + '</div>' +
            '</div>' +
            '<div class="order-meta">' + o.order_id + ' · ' + formatOrderTime(new Date(o.create_time).getTime()) + '</div>';
    }).join('');
}

async function requeryOrder(orderId) {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    showToast(I18N[lang].payQuerying, 'info');

    // 真实模式：调用服务端接口
    if (PAYMENT_MODE.isReal() && window.apiClient && window.apiClient.isLoggedIn()) {
        const res = await window.apiClient.userOrderCheck(orderId);
        if (res.code === 0 && res.extra && res.extra.status === 'shipped') {
            renderOrderList();
            showToast(I18N[lang].paySuccessTitle, 'success');
        } else {
            renderOrderList();
            showToast(I18N[lang].payQueryFail, 'warning');
        }
        return;
    }

    // 模拟模式：交替切换
    var order = window.mockOrderHistory.find(function(o) { return o.orderId === orderId; });
    var lastStatus = order ? order.lastRequeryStatus : null;
    var thisResult = (lastStatus === 'success') ? false : true;

    await new Promise(r => setTimeout(r, 800));

    if (order) {
        order.status = thisResult ? 'paid' : 'not_found';
        order.lastRequeryStatus = thisResult ? 'success' : 'fail';
    }
    localStorage.setItem('mockOrderHistory', JSON.stringify(window.mockOrderHistory));

    renderOrderList();
    if (thisResult) {
        showToast(I18N[lang].paySuccessTitle, 'success');
    } else {
        showToast(I18N[lang].payQueryFail, 'warning');
    }
}

// 支付回调处理（模拟模式）
function handleMockPaymentCallback(orderId) {
    var lang = document.body.getAttribute('data-lang') || 'vi';
    var pending = window.pendingPayment;

    var order = (pending && pending.orderId === orderId) ? pending : null;
    if (!order) {
        var stored = window.mockOrderHistory.find(function(o) { return o.orderId === orderId; });
        if (stored) {
            order = {
                orderId: stored.orderId,
                itemType: stored.itemType,
                qty: stored.qty,
                cfg: PURCHASE_CONFIG[stored.itemType],
                traceId: null,
                skillId: null,
                manager: window.itemManager
            };
        }
    }
    if (!order || !order.manager) {
        showToast(I18N[lang].payNoRecordTitle, 'warning');
        return;
    }

    showToast(I18N[lang].payQuerying, 'info');
    mockQueryOrder(orderId).then(function(result) {
        var storedOrder = window.mockOrderHistory.find(function(o) { return o.orderId === orderId; });
        if (storedOrder) {
            storedOrder.status = result.success ? 'paid' : 'not_found';
            localStorage.setItem('mockOrderHistory', JSON.stringify(window.mockOrderHistory));
        }

        if (result.success) {
            order.manager.user.inventory[order.cfg.inventoryKey] = (order.manager.user.inventory[order.cfg.inventoryKey] || 0) + order.qty;
            order.manager.saveUser();
            order.manager.renderInventory();
            openPaySuccessModal(order.itemType, order.qty);
            if (typeof Analytics !== 'undefined') {
                Analytics.track('purchase_result', { item_type: order.itemType, result: 'success', qty: order.qty, total_price: order.cfg.price * order.qty });
                if (order.traceId) Analytics.endTrace(order.traceId, 'success', { qty: order.qty, total_price: order.cfg.price * order.qty });
            }
        } else {
            openPayFailModal();
            if (typeof Analytics !== 'undefined') {
                Analytics.track('purchase_result', { item_type: order.itemType, result: 'fail', reason: 'no_record' });
                if (order.traceId) Analytics.endTrace(order.traceId, 'fail', { reason: 'no_record' });
            }
        }
        window.pendingPayment = null;
        window.currentPurchaseTraceId = null;
    });
}

// 恢复真实支付 pending（页面加载时从 localStorage 读取）
function restoreRealPendingPayment() {
    var raw = localStorage.getItem('itemManager_pending_payment');
    if (!raw) return null;
    try {
        var saved = JSON.parse(raw);
        if (!saved || !saved.isReal || !saved.orderId) return null;
        // 超过 30 分钟视为过期
        if (Date.now() - saved.createdAt > 30 * 60 * 1000) {
            localStorage.removeItem('itemManager_pending_payment');
            return null;
        }
        var cfg = PURCHASE_CONFIG[saved.itemType];
        if (!cfg) return null;
        return {
            orderId: saved.orderId,
            itemType: saved.itemType,
            qty: saved.qty,
            cfg: cfg,
            traceId: saved.traceId,
            skillId: saved.skillId,
            manager: window.itemManager,
            payUrl: saved.payUrl,
            isReal: true
        };
    } catch (e) {
        localStorage.removeItem('itemManager_pending_payment');
        return null;
    }
}

// 页面加载时检测支付回调
function checkPaymentUrlCallback() {
    // 1. 模拟模式：检测 URL 参数
    var params = new URLSearchParams(location.search);
    var paySuc = params.get('paySuc');
    var orderId = params.get('orderId');
    if (paySuc === '1' && orderId) {
        var url = new URL(location.href);
        url.searchParams.delete('paySuc');
        url.searchParams.delete('orderId');
        history.replaceState(null, '', url.toString());
        setTimeout(function() {
            handleMockPaymentCallback(orderId);
        }, 500);
        return;
    }

    // 2. 真实模式：检测 localStorage 中的 pendingPayment
    var pending = restoreRealPendingPayment();
    if (pending && window.itemManager) {
        window.pendingPayment = pending;
        showToast(I18N[document.body.getAttribute('data-lang') || 'vi'].payQuerying, 'info');
        startRealPaymentPolling(pending.orderId, pending);
    }
}

// Purchase config
const PURCHASE_CONFIG = {
    weather: {
        productId: 102,
        price: 130000,
        icon: './static/icons/weather.png',
        nameVi: 'Thẻ Thời Tiết',
        nameCn: '天气卡',
        descVi: 'Thay đổi thời tiết trong game trong 10 phút.',
        descCn: '改变游戏内天气，持续10分钟。',
        inventoryKey: 'weather'
    },
    time: {
        productId: 105,
        price: 130000,
        icon: './static/icons/time.png',
        nameVi: 'Thẻ Thời Gian',
        nameCn: '时间卡',
        descVi: 'Đặt thời gian game theo ý muốn, hiệu lực 10 phút.',
        descCn: '按意愿设定游戏时间，有效期10分钟。',
        inventoryKey: 'time'
    },
    announcement: {
        productId: 104,
        price: 130000,
        icon: './static/icons/announcement.png',
        nameVi: 'Thẻ Thông Báo',
        nameCn: '公告卡',
        descVi: 'Gửi thông báo toàn server, cần qua kiểm duyệt.',
        descCn: '发送全服公告，需经过审核。',
        inventoryKey: 'announcement'
    },
    flow: {
        productId: 103,
        price: 250000,
        icon: './static/icons/flow.png',
        nameVi: 'Thẻ Dòng Chảy',
        nameCn: '时间流动卡',
        descVi: 'Tăng tốc thời gian game, 1 giờ thực = 1 ngày game.',
        descCn: '加速游戏时间流逝，现实1小时=游戏1整天。',
        inventoryKey: 'flow'
    },
    dinoGrow50: {
        productId: 101,
        price: 100000,
        icon: './static/icons/dino.png',
        nameVi: 'Thẻ Tăng Kích Thước',
        nameCn: '体型变大卡',
        descVi: 'Tăng kích thước khủng long 50%.',
        descCn: '使恐龙体型增大50%。',
        inventoryKey: 'dinoGrow50'
    }
};

// 支付模式管理
const PAYMENT_MODE = {
    get mode() { return localStorage.getItem('itemManager_payment_mode') || 'mock'; },
    set mode(v) { localStorage.setItem('itemManager_payment_mode', v); },
    isMock() { return this.mode === 'mock'; },
    isReal() { return this.mode === 'real'; },
    toggle() {
        this.mode = this.isMock() ? 'real' : 'mock';
        return this.mode;
    }
};

function openPurchaseModal(itemType) {
    if (window.itemManager) window.itemManager.openPurchaseModal(itemType);
}

function confirmPurchase() {
    if (window.itemManager) window.itemManager.confirmPurchase();
}

function closePurchaseModal() {
    const overlay = document.getElementById('purchase-overlay');
    if (overlay) overlay.style.display = 'none';
    window.currentPurchaseItem = null;
    window.currentPurchaseQty = 1;
}

function changePurchaseQty(delta) {
    window.currentPurchaseQty = Math.max(1, Math.min(99, (window.currentPurchaseQty || 1) + delta));
    const qtyEl = document.getElementById('purchase-qty');
    if (qtyEl) qtyEl.textContent = window.currentPurchaseQty;
    if (window.itemManager) window.itemManager.updatePurchaseTotal();
}

function toggleInvVisibility(itemKey, visible) {
    if (window.itemManager) window.itemManager.toggleInvVisibility(itemKey, visible);
}

function togglePaymentMode(mode) {
    PAYMENT_MODE.mode = mode;
    const mockControls = document.getElementById('mock-payment-controls');
    if (mockControls) {
        mockControls.style.opacity = (mode === 'real') ? '0.4' : '1';
        mockControls.style.pointerEvents = (mode === 'real') ? 'none' : 'auto';
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toast
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Language Toggle
function applyLangUI(lang) {
    document.body.setAttribute('data-lang', lang);
    // Update title
    document.title = lang === 'vi' ? 'Trung Tâm Thần Tích' : I18N[lang].appTitle;

    // Update textarea placeholder
    const textarea = document.getElementById('announcement-content');
    if (textarea) {
        textarea.placeholder = lang === 'vi' ? 'Nhập nội dung...' : I18N[lang].enterContentPlaceholder;
    }

    // Update player identity
    const playerNameEl = document.getElementById('player-id-name');
    const manager = window.itemManager;
    if (playerNameEl && manager) {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const fallback = lang === 'vi' ? 'Người Bí Ẩn' : I18N[lang].defaultUsername;
        playerNameEl.textContent = manager.user.username || manager.user.usernameCn || fallback;
    }
}

function toggleLanguage() {
    const currentLang = document.body.getAttribute('data-lang') || 'vi';
    const newLang = currentLang === 'vi' ? 'cn' : 'vi';
    localStorage.setItem('lang', newLang);
    applyLangUI(newLang);

    // Re-render
    if (window.itemManager) {
        window.itemManager.renderAllPanels();
        window.itemManager.renderHistory();
        window.itemManager.startCountdowns();
    }
}

// Tab Switch
function switchTab(tab) {
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel-${tab}`);
    });
    if (window.itemManager) {
        window.itemManager.currentTab = tab;
    }
}

function useFlowCard() {
    if (window.itemManager) window.itemManager.useFlowCard();
}

function stopFlowCard() {
    if (window.itemManager) window.itemManager.stopFlowCard();
}

// Quick use from inventory bar — opens detail panel only
function quickUseWeather() {
    switchTab('weather');
}

function quickUseTime() {
    switchTab('time');
}

function quickUseAnnouncement() {
    switchTab('announcement');
    setTimeout(() => {
        document.getElementById('announcement-content')?.focus();
    }, 150);
}

function quickUseFlow() {
    switchTab('flow');
}

function quickUseDinoGrow() {
    switchTab('dino-grow');
}

// Global actions
function useWeatherCard() {
    if (window.itemManager) window.itemManager.useWeatherCard();
}

function useTimeCard() {
    if (window.itemManager) window.itemManager.useTimeCard();
}

function useDinoSizeCard() {
    if (window.itemManager) window.itemManager.useDinoSizeCard();
}

function adjustTime(delta) {
    if (!window.itemManager) return;
    const slider = document.getElementById('time-slider');
    const skyTime = document.getElementById('sky-time');
    let minutes = gameValToMinutes(window.itemManager.selectedOptions.time || 1200);
    minutes += delta;
    if (minutes < 0) minutes = 0;
    if (minutes > 1439) minutes = 1439;
    const gv = minutesToGameVal(minutes);
    const hhmm = minutesToHHMM(minutes);
    if (slider) slider.value = minutes;
    if (skyTime) skyTime.textContent = hhmm;
    window.itemManager.selectedOptions.time = gv;
    updateSky(Math.floor(minutes / 60), minutes % 60);
    // 取消预设选中状态
    document.querySelectorAll('#time-presets .preset-btn').forEach(b => b.classList.remove('selected'));
}

function resetInventory() {
    if (window.itemManager) window.itemManager.resetInventory();
}

function submitAnnouncement() {
    const content = document.getElementById('announcement-content')?.value || '';
    if (window.itemManager) {
        window.itemManager.submitAnnouncement(content);
        document.getElementById('announcement-content').value = '';
        document.getElementById('char-count').textContent = '0';
    }
}

// Debug panel: simulate server errors
function toggleDebugPanel() {
    const panel = document.getElementById('debug-panel');
    const btn = document.querySelector('.debug-toggle');
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    if (btn) btn.classList.toggle('active', !isVisible);
}

function setupDebugMock() {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    const radios = document.querySelectorAll('input[name="mock-error"]');
    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            const val = radio.value;
            if (!val) {
                window.__mockServerError = null;
            } else if (val === 'SYSTEM_ERROR') {
                const code = `ERR_500_${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}`;
                window.__mockServerError = { success: false, code: val, errorCode: code };
            } else {
                window.__mockServerError = { success: false, code: val };
            }
        });
    });
    // Restore mock-expired checkbox state
    const expiredCb = document.getElementById('mock-expired');
    if (expiredCb) {
        expiredCb.checked = localStorage.getItem('itemManager_mockExpired') === '1';
    }
    // Restore app mode
    const appModeRadios = document.querySelectorAll('input[name="app-mode"]');
    const savedAppMode = APP_MODE.mode;
    appModeRadios.forEach(function(r) {
        if (r.value === savedAppMode) r.checked = true;
    });
    // Restore payment mode
    const paymentRadios = document.querySelectorAll('input[name="payment-mode"]');
    const savedPaymentMode = PAYMENT_MODE.mode;
    paymentRadios.forEach(function(r) {
        if (r.value === savedPaymentMode) r.checked = true;
    });
    togglePaymentMode(savedPaymentMode);
    // Toggle debug panel controls based on mode
    const isApi = APP_MODE.isApi();
    const mockControls = document.getElementById('mock-controls');
    const mockExpiredControl = document.getElementById('mock-expired-control');
    const apiControls = document.getElementById('api-controls');
    const apiDivider = document.getElementById('api-divider');
    const apiClearControls = document.getElementById('api-clear-controls');
    const btnResetMock = document.getElementById('btn-reset-mock');
    const hint = document.getElementById('debug-hint');
    if (mockControls) mockControls.style.display = isApi ? 'none' : 'flex';
    if (mockExpiredControl) mockExpiredControl.style.display = isApi ? 'none' : 'flex';
    if (apiControls) apiControls.style.display = isApi ? 'flex' : 'none';
    if (apiDivider) apiDivider.style.display = isApi ? 'block' : 'none';
    if (apiClearControls) apiClearControls.style.display = isApi ? 'flex' : 'none';
    if (btnResetMock) btnResetMock.style.display = isApi ? 'none' : 'inline-flex';
    if (hint) hint.textContent = isApi ? I18N[lang].apiModeLabel : I18N[lang].mockModeLabel;
}

/* ── auth check ── */
/**
 * 权限检查入口
 * 实际项目中请替换为真实的 API 校验，例如：
 *   const res = await fetch('/api/check-auth', { headers: { Authorization: 'Bearer ' + token } });
 *   if (!res.ok) { showAuthBanner(); return false; }
 */
function checkAuth() {
    const token = localStorage.getItem('itemManager_token');
    // 默认放行（无 token 时演示模式），如需强制登录请取消下行注释：
    // if (!token) { showAuthBanner(); return false; }
    // Mock: simulate login expired
    if (localStorage.getItem('itemManager_mockExpired') === '1') {
        showAuthBanner();
        return false;
    }
    return true;
}

function showAuthBanner() {
    const banner = document.getElementById('auth-banner');
    if (banner) banner.style.display = 'block';
}

function handleRelogin() {
    localStorage.removeItem('itemManager_mockExpired');
    window.location.reload();
}

function toggleMockExpired(checked) {
    if (checked) {
        localStorage.setItem('itemManager_mockExpired', '1');
    } else {
        localStorage.removeItem('itemManager_mockExpired');
    }
}

// ========== API Mode Global Functions ==========

function doApiLogin() {
    // 跳转到临时统一登录页，登录完成后自动返回
    window.location.href = 'login.html';
}

function updatePlayerIdentityDisplay() {
    const manager = window.itemManager;
    const accountEl = document.getElementById('player-id-account');
    const nameEl = document.getElementById('player-id-name');
    const loginBtn = document.getElementById('player-id-login-btn');
    const lang = document.body.getAttribute('data-lang') || 'vi';

    if (APP_MODE.isApi()) {
        const isLoggedIn = manager && manager.api && manager.api.isLoggedIn();
        if (!isLoggedIn) {
            if (accountEl) accountEl.textContent = '';
            if (nameEl) {
                nameEl.innerHTML = '<span class="lang-cn">您的登录已过期或无访问权限，请重新登录</span>';
                nameEl.style.color = '#9ca3af';
                nameEl.style.fontSize = '0.82rem';
            }
            if (loginBtn) loginBtn.style.display = 'inline-flex';
            return;
        }

        // 已登录
        const gameUid = manager.api.gameUid || '';
        if (accountEl) accountEl.textContent = gameUid;

        const status = manager && manager.user ? manager.user.nicknameStatus : 'pending';
        if (nameEl) {
            if (status === 'pending_server' || status === 'pending') {
                const msg = lang === 'vi'
                    ? 'Vui lòng chọn máy chủ'
                    : '请选择服务器';
                nameEl.textContent = msg;
                nameEl.style.color = 'var(--gold)';
                nameEl.style.fontSize = '0.85rem';
            } else if (status === 'loading') {
                const msg = lang === 'vi'
                    ? 'Đang tra cứu biệt danh...'
                    : '正在查询昵称...';
                nameEl.textContent = msg;
                nameEl.style.color = 'var(--gold)';
                nameEl.style.fontSize = '0.85rem';
            } else if (status === 'not_found' || status === 'error') {
                const msg = lang === 'vi'
                    ? '⚠️ Không tìm thấy biệt danh trên máy chủ này'
                    : '⚠️ 该服务器下未查询到 nickname';
                nameEl.textContent = msg;
                nameEl.style.color = 'var(--red)';
                nameEl.style.fontSize = '0.85rem';
            } else if (status === 'ok') {
                const displayName = manager.user.username || manager.user.usernameCn || '';
                nameEl.textContent = displayName;
                nameEl.style.color = '';
                nameEl.style.fontSize = '';
            } else {
                nameEl.textContent = '';
                nameEl.style.color = '';
                nameEl.style.fontSize = '';
            }
        }
        if (loginBtn) loginBtn.style.display = 'none';
    } else {
        // 模拟模式
        if (!manager) return;
        const uid = manager.user.userId || '';
        if (accountEl) accountEl.textContent = uid.replace('player_', '');
        if (nameEl) {
            const fallback = lang === 'vi' ? 'Ngườ Bí Ẩn' : I18N[lang].defaultUsername;
            nameEl.textContent = manager.user.username || manager.user.usernameCn || fallback;
            nameEl.style.color = '';
            nameEl.style.fontSize = '';
        }
        if (loginBtn) loginBtn.style.display = 'none';
    }
}
function checkNicknameReady() {
    const manager = window.itemManager;
    const lang = document.body.getAttribute('data-lang') || 'vi';
    if (APP_MODE.isApi() && manager && manager.api && manager.api.isLoggedIn()) {
        const status = manager.user ? manager.user.nicknameStatus : 'pending';
        if (status !== 'ok') {
            const msg = lang === 'vi'
                ? 'Vui lòng chọn máy chủ và tra cứu biệt danh trước'
                : '请先选择服务器并查询昵称';
            showToast(msg, 'warning');
            return false;
        }
    }
    return true;
}


function switchMode(mode) {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    APP_MODE.mode = mode;
    showToast(mode === 'api' ? I18N[lang].switchedToApi : I18N[lang].switchedToMock, 'info');
    setTimeout(() => location.reload(), 800);
}

async function refreshApiData() {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    if (!APP_MODE.isApi() || !window.itemManager) return;
    const ok = await window.itemManager.syncFromApi();
    if (ok) {
        window.itemManager.renderInventory();
        window.itemManager.renderAllPanels();
        window.itemManager.renderHistory();
        window.itemManager.startCountdowns();
        showToast(I18N[lang].dataRefreshed, 'success');
    }
}

async function forceClearRecords() {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    if (!APP_MODE.isApi() || !window.itemManager) return;
    const api = window.itemManager.api;
    const res = await api.getRecords();
    if (res.code !== 0 || !res.extra || !res.extra.records) {
        showToast(I18N[lang].getRecordsFailed + (res.message || I18N[lang].unknownError), 'error');
        return;
    }
    const records = res.extra.records;
    const activeRecords = records.filter(r => {
        const status = String(r.status || '');
        return status === 'doing' || status === '1' || status === 'todo';
    });
    if (activeRecords.length === 0) {
        showToast(I18N[lang].noRecordsToClear, 'info');
        return;
    }
    let success = 0;
    let fail = 0;
    for (const r of activeRecords) {
        const result = await api.gmSuccess(r.record_id);
        if (result.code === 0) {
            success++;
            console.log('[forceClear] ✅', r.record_id, 'skill_id=' + r.skill_id);
        } else {
            fail++;
            console.log('[forceClear] ❌', r.record_id, result.message || result.code);
        }
    }
    showToast(I18N[lang].clearComplete + success + I18N[lang].clearFailSuffix + fail, fail > 0 ? 'warning' : 'success');
    // 重新同步
    await window.itemManager.syncFromApi();
    window.itemManager.renderInventory();
    window.itemManager.renderAllPanels();
    window.itemManager.renderHistory();
    window.itemManager.startCountdowns();
}

// 调试用：在控制台输出当前API库存
async function debugApiInventory() {
    if (!window.itemManager || !window.itemManager.api) return;
    const res = await window.itemManager.api.getBenefits();
    console.log('API Benefits:', res);
    const records = await window.itemManager.api.getRecords();
    console.log('API Records:', records);
}

function doApiLogout() {
    if (window.itemManager && window.itemManager.api) {
        window.itemManager.api.logout();
        // 清空本地状态，确保面板显示为空
        window.itemManager.user.inventory = {
            ...(Object.keys(ITEM_CONFIG).reduce((acc, type) => {
                acc[ITEM_CONFIG[type].inventoryKey] = 0;
                return acc;
            }, {}))
        };
        window.itemManager.state.globalLocks = { weather: null, time: null, flow: null, dinoSize: null };
        window.itemManager.saveUser();
        window.itemManager.saveState();
        window.itemManager.renderInventory();
        window.itemManager.renderAllPanels();
        window.itemManager.startCountdowns();
        window.itemManager.updateAuthUI();
        showToast(I18N[lang].loggedOut, 'info');
    }
}

// Override resetInventory for API mode
const _originalResetInventory = resetInventory;
resetInventory = async function() {
    if (APP_MODE.isApi() && window.itemManager) {
        const client = window.itemManager.api;
        const gameUid = client.gameUid || 13222545;
        const skills = [1, 2, 3, 4, 5];
        let successCount = 0;
        let failMsg = '';
        for (const sid of skills) {
            const res = await client.simAddBenefit(gameUid, sid, 3);
            console.log('[simAddBenefit] skill=' + sid, res);
            if (res.code === 0) {
                successCount++;
            } else if (res.code === 91) {
                failMsg = I18N[lang].loginExpired;
                client.logout();
                window.itemManager.updateAuthUI();
                break;
            } else {
                failMsg = res.message || ('skill_id=' + sid + I18N[lang].supplementFailed + res.code);
            }
        }
        if (failMsg) {
            showToast(failMsg, 'error');
            return;
        }
        // 延迟一点再同步，给服务端写入时间
        setTimeout(async () => {
            const ok = await window.itemManager.syncFromApi();
            if (ok) {
                window.itemManager.renderInventory();
                window.itemManager.renderAllPanels();
                showToast(I18N[lang].supplemented + successCount + I18N[lang].supplementedSuffix, 'success');
            }
        }, 500);
        return;
    }
    _originalResetInventory();
};

// Initialize
let itemManager;
function initApp() {
    const savedLang = localStorage.getItem('lang') || 'vi';
    applyLangUI(savedLang);
    // 恢复模拟支付状态 radio 按钮
    const savedMockStatus = localStorage.getItem('mockPaymentStatus');
    if (savedMockStatus) {
        const radio = document.querySelector('input[name="mock-payment"][value="' + savedMockStatus + '"]');
        if (radio) radio.checked = true;
    }
    itemManager = new ItemManager();
    window.itemManager = itemManager;
    checkPaymentUrlCallback();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
