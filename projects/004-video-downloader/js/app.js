/**
 * 内部视频库
 * 专属页面：带密码保护 + 卡片布局 + 视频播放
 */

// 配置
const CONFIG = {
  PASSWORD: '1111'  // 访问密码
};

// CSV 数据已内嵌在 csv_data.js 中

let allVideos = [];
let currentVideo = null;
let selectedVideos = new Set();
let isBatchMode = false;
let currentView = localStorage.getItem('video_lib_view') || 'card'; // 'card' 或 'list'

// ========== 登录模块 ==========

function checkAuth() {
  const isAuthed = sessionStorage.getItem('video_lib_auth') === 'true';
  if (isAuthed) {
    showMain();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-layer').classList.remove('hidden');
  document.getElementById('main-content').classList.add('hidden');
}

function showMain() {
  document.getElementById('login-layer').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
}

function login() {
  const input = document.getElementById('password-input');
  const error = document.getElementById('login-error');
  
  console.log('登录按钮被点击，输入密码:', input.value);
  
  if (!input || !input.value) {
    error.textContent = '请输入密码';
    return;
  }
  
  if (input.value === CONFIG.PASSWORD) {
    console.log('密码正确，进入主页面');
    sessionStorage.setItem('video_lib_auth', 'true');
    error.textContent = '';
    showMain();
    loadData();
  } else {
    console.log('密码错误');
    error.textContent = '密码错误，请重试';
    input.value = '';
    input.focus();
  }
}

function logout() {
  sessionStorage.removeItem('video_lib_auth');
  location.reload();
}

// ========== CSV 解析 ==========

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ? values[i].replace(/^"|"$/g, '') : '';
    });
    return obj;
  });
}

// ========== 格式化 ==========

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatStartTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ========== 渲染 ==========

function getUniqueTypes(videos) {
  const types = new Set(videos.map(v => v.type).filter(Boolean));
  return Array.from(types).sort();
}

function populateTypeFilter(types) {
  const select = document.getElementById('type-filter');
  // 保留第一个选项
  select.innerHTML = '<option value="">全部类型</option>';
  types.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  });
}

function renderVideos(videos) {
  const grid = document.getElementById('video-grid');
  const countEl = document.getElementById('total-count');
  
  countEl.textContent = `${videos.length} 个视频`;
  
  if (videos.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>未找到视频</h3>
        <p>尝试调整搜索条件</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = videos.map(video => {
    const thumbnailUrl = getThumbnailPath(video);
    const typeClass = `type-${video.type.replace(/[&\s]/g, '')}`;
    const isSelected = selectedVideos.has(video.id);
    
    return `
    <div class="video-card ${isSelected ? 'selected' : ''}" data-id="${video.id}" data-url="${video.url}" data-thumbnail="${thumbnailUrl}" data-title="${video.title}">
      <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''} data-id="${video.id}">
      <button class="card-download" data-id="${video.id}" data-url="${video.url}" data-title="${video.title}" title="下载视频">
        <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      </button>
      <div class="video-thumbnail ${typeClass}">
        <img src="${thumbnailUrl}" alt="" loading="lazy" onerror="this.style.display='none'">
        <div class="thumbnail-overlay">
          <div class="thumbnail-icon">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <span class="duration">${formatDuration(parseInt(video.duration) || 0)}</span>
      </div>
      <div class="video-info">
        <h3 class="video-title"><span class="video-id">[${video.id}]</span> ${video.title}</h3>
        <div class="video-meta">
          <span class="video-type">${video.type}</span>
          <span>⏱ ${formatStartTime(parseInt(video.start) || 0)}</span>
        </div>
        <p class="video-desc">${video.content}</p>
      </div>
    </div>
  `;
  }).join('');
  
  // 绑定卡片点击事件（播放）
  grid.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // 如果点击的是复选框或下载按钮，不触发播放
      if (e.target.closest('.card-checkbox') || e.target.closest('.card-download')) return;
      
      const id = card.dataset.id;
      const video = videos.find(v => v.id === id);
      openModal(video);
    });
  });
  
  // 绑定复选框事件
  grid.querySelectorAll('.card-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) {
        selectedVideos.add(id);
      } else {
        selectedVideos.delete(id);
      }
      updateBatchBar();
      renderVideos(videos); // 重新渲染以更新选中样式
    });
  });
  
  // 绑定单个下载按钮事件
  grid.querySelectorAll('.card-download').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      const title = btn.dataset.title;
      downloadVideo(url, title);
    });
  });
}

