/**
 * 无公会玩家看板 Demo
 * 双目标：促进入团 + 团长竞争
 */

// ===== I18N =====
const i18n = {
  zh: {
    login_title: '团长登录', login_subtitle: '无公会玩家看板系统',
    label_username: '用户名', label_password: '密码',
    btn_login: '登录', btn_logout: '退出',
    login_hint: '团长账号: specter(SPECTER) / sktti(SKTTI) / chiuchiu(ChiuChiu) / thien_co / hacam / nhatthuc / nguyetcung / tutien，密码: 123456',
    title: '无公会玩家看板', subtitle: 'Guild-less Player Dashboard',
    refresh: '刷新',
    tab_players: '👥 玩家列表', tab_leaderboard: '🏆 团长排行',
    stat_active_no_guild: '今日活跃（无公会）',
    stat_new: '今日新玩家',
    stat_returning: '老玩家',
    stat_joined: '今日入团',
    stat_rate: '转化率',
    filter_all: '全部', filter_new: '新用户', filter_returning: '老用户',
    filter_online: '在线中', filter_unclaimed: '未认领',
    th_player_id: '账号 ID', th_nickname: '昵称', th_server: '服务器',
    th_reg_date: '首次登录', th_tag: '标签',
    th_guild_status: '公会状态', th_online_status: '最近活跃时间',
    th_claimed_by: '认领人', th_action: '操作',
    tag_new: '新用户', tag_returning: '老用户',
    guild_no: '无公会', guild_yes: '已入团',
    lb_title: '🏆 团长排行榜',
    lb_today: '今日', lb_week: '近一周', lb_month: '本月', lb_total: '累计',
    online: '在线', offline: '已离线',
    login_error: '用户名或密码错误',
    welcome: '欢迎',
    welcome_msg: '欢迎，{name}',
    please_login: '请先登录',
    toast_new_user: '新用户 #{id} 已登录，Zalo 已推送通知',
    toast_returning_user: '回流用户 #{id} 已登录',
    lb_claims: '认领', lb_joins: '入团', lb_rate: '转化率',
    lb_empty: '暂无数据',
    you: '你',
    btn_claim: '认领',
    btn_claimed_by_you: '你已认领',
    toast_claim: '✓ 已认领 #{id}，账号已复制到剪贴板',
    empty: '暂无数据',
  },
  vi: {
    login_title: 'Đăng nhập độI trưởng', login_subtitle: 'Bảng ngườI chơI không bang',
    label_username: 'Tên đăng nhập', label_password: 'Mật khẩu',
    btn_login: 'Đăng nhập', btn_logout: 'Đăng xuất',
    login_hint: 'TK ĐT: specter(SPECTER) / sktti(SKTTI) / chiuchiu(ChiuChiu) / thien_co / hacam / nhatthuc / nguyetcung / tutien, MK: 123456',
    title: 'Bảng ngườI chơI không bang', subtitle: 'Guild-less Player Dashboard',
    refresh: 'Làm mới',
    tab_players: '👥 Danh sách', tab_leaderboard: '🏆 Xếp hạng',
    stat_active_no_guild: 'Hoạt động hôm nay (không bang)',
    stat_new: 'Tân thủ hôm nay', stat_returning: 'NgườI chơI cũ',
    stat_joined: 'Vào bang hôm nay', stat_rate: 'Tỷ lệ chuyển đổI',
    filter_all: 'Tất cả', filter_new: 'Tân thủ', filter_returning: 'Cũ',
    filter_online: 'Online', filter_unclaimed: 'Chưa nhận',
    th_player_id: 'ID TK', th_nickname: 'Biệt danh', th_server: 'Máy chủ',
    th_reg_date: 'Lần đăng nhập đầu', th_tag: 'Nhãn',
    th_guild_status: 'Bang hộI', th_online_status: 'ThờI gian hoạt động gần nhất',
    th_claimed_by: 'NgườI nhận', th_action: 'Thao tác',
    tag_new: 'Tân thủ', tag_returning: 'Cũ',
    guild_no: 'Không bang', guild_yes: 'Đã vào bang',
    lb_title: '🏆 Bảng xếp hạng',
    lb_today: 'Hôm nay', lb_week: '7 ngày qua', lb_month: 'Tháng này', lb_total: 'Tổng',
    online: 'Online', offline: 'Offline',
    login_error: 'Sai tên đăng nhập hoặc mật khẩu',
    welcome: 'Chào mừng',
    welcome_msg: 'Chào mừng, {name}',
    please_login: 'Vui lòng đăng nhập',
    toast_new_user: 'Tân thủ #{id} đã đăng nhập, đã gửI Zalo',
    toast_returning_user: 'NgườI cũ #{id} đã đăng nhập',
    lb_claims: 'Nhận', lb_joins: 'Vào bang', lb_rate: 'Tỷ lệ',
    lb_empty: 'Không có dữ liệu',
    you: 'Bạn',
    btn_claim: 'Nhận',
    btn_claimed_by_you: 'Bạn đã nhận',
    toast_claim: '✓ Đã nhận #{id}，ID đã sao chép',
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
  renderLeaderboard();
  renderTable();
  renderStats();
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

// ===== Auth =====
const leaderAccounts = [
  { username: 'specter', password: '123456', displayName: 'SPECTER', avatar: 'S', guild: 'Hoả Long', server: 'Q' },
  { username: 'sktti', password: '123456', displayName: 'SKTTI', avatar: 'K', guild: 'GOD DINO', server: 'Q' },
  { username: 'chiuchiu', password: '123456', displayName: 'ChiuChiu', avatar: 'C', guild: 'God King', server: 'Q' },
  { username: 'nguyetcung', password: '123456', displayName: 'NguyệtCung', avatar: 'N', guild: 'NguyệtCung', server: 'Q' },
  { username: 'thien_co', password: '123456', displayName: 'Thiên Cơ', avatar: 'T', guild: 'Thiên Cơ', server: 'K' },
  { username: 'hacam', password: '123456', displayName: 'Hắc Ám', avatar: 'H', guild: 'Hắc Ám', server: 'K' },
  { username: 'nhatthuc', password: '123456', displayName: 'Nhật Thực', avatar: 'R', guild: 'Nhật Thực', server: 'K' },
  { username: 'tutien', password: '123456', displayName: 'TUTien', avatar: 'U', guild: 'Tu Tiên', server: 'Q' },
];

let currentUser = null;
let currentTab = 'players';

function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const account = leaderAccounts.find(a => a.username === username && a.password === password);
  if (!account) {
    showToast('warning', t('login_error'));
    return;
  }
  currentUser = account;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('current-user-badge').textContent = `👤 ${account.displayName} · ${account.guild}`;
  showToast('success', t('welcome_msg', { name: account.displayName }));
  renderAll();
}

function doLogout() {
  currentUser = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('login-username').value = 'specter';
  document.getElementById('login-password').value = '123456';
}

// ===== Mock Data =====
let players = [
  { id: '13219635', nickname: 'TOP龙mixuka', server: 'Q', regDate: '2026-04-28', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '14:20:00', offlineTime: null, claimedBy: [] },
  { id: '13219663', nickname: 'ChiuChiu', server: 'Q', regDate: '2026-04-25', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '14:15:00', offlineTime: null, claimedBy: [] },
  { id: '13219698', nickname: 'Soul', server: 'K', regDate: '2026-04-30', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '14:10:00', offlineTime: null, claimedBy: ['SPECTER'] },
  { id: '13219754', nickname: 'C007TITI', server: 'Q', regDate: '2026-03-15', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '14:05:00', offlineTime: null, claimedBy: [] },
  { id: '13219761', nickname: 'CoDoc', server: 'K', regDate: '2026-04-20', tag: 'new', guildStatus: 'has_guild', guildName: 'GOD DINO', onlineStatus: 'online', onlineSince: '13:50:00', offlineTime: null, claimedBy: ['SKTTI'] },
  { id: '13219766', nickname: 'TeThanVuong', server: 'Q', regDate: '2026-02-20', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'offline', onlineSince: '13:30:00', offlineTime: '14:00:00', claimedBy: [] },
  { id: '13219794', nickname: 'PAULZ', server: 'K', regDate: '2026-04-15', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '13:55:00', offlineTime: null, claimedBy: ['Thiên Cơ', 'SPECTER'] },
  { id: '13219808', nickname: 'GKTieuLynh', server: 'Q', regDate: '2026-01-10', tag: 'returning', guildStatus: 'has_guild', guildName: 'Tu Tiên', onlineStatus: 'offline', onlineSince: '12:00:00', offlineTime: '13:45:00', claimedBy: ['SPECTER'] },
  { id: '13219827', nickname: 'Nolan', server: 'Q', regDate: '2026-04-28', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '13:40:00', offlineTime: null, claimedBy: [] },
  { id: '13219916', nickname: 'latne', server: 'K', regDate: '2026-04-22', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'offline', onlineSince: '12:30:00', offlineTime: '13:30:00', claimedBy: [] },
  { id: '13219922', nickname: 'GK炎3Luffy', server: 'Q', regDate: '2026-04-18', tag: 'new', guildStatus: 'has_guild', guildName: 'TOP.Legend', onlineStatus: 'online', onlineSince: '13:20:00', offlineTime: null, claimedBy: ['ChiuChiu'] },
  { id: '13220015', nickname: 'Leyla', server: 'Q', regDate: '2026-03-01', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '13:15:00', offlineTime: null, claimedBy: ['SPECTER'] },
  { id: '13220149', nickname: 'AnH2', server: 'K', regDate: '2026-04-27', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'offline', onlineSince: '11:00:00', offlineTime: '12:45:00', claimedBy: [] },
  { id: '13220150', nickname: 'Fnasha', server: 'Q', regDate: '2026-04-10', tag: 'returning', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '12:35:00', offlineTime: null, claimedBy: [] },
  { id: '13220178', nickname: 'nhoknhok', server: 'K', regDate: '2026-04-29', tag: 'new', guildStatus: 'no_guild', guildName: null, onlineStatus: 'online', onlineSince: '12:20:00', offlineTime: null, claimedBy: [] },
];

let currentFilter = 'all';
let currentPeriod = 'today';

// ===== Leaderboard History Data (Mock) =====
const leaderHistory = {
  '2026-04-24': { SPECTER: {c:2,j:1}, SKTTI: {c:1,j:1}, ChiuChiu: {c:1,j:0}, 'Thiên Cơ': {c:1,j:0} },
  '2026-04-25': { SPECTER: {c:3,j:2}, SKTTI: {c:2,j:1}, ChiuChiu: {c:1,j:1}, 'Hắc Ám': {c:1,j:0} },
  '2026-04-26': { SPECTER: {c:2,j:1}, SKTTI: {c:2,j:1}, ChiuChiu: {c:2,j:1}, 'Nhật Thực': {c:1,j:0} },
  '2026-04-27': { SPECTER: {c:4,j:2}, SKTTI: {c:3,j:2}, ChiuChiu: {c:2,j:1}, TUTien: {c:1,j:0} },
  '2026-04-28': { SPECTER: {c:3,j:2}, SKTTI: {c:2,j:1}, ChiuChiu: {c:1,j:1}, NguyệtCung: {c:1,j:0} },
  '2026-04-29': { SPECTER: {c:3,j:2}, SKTTI: {c:2,j:1}, ChiuChiu: {c:2,j:1}, 'Thiên Cơ': {c:1,j:0} },
};

const leaderTotals = {
  SPECTER: {claims: 45, joins: 28},
  SKTTI: {claims: 38, joins: 22},
  ChiuChiu: {claims: 32, joins: 18},
  'Thiên Cơ': {claims: 25, joins: 15},
  'Hắc Ám': {claims: 20, joins: 12},
  'Nhật Thực': {claims: 18, joins: 10},
  NguyệtCung: {claims: 15, joins: 8},
  TUTien: {claims: 12, joins: 6},
};

// 本月额外估算（4/1~4/23）
const monthExtra = {
  SPECTER: {c:20,j:12}, SKTTI: {c:18,j:10}, ChiuChiu: {c:15,j:8},
  'Thiên Cơ': {c:12,j:7}, 'Hắc Ám': {c:10,j:5}, 'Nhật Thực': {c:8,j:4},
  NguyệtCung: {c:6,j:3}, TUTien: {c:5,j:2},
};

// ===== Helpers =====
function calcOnlineMinutes(since) {
  const now = new Date();
  const [h, m, s] = since.split(':').map(Number);
  const start = h * 60 + m;
  const current = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, current - start);
}

