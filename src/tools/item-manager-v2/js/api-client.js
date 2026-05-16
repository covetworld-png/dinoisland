// DURATION_* 由 main.js 定义，此处不重复声明
// 道具时效（毫秒）
const DURATION_WEATHER = 10 * 1000;      // 调试：10秒（正式版：10 * 60 * 1000 = 10分钟）
const DURATION_TIME    = 10 * 1000;      // 调试：10秒（正式版：10 * 60 * 1000 = 10分钟）
const DURATION_FLOW    = 60 * 1000;    // 调试：1分钟（正式版：60 * 60 * 1000 = 60分钟）
const DURATION_DINO    = 60 * 1000;      // 恐龙变大防连点：60秒
// 体型变化：无固定时效（endTime = Infinity，龙死亡/下线时失效）

// ============================================
// 道具配置表（ITEM_CONFIG）— 新增道具仅需在此添加一行配置
// ============================================
const ITEM_CONFIG = {
    weather: {
        skillId: 2,
        inventoryKey: 'weatherCard',
        lockKey: 'weather',
        duration: DURATION_WEATHER,
        hasCountdown: true,
        hasOptions: true,
        mutuallyExclusive: [],
        historyKey: 'weather',
        icon: '🌦️',
        tabId: 'weather',
    },
    time: {
        skillId: 5,
        inventoryKey: 'timeCard',
        lockKey: 'time',
        duration: DURATION_TIME,
        hasCountdown: true,
        hasOptions: true,
        mutuallyExclusive: ['flow'],
        historyKey: 'time',
        icon: '🕐',
        tabId: 'time',
    },
    announcement: {
        skillId: 4,
        inventoryKey: 'announcementCard',
        lockKey: null,
        duration: 0,
        hasCountdown: false,
        hasOptions: false,
        mutuallyExclusive: [],
        historyKey: 'announcement',
        icon: '📢',
        tabId: 'announcement',
    },
    flow: {
        skillId: 3,
        inventoryKey: 'flowCard',
        lockKey: 'flow',
        duration: DURATION_FLOW,
        hasCountdown: true,
        hasOptions: false,
        hasStopButton: true,
        mutuallyExclusive: ['time'],
        historyKey: 'flow',
        icon: '⏳',
        tabId: 'flow',
        stopParams: { time_hm: 1200 },
    },
    dinoGrow50: {
        skillId: 1,
        inventoryKey: 'dinoGrow50',
        lockKey: 'dinoSize',
        duration: DURATION_DINO,
        hasCountdown: true,
        hasOptions: false,
        mutuallyExclusive: [],
        historyKey: 'dinoGrow50',
        icon: '🦖',
        tabId: 'dino-grow',
    },
};

// 辅助：根据 skillId 查找道具类型
const SKILL_ID_TO_TYPE = {};
Object.keys(ITEM_CONFIG).forEach(type => {
    const cfg = ITEM_CONFIG[type];
    if (cfg.skillId != null) {
        SKILL_ID_TO_TYPE[cfg.skillId] = type;
    }
});


const API_CONFIG = {
    baseUrl: 'https://monsteraccounttest.yuemei.info/activity/gmSkill',
    loginUrl: 'https://monsteraccounttest.yuemei.info/api/login'
};

const SERVER_ID_MAP = {
    Q: '750748016054341',
    K: '768538488131653'
};

const WEATHER_ID_MAP = {
    sunshine: 1,
    cloudy_fog: 2,
    light_rain: 3,
    snowfall: 4,
    thunderstorm: 5,
    heavy_rain: 6,
    blizzard: 7,
    aurora: 8,
    meteor_shower: 9,
    sandstorm: 10
};