// ========== 筛选 ==========

function filterVideos() {
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  const typeFilter = document.getElementById('type-filter').value;
  
  const filtered = allVideos.filter(video => {
    const matchSearch = !search || 
      video.title.toLowerCase().includes(search) ||
      video.content.toLowerCase().includes(search) ||
      video.vid.toLowerCase().includes(search);
    
    const matchType = !typeFilter || video.type === typeFilter;
    
    return matchSearch && matchType;
  });
  
  renderVideos(filtered);
}

// ========== 批量下载功能 ==========

function updateBatchBar() {
  const batchBar = document.getElementById('batch-bar');
  const selectedCount = document.getElementById('selected-count');
  const batchDownloadBtn = document.getElementById('batch-download');
  const selectAllCheckbox = document.getElementById('select-all');
  
  selectedCount.textContent = selectedVideos.size;
  batchDownloadBtn.disabled = selectedVideos.size === 0;
  
  if (selectedVideos.size > 0) {
    batchBar.classList.remove('hidden');
    // 更新全选框状态
    const visibleCards = document.querySelectorAll('.video-card');
    const visibleIds = Array.from(visibleCards).map(card => card.dataset.id);
    const allVisibleSelected = visibleIds.every(id => selectedVideos.has(id));
    selectAllCheckbox.checked = allVisibleSelected;
  } else {
    batchBar.classList.add('hidden');
    selectAllCheckbox.checked = false;
  }
}

function toggleSelectAll() {
  const selectAllCheckbox = document.getElementById('select-all');
  const visibleCards = document.querySelectorAll('.video-card');
  
  if (selectAllCheckbox.checked) {
    // 全选当前可见的
    visibleCards.forEach(card => {
      selectedVideos.add(card.dataset.id);
    });
  } else {
    // 取消全选
    visibleCards.forEach(card => {
      selectedVideos.delete(card.dataset.id);
    });
  }
  
  updateBatchBar();
  // 重新渲染以更新选中状态
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  const typeFilter = document.getElementById('type-filter').value;
  const filtered = allVideos.filter(video => {
    const matchSearch = !search || 
      video.title.toLowerCase().includes(search) ||
      video.content.toLowerCase().includes(search) ||
      video.vid.toLowerCase().includes(search);
    const matchType = !typeFilter || video.type === typeFilter;
    return matchSearch && matchType;
  });
  renderVideos(filtered);
}

function clearSelection() {
  selectedVideos.clear();
  updateBatchBar();
  // 重新渲染
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  const typeFilter = document.getElementById('type-filter').value;
  const filtered = allVideos.filter(video => {
    const matchSearch = !search || 
      video.title.toLowerCase().includes(search) ||
      video.content.toLowerCase().includes(search) ||
      video.vid.toLowerCase().includes(search);
    const matchType = !typeFilter || video.type === typeFilter;
    return matchSearch && matchType;
  });
  renderVideos(filtered);
}

function batchDownload() {
  if (selectedVideos.size === 0) return;
  
  const videosToDownload = allVideos.filter(v => selectedVideos.has(v.id));
  
  // 显示确认
  if (!confirm(`确定要下载 ${videosToDownload.length} 个视频吗？\n将逐个触发下载。`)) {
    return;
  }
  
  // 逐个下载
  videosToDownload.forEach((video, index) => {
    setTimeout(() => {
      downloadVideo(video.url, video.title);
    }, index * 500); // 间隔 500ms 避免浏览器拦截
  });
  
  // 清空选择
  clearSelection();
}