function sortLeaderboard(a, b) {
  if (b.joins !== a.joins) return b.joins - a.joins;
  if (b.claims !== a.claims) return b.claims - a.claims;
  return 0;
}

function calcTodayStats() {
  const stats = {};
  leaderAccounts.forEach(a => {
    stats[a.displayName] = { name: a.displayName, guild: a.guild, avatar: a.avatar, claims: 0, joins: 0 };
  });
  players.forEach(p => {
    p.claimedBy.forEach(leaderName => {
      if (stats[leaderName]) stats[leaderName].claims++;
    });
    if (p.guildStatus === 'has_guild') {
      p.claimedBy.forEach(leaderName => {
        if (stats[leaderName]) stats[leaderName].joins++;
      });
    }
  });
  return Object.values(stats).filter(s => s.claims > 0 || s.joins > 0).sort(sortLeaderboard);
}

function calcPeriodStats(period) {
  if (period === 'today') return calcTodayStats();

  const stats = {};
  leaderAccounts.forEach(a => {
    stats[a.displayName] = { name: a.displayName, guild: a.guild, avatar: a.avatar, claims: 0, joins: 0 };
  });

  // Add history
  Object.entries(leaderHistory).forEach(([date, dayStats]) => {
    Object.entries(dayStats).forEach(([name, data]) => {
      if (stats[name]) { stats[name].claims += data.c; stats[name].joins += data.j; }
    });
  });

  // Add today
  players.forEach(p => {
    p.claimedBy.forEach(leaderName => {
      if (stats[leaderName]) stats[leaderName].claims++;
    });
    if (p.guildStatus === 'has_guild') {
      p.claimedBy.forEach(leaderName => {
        if (stats[leaderName]) stats[leaderName].joins++;
      });
    }
  });

  if (period === 'month') {
    Object.entries(monthExtra).forEach(([name, data]) => {
      if (stats[name]) { stats[name].claims += data.c; stats[name].joins += data.j; }
    });
  }

  if (period === 'total') {
    // Replace with pre-calculated totals
    leaderAccounts.forEach(a => {
      const total = leaderTotals[a.displayName];
      if (total && stats[a.displayName]) {
        stats[a.displayName].claims = total.claims;
        stats[a.displayName].joins = total.joins;
      }
    });
  }

  return Object.values(stats).filter(s => s.claims > 0 || s.joins > 0).sort(sortLeaderboard);
}

function getDateRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const today = `${y}-${m}-${d}`;
  if (period === 'today') return today;
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    const sy = start.getFullYear();
    const sm = String(start.getMonth() + 1).padStart(2, '0');
    const sd = String(start.getDate()).padStart(2, '0');
    return `${sy}-${sm}-${sd} ~ ${today}`;
  }
  if (period === 'month') {
    return `${y}-${m}-01 ~ ${today}`;
  }
  return '';
}

function calcLeaderboard() {
  return calcPeriodStats(currentPeriod);
}

// ===== Render =====
function renderAll() {
  renderStats();
  renderFilters();
  renderTable();
  renderLeaderboard();
  // Ensure players panel is visible by default on mobile
  const playersPanel = document.getElementById('panel-players');
  if (playersPanel && !playersPanel.classList.contains('active')) {
    playersPanel.classList.add('active');
  }
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
  const unclaimedCount = players.filter(p => p.claimedBy.length === 0 && p.guildStatus === 'no_guild').length;

  document.getElementById('count-all').textContent = total;
  document.getElementById('count-new').textContent = newCount;
  document.getElementById('count-returning').textContent = retCount;
  document.getElementById('count-online').textContent = onlineCount;
  document.getElementById('count-unclaimed').textContent = unclaimedCount;
}

