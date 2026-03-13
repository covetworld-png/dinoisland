// Dinosaur Island - Invite Dashboard JavaScript

// Configuration loaded from external JSON
let config = {
    inviteCode: '13218392',
    templates: [],
    poster: {},
    rewards: {}
};

// Data
const servers = [
    { id: 'S1', name: 'Máy chủ 1', nameCN: '服务器 1', players: 2847 },
    { id: 'S2', name: 'Máy chủ 2', nameCN: '服务器 2', players: 1956 },
    { id: 'S3', name: 'Máy chủ 3', nameCN: '服务器 3', players: 3124 },
    { id: 'S4', name: 'Máy chủ 4', nameCN: '服务器 4', players: 2531 },
];

const players = [
    { id: 1, name: 'Nguyễn_Văn_Anh', avatar: 'N', status: 'activated', date: '2026-03-10', recharged: true, amount: 68, reward: 30, bonus: 13 },
    { id: 2, name: 'Trần_Thị_Minh', avatar: 'T', status: 'activated', date: '2026-03-11', recharged: false, amount: 0, reward: 30, bonus: 0 },
    { id: 3, name: 'Lê_Hoàng_Phúc', avatar: 'L', status: 'pending', date: '2026-03-11', recharged: false, amount: 0, reward: 0, bonus: 0 },
    { id: 4, name: 'Phạm_Thanh_Hương', avatar: 'P', status: 'pending', date: '2026-03-12', recharged: false, amount: 0, reward: 0, bonus: 0 },
];

// State
let currentLang = 'vi';
let selectedServerId = null;

// Load configuration
async function loadConfig() {
    try {
        const response = await fetch('config/messages.json');
        if (!response.ok) throw new Error('Failed to load config');
        config = await response.json();
        
        // Update invite code display
        document.querySelectorAll('.invite-code').forEach(el => {
            el.textContent = config.inviteCode;
        });
        
        // Update poster text
        updatePosterText();
    } catch (error) {
        console.error('Failed to load config:', error);
        // Fallback to default values
        config = {
            inviteCode: '13218392',
            templates: [
                { id: 1, vi: 'Nhanh tay tham gia Đảo Khủng Long! Dùng mã mờI 13218392 đăng ký, cả hai đều nhận 50 vàng!', cn: '快来加入恐龙世界！用我的邀请码 13218392 注册，双方都能获得50金币！' },
                { id: 2, vi: 'Phát hiện game khủng long cực hay! Đăng ký nhập mã 13218392, nhận ngay 50 vàng + quà tân thủ!', cn: '发现一款超好玩的恐龙游戏！注册填我的邀请码 13218392，新手礼包+50金币直接到账！' },
                { id: 3, vi: 'Thiếu đồng đội thám hiểm! Dùng mã 13218392 tham gia, nhận ngay thưởng vàng!', cn: '组队探险缺队友！用邀请码 13218392 加入，开局就有金币奖励！' },
            ],
            poster: {
                title: { vi: 'Đảo Khủng Long', cn: '恐龙世界' },
                subtitle: { vi: 'MờI bạn cùng khám phá thế giới tiền sử', cn: '邀请你一起探索史前世界' },
                codeLabel: { vi: 'Mã mờI của tôi', cn: '我的邀请码' },
                scanText: { vi: 'Quét mã để tham gia ngay', cn: '扫码立即加入' }
            },
            rewards: {
                base: { vi: 'Mỗi lờI mờI thành công nhận {{amount}} vàng', cn: '每成功邀请一位好友可获得 {{amount}} 金币' },
                recharge: { vi: 'Hoàn thành nạp đầu nhận {{percent}}% hoàn trả', cn: '完成首充可获得 {{percent}}% 返点' },
                newbie: { vi: 'NgườI mới kích hoạt nhận {{amount}} vàng', cn: '新用户激活可获得 {{amount}} 金币' }
            }
        };
    }
}

// Helper: Replace template variables
function formatTemplate(template, vars) {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
}

// Language
function toggleLanguage() {
    currentLang = currentLang === 'vi' ? 'cn' : 'vi';
    document.getElementById('lang-btn-desktop').textContent = currentLang === 'vi' ? 'CN' : 'VN';
    document.getElementById('lang-btn-mobile').textContent = currentLang === 'vi' ? 'CN' : 'VN';
    
    document.querySelectorAll('[data-vi][data-cn]').forEach(el => {
        if (el.tagName === 'INPUT') {
            el.placeholder = currentLang === 'vi' ? el.dataset.vi : el.dataset.cn;
        } else if (el.tagName === 'OPTION') {
            el.textContent = currentLang === 'vi' ? el.dataset.vi : el.dataset.cn;
        } else {
            el.textContent = currentLang === 'vi' ? el.dataset.vi : el.dataset.cn;
        }
    });
    
    renderPlayers();
    renderServerOptions();
    updatePosterText();
    
    showToast(currentLang === 'vi' ? 'Đã chuyển sang tiếng Việt' : '已切换到中文');
}

// Toast
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');
    
    setTimeout(() => {
        toast.classList.add('opacity-0', 'pointer-events-none');
        toast.classList.remove('opacity-100');
    }, 2000);
}