function downloadVideo(url, filename) {
  // 清理文件名中的非法字符
  const safeFilename = (filename || 'video').replace(/[<>:"\/\\|?*]/g, '_').substring(0, 100);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename}.mp4`;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ========== 视图切换 ==========

function initViewToggle() {
  const cardBtn = document.getElementById('view-card');
  const listBtn = document.getElementById('view-list');
  const grid = document.getElementById('video-grid');
  
  // 应用保存的视图
  if (currentView === 'list') {
    grid.classList.add('list-view');
    cardBtn.classList.remove('active');
    listBtn.classList.add('active');
  }
  
  // 卡片视图
  cardBtn.addEventListener('click', () => {
    currentView = 'card';
    localStorage.setItem('video_lib_view', 'card');
    grid.classList.remove('list-view');
    cardBtn.classList.add('active');
    listBtn.classList.remove('active');
  });
  
  // 列表视图
  listBtn.addEventListener('click', () => {
    currentView = 'list';
    localStorage.setItem('video_lib_view', 'list');
    grid.classList.add('list-view');
    cardBtn.classList.remove('active');
    listBtn.classList.add('active');
  });
}

// ========== 视频播放弹层 ==========

function showLoading(show) {
  document.getElementById('video-loading').classList.toggle('hidden', !show);
}

function showError(show) {
  document.getElementById('video-error').classList.toggle('hidden', !show);
}

function openModal(video) {
  currentVideo = video;
  const modal = document.getElementById('video-modal');
  const player = document.getElementById('video-player');
  const titleEl = document.getElementById('modal-title');
  const contentEl = document.getElementById('modal-content');
  const openNewTabBtn = document.getElementById('open-newtab');
  
  // 重置状态
  player.src = video.url;
  titleEl.textContent = video.title;
  contentEl.textContent = video.content;
  openNewTabBtn.href = video.url;
  
  showLoading(true);
  showError(false);
  modal.classList.remove('hidden');
  
  // 等待视频可以播放
  player.oncanplay = () => {
    showLoading(false);
    player.play().catch(() => {
      // 自动播放被阻止，用户需手动点击
    });
  };
  
  // 加载错误处理
  player.onerror = () => {
    showLoading(false);
    showError(true);
    console.error('视频加载失败:', video.url, player.error);
  };
  
  // 超时处理（10秒）
  setTimeout(() => {
    if (player.readyState < 3) { // HAVE_FUTURE_DATA = 3
      showLoading(false);
      showError(true);
    }
  }, 10000);
}

function retryVideo() {
  if (currentVideo) {
    openModal(currentVideo);
  }
}

function closeModal() {
  const modal = document.getElementById('video-modal');
  const player = document.getElementById('video-player');
  
  player.oncanplay = null;
  player.onerror = null;
  player.pause();
  player.src = '';
  modal.classList.add('hidden');
  currentVideo = null;
}

// ========== 数据加载 ==========

async function loadData() {
  try {
    // 使用内嵌的 CSV 数据（避免 file:// 协议下 fetch 失败）
    const text = typeof CSV_DATA !== 'undefined' ? CSV_DATA : '';
    
    if (!text) {
      throw new Error('CSV 数据未找到');
    }
    
    allVideos = parseCSV(text);
    
    // 填充类型筛选器
    const types = getUniqueTypes(allVideos);
    populateTypeFilter(types);
    
    // 初始渲染
    renderVideos(allVideos);
    
  } catch (error) {
    document.getElementById('video-grid').innerHTML = `
      <div class="empty-state">
        <h3>加载失败</h3>
        <p>${error.message}</p>
      </div>
    `;
  }
}

// ========== 事件绑定 ==========

document.addEventListener('DOMContentLoaded', () => {
  // 登录
  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('password-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
  
  // 退出
  document.getElementById('logout-btn').addEventListener('click', logout);
  
  // 筛选
  document.getElementById('search-input').addEventListener('input', filterVideos);
  document.getElementById('type-filter').addEventListener('change', filterVideos);
  
  // 弹层
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.querySelector('.modal-overlay').addEventListener('click', closeModal);
  document.getElementById('retry-btn').addEventListener('click', retryVideo);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  
  // 批量操作
  document.getElementById('select-all').addEventListener('change', toggleSelectAll);
  document.getElementById('batch-download').addEventListener('click', batchDownload);
  document.getElementById('clear-selection').addEventListener('click', clearSelection);
  
  // 视图切换
  initViewToggle();
  
  // 初始化
  checkAuth();
  // 开发模式：取消下一行注释可跳过登录
  // sessionStorage.setItem('video_lib_auth', 'true');
  if (sessionStorage.getItem('video_lib_auth') === 'true') {
    showMain();
    loadData();
  }
});