function renderTable() {
  let filtered = players;
  if (currentFilter === 'new') filtered = players.filter(p => p.tag === 'new');
  else if (currentFilter === 'returning') filtered = players.filter(p => p.tag === 'returning');
  else if (currentFilter === 'online') filtered = players.filter(p => p.onlineStatus === 'online');
  else if (currentFilter === 'unclaimed') filtered = players.filter(p => p.claimedBy.length === 0 && p.guildStatus === 'no_guild');

  filtered.sort((a, b) => {
    if (a.guildStatus === 'no_guild' && b.guildStatus === 'has_guild') return -1;
    if (a.guildStatus === 'has_guild' && b.guildStatus === 'no_guild') return 1;
    return 0;
  });

  const tbody = document.getElementById('player-table');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><span>${t('empty')}</span></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const hasGuild = p.guildStatus === 'has_guild';
    const isOnline = p.onlineStatus === 'online';
    const hasMyClaim = currentUser && p.claimedBy.includes(currentUser.displayName);
    const isUnclaimed = !hasGuild && p.claimedBy.length === 0;
    const tagClass = p.tag === 'new' ? 'tag-new' : 'tag-returning';
    const tagText = p.tag === 'new' ? t('tag_new') : t('tag_returning');

    let guildBadge;
    if (hasGuild) {
      guildBadge = `<span class="status-badge status-joined">${t('guild_yes')}${p.guildName ? ' · ' + p.guildName : ''}</span>`;
    } else {
      guildBadge = `<span class="status-badge status-online">${t('guild_no')}</span>`;
    }

    const loginTimeBadge = `<span style="color:var(--text-secondary);font-size:12px;">${p.onlineSince}</span>`;

    const rowClass = hasGuild ? 'strikethrough' : (isUnclaimed ? 'row-unclaimed' : '');

    let action = '';
    if (hasGuild) {
      action = `<span style="color:var(--text-muted);font-size:11px;">✓ ${t('guild_yes')}</span>`;
    } else if (hasMyClaim) {
      action = `<span style="color:var(--gold);font-size:11px;font-weight:500;">✓ ${t('btn_claimed_by_you')}</span>`;
    } else {
      action = `<button class="btn btn-primary" onclick="claimPlayer('${p.id}')">${t('btn_claim')}</button>`;
    }

    const claimedByText = p.claimedBy.length > 0
      ? p.claimedBy.map(name => `<span class="claimed-by">👤 ${name}</span>`).join(' ')
      : '—';

    return `
      <tr class="${rowClass}">
        <td data-label="${t('th_player_id')}"><span class="player-id">${p.id}</span></td>
        <td data-label="${t('th_nickname')}">${p.nickname}</td>
        <td data-label="${t('th_server')}"><span class="server-badge server-${p.server}">${p.server}</span></td>
        <td data-label="${t('th_reg_date')}" style="color:var(--text-secondary);font-size:12px;">${p.regDate}</td>
        <td data-label="${t('th_tag')}"><span class="tag ${tagClass}">${tagText}</span></td>
        <td data-label="${t('th_guild_status')}">${guildBadge}</td>
        <td data-label="${t('th_online_status')}">${loginTimeBadge}</td>
        <td data-label="${t('th_claimed_by')}">${claimedByText}</td>
        <td data-label="${t('th_action')}">${action}</td>
      </tr>
    `;
  }).join('');
}