// Navigation
function goBack() {
    showToast(currentLang === 'vi' ? 'Quay lại' : '返回上一页');
}

// Server Selection
function renderServerOptions() {
    const select = document.getElementById('server-select');
    
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    servers.forEach(server => {
        const option = document.createElement('option');
        option.value = server.id;
        option.textContent = currentLang === 'vi' ? server.name : server.nameCN;
        select.appendChild(option);
    });
}

function showServerModal() {
    renderServerOptions();
    selectedServerId = null;
    updateConfirmButton();
    document.getElementById('server-modal').classList.remove('hidden');
}

function closeServerModal() {
    document.getElementById('server-modal').classList.add('hidden');
}

function updateConfirmButton() {
    const confirmBtn = document.getElementById('confirm-claim-btn');
    if (selectedServerId) {
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('bg-jungle-600', 'text-gray-400', 'cursor-not-allowed');
        confirmBtn.classList.add('bg-gradient-to-r', 'from-gold', 'to-gold-dark', 'text-jungle-900', 'cursor-pointer', 'hover:brightness-110');
        confirmBtn.innerHTML = `<span>${currentLang === 'vi' ? 'Nhận 1,250 vàng' : '领取 1,250 金币'}</span>`;
    } else {
        confirmBtn.disabled = true;
        confirmBtn.classList.add('bg-jungle-600', 'text-gray-400', 'cursor-not-allowed');
        confirmBtn.classList.remove('bg-gradient-to-r', 'from-gold', 'to-gold-dark', 'text-jungle-900', 'cursor-pointer', 'hover:brightness-110');
        confirmBtn.innerHTML = `<span data-vi="Vui lòng chọn máy chủ" data-cn="请选择服务器">${currentLang === 'vi' ? 'Vui lòng chọn máy chủ' : '请选择服务器'}</span>`;
    }
}

function confirmClaim() {
    if (selectedServerId) {
        const server = servers.find(s => s.id === selectedServerId);
        const serverName = currentLang === 'vi' ? server.name : server.nameCN;
        showToast(currentLang === 'vi' ? `Đã nhận 1,250 vàng vào ${serverName}` : `成功领取 1,250 金币到 ${serverName}`);
        closeServerModal();
    }
}

// Copy Functions
function copyCode() {
    navigator.clipboard.writeText(config.inviteCode).then(() => {
        showToast(currentLang === 'vi' ? 'Đã sao chép mã mờI' : '邀请码已复制');
    }).catch(() => {
        showToast(currentLang === 'vi' ? 'Sao chép thất bại' : '复制失败');
    });
}

function copyLink() {
    navigator.clipboard.writeText(`https://dinogame.com/invite/${config.inviteCode}`).then(() => {
        showToast(currentLang === 'vi' ? 'Đã sao chép link' : '链接已复制');
    }).catch(() => {
        showToast(currentLang === 'vi' ? 'Sao chép thất bại' : '复制失败');
    });
}

// Quick Actions
function generatePoster() {
    const randomIndex = Math.floor(Math.random() * config.templates.length);
    const template = config.templates[randomIndex];
    const message = formatTemplate(
        currentLang === 'vi' ? template.vi : template.cn,
        { code: config.inviteCode }
    );
    document.getElementById('poster-message').textContent = message;
    document.getElementById('poster-modal').classList.remove('hidden');
}

function updatePosterText() {
    const posterMsg = document.getElementById('poster-message');
    if (posterMsg && config.templates.length > 0) {
        const randomIndex = Math.floor(Math.random() * config.templates.length);
        const template = config.templates[randomIndex];
        posterMsg.textContent = formatTemplate(
            currentLang === 'vi' ? template.vi : template.cn,
            { code: config.inviteCode }
        );
    }
}

function showMessageTemplates() {
    renderMessageTemplates();
    document.getElementById('message-modal').classList.remove('hidden');
}

function renderMessageTemplates() {
    const container = document.querySelector('#message-modal .space-y-3');
    if (!container || !config.templates) return;
    
    container.innerHTML = config.templates.map((template, index) => {
        const message = formatTemplate(
            currentLang === 'vi' ? template.vi : template.cn,
            { code: config.inviteCode }
        );
        return `
            <button onclick="copyTemplate(${index})" class="w-full p-4 bg-jungle-700/50 rounded-xl text-left hover:bg-jungle-700 transition-colors cursor-pointer active:scale-[0.99] border border-mist/10">
                <p class="text-white text-sm leading-relaxed">"${message}"</p>
            </button>
        `;
    }).join('');
}

function startInviting() {
    showMessageTemplates();
}

