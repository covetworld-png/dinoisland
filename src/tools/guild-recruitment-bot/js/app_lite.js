/**
 * 无公会玩家看板 · 简化版
 * 仅展示，无交互
 */

// ===== I18N =====
const i18n = {
  zh: {
    title: '无公会玩家看板', subtitle: 'Guild-less Player Dashboard',
    refresh: '刷新',
    stat_active_no_guild: '今日活跃（无公会）',
    stat_new: '今日新玩家',
    stat_returning: '老玩家',
    stat_joined: '今日入团',
    stat_rate: '转化率',
    filter_all: '全部', filter_new: '新用户', filter_returning: '老用户',
    filter_online: '在线中',
    th_player_id: '账号 ID', th_nickname: '昵称', th_server: '服务器',
    th_reg_date: '首次登录', th_tag: '标签',
    th_guild_status: '公会状态', th_online_status: '最近活跃时间',
    tag_new: '新用户', tag_returning: '老用户',
    guild_no: '无公会', guild_yes: '已入团',
    online: '在线', offline: '已离线',
    toast_new_user: '新用户 #{id} 已登录',
    toast_returning_user: '回流用户 #{id} 已登录',
    empty: '暂无数据',
  },
  vi: {
    title: 'Bảng ngườI chơI không bang', subtitle: 'Guild-less Player Dashboard',
    refresh: 'Làm mới',
    stat_active_no_guild: 'Hoạt động hôm nay (không bang)',
    stat_new: 'Tân thủ hôm nay', stat_returning: 'NgườI chơI cũ',
    stat_joined: 'Vào bang hôm nay', stat_rate: 'Tỷ lệ chuyển đổI',
    filter_all: 'Tất cả', filter_new: 'Tân thủ', filter_returning: 'Cũ',
    filter_online: 'Online',
    th_player_id: 'ID TK', th_nickname: 'Biệt danh', th_server: 'Máy chủ',
    th_reg_date: 'Lần đăng nhập đầu', th_tag: 'Nhãn',
    th_guild_status: 'Bang hộI', th_online_status: 'ThờI gian hoạt động gần nhất',
    tag_new: 'Tân thủ', tag_returning: 'Cũ',
    guild_no: 'Không bang', guild_yes: 'Đã vào bang',
    online: 'Online', offline: 'Offline',
    toast_new_user: 'Tân thủ #{id} đã đăng nhập',
    toast_returning_user: 'NgườI cũ #{id} đã đăng nhập',
    empty: 'Không có dữ liệu',
  }
};

let currentLang = 'zh';

function t(key, params = {}) {
  let text = i18n[currentLang][key] || key;
  Object.entries(params).forEach(([k, v]) => { text = text.replace(`{${k}}`, v); });
  return text;
}

function switchLang(lang) {
  currentLang = lang;
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (i18n[lang][key]) el.textContent = i18n[lang][key];
  });
  renderStats();
  renderTable();
}

// ===== Mock Data =====
let players = [
  { id: '13219635', nickname: 'TOP龙mixuka', server: 'Q', regDate: '2026-04-28', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '14:20:00', offlineTime: null },
  { id: '13219663', nickname: 'ChiuChiu', server: 'Q', regDate: '2026-04-25', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '14:15:00', offlineTime: null },
  { id: '13219698', nickname: 'Soul', server: 'K', regDate: '2026-04-30', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '14:10:00', offlineTime: null },
  { id: '13219754', nickname: 'C007TITI', server: 'Q', regDate: '2026-03-15', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '14:05:00', offlineTime: null },
  { id: '13219761', nickname: 'CoDoc', server: 'K', regDate: '2026-04-20', tag: 'new', guildStatus: 'has_guild', guildName: 'GOD DINO', onlineStatus: 'online', onlineSince: '13:50:00', offlineTime: null },
  { id: '13219766', nickname: 'TeThanVuong', server: 'Q', regDate: '2026-02-20', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'offline', onlineSince: '13:30:00', offlineTime: '14:00:00' },
  { id: '13219794', nickname: 'PAULZ', server: 'K', regDate: '2026-04-15', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '13:55:00', offlineTime: null },
  { id: '13219808', nickname: 'GKTieuLynh', server: 'Q', regDate: '2026-01-10', tag: 'returning', guildStatus: 'has_guild', guildName: 'Tu Tiên', onlineStatus: 'offline', onlineSince: '12:00:00', offlineTime: '13:45:00' },
  { id: '13219827', nickname: 'Nolan', server: 'Q', regDate: '2026-04-28', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '13:40:00', offlineTime: null },
  { id: '13219916', nickname: 'latne', server: 'K', regDate: '2026-04-22', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'offline', onlineSince: '12:30:00', offlineTime: '13:30:00' },
  { id: '13219922', nickname: 'GK炎3Luffy', server: 'Q', regDate: '2026-04-18', tag: 'new', guildStatus: 'has_guild', guildName: 'TOP.Legend', onlineStatus: 'online', onlineSince: '13:20:00', offlineTime: null },
  { id: '13220015', nickname: 'Leyla', server: 'Q', regDate: '2026-03-01', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '13:15:00', offlineTime: null },
  { id: '13220149', nickname: 'AnH2', server: 'K', regDate: '2026-04-27', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'offline', onlineSince: '11:00:00', offlineTime: '12:45:00' },
  { id: '13220150', nickname: 'Fnasha', server: 'Q', regDate: '2026-04-10', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '12:35:00', offlineTime: null },
  { id: '13220178', nickname: 'nhoknhok', server: 'K', regDate: '2026-04-29', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '12:20:00', offlineTime: null },
];