function renderLeaderboard() {
  const list = calcLeaderboard();
  const container = document.getElementById('leaderboard-list');
  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:30px;"><span>${t('lb_empty')}</span></div>`;
    return;
  }

  const periodLabel = {
    today: t('lb_today'), week: t('lb_week'), month: t('lb_month'), total: t('lb_total'),
  }[currentPeriod];

  let html = '';
  list.forEach((s, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'normal';
    const top3Class = rank <= 3 ? 'top3' : '';
    const rate = s.claims > 0 ? ((s.joins / s.claims) * 100).toFixed(0) : '0';
    const isMe = currentUser && s.name === currentUser.displayName;

    html += `
      <div class="lb-item ${top3Class} ${isMe ? 'lb-me' : ''}" data-leader="${s.name}">
        <div class="lb-rank ${rankClass}">${rank}</div>
        <div class="lb-avatar">${s.avatar}</div>
        <div class="lb-info">
          <div class="lb-name">${s.name}${isMe ? ' <span style="color:var(--gold);font-size:10px;">(' + t('you') + ')</span>' : ''}</div>
          <div class="lb-guild">${s.guild}</div>
        </div>
        <div class="lb-stats">
          <div class="lb-claims">${s.claims} <span style="font-size:10px;color:var(--text-muted);font-weight:400;">${t('lb_claims')}</span></div>
          <div class="lb-joins">${s.joins} <span style="font-size:10px;color:var(--text-muted);font-weight:400;">${t('lb_joins')}</span></div>
          <div class="lb-rate">${rate}% ${t('lb_rate')}</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Update subtitle & date range
  const sub = document.querySelector('.leaderboard-sub');
  if (sub) sub.textContent = periodLabel;
  const range = document.getElementById('leaderboard-range');
  if (range) range.textContent = getDateRange(currentPeriod);}

function switchPeriod(period) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  renderLeaderboard();
}

function flashLeaderboard(leaderName) {
  const item = document.querySelector(`.lb-item[data-leader="${leaderName}"]`);
  if (item) {
    item.classList.add('lb-flash');
    setTimeout(() => item.classList.remove('lb-flash'), 600);
  }
}

// ===== Tab Switch =====
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('panel-players').classList.toggle('active', tab === 'players');
  document.getElementById('panel-leaderboard').classList.toggle('active', tab === 'leaderboard');
}

// ===== Actions =====
async function claimPlayer(playerId) {
  if (!currentUser) {
    showToast('warning', t('please_login'));
    return;
  }
  const p = players.find(x => x.id === playerId);
  if (!p || p.guildStatus === 'has_guild') return;
  if (p.claimedBy.includes(currentUser.displayName)) return;

  p.claimedBy.push(currentUser.displayName);

  // 复制 ID 到剪贴板
  try {
    await navigator.clipboard.writeText(playerId);
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = playerId;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  renderAll();
  flashLeaderboard(currentUser.displayName);
  showToast('success', t('toast_claim', { id: playerId }));
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
      claimedBy: [],
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

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  document.getElementById('login-username').value = 'specter';
  document.getElementById('login-password').value = '123456';
});
