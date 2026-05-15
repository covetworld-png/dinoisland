// ============================================
// Trung Tâm Đạo Cụ - Item Manager
// LocalStorage-based state with cross-tab sync
// ============================================

// 道具时效（毫秒）
const DURATION_WEATHER = 10 * 1000;      // 调试：10秒（正式版：10 * 60 * 1000 = 10分钟）
const DURATION_TIME    = 10 * 1000;      // 调试：10秒（正式版：10 * 60 * 1000 = 10分钟）
const DURATION_FLOW    = 60 * 1000;    // 调试：1分钟（正式版：60 * 60 * 1000 = 60分钟）
// 体型变化：无固定时效（endTime = Infinity，龙死亡/下线时失效）

// Server-scoped localStorage keys
function getServerId() {
    return localStorage.getItem('itemManager_serverId') || 'Q';
}
function lsKeyState() { return `itemManager_state_v1_${getServerId()}`; }
function lsKeyUser()  { return `itemManager_user_v1_${getServerId()}`; }
function lsKeyLogs()   { return `itemManager_logs_v1_${getServerId()}`; }

// 服务器切换
function switchServer(sid) {
    localStorage.setItem('itemManager_serverId', sid);
    location.reload();
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
        if (state.history.length > 50) state.history.pop();
        
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

// Translations
const I18N = {
    vi: {
        ready: 'Sẵn sàng',
        inUse: 'Đang sử dụng',
        busy: 'Đang bận',
        conflictWeather: (name, time) => `Người chơi ${name} đang sử dụng Thẻ Thời Tiết, còn lại ${time}`,
        conflictTime: (name, time) => `Người chơi ${name} đang sử dụng Thẻ Thời Gian, còn lại ${time}`,
        conflictDinoSize: (name, time) => `Người chơi ${name} đang thay đổi kích thước, còn lại ${time}`,
        conflictFlow: (name, time) => `Người chơi ${name} đang sử dụng Dòng Chảy Thờ Gian, còn lại ${time}`,
        conflictFlowByTime: (time) => `Thẻ Thờ Gian đang sử dụng (${time}), không thể khởi động dòng chảy`,
        conflictTimeByFlow: (time) => `Dòng Chảy Thờ Gian đang chạy (${time}), không thể sử dụng thẻ thờ gian`,
        noItem: 'Không đủ đạo cụ',
        connectingServer: 'Đang kết nối server...',
        serverErrorConflict: 'Server: Có người chơi khác đang sử dụng đạo cụ này, vui lòng thử lại sau',
        serverErrorNoItem: 'Server: Không đủ đạo cụ',
        serverErrorSystem: () => `Lỗi hệ thống, vui lòng liên hệ quản trị viên`,
        selectOption: 'Vui lòng chọn một tùy chọn',
        useSuccess: (type) => `Sử dụng ${type} thành công!`,
        useFailed: 'Sử dụng thất bại, vui lòng thử lại',
        submitSuccess: 'Gửi thông báo thành công, đang chờ duyệt',
        enterContent: 'Vui lòng nhập nội dung thông báo',
        timeUp: 'Hết thời gian, đã tự động kết thúc',
        approved: 'Thông báo đã đườc duyệt',
        clickToSend: 'Đã duyệt, nhấn để gửi',
        sendAnnouncement: 'Gửi thông báo',
        sent: 'Thông báo đã đườc gửi toàn server',
        history: {
            weather: 'Thẻ Thời Tiết',
            time: 'Thẻ Thời Gian',
            announcement: 'Thông báo',
            dinoGrow50: 'Tăng kích thước 50%'
        },
        status: {
            pending_review: 'Chờ duyệt',
            approved: 'Đã duyệt',
            queued: 'Chờ gửi',
            sent: 'Đã gửi',
            active: 'Đang hoạt động',
            completed: 'Hoàn thành'
        },
        weatherNames: {
            sunshine: 'Nắng',
            cloudy_fog: 'Âm u có sương',
            light_rain: 'Mưa nhỏ',
            snowfall: 'Tuyết',
            thunderstorm: 'Mưa bão',
            heavy_rain: 'Mưa lớn',
            blizzard: 'Sương mù',
            sandstorm: 'Bão cát',
            aurora: 'Nửa mây',
            meteor_shower: 'Mưa + Nắng'
        },
        timeNames: {
            dawn: 'Bình minh',
            day: 'Ban ngày',
            dusk: 'Hoàng hôn',
            night: 'Đêm khuya'
        }
    },
    cn: {
        ready: '就绪',
        inUse: '使用中',
        busy: '占用中',
        conflictWeather: (name, time) => `玩家 ${name} 正在使用天气卡，剩余 ${time}`,
        conflictTime: (name, time) => `玩家 ${name} 正在使用时间卡，剩余 ${time}`,
        conflictFlow: (name, time) => `玩家 ${name} 正在使用时间流动卡，剩余 ${time}`,
        conflictFlowByTime: (time) => `时间卡正在使用中 (${time})，无法启动时间流动`,
        conflictTimeByFlow: (time) => `时间流动正在运行中 (${time})，无法使用时间卡`,
        conflictDinoSize: (name, time) => `玩家 ${name} 正在改变体型，剩余 ${time}`,
        noItem: '道具不足',
        connectingServer: '正在连接服务端...',
        serverErrorConflict: '服务端返回：有其他玩家正在使用该道具，请稍后再试',
        serverErrorNoItem: '服务端返回：道具数量不足',
        serverErrorSystem: () => `系统错误，请联系管理员`,
        selectOption: '请选择一个选项',
        useSuccess: (type) => `${type} 使用成功！`,
        useFailed: '使用失败，请重试',
        submitSuccess: '公告提交成功，等待审核',
        enterContent: '请输入公告内容',
        timeUp: '时间结束，已自动重置',
        approved: '公告已通过审核',
        clickToSend: '审核已通过，点击发送',
        sendAnnouncement: '发送公告',
        sent: '公告已发送至全服',
        history: {
            weather: '天气卡',
            time: '时间卡',
            announcement: '全服公告',
            flow: '时间流动卡',
            dinoGrow50: '体型增大50%'
        },
        status: {
            pending_review: '待审核',
            approved: '已通过',
            queued: '待发送',
            sent: '已发送',
            active: '进行中',
            completed: '已完成'
        },
        weatherNames: {
            sunshine: '阳光',
            cloudy_fog: '阴天起雾',
            light_rain: '小雨',
            snowfall: '下雪',
            thunderstorm: '暴雨',
            heavy_rain: '大雨',
            blizzard: '雾',
            sandstorm: '沙尘',
            aurora: '半云',
            meteor_shower: '雨_阳光'
        },
        timeNames: {
            dawn: '清晨',
            day: '白天',
            dusk: '黄昏',
            night: '深夜'
        }
    }
};

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
        this.currentTab = 'weather';
        this.selectedOptions = { weather: null, time: 1200 };
        this.init();
    }

    loadUser() {
        const sid = getServerId();
        const serverNicknames = {
            Q: { vi: 'robo', cn: 'robo' },
            K: { vi: '东皇没大', cn: '东皇没大' }
        };
        const nick = serverNicknames[sid] || { vi: 'robo', cn: 'robo' };
        let user = localStorage.getItem(lsKeyUser());
        if (user) {
            user = JSON.parse(user);
            // Merge new fields for backward compatibility
            if (!user.inventory) user.inventory = {};
            if (user.inventory.flowCard === undefined) user.inventory.flowCard = 3;
            if (user.inventory.dinoGrow50 === undefined) user.inventory.dinoGrow50 = 3;
            // Update nickname per server
            user.username = nick.vi;
            user.usernameCn = nick.cn;
            localStorage.setItem(lsKeyUser(), JSON.stringify(user));
            return user;
        }
        user = {
            userId: 'player_13225799',
            username: nick.vi,
            usernameCn: nick.cn,
            inventory: {
                weatherCard: 3,
                timeCard: 3,
                announcementCard: 3,
                flowCard: 3,
                dinoGrow50: 3
            }
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
                this.user.inventory = {
                    weatherCard: 0, timeCard: 0, announcementCard: 0,
                    flowCard: 0, dinoGrow50: 0
                };
                this.state.globalLocks = { weather: null, time: null, flow: null, dinoSize: null };
                this.saveUser();
                this.saveState();
                this.cleanupHistory();
                updatePlayerIdentityDisplay();
                this.renderInventory();
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
            this.syncFromApi().then(() => {
                this.cleanupHistory();
                updatePlayerIdentityDisplay();
                this.renderInventory();
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
            // API模式：定时轮询同步状态（5秒一次）
            this._startApiPolling();
            return;
        }

        this.cleanupHistory();
        updatePlayerIdentityDisplay();
        this.renderInventory();
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
                showToast('登录已过期，请重新登录', 'warning');
                return false;
            }
            if (benefitsRes.code === 0 && benefitsRes.extra) {
                const benefits = benefitsRes.extra.benefits || [];
                console.log('[syncFromApi] benefits:', benefits);
                this.user.inventory = mapApiBenefitsToInventory(benefits);
                if (this.api.gameUid && this.user.userId !== 'player_' + this.api.gameUid) {
                    this.user.userId = 'player_' + this.api.gameUid;
                }
                this.user.username = '';
                this.user.usernameCn = '';
                this.saveUser();
                updatePlayerIdentityDisplay();
                if (benefits.length === 0) {
                    showToast('当前账号库存为空，请使用 simAddBenefit 补充', 'info');
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
            showToast('API 同步失败: ' + e.message, 'error');
            return false;
        }
    }

    updateAuthUI() {
        const panel = document.getElementById('auth-panel-inline');
        const status = document.getElementById('auth-status');
        const logoutBtn = document.getElementById('auth-logout');
        const modeSelect = document.getElementById('mode-select');
        if (modeSelect) modeSelect.value = APP_MODE.mode;
        if (APP_MODE.isApi()) {
            if (this.api.isLoggedIn()) {
                if (panel) panel.style.display = 'flex';
                if (status) { status.style.display = 'inline'; status.textContent = '✓ API已连接'; status.style.color = 'var(--green)'; }
                if (logoutBtn) logoutBtn.style.display = 'inline-flex';
            } else {
                if (panel) panel.style.display = 'none';
                if (status) status.style.display = 'none';
                if (logoutBtn) logoutBtn.style.display = 'none';
            }
        } else {
            if (panel) panel.style.display = 'none';
            if (status) { status.style.display = 'inline'; status.textContent = '🧪 模拟模式'; status.style.color = 'var(--gold)'; }
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
        // dinoSize has no fixed expiration (expires on dino death/logout)
        if (type === 'dinoSize') return lock;
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
                showToast(t.invalidOption || '无效的天气选择', 'error');
                return;
            }
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            
            // 先结束自己旧的 weather 记录，避免 118
            const recordsRes = await this.api.getRecords();
            if (recordsRes.code === 0 && recordsRes.extra && recordsRes.extra.records) {
                const oldRecord = recordsRes.extra.records.find(r => {
                    const status = String(r.status || '');
                    return parseInt(r.skill_id, 10) === 2 && (status === 'doing' || status === '1' || status === 'todo');
                });
                if (oldRecord && oldRecord.record_id) {
                    console.log('[gmSuccess] ending old weather record', oldRecord.record_id);
                    await this.api.gmSuccess(oldRecord.record_id);
                }
            }
            
            const res = await this.api.apply(2, serverId, { weather_id: weatherId });
            if (res.code === 0) {
                showToast(lang === 'vi' ? 'Đã gửi, đang chờ kích hoạt... (hiệu lực đến khi khủng long chết hoặc đăng xuất)' : '已提交，等待生效...（有效期至恐龙死亡或退出游戏）', 'info');
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
                    detail: t.weatherNames[selected] || selected,
                    startTime: now,
                    endTime: now + DURATION_WEATHER,
                    status: 'active'
                });
                if (this.state.history.length > 50) this.state.history.pop();
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
                showToast(t.invalidOption || '无效的时间选择', 'error');
                return;
            }
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            
            // 先结束自己旧的 time 记录（skill_id=5, time_hm>0），避免 118
            const recordsRes = await this.api.getRecords();
            if (recordsRes.code === 0 && recordsRes.extra && recordsRes.extra.records) {
                const oldRecord = recordsRes.extra.records.find(r => {
                    const status = String(r.status || '');
                    const sid = parseInt(r.skill_id, 10);
                    const timeHm = parseInt(r.time_hm, 10);
                    return sid === 5 && timeHm > 0 && (status === 'doing' || status === '1' || status === 'todo');
                });
                if (oldRecord && oldRecord.record_id) {
                    console.log('[gmSuccess] ending old time record', oldRecord.record_id);
                    await this.api.gmSuccess(oldRecord.record_id);
                }
            }
            
            const res = await this.api.apply(5, serverId, { time_hm: selected });
            if (res.code === 0) {
                const hh = Math.floor(selected / 100);
                const mm = Math.round((selected % 100) * 0.6);
                const detail = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
                showToast('已提交，等待生效中...', 'info');
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
                if (this.state.history.length > 50) this.state.history.pop();
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
            
            // 先结束自己旧的 flow 记录（skill_id=3, time_hm=0），避免 118
            const recordsRes = await this.api.getRecords();
            if (recordsRes.code === 0 && recordsRes.extra && recordsRes.extra.records) {
                const oldRecord = recordsRes.extra.records.find(r => {
                    const status = String(r.status || '');
                    const sid = parseInt(r.skill_id, 10);
                    const timeHm = parseInt(r.time_hm, 10);
                    return sid === 3 && (timeHm === 0 || isNaN(timeHm)) && (status === 'doing' || status === '1' || status === 'todo');
                });
                if (oldRecord && oldRecord.record_id) {
                    console.log('[gmSuccess] ending old flow record', oldRecord.record_id);
                    await this.api.gmSuccess(oldRecord.record_id);
                }
            }
            
            const res = await this.api.apply(3, serverId, { time_hm: 0 });
            if (res.code === 0) {
                showToast('已提交，等待生效中...', 'info');
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
                if (this.state.history.length > 50) this.state.history.pop();
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
        const inventoryKey = 'dinoGrow50';

        // 防连点：1分钟冷却
        const cd = this.cooldowns.dino;
        if (cd && Date.now() < cd) {
            const remaining = Math.ceil((cd - Date.now()) / 1000);
            showToast(lang === 'vi' ? `Vui lòng chờ ${remaining} giây` : `请等待 ${remaining} 秒后重试`, 'warning');
            return;
        }

        if (this.user.inventory[inventoryKey] <= 0) {
            showToast(t.noItem, 'error');
            return;
        }

        // API模式
        if (APP_MODE.isApi()) {
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            const res = await this.api.apply(1, serverId);
            if (res.code === 0) {
                showToast('已提交，等待生效中...', 'info');
                const now = Date.now();
                // 乐观设置临时锁（体型变化无固定过期）
                this.state.globalLocks.dinoSize = {
                    userId: this.user.userId,
                    username: this.user.username,
                    usernameCn: this.user.usernameCn,
                    startTime: now,
                    endTime: Infinity,
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
                    detail: t.history.dinoGrow50,
                    startTime: now,
                    endTime: null,
                    status: 'active'
                });
                if (this.state.history.length > 50) this.state.history.pop();
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
            endTime: Infinity,
            sizeType: 'grow50',
            detail: 'grow50',
            detailName: '体型增大50%'
        };

        this.state.history.unshift({
            id: generateId(),
            type: 'dinoGrow50',
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            detail: '体型增大50%',
            startTime: now,
            endTime: null,
            status: 'active'
        });
        this.cooldowns.dino = Date.now() + 60000;
        this.saveState();
        this.renderInventory();
        this.renderDinoSizePanel();
        this.renderHistory();
        this.startCountdowns();
        showToast(t.useSuccess(lang === 'vi' ? 'Tăng kích thước (hiệu lực đến khi chết/đăng xuất)' : '体型增大（有效期至死亡/退出游戏）'), 'success');
    }

    stopFlowCard() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];
        const lock = this.state.globalLocks.flow;

        if (!lock || lock.userId !== this.user.userId) {
            showToast(t.useFailed, 'error');
            return;
        }

        const confirmMsg = lang === 'vi'
            ? 'Bạn có chắc muốn dừng dòng chảy thờ gian? Thẻ sẽ bị tiêu hao và không hoàn lại.'
            : '确定要停止时间流动吗？卡片将被消耗且不予返还。';
        if (!confirm(confirmMsg)) return;

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

        if (this.user.inventory.announcementCard <= 0) {
            showToast(t.noItem, 'error');
            return;
        }

        if (!content || !content.trim()) {
            showToast(t.enterContent, 'warning');
            return;
        }

        // API模式
        if (APP_MODE.isApi()) {
            const serverId = SERVER_ID_MAP[getServerId()] || '750748016054341';
            const res = await this.api.apply(4, serverId, { content: content.trim() });
            if (res.code === 0) {
                showToast(t.sent || '已发送', 'success');
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
                if (this.state.history.length > 50) this.state.history.pop();
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
        showToast(t.sent || '已发送', 'success');
    }

    resetInventory() {
        this.user.inventory = {
            weatherCard: 3,
            timeCard: 3,
            announcementCard: 3,
            flowCard: 3,
            dinoGrow50: 3
        };
        this.saveUser();
        this.renderInventory();
        this.renderAllPanels();
        const lang = document.body.getAttribute('data-lang') || 'vi';
        showToast(lang === 'vi' ? 'Đã khôi phục đạo cụ!' : '道具已重置！', 'success');
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
                            value.textContent = '生效中 ' + formatTime(remaining);
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
                            if (stopBtn) stopBtn.style.display = (isMine && !lock.optimistic) ? 'block' : 'none';
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
                                dinoChar.style.transform = 'scale(1.5)';
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
                                    detail = 'Dòng chảy thờ gian / 时间流动';
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

            // Dino size 冷却倒计时
            const cd = this.cooldowns.dino;
            if (cd && Date.now() < cd) {
                const btn50 = document.getElementById('btn-use-dino-grow-50');
                if (btn50 && !btn50.disabled) {
                    this.renderDinoSizePanel();
                }
            }
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
        const inv = isApiNotLoggedIn ? {} : (this.user.inventory || {});
        console.log('[renderInventory]', isApiNotLoggedIn ? 'API未登录，显示空' : inv);
        const elCountWeather = document.getElementById('count-weather');
        if (elCountWeather) elCountWeather.textContent = '×' + (inv.weatherCard || 0);
        const elCountTime = document.getElementById('count-time');
        if (elCountTime) elCountTime.textContent = '×' + (inv.timeCard || 0);
        const elCountAnnouncement = document.getElementById('count-announcement');
        if (elCountAnnouncement) elCountAnnouncement.textContent = '×' + (inv.announcementCard || 0);
        const elCountFlow = document.getElementById('count-flow');
        if (elCountFlow) elCountFlow.textContent = '×' + (inv.flowCard || 0);
        const elCountDino = document.getElementById('count-dino-grow');
        if (elCountDino) elCountDino.textContent = '×' + (inv.dinoGrow50 || 0);

        const invMap = [
            { type: 'weather', key: 'weatherCard' },
            { type: 'time', key: 'timeCard' },
            { type: 'announcement', key: 'announcementCard' },
            { type: 'flow', key: 'flowCard' },
            { type: 'dino-grow', key: 'dinoGrow50' }
        ];
        invMap.forEach(({ type, key }) => {
            const card = document.getElementById(`inv-${type}`);
            const btn = document.getElementById(`btn-slot-${type}`);
            const count = isApiNotLoggedIn ? 0 : (this.user.inventory[key] || 0);
            if (card) {
                card.classList.toggle('empty', count <= 0);
            }
            if (btn) {
                btn.disabled = count <= 0;
            }
        });
    }

    renderAllPanels() {
        this.renderWeatherPanel();
        this.renderTimePanel();
        this.renderAnnouncementPanel();
        this.renderFlowPanel();
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

        // 防连点冷却
        const cd = this.cooldowns.dino;
        if (cd && Date.now() < cd) {
            const remaining = Math.ceil((cd - Date.now()) / 1000);
            if (btn50) {
                btn50.disabled = true;
                btn50.textContent = lang === 'vi' ? `Chờ ${remaining}s` : `冷却 ${remaining}s`;
            }
        } else {
            if (btn50) {
                btn50.disabled = this.user.inventory.dinoGrow50 <= 0 || !!myLock;
                btn50.innerHTML = '<span class="lang-vi">Sử dụng Thẻ Tăng Kích Thước</span><span class="lang-cn">使用体型变大卡</span>';
            }
        }

        if (lock) {
            if (dinoChar) {
                dinoChar.classList.add('grown');
                dinoChar.style.transform = 'scale(1.5)';
            }
            if (dinoAura) dinoAura.classList.add('active');
            if (dinoStatus) {
                dinoStatus.classList.add('grown');
                dinoStatus.innerHTML = '<span class="lang-vi">Đã tăng kích thước 50%!</span><span class="lang-cn">体型已增大50%！</span>';
            }
        } else {
            if (dinoChar) {
                dinoChar.classList.remove('grown');
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
                        <span class="status-badge sent">${t.status.sent || '已发送'}</span>
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
        list.innerHTML = myHistory.slice(0, 20).map(item => {
            const icon = item.type === 'weather' ? '🌦️' : item.type === 'time' ? '🕐' : item.type === 'flow' ? '⏳' : item.type.startsWith('dino') ? '🦖' : '📢';
            const title = t.history[item.type] || item.type;
            const timeStr = formatDateTime(item.startTime);
            const statusLabel = t.status[item.status] || item.status;
            const statusClass = item.status === 'active' ? 'pending' : item.status === 'completed' ? 'success' : 'info';

            return `
                <div class="history-item ${item.type}">
                    <span class="history-icon">${icon}</span>
                    <div class="history-info">
                        <span class="history-title">${title} — ${escapeHtml(item.detail)}</span>
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
        if (textarea && charCount) {
            textarea.addEventListener('input', () => {
                charCount.textContent = textarea.value.length;
            });
        }

        // Update player identity display
        const playerNameEl = document.getElementById('player-id-name');
        const serverSelect = document.getElementById('server-select');
        const sid = getServerId();
        if (playerNameEl) {
            playerNameEl.textContent = this.user.username;
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
    document.getElementById('current-lang').textContent = lang === 'vi' ? 'VI / 中' : '中 / VI';

    // Update title
    document.title = lang === 'vi' ? 'Trung Tâm Đạo Cụ' : '道具管理中心';

    // Update textarea placeholder
    const textarea = document.getElementById('announcement-content');
    if (textarea) {
        textarea.placeholder = lang === 'vi' ? 'Nhập nội dung...' : '输入内容...';
    }

    // Update player identity
    const playerNameEl = document.getElementById('player-id-name');
    const manager = window.itemManager;
    if (playerNameEl && manager) {
        playerNameEl.textContent = manager.user.username;
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
    if (hint) hint.textContent = isApi ? 'API模式：使用真实服务端接口' : '模拟模式：下一次使用道具时生效';
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

    if (APP_MODE.isApi()) {
        // API 模式：根据登录状态显示
        const isLoggedIn = manager && manager.api && manager.api.isLoggedIn();
        if (isLoggedIn) {
            const gameUid = manager.api.gameUid || '';
            if (accountEl) accountEl.textContent = gameUid;
            if (nameEl) {
                nameEl.textContent = '';
                nameEl.style.color = '';
                nameEl.style.fontSize = '';
            }
            if (loginBtn) loginBtn.style.display = 'none';
        } else {
            if (accountEl) accountEl.textContent = '';
            if (nameEl) {
                nameEl.innerHTML = '<span class="lang-cn">您的登录已过期或无访问权限，请重新登录</span>';
                nameEl.style.color = '#9ca3af';
                nameEl.style.fontSize = '0.82rem';
            }
            if (loginBtn) loginBtn.style.display = 'inline-flex';
        }
    } else {
        // 模拟模式：显示本地用户信息
        if (!manager) return;
        const uid = manager.user.userId || '';
        if (accountEl) accountEl.textContent = uid.replace('player_', '');
        if (nameEl) {
            nameEl.textContent = manager.user.username || 'Player';
            nameEl.style.color = '';
            nameEl.style.fontSize = '';
        }
        if (loginBtn) loginBtn.style.display = 'none';
    }
}

function switchMode(mode) {
    APP_MODE.mode = mode;
    showToast(mode === 'api' ? '已切换到真实API模式' : '已切换到模拟模式', 'info');
    setTimeout(() => location.reload(), 800);
}

async function refreshApiData() {
    if (!APP_MODE.isApi() || !window.itemManager) return;
    const ok = await window.itemManager.syncFromApi();
    if (ok) {
        window.itemManager.renderInventory();
        window.itemManager.renderAllPanels();
        window.itemManager.renderHistory();
        window.itemManager.startCountdowns();
        showToast('数据已刷新', 'success');
    }
}

async function forceClearRecords() {
    if (!APP_MODE.isApi() || !window.itemManager) return;
    const api = window.itemManager.api;
    const res = await api.getRecords();
    if (res.code !== 0 || !res.extra || !res.extra.records) {
        showToast('获取记录失败: ' + (res.message || '未知错误'), 'error');
        return;
    }
    const records = res.extra.records;
    const activeRecords = records.filter(r => {
        const status = String(r.status || '');
        return status === 'doing' || status === '1' || status === 'todo';
    });
    if (activeRecords.length === 0) {
        showToast('没有进行中的记录需要清除', 'info');
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
    showToast('清除完成：成功 ' + success + '，失败 ' + fail, fail > 0 ? 'warning' : 'success');
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
            weatherCard: 0, timeCard: 0, announcementCard: 0,
            flowCard: 0, dinoGrow50: 0
        };
        window.itemManager.state.globalLocks = { weather: null, time: null, flow: null, dinoSize: null };
        window.itemManager.saveUser();
        window.itemManager.saveState();
        window.itemManager.renderInventory();
        window.itemManager.renderAllPanels();
        window.itemManager.startCountdowns();
        window.itemManager.updateAuthUI();
        showToast('已退出登录', 'info');
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
                failMsg = '登录已过期，请重新登录';
                client.logout();
                window.itemManager.updateAuthUI();
                break;
            } else {
                failMsg = res.message || ('skill_id=' + sid + ' 补充失败 code=' + res.code);
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
                showToast('已补充 ' + successCount + ' 种道具库存', 'success');
            }
        }, 500);
        return;
    }
    _originalResetInventory();
};

// Initialize
let itemManager;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const savedLang = localStorage.getItem('lang') || 'vi';
        applyLangUI(savedLang);
        itemManager = new ItemManager();
        window.itemManager = itemManager;
    });
} else {
    const savedLang = localStorage.getItem('lang') || 'vi';
    applyLangUI(savedLang);
    itemManager = new ItemManager();
    window.itemManager = itemManager;
}
