// ============================================
// Trung Tâm Đạo Cụ - Item Manager
// LocalStorage-based state with cross-tab sync
// ============================================

const USE_DURATION = 5 * 60 * 1000; // 5 minutes in ms
const FLOW_DURATION = 60 * 60 * 1000; // 60 minutes in ms

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
function updateSky(hh, mm) {
    const skyBg = document.getElementById('sky-bg');
    const periodEl = document.getElementById('sky-period');
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
    const types = ['weather','time','flow','dinoGrow'];
    const type = types[Math.floor(Math.random() * types.length)];
    const bots = [
        {vi:'Ngườ chơi 7723', cn:'玩家7723'},
        {vi:'Ngườ chơi 8844', cn:'玩家8844'},
        {vi:'Ngườ chơi 5566', cn:'玩家5566'},
        {vi:'Ngườ chơi 3399', cn:'玩家3399'},
        {vi:'Ngườ chơi 1122', cn:'玩家1122'}
    ];
    const bot = bots[Math.floor(Math.random() * bots.length)];
    
    // 只在 30% 概率触发，避免过于频繁
    if (Math.random() > 0.7) {
        const stateKey = `itemManager_state_v1_${target}`;
        let state = localStorage.getItem(stateKey);
        if (!state) {
            state = { globalLocks:{weather:null,time:null,flow:null}, announcements:[], history:[] };
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
    { vi: 'Ngườ chơi 7723', cn: '玩家7723' },
    { vi: 'Ngườ chơi 9142', cn: '玩家9142' },
    { vi: 'Ngườ chơi 3301', cn: '玩家3301' },
    { vi: 'Ngườ chơi 5528', cn: '玩家5528' },
];

// Translations
const I18N = {
    vi: {
        ready: 'Sẵn sàng',
        inUse: 'Đang sử dụng',
        busy: 'Đang bận',
        conflictWeather: (name, time) => `Người chơi ${name} đang sử dụng Thẻ Thời Tiết, còn lại ${time}`,
        conflictTime: (name, time) => `Người chơi ${name} đang sử dụng Thẻ Thời Gian, còn lại ${time}`,
        conflictDinoGrow: (name, time) => `Ngườ chơi ${name} đang sử dụng Thẻ Tăng Trưởng, còn lại ${time}`,
        noItem: 'Không đủ đạo cụ',
        selectOption: 'Vui lòng chọn một tùy chọn',
        useSuccess: (type) => `Sử dụng ${type} thành công!`,
        useFailed: 'Sử dụng thất bại, vui lòng thử lại',
        submitSuccess: 'Gửi thông báo thành công, đang chờ duyệt',
        enterContent: 'Vui lòng nhập nội dung thông báo',
        timeUp: 'Hết thờ gian, đã tự động kết thúc',
        approved: 'Thông báo đã được duyệt',
        sent: 'Thông báo đã được gửi toàn server',
        history: {
            weather: 'Thẻ Thời Tiết',
            time: 'Thẻ Thời Gian',
            announcement: 'Thông Báo',
            dinoGrow: 'Thẻ Tăng Trưởng'
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
            snow: 'Tuyết',
            heavy_rain: 'Mưa bão',
            cloudy: 'Nhiều mây',
            fog: 'Sương mù',
            partly_cloudy: 'Nửa mây',
            rain_sun: 'Mưa + Nắng',
            sandstorm: 'Bão cát'
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
        conflictDinoGrow: (name, time) => `玩家 ${name} 正在使用恐龙变大卡，剩余 ${time}`,
        noItem: '道具不足',
        selectOption: '请选择一个选项',
        useSuccess: (type) => `${type} 使用成功！`,
        useFailed: '使用失败，请重试',
        submitSuccess: '公告提交成功，等待审核',
        enterContent: '请输入公告内容',
        timeUp: '时间结束，已自动重置',
        approved: '公告已通过审核',
        sent: '公告已发送至全服',
        history: {
            weather: '天气卡',
            time: '时间卡',
            announcement: '全服公告',
            flow: '时间流动卡',
            dinoGrow: '恐龙变大卡'
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
            snow: '下雪',
            heavy_rain: '暴雨',
            cloudy: '多云',
            fog: '雾',
            partly_cloudy: '半云',
            rain_sun: '雨_阳光',
            sandstorm: '沙尘'
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
        this.user = this.loadUser();
        this.state = this.loadState();
        this.countdowns = { weather: null, time: null, dinoGrow: null };
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
            if (user.inventory.dinoGrowCard === undefined) user.inventory.dinoGrowCard = 3;
            localStorage.setItem(lsKeyUser(), JSON.stringify(user));
            return user;
        }
        const id = 'player_' + Math.random().toString(36).substr(2, 6);
        const realNames = ['SPECTER','ChiuChiu','NguyệtCung','Thiên Cơ','Hắc Ám','Nhật Thực','TUTien','SKTTI','CoDoc','PAULZ','Soul','TOP龙mixuka','C007TITI','GKTieuLynh','Nolan','Leyla'];
        const name = realNames[getRandomInt(0, realNames.length - 1)];
        user = {
            userId: id,
            username: name,
            usernameCn: name,
            inventory: {
                weatherCard: 3,
                timeCard: 3,
                announcementCard: 3,
                flowCard: 3,
                dinoGrowCard: 3
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
            globalLocks: { weather: null, time: null, flow: null, dinoGrow: null },
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
        // 权限检查 - 如需实际 API 校验请替换 checkAuth() 实现
        if (typeof checkAuth === 'function' && !checkAuth()) return;

        this.cleanupHistory();
        this.renderInventory();
        this.renderAllPanels();
        this.renderHistory();
        this.startCountdowns();
        this.processAnnouncements();
        this.setupEventListeners();
        this.setupStorageSync();
        this.setupTimeSetter();
        this.startServerPolling();
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
            updateSky(hh, mm);
        };

        slider.addEventListener('input', () => {
            const minutes = parseInt(slider.value, 10) || 0;
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
        return lock;
    }

    // Use Weather Card
    useWeatherCard() {
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
            endTime: now + USE_DURATION,
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
            endTime: now + USE_DURATION,
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
    useTimeCard() {
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
            endTime: now + USE_DURATION,
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
            endTime: now + USE_DURATION,
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
    useFlowCard() {
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

        this.user.inventory.flowCard--;
        this.saveUser();

        const now = Date.now();
        this.state.globalLocks.flow = {
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            startTime: now,
            endTime: now + FLOW_DURATION,
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
            endTime: now + FLOW_DURATION,
            status: 'active'
        });

        this.saveState();
        this.renderInventory();
        this.renderFlowPanel();
        this.renderHistory();
        this.startCountdowns();
        showToast(t.useSuccess(t.history.flow), 'success');
    }

    // Use Dino Grow Card
    useDinoGrowCard() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        if (this.user.inventory.dinoGrowCard <= 0) {
            showToast(t.noItem, 'error');
            return;
        }

        const conflict = this.checkConflict('dinoGrow');
        if (conflict) {
            const remaining = conflict.endTime - Date.now();
            const name = lang === 'vi' ? conflict.username : (conflict.usernameCn || conflict.username);
            showToast(t.conflictDinoGrow(name, formatTime(remaining)), 'warning');
            return;
        }

        this.user.inventory.dinoGrowCard--;
        this.saveUser();

        const now = Date.now();
        this.state.globalLocks.dinoGrow = {
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            startTime: now,
            endTime: now + USE_DURATION,
            detail: 'grow',
            detailName: '50%'
        };

        this.state.history.unshift({
            id: generateId(),
            type: 'dinoGrow',
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            detail: '+50%',
            startTime: now,
            endTime: now + USE_DURATION,
            status: 'active'
        });

        this.saveState();
        this.renderInventory();
        this.renderDinoGrowPanel();
        this.renderHistory();
        this.startCountdowns();
        showToast(t.useSuccess(t.history.dinoGrow), 'success');
    }

    stopFlowCard() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];
        const lock = this.state.globalLocks.flow;

        if (!lock || lock.userId !== this.user.userId) {
            showToast(t.useFailed, 'error');
            return;
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
        showToast(I18N[lang].timeUp, 'info');
    }

    // Submit Announcement
    submitAnnouncement(content) {
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

        this.user.inventory.announcementCard--;
        this.saveUser();

        const now = Date.now();
        const announcement = {
            id: generateId(),
            userId: this.user.userId,
            username: this.user.username,
            usernameCn: this.user.usernameCn,
            content: content.trim(),
            status: 'pending_review',
            submitTime: now,
            approveTime: null,
            sendTime: null
        };

        this.state.announcements.unshift(announcement);
        this.saveState();

        this.renderInventory();
        this.renderAnnouncementPanel();
        this.renderHistory();
        showToast(t.submitSuccess, 'success');

        // Simulate review process
        this.simulateReview(announcement.id);
    }

    simulateReview(announcementId) {
        const reviewDelay = getRandomInt(5000, 15000); // 5-15s
        setTimeout(() => {
            this.loadState(); // Refresh state
            const ann = this.state.announcements.find(a => a.id === announcementId);
            if (ann && ann.status === 'pending_review') {
                ann.status = 'approved';
                ann.approveTime = Date.now();
                this.saveState();
                this.renderAnnouncementPanel();
                this.renderHistory();
                showToast(I18N[document.body.getAttribute('data-lang') || 'vi'].approved, 'info');

                // Simulate send after approval
                setTimeout(() => {
                    this.loadState();
                    const ann2 = this.state.announcements.find(a => a.id === announcementId);
                    if (ann2 && ann2.status === 'approved') {
                        ann2.status = 'queued';
                        this.saveState();
                        this.renderAnnouncementPanel();

                        setTimeout(() => {
                            this.loadState();
                            const ann3 = this.state.announcements.find(a => a.id === announcementId);
                            if (ann3 && ann3.status === 'queued') {
                                ann3.status = 'sent';
                                ann3.sendTime = Date.now();
                                this.saveState();

                                // Add to history
                                this.state.history.unshift({
                                    id: generateId(),
                                    type: 'announcement',
                                    userId: this.user.userId,
                                    username: this.user.username,
                                    usernameCn: this.user.usernameCn,
                                    detail: ann3.content.substring(0, 30) + (ann3.content.length > 30 ? '...' : ''),
                                    startTime: ann3.submitTime,
                                    endTime: ann3.sendTime,
                                    status: 'completed'
                                });
                                this.saveState();
                                this.renderAnnouncementPanel();
                                this.renderHistory();
                                showToast(I18N[document.body.getAttribute('data-lang') || 'vi'].sent, 'success');
                            }
                        }, getRandomInt(3000, 8000));
                    }
                }, getRandomInt(2000, 5000));
            }
        }, reviewDelay);
    }

    // Countdown Management
    startCountdowns() {
        ['weather', 'time', 'flow', 'dinoGrow'].forEach(type => {
            if (this.countdowns[type]) {
                clearInterval(this.countdowns[type]);
                this.countdowns[type] = null;
            }
        });

        const tick = () => {
            ['weather', 'time', 'flow', 'dinoGrow'].forEach(type => {
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

                    if (remaining > 0) {
                        banner.style.display = 'flex';
                        value.textContent = formatTime(remaining);
                        banner.className = isMine 
                            ? 'countdown-banner' 
                            : 'countdown-banner';

                        if (statusDot) {
                            statusDot.className = 'status-dot ' + (isMine ? 'active' : 'busy');
                        }
                        if (statusText) {
                            statusText.innerHTML = `<span class="lang-vi">${isMine ? 'Đang sử dụng' : 'Đang bận'}</span><span class="lang-cn">${isMine ? '使用中' : '占用中'}</span>`;
                        }

                        // Flow-specific: update game time display
                        if (type === 'flow') {
                            const elapsedSec = (Date.now() - lock.startTime) / 1000;
                            const gameMinutes = (720 + elapsedSec * 0.4) % 1440;
                            const hh = Math.floor(gameMinutes / 60);
                            const mm = Math.floor(gameMinutes % 60);
                            const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                            const timeDisplay = document.getElementById('game-time-value');
                            const stopBtn = document.getElementById('btn-stop-flow');
                            const useBtn = document.getElementById('btn-use-flow');
                            const display = document.getElementById('game-time-display');
                            if (timeDisplay) timeDisplay.textContent = timeStr;
                            if (stopBtn) stopBtn.style.display = isMine ? 'block' : 'none';
                            if (useBtn) useBtn.style.display = 'none';
                            if (display) display.classList.add('active');
                        }

                        if (options) {
                            options.querySelectorAll('.option-btn').forEach(btn => {
                                btn.disabled = true;
                            });
                        }
                        if (btn) btn.disabled = true;

                        // Time setter controls disable during conflict
                        if (type === 'time') {
                            const timeSlider = document.getElementById('time-slider');
                            if (timeSlider) timeSlider.disabled = true;
                            document.querySelectorAll('#time-presets .preset-btn').forEach(b => b.disabled = true);
                        }

                        // Dino grow visual effect during active
                        if (type === 'dinoGrow') {
                            const dinoChar = document.getElementById('dino-character');
                            const dinoAura = document.getElementById('dino-aura');
                            const dinoStatus = document.getElementById('dino-status');
                            const lang = document.body.getAttribute('data-lang') || 'vi';
                            if (dinoChar) dinoChar.classList.add('grown');
                            if (dinoAura) dinoAura.classList.add('active');
                            if (dinoStatus) {
                                dinoStatus.classList.add('grown');
                                dinoStatus.innerHTML = lang === 'vi'
                                    ? '<span class="lang-vi">Khủng long đã tăng kích thước 50%!</span><span class="lang-cn">恐龙已增大50%！</span>'
                                    : '<span class="lang-vi">Khủng long đã tăng kích thước 50%!</span><span class="lang-cn">恐龙已增大50%！</span>';
                            }
                        }

                        if (conflictBanner) {
                            if (isMine) {
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
                                    else if (type === 'dinoGrow') msg = t.conflictDinoGrow(name, formatTime(remaining));
                                    textEl.textContent = msg + (detail ? ` (${detail})` : '');
                                }
                            }
                        }
                    } else {
                        // Time's up - clean up lock and update history
                        this.checkConflict(type);
                        // Update history status to completed
                        const historyItem = this.state.history.find(h => 
                            h.type === type && h.userId === this.user.userId && h.status === 'active'
                        );
                        if (historyItem) {
                            historyItem.status = 'completed';
                            historyItem.endTime = Date.now();
                            this.saveState();
                            this.renderHistory();
                        }
                        this.renderPanel(type);
                    }
                } else {
                    banner.style.display = 'none';
                    if (statusDot) {
                        statusDot.className = 'status-dot idle';
                    }
                    if (statusText) {
                        statusText.innerHTML = `<span class="lang-vi">${t.ready}</span><span class="lang-cn">${t.ready}</span>`;
                    }
                    if (options) {
                        options.querySelectorAll('.option-btn').forEach(btn => {
                            btn.disabled = false;
                        });
                    }
                    if (btn) {
                        btn.disabled = (type === 'weather' && this.user.inventory.weatherCard <= 0) ||
                                       (type === 'time' && this.user.inventory.timeCard <= 0) ||
                                       (type === 'flow' && this.user.inventory.flowCard <= 0) ||
                                       (type === 'dinoGrow' && this.user.inventory.dinoGrowCard <= 0);
                    }

                    // Time setter controls re-enable when no conflict
                    if (type === 'time') {
                        const timeSlider = document.getElementById('time-slider');
                        const hasCards = this.user.inventory.timeCard > 0;
                        if (timeSlider) timeSlider.disabled = !hasCards;
                        document.querySelectorAll('#time-presets .preset-btn').forEach(b => b.disabled = !hasCards);
                    }

                    // Dino grow reset visual
                    if (type === 'dinoGrow') {
                        const dinoChar = document.getElementById('dino-character');
                        const dinoAura = document.getElementById('dino-aura');
                        const dinoStatus = document.getElementById('dino-status');
                        if (dinoChar) dinoChar.classList.remove('grown');
                        if (dinoAura) dinoAura.classList.remove('active');
                        if (dinoStatus) {
                            dinoStatus.classList.remove('grown');
                            dinoStatus.innerHTML = '<span class="lang-vi">Kích thước bình thường</span><span class="lang-cn">正常体型</span>';
                        }
                    }
                    if (conflictBanner) conflictBanner.style.display = 'none';

                    // Flow-specific: reset game time display
                    if (type === 'flow') {
                        const timeDisplay = document.getElementById('game-time-value');
                        const stopBtn = document.getElementById('btn-stop-flow');
                        const useBtn = document.getElementById('btn-use-flow');
                        const display = document.getElementById('game-time-display');
                        const hint = display?.querySelector('.game-time-hint');
                        if (timeDisplay) timeDisplay.textContent = '12:00';
                        if (stopBtn) stopBtn.style.display = 'none';
                        if (useBtn) useBtn.style.display = 'block';
                        if (display) display.classList.remove('active');
                        if (hint) hint.innerHTML = `<span class="lang-vi">Thờ gian đang đứng yên tại 12:00</span><span class="lang-cn">时间静止在 12:00</span>`;
                    }
                }
            });
        };

        tick();
        const interval = setInterval(tick, 1000);
        ['weather', 'time', 'flow', 'dinoGrow'].forEach(type => {
            this.countdowns[type] = interval;
        });
    }

    processAnnouncements() {
        // Cleanup any stuck announcements
        this.loadState();
        this.state.announcements.forEach(ann => {
            if (ann.status === 'pending_review' && Date.now() - ann.submitTime > 60000) {
                ann.status = 'approved';
                ann.approveTime = Date.now();
            }
            if (ann.status === 'approved' && ann.approveTime && Date.now() - ann.approveTime > 10000) {
                ann.status = 'queued';
            }
            if (ann.status === 'queued' && Date.now() - (ann.approveTime || ann.submitTime) > 20000) {
                ann.status = 'sent';
                ann.sendTime = Date.now();
            }
        });
        this.saveState();
        this.renderAnnouncementPanel();
    }

    // Render Methods
    renderInventory() {
        document.getElementById('count-weather').textContent = '×' + this.user.inventory.weatherCard;
        document.getElementById('count-time').textContent = '×' + this.user.inventory.timeCard;
        document.getElementById('count-announcement').textContent = '×' + this.user.inventory.announcementCard;
        document.getElementById('count-flow').textContent = '×' + this.user.inventory.flowCard;
        document.getElementById('count-dino-grow').textContent = '×' + this.user.inventory.dinoGrowCard;

        ['weather', 'time', 'announcement', 'flow', 'dino-grow'].forEach(type => {
            const card = document.getElementById(`inv-${type}`);
            const btn = document.getElementById(`btn-slot-${type}`);
            const count = this.user.inventory[type + 'Card'];
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
        this.renderDinoGrowPanel();
    }

    renderPanel(type) {
        if (type === 'weather') this.renderWeatherPanel();
        else if (type === 'time') this.renderTimePanel();
        else if (type === 'announcement') this.renderAnnouncementPanel();
        else if (type === 'flow') this.renderFlowPanel();
        else if (type === 'dino-grow') this.renderDinoGrowPanel();
    }

    renderWeatherPanel() {
        const container = document.getElementById('options-weather');
        if (!container) return;
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];

        container.querySelectorAll('.option-btn').forEach(btn => {
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

        // 如果有冲突，禁用所有时间设置控件
        if (slider) slider.disabled = !!lock;
        presets.forEach(btn => { btn.disabled = !!lock; });
    }

    renderFlowPanel() {
        const lang = document.body.getAttribute('data-lang') || 'vi';
        const t = I18N[lang];
        const lock = this.checkConflict('flow');
        const btn = document.getElementById('btn-use-flow');
        const stopBtn = document.getElementById('btn-stop-flow');
        const display = document.getElementById('game-time-display');
        const hint = display?.querySelector('.game-time-hint');

        if (btn) {
            btn.disabled = this.user.inventory.flowCard <= 0 || !!lock;
        }
        if (stopBtn) {
            stopBtn.style.display = lock && lock.userId === this.user.userId ? 'block' : 'none';
        }
        if (display) {
            display.classList.toggle('active', !!lock);
        }
        if (hint) {
            if (lock) {
                hint.innerHTML = `<span class="lang-vi">Thờ gian đang chảy...</span><span class="lang-cn">时间正在流动...</span>`;
            } else {
                hint.innerHTML = `<span class="lang-vi">Thờ gian đang đứng yên tại 12:00</span><span class="lang-cn">时间静止在 12:00</span>`;
            }
        }
    }

    renderDinoGrowPanel() {
        const lock = this.checkConflict('dinoGrow');
        const btn = document.getElementById('btn-use-dino-grow');
        const dinoChar = document.getElementById('dino-character');
        const dinoAura = document.getElementById('dino-aura');
        const dinoStatus = document.getElementById('dino-status');
        const lang = document.body.getAttribute('data-lang') || 'vi';

        if (btn) {
            btn.disabled = this.user.inventory.dinoGrowCard <= 0 || !!lock;
        }

        if (lock) {
            if (dinoChar) dinoChar.classList.add('grown');
            if (dinoAura) dinoAura.classList.add('active');
            if (dinoStatus) {
                dinoStatus.classList.add('grown');
                dinoStatus.innerHTML = '<span class="lang-vi">Khủng long đã tăng kích thước 50%!</span><span class="lang-cn">恐龙已增大50%！</span>';
            }
        } else {
            if (dinoChar) dinoChar.classList.remove('grown');
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

        // Update flow dots
        const myAnnouncements = this.state.announcements.filter(a => a.userId === this.user.userId);
        const hasPending = myAnnouncements.some(a => a.status === 'pending_review');
        const hasApproved = myAnnouncements.some(a => a.status === 'approved');
        const hasQueued = myAnnouncements.some(a => a.status === 'queued');
        const hasSent = myAnnouncements.some(a => a.status === 'sent');

        const dotReview = document.getElementById('flow-dot-review');
        const dotQueue = document.getElementById('flow-dot-queue');
        const dotSent = document.getElementById('flow-dot-sent');

        if (dotReview) {
            dotReview.className = 'flow-dot' + (hasPending ? ' active' : hasApproved || hasQueued || hasSent ? ' completed' : '');
        }
        if (dotQueue) {
            dotQueue.className = 'flow-dot' + (hasQueued ? ' active' : hasSent ? ' completed' : '');
        }
        if (dotSent) {
            dotSent.className = 'flow-dot' + (hasSent ? ' completed' : '');
        }

        // Render my announcements list
        const section = document.getElementById('my-announcements-section');
        const list = document.getElementById('announcement-list');
        if (!section || !list) return;

        if (myAnnouncements.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = myAnnouncements.map(ann => {
            const timeStr = formatDateTime(ann.submitTime);
            return `
                <div class="announcement-item">
                    <div class="announcement-content">${escapeHtml(ann.content)}</div>
                    <div class="announcement-meta">
                        <span class="status-badge ${ann.status}">${t.status[ann.status] || ann.status}</span>
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
            const icon = item.type === 'weather' ? '🌦️' : item.type === 'time' ? '🕐' : item.type === 'flow' ? '⏳' : item.type === 'dinoGrow' ? '🦖' : '📢';
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
        const playerServerEl = document.getElementById('player-id-server');
        const playerGuildEl = document.getElementById('player-id-guild');
        const serverSelect = document.getElementById('server-select');
        const userNameEl = document.getElementById('user-name');
        const sid = getServerId();
        if (playerNameEl) {
            const lang = document.body.getAttribute('data-lang') || 'vi';
            playerNameEl.textContent = lang === 'vi' ? this.user.username : this.user.usernameCn;
        }
        if (playerServerEl) {
            playerServerEl.textContent = 'Server ' + sid;
        }
        if (playerGuildEl) {
            const guilds = { Q: 'Hoả Long', K: 'Hắc Ám' };
            playerGuildEl.textContent = guilds[sid] || '';
        }
        if (serverSelect) {
            serverSelect.value = sid;
        }
        if (userNameEl) {
            const lang = document.body.getAttribute('data-lang') || 'vi';
            userNameEl.textContent = lang === 'vi' ? this.user.username : this.user.usernameCn;
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
    const userNameEl = document.getElementById('user-name');
    if (playerNameEl && window.itemManager) {
        playerNameEl.textContent = lang === 'vi'
            ? window.itemManager.user.username
            : window.itemManager.user.usernameCn;
    }
    if (userNameEl && window.itemManager) {
        userNameEl.textContent = lang === 'vi'
            ? window.itemManager.user.username
            : window.itemManager.user.usernameCn;
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
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel-${tab}`);
    });
    if (window.itemManager) {
        window.itemManager.currentTab = tab;
    }
}

function toggleTab(tab) {
    const isActive = document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.contains('active');
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', !isActive && btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', !isActive && panel.id === `panel-${tab}`);
    });
    if (window.itemManager) {
        window.itemManager.currentTab = isActive ? null : tab;
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

function useDinoGrowCard() {
    if (window.itemManager) window.itemManager.useDinoGrowCard();
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

function submitAnnouncement() {
    const content = document.getElementById('announcement-content')?.value || '';
    if (window.itemManager) {
        window.itemManager.submitAnnouncement(content);
        document.getElementById('announcement-content').value = '';
        document.getElementById('char-count').textContent = '0';
    }
}

/* ── auth check ── */
/**
 * 权限检查入口
 * 实际项目中请替换为真实的 API 校验，例如：
 *   const res = await fetch('/api/check-auth', { headers: { Authorization: 'Bearer ' + token } });
 *   if (!res.ok) { showAuthOverlay(); return false; }
 */
function checkAuth() {
    const token = localStorage.getItem('itemManager_token');
    // 默认放行（无 token 时演示模式），如需强制登录请取消下行注释：
    // if (!token) { showAuthOverlay(); return false; }
    return true;
}

function showAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    const content = document.getElementById('content');
    if (overlay) overlay.classList.add('show');
    if (content) content.style.display = 'none';
    document.body.style.overflow = 'hidden';
}

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