const API_ERROR_MAP = {
    0:   { zh: '成功', vn: 'Thành công' },
    91:  { zh: '用户未登录', vn: 'Ngườ dùng chưa đăng nhập' },
    92:  { zh: '输入参数不全，请确认', vn: 'Tham số nhập không đầy đủ, vui lòng kiểm tra lại' },
    99:  { zh: '未知错误，请联系客服', vn: 'Lỗi không xác định, vui lòng liên hệ bộ phận hỗ trợ khách hàng' },
    999: { zh: '系统异常，请稍候再试', vn: 'Hệ thống có lỗi bất thường, vui lòng thử lại sau' },
    101: { zh: '邀请码不存在或已失效', vn: 'Mã mờ không tồn tại hoặc đã hết hạn' },
    102: { zh: '用户名或密码不符合规范', vn: 'Tên đăng nhập hoặc mật khẩu không phù hợp với quy định' },
    103: { zh: '用户名已存在', vn: 'Tên ngườ dùng đã tồn tại.' },
    104: { zh: '用户名或密码错误', vn: 'Tên đăng nhập hoặc mật khẩu không đúng' },
    105: { zh: '输入参数错误，数据为空', vn: 'Tham số nhập sai, dữ liệu trống' },
    106: { zh: '支付未成功', vn: 'Thanh toán không thành công' },
    107: { zh: '订单创建失败，请稍候再试', vn: 'Tạo đơn hàng thất bại, vui lòng thử lại sau' },
    108: { zh: '订单不存在', vn: 'Đơn hàng không hợp lệ' },
    109: { zh: '支付成功，请先登录游戏后再尝试补发金币', vn: 'Thanh toán thành công, vui lòng đăng nhập vào game trước rồi mới thử lại nhấn gửi tiền xu' },
    110: { zh: '操作过于频繁，请稍后再试', vn: 'Thao tác quá thường xuyên, vui lòng thử lại sau' },
    111: { zh: '用户权限不足，请联系管理员申请', vn: 'Quyền ngườ dùng không đủ, vui lòng liên hệ quản trị viên để đăng ký' },
    112: { zh: '众筹已完成，感谢您的支持！', vn: 'Dự án quỹ đã hoàn thành, xin cảm ơn sự ủng hộ của bạn!' },
    113: { zh: '验证码输入错误', vn: 'Mã xác minh không đúng' },
    114: { zh: '手机号已存在', vn: 'Số điện thoại đã tồn tại.' },
    115: { zh: '手机号码格式错误', vn: 'Số điện thoại bạn nhập chưa đúng, vui lòng kiểm tra lại.' },
    116: { zh: '用户未登录游戏', vn: 'Ngườ dùng chưa đăng nhập vào trò chơi.' },
    117: { zh: '用户已加入该服务器的其他阵营', vn: 'Ngườ dùng đã tham gia phe khác trên máy chủ này.' },
    118: { zh: '已有同类特效正在执行', vn: 'Đã có hiệu ứng cùng loại đang được thực hiện.' },
    119: { zh: '用户权益点数不足，或已过期', vn: 'Điểm quyền lợi của ngườ dùng không đủ hoặc đã hết hạn.' },
    120: { zh: '用户输入内容违规，申请被拒绝', vn: 'Nội dung nhập vào không hợp lệ, yêu cầu bị từ chối' },
    121: { zh: '用户输入参数不符合规范，请确认后重试', vn: 'Tham số nhập không hợp lệ, vui lòng kiểm tra lại và thử lại' }
};

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('itemManager_api_token') || null;
        this.gameUid = localStorage.getItem('itemManager_api_gameuid') || null;
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'AuthToken': this.token || ''
        };
    }

    async login(username, password) {
        try {
            console.log('[API] POST', API_CONFIG.loginUrl);
            const res = await fetch(API_CONFIG.loginUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            console.log('[API] POST login status:', res.status);
            const data = await res.json();
            if (data.code === 0 && data.extra && data.extra.token) {
                this.token = data.extra.token;
                localStorage.setItem('itemManager_api_token', this.token);
                return { success: true, token: this.token, user: data.extra };
            }
            return { success: false, code: data.code, message: data.message || '登录失败' };
        } catch (e) {
            console.error('[API] login error:', e.message);
            return { success: false, message: '网络错误: ' + e.message };
        }
    }

    async getBenefits() {
        const url = API_CONFIG.baseUrl + '/userListBenefits';
        try {
            console.log('[API] GET', url);
            const res = await fetch(url, { headers: this.getHeaders() });
            console.log('[API] GET', url, 'status:', res.status, 'ok:', res.ok);
            return await res.json();
        } catch (e) {
            console.error('[API] GET error:', url, e.message);
            return { code: -1, message: e.message };
        }
    }

    async getRecords() {
        const url = API_CONFIG.baseUrl + '/userListRecords';
        try {
            console.log('[API] GET', url);
            const res = await fetch(url, { headers: this.getHeaders() });
            console.log('[API] GET', url, 'status:', res.status, 'ok:', res.ok);
            return await res.json();
        } catch (e) {
            console.error('[API] GET error:', url, e.message);
            return { code: -1, message: e.message };
        }
    }

    async apply(skillId, serverId, params) {
        params = params || {};
        const body = {
            skill_id: skillId,
            server_id: serverId,
            weather_id: params.weather_id || 0,
            time_hm: params.time_hm || 0,
            content: params.content || ''
        };
        const url = API_CONFIG.baseUrl + '/userApply';
        try {
            console.log('[API] POST', url, JSON.stringify(body));
            const res = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(body)
            });
            console.log('[API] POST', url, 'status:', res.status, 'ok:', res.ok);
            return await res.json();
        } catch (e) {
            console.error('[API] POST error:', url, e.message);
            return { code: -1, message: e.message };
        }
    }

    async gmSuccess(recordId) {
        const url = API_CONFIG.baseUrl + '/gmSuccess/' + recordId;
        try {
            console.log('[API] GET', url);
            const res = await fetch(url, { headers: this.getHeaders() });
            console.log('[API] GET', url, 'status:', res.status, 'ok:', res.ok);
            return await res.json();
        } catch (e) {
            console.error('[API] GET error:', url, e.message);
            return { code: -1, message: e.message };
        }
    }

    async simAddBenefit(gameUid, skillId, num) {
        const url = API_CONFIG.baseUrl + '/simAddBenefit?' + new URLSearchParams({game_uid: gameUid, skill_id: skillId, num: num});
        try {
            console.log('[API] GET', url);
            const res = await fetch(url, { headers: { 'AuthToken': this.token || '', 'Content-Type': 'application/json' } });
            console.log('[API] GET', url, 'status:', res.status, 'ok:', res.ok);
            return await res.json();
        } catch (e) {
            console.error('[API] GET error:', url, e.message);
            return { code: -1, message: e.message };
        }
    }

    isLoggedIn() {
        return !!this.token;
    }

    logout() {
        this.token = null;
        this.gameUid = null;
        localStorage.removeItem('itemManager_api_token');
        localStorage.removeItem('itemManager_api_gameuid');
    }
}