// Render Players
function renderPlayers() {
    const container = document.getElementById('player-list');
    
    container.innerHTML = players.map((player, index) => {
        const activated = player.status === 'activated';
        const recharged = player.recharged;
        const colors = ['from-emerald-600 to-emerald-800', 'from-amber-600 to-amber-800', 'from-slate-600 to-slate-800', 'from-stone-600 to-stone-800'];
        const colorClass = colors[index % colors.length];
        
        const statusText = activated 
            ? (currentLang === 'vi' ? 'Đã kích hoạt' : '已激活')
            : (currentLang === 'vi' ? 'Chờ kích hoạt' : '待激活');
        const statusColor = activated ? 'emerald' : 'amber';
        
        const rechargeText = recharged
            ? `${currentLang === 'vi' ? 'Đã nạp' : '已首充'} ¥${player.amount}`
            : (currentLang === 'vi' ? 'Chưa nạp' : '未首充');
        
        const rewardText = activated
            ? `+${player.reward}`
            : (currentLang === 'vi' ? 'Chờ phát' : '待发放');
        
        return `
            <div class="player-item lg:grid lg:grid-cols-12 lg:gap-4 lg:items-center lg:px-4 lg:py-4 card-glass lg:bg-none lg:hover:bg-jungle-700/30 rounded-xl lg:rounded-none p-4 lg:p-0 border border-mist/10 lg:border-0 lg:border-b transition-colors duration-200 cursor-pointer" data-status="${player.status}">
                <div class="lg:hidden flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-bold text-lg">${player.avatar}</div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="text-white font-semibold text-sm truncate section-title-shadow">${player.name}</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs text-gray-300">${player.date}</span>
                            <span class="flex items-center gap-1 text-xs text-${statusColor}-400">
                                <span class="w-1.5 h-1.5 rounded-full bg-${statusColor}-400"></span>
                                ${statusText}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 mt-1">
                            ${recharged 
                                ? `<span class="text-xs text-gold flex items-center gap-1"><i class="fas fa-coins text-[10px]"></i>${rechargeText}</span>`
                                : `<span class="text-xs text-gray-400">${rechargeText}</span>`
                            }
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="${activated ? 'text-gold' : 'text-gray-400'} font-bold text-sm">${rewardText}</div>
                        ${recharged ? `<div class="text-gold/70 text-xs">+${player.bonus}</div>` : ''}
                    </div>
                </div>
                <div class="hidden lg:contents">
                    <div class="col-span-4 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-bold text-sm">${player.avatar}</div>
                        <span class="text-white font-medium section-title-shadow">${player.name}</span>
                    </div>
                    <div class="col-span-2 text-center text-sm text-gray-300">${player.date}</div>
                    <div class="col-span-2 text-center">
                        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-${statusColor}-500/20 text-${statusColor}-400 text-xs">
                            <span class="w-1.5 h-1.5 rounded-full bg-${statusColor}-400"></span>
                            ${statusText}
                        </span>
                    </div>
                    <div class="col-span-2 text-center">
                        ${recharged 
                            ? `<span class="inline-flex items-center gap-1 text-gold text-xs"><i class="fas fa-coins text-[10px]"></i>${rechargeText}</span>`
                            : `<span class="text-gray-400 text-xs">${rechargeText}</span>`
                        }
                    </div>
                    <div class="col-span-2 text-right">
                        <div class="${activated ? 'text-gold' : 'text-gray-400'} font-bold">${rewardText}</div>
                        ${recharged ? `<div class="text-gold/70 text-xs">+${player.bonus} ${currentLang === 'vi' ? 'hoàn trả' : '返点'}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Filter
function filterList(status) {
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('bg-gold', 'text-jungle-900');
        tab.classList.add('bg-jungle-700', 'text-gray-300');
    });
    document.getElementById(`tab-${status}`).classList.remove('bg-jungle-700', 'text-gray-300');
    document.getElementById(`tab-${status}`).classList.add('bg-gold', 'text-jungle-900');

    document.querySelectorAll('.player-item').forEach(item => {
        if (status === 'all' || item.dataset.status === status) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
}

// Modals
function closeMessageModal() {
    document.getElementById('message-modal').classList.add('hidden');
}

function closePosterModal() {
    document.getElementById('poster-modal').classList.add('hidden');
}

function closeRulesModal() {
    document.getElementById('rules-modal').classList.add('hidden');
}

function showRules() {
    document.getElementById('rules-modal').classList.remove('hidden');
}

// Templates
function copyTemplate(index) {
    const template = config.templates[index];
    if (!template) return;
    
    const text = formatTemplate(
        currentLang === 'vi' ? template.vi : template.cn,
        { code: config.inviteCode }
    );
    
    navigator.clipboard.writeText(text).then(() => {
        showToast(currentLang === 'vi' ? `Đã sao chép mẫu ${index + 1}` : `话术模板${index + 1}已复制`);
        closeMessageModal();
    });
}

// Poster
function savePoster() {
    showToast(currentLang === 'vi' ? 'Đã lưu poster' : '海报已保存');
    closePosterModal();
}

function sharePoster() {
    showToast(currentLang === 'vi' ? 'Chọn kênh chia sẻ' : '请选择分享渠道');
}

// Event Listeners
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMessageModal();
        closePosterModal();
        closeRulesModal();
        closeServerModal();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    renderPlayers();
    renderServerOptions();
    
    document.getElementById('server-select').addEventListener('change', function() {
        selectedServerId = this.value;
        updateConfirmButton();
    });
});
