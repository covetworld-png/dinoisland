// ============================================
// Trung Tâm Đạo Cụ - Item Manager
// LocalStorage-based state with cross-tab sync
// ============================================

const LS_KEY_STATE = 'itemManager_state_v1';
const LS_KEY_USER = 'itemManager_user_v1';
const USE_DURATION = 5 * 60 * 1000; // 5 minutes in ms

// Translations
const I18N = {
    vi: {
        ready: 'Sẵn sàng',
        inUse: 'Đang sử dụng',
        busy: 'Đang bận',
        conflictWeather: (name, time) => `Người chơi ${name} đang sử dụng Thẻ Thời Tiết, còn lại ${time}`,
        conflictTime: (name, time) => `Người chơi ${name} đang sử dụng Thẻ Thời Gian, còn lại ${time}`,
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
            announcement: 'Thông Báo'
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
            announcement: '全服公告'
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
        this.countdowns = { weather: null, time: null };
        this.currentTab = 'weather';
        this.selectedOptions = { weather: null, time: null };
        this.init();
    }

    loadUser() {
        let user = localStorage.getItem(LS_KEY_USER);
        if (user) {
            return JSON.parse(user);
        }
        const id = 'player_' + Math.random().toString(36).substr(2, 6);
        const num = getRandomInt(1000, 9999);
        user = {
            userId: id,
            username: `Người chơi ${num}`,
            usernameCn: `玩家${num}`,
            inventory: {
                weatherCard: 3,
                timeCard: 3,
                announcementCard: 3
            }
        };
        localStorage.setItem(LS_KEY_USER, JSON.stringify(user));
        return user;
    }

    loadState() {
        const state = localStorage.getItem(LS_KEY_STATE);
        if (state) {
            return JSON.parse(state);
        }
        return {
            globalLocks: { weather: null, time: null },
            announcements: [],
            history: []
        };
    }

    saveState() {
        localStorage.setItem(LS_KEY_STATE, JSON.stringify(this.state));
    }

    saveUser() {
        localStorage.setItem(LS_KEY_USER, JSON.stringify(this.user));
    }

    init() {
        this.cleanupHistory();
        this.renderInventory();
        this.renderAllPanels();
        this.renderHistory();
        this.startCountdowns();
        this.processAnnouncements();
        this.setupEventListeners();
        this.setupStorageSync();
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
        if (!selected) {
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
        const detail = t.timeNames[selected] || selected;
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
        showToast(t.useSuccess(t.history.time), 'success');
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
        ['weather', 'time'].forEach(type => {
            if (this.countdowns[type]) {
                clearInterval(this.countdowns[type]);
                this.countdowns[type] = null;
            }
        });

        const tick = () => {
            ['weather', 'time'].forEach(type => {
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

                        if (options) {
                            options.querySelectorAll('.option-btn').forEach(btn => {
                                btn.disabled = true;
                            });
                        }
                        if (btn) btn.disabled = true;

                        if (conflictBanner) {
                            if (isMine) {
                                conflictBanner.style.display = 'none';
                            } else {
                                conflictBanner.style.display = 'flex';
                                const name = lang === 'vi' ? lock.username : (lock.usernameCn || lock.username);
                                const namesMap = type === 'weather' 
                                    ? (lang === 'vi' ? I18N.vi.weatherNames : I18N.cn.weatherNames)
                                    : (lang === 'vi' ? I18N.vi.timeNames : I18N.cn.timeNames);
                                const detail = namesMap[lock.detail] || lock.detailName || lock.detail;
                                const textEl = document.getElementById(`conflict-text-${type}`);
                                if (textEl) {
                                    const msg = type === 'weather' 
                                        ? t.conflictWeather(name, formatTime(remaining))
                                        : t.conflictTime(name, formatTime(remaining));
                                    textEl.textContent = msg + ` (${detail})`;
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
                                       (type === 'time' && this.user.inventory.timeCard <= 0);
                    }
                    if (conflictBanner) conflictBanner.style.display = 'none';
                }
            });
        };

        tick();
        const interval = setInterval(tick, 1000);
        ['weather', 'time'].forEach(type => {
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
        document.getElementById('count-weather').textContent = this.user.inventory.weatherCard;
        document.getElementById('count-time').textContent = this.user.inventory.timeCard;
        document.getElementById('count-announcement').textContent = this.user.inventory.announcementCard;

        ['weather', 'time', 'announcement'].forEach(type => {
            const card = document.getElementById(`inv-${type}`);
            const count = this.user.inventory[type + 'Card'];
            if (card) {
                card.classList.toggle('empty', count <= 0);
            }
        });
    }

    renderAllPanels() {
        this.renderWeatherPanel();
        this.renderTimePanel();
        this.renderAnnouncementPanel();
    }

    renderPanel(type) {
        if (type === 'weather') this.renderWeatherPanel();
        else if (type === 'time') this.renderTimePanel();
        else if (type === 'announcement') this.renderAnnouncementPanel();
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
        const container = document.getElementById('options-time');
        if (!container) return;

        container.querySelectorAll('.option-btn').forEach(btn => {
            btn.onclick = () => {
                if (btn.disabled) return;
                container.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedOptions.time = btn.dataset.value;
            };
        });
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
            const icon = item.type === 'weather' ? '🌦️' : item.type === 'time' ? '🕐' : '📢';
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

        // Update user name display
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) {
            const lang = document.body.getAttribute('data-lang') || 'vi';
            userNameEl.textContent = lang === 'vi' ? this.user.username : this.user.usernameCn;
        }
    }

    setupStorageSync() {
        window.addEventListener('storage', (e) => {
            if (e.key === LS_KEY_STATE) {
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
function toggleLanguage() {
    const body = document.body;
    const currentLang = body.getAttribute('data-lang') || 'vi';
    const newLang = currentLang === 'vi' ? 'cn' : 'vi';
    body.setAttribute('data-lang', newLang);
    document.getElementById('current-lang').textContent = newLang === 'vi' ? 'VI / 中' : '中 / VI';
    localStorage.setItem('lang', newLang);

    // Update user name
    const userNameEl = document.getElementById('user-name');
    if (userNameEl && window.itemManager) {
        userNameEl.textContent = newLang === 'vi' 
            ? window.itemManager.user.username 
            : window.itemManager.user.usernameCn;
    }

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

// Global actions
function useWeatherCard() {
    if (window.itemManager) window.itemManager.useWeatherCard();
}

function useTimeCard() {
    if (window.itemManager) window.itemManager.useTimeCard();
}

function submitAnnouncement() {
    const content = document.getElementById('announcement-content')?.value || '';
    if (window.itemManager) {
        window.itemManager.submitAnnouncement(content);
        document.getElementById('announcement-content').value = '';
        document.getElementById('char-count').textContent = '0';
    }
}

// Initialize
let itemManager;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const savedLang = localStorage.getItem('lang') || 'vi';
        document.body.setAttribute('data-lang', savedLang);
        document.getElementById('current-lang').textContent = savedLang === 'vi' ? 'VI / 中' : '中 / VI';
        itemManager = new ItemManager();
        window.itemManager = itemManager;
    });
} else {
    const savedLang = localStorage.getItem('lang') || 'vi';
    document.body.setAttribute('data-lang', savedLang);
    document.getElementById('current-lang').textContent = savedLang === 'vi' ? 'VI / 中' : '中 / VI';
    itemManager = new ItemManager();
    window.itemManager = itemManager;
}