const APP_MODE = {
    get mode() { return localStorage.getItem('itemManager_app_mode') || 'api'; },
    set mode(v) { localStorage.setItem('itemManager_app_mode', v); },
    isMock() { return this.mode === 'mock'; },
    isApi() { return this.mode === 'api'; },
    toggle() {
        this.mode = this.isMock() ? 'api' : 'mock';
        return this.mode;
    }
};

function mapApiBenefitsToInventory(benefits) {
    // 根据 ITEM_CONFIG 动态初始化库存对象
    const inv = {};
    Object.keys(ITEM_CONFIG).forEach(type => {
        inv[ITEM_CONFIG[type].inventoryKey] = 0;
    });
    if (!Array.isArray(benefits)) return inv;
    benefits.forEach(function(b) {
        const sid = parseInt(b.skill_id, 10);
        const left = parseInt(b.left_times, 10) || 0;
        const type = SKILL_ID_TO_TYPE[sid];
        if (type && ITEM_CONFIG[type]) {
            inv[ITEM_CONFIG[type].inventoryKey] += left;
        }
    });
    console.log('[mapApiBenefitsToInventory] mapped:', inv);
    return inv;
}

function mapApiRecordsToLocks(records, userId) {
    // 根据 ITEM_CONFIG 动态初始化 locks 对象
    const locks = {};
    Object.keys(ITEM_CONFIG).forEach(type => {
        const lockKey = ITEM_CONFIG[type].lockKey;
        if (lockKey) locks[lockKey] = null;
    });
    if (!Array.isArray(records)) return locks;
    records.forEach(function(r) {
        // 兼容 status: 'doing' | 1 | '1'
        const status = String(r.status || '');
        if (status !== 'doing' && status !== '1') return;
        const sid = parseInt(r.skill_id, 10);
        const type = SKILL_ID_TO_TYPE[sid];
        if (!type || !ITEM_CONFIG[type]) return;
        const cfg = ITEM_CONFIG[type];
        const start = r.start_time ? new Date(r.start_time.replace(' ', 'T')).getTime() : Date.now();
        // 计算默认过期时间
        let defaultDuration = cfg.duration || (5 * 60 * 1000);
        // flow 特殊处理：time_hm > 0 是时间卡，time_hm = 0 是流动
        if (type === 'flow') {
            const timeHm = parseInt(r.time_hm, 10);
            defaultDuration = (timeHm > 0) ? DURATION_TIME : DURATION_FLOW;
        }
        const end = r.end_time ? new Date(r.end_time.replace(' ', 'T')).getTime() : (start + defaultDuration);
        const recordUserId = r.user_id || r.game_uid || userId;
        const isMine = String(recordUserId) === String(userId);
        const base = {
            userId: isMine ? userId : ('player_' + recordUserId),
            username: isMine ? 'You' : ('Player ' + String(recordUserId).slice(-4)),
            usernameCn: isMine ? '你' : ('玩家' + String(recordUserId).slice(-4)),
            startTime: start,
            endTime: end,
            detail: r.weather_id || r.time_hm || '',
            detailName: r.content || ''
        };
        // 体型变化特殊：无固定过期时间
        if (type === 'dinoGrow50') {
            locks[cfg.lockKey] = Object.assign({}, base, { endTime: Infinity, sizeType: 'grow50' });
        } else if (type === 'flow') {
            const timeHm = parseInt(r.time_hm, 10);
            if (timeHm > 0) locks.time = base;  // time_hm > 0 表示时间卡
            else locks[cfg.lockKey] = base;
        } else if (cfg.lockKey) {
            locks[cfg.lockKey] = base;
        }
    });
    return locks;
}

// API 错误码映射（供前端直接使用）
function getApiErrorMessage(code, lang) {
    const entry = API_ERROR_MAP[code];
    if (!entry) return null;
    return lang === 'vi' || lang === 'vn' ? entry.vn : entry.zh;
}

window.apiClient = new ApiClient();