let currentFilter = 'all';

// ===== Helpers =====
function calcOnlineMinutes(since) {
  const now = new Date();
  const [h, m, s] = since.split(':').map(Number);
  const start = h * 60 + m;
  const current = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, current - start);
}

// ===== Render =====
function renderAll() {
  renderStats();
  renderFilters();
  renderTable();
}

function renderStats() {
  const noGuild = players.filter(p => p.guildStatus === 'no_guild').length;
  const newCount = players.filter(p => p.tag === 'new').length;
  const retCount = players.filter(p => p.tag === 'returning').length;
  const joined = players.filter(p => p.guildStatus === 'has_guild').length;
  const total = players.length;
  const rate = total > 0 ? ((joined / total) * 100).toFixed(1) : '0.0';

  document.getElementById('stats-bar').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">${t('stat_active_no_guild')}</div>
      <div class="stat-value gold">${noGuild}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t('stat_new')}</div>
      <div class="stat-value success">${newCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t('stat_returning')}</div>
      <div class="stat-value info">${retCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t('stat_joined')}</div>
      <div class="stat-value" style="color:var(--mist)">${joined}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${t('stat_rate')}</div>
      <div class="stat-value" style="color:var(--gold)">${rate}%</div>
      <div class="stat-sub">${joined}/${total}</div>
    </div>
  `;
}

function renderFilters() {
  const total = players.length;
  const newCount = players.filter(p => p.tag === 'new').length;
  const retCount = players.filter(p => p.tag === 'returning').length;
  const onlineCount = players.filter(p => p.onlineStatus === 'online').length;

  document.getElementById('count-all').textContent = total;
  document.getElementById('count-new').textContent = newCount;
  document.getElementById('count-returning').textContent = retCount;
  document.getElementById('count-online').textContent = onlineCount;
}

function renderTable() {
  let filtered = players;
  if (currentFilter === 'new') filtered = players.filter(p => p.tag === 'new');
  else if (currentFilter === 'returning') filtered = players.filter(p => p.tag === 'returning');
  else if (currentFilter === 'online') filtered = players.filter(p => p.onlineStatus === 'online');

  filtered.sort((a, b) => {
    if (a.guildStatus === 'no_guild' && b.guildStatus === 'has_guild') return -1;
    if (a.guildStatus === 'has_guild' && b.guildStatus === 'no_guild') return 1;
    return 0;
  });

  const tbody = document.getElementById('player-table');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><span>${t('empty')}</span></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const hasGuild = p.guildStatus === 'has_guild';
    const isOnline = p.onlineStatus === 'online';
    const tagClass = p.tag === 'new' ? 'tag-new' : 'tag-returning';
    const tagText = p.tag === 'new' ? t('tag_new') : t('tag_returning');

    let guildBadge;
    if (hasGuild) {
      guildBadge = `<span class="status-badge status-joined">${t('guild_yes')}${p.guildName ? ' · ' + p.guildName : ''}</span>`;
    } else {
      guildBadge = `<span class="status-badge status-online">${t('guild_no')}</span>`;
    }

    const loginTimeBadge = `<span style="color:var(--text-secondary);font-size:12px;">${p.onlineSince}</span>`;

    const rowClass = hasGuild ? 'strikethrough' : '';

    return `
      <tr class="${rowClass}">
        <td data-label="${t('th_player_id')}"><span class="player-id">${p.id}</span></td>
        <td data-label="${t('th_nickname')}">${p.nickname}</td>
        <td data-label="${t('th_server')}"><span class="server-badge server-${p.server}">${p.server}</span></td>
        <td data-label="${t('th_reg_date')}" style="color:var(--text-secondary);font-size:12px;">${p.regDate}</td>
        <td data-label="${t('th_tag')}"><span class="tag ${tagClass}">${tagText}</span></td>
        <td data-label="${t('th_guild_status')}">${guildBadge}</td>
        <td data-label="${t('th_online_status')}">${loginTimeBadge}</td>
      </tr>
    `;
  }).join('');
}

// ===== Filter =====
function filterPlayers(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderTable();
}

// ===== Refresh =====
function refreshData() {
  const btn = document.querySelector('.refresh-btn');
  btn.classList.add('spinning');
  setTimeout(() => {
    btn.classList.remove('spinning');
    const names = ['VeloRaptor','CarnoBite','IguanoSpike','ParaBeak','GalliRun','MegaShark','AlloPack','CeraHorn','DiloSpit','TroodonEye'];
    const servers = ['Q','K'];
    const newId = 10000 + Math.floor(Math.random() * 89999);
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    const isNewUser = Math.random() > 0.4;

    players.unshift({
      id: String(newId),
      nickname: names[Math.floor(Math.random() * names.length)],
      server: servers[Math.floor(Math.random() * servers.length)],
      regDate: '2026-04-30',
      tag: isNewUser ? 'new' : 'returning',
      guildStatus: 'no_guild',
      guildName: null,
      onlineStatus: 'online',
      onlineSince: timeStr,
      offlineTime: null,
    });
    renderAll();
    showToast('info', isNewUser ? t('toast_new_user', { id: newId }) : t('toast_returning_user', { id: newId }));
  }, 700);
}

// ===== Toast =====
function showToast(type, message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span style="font-size:13px;">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== Theme =====
function switchTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.textContent = theme === 'light' ? '☀️' : '🌙';
  });
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderAll();
});
