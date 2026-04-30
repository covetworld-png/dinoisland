// Main JavaScript for Chí Tôn Bạo Long Vương - Season 3

// Language Toggle
function toggleLanguage() {
    const body = document.body;
    const currentLang = body.getAttribute('data-lang') || 'vi';
    const newLang = currentLang === 'vi' ? 'cn' : 'vi';
    
    body.setAttribute('data-lang', newLang);
    
    const langLabel = document.getElementById('current-lang');
    if (langLabel) {
        langLabel.textContent = newLang === 'vi' ? 'VI / 中' : '中 / VI';
    }
    
    document.title = newLang === 'vi' ? 'Chí Tôn Bạo Long Vương Mùa 3' : '至尊暴龙王 第三届';
    
    localStorage.setItem('lang', newLang);
    
    // Re-render amounts with correct currency suffix
    renderAmounts();
}

// Toggle between activity view and result view (demo button)
let showingResult = false;
let demoPreviousState = 'state-before';

function toggleResult() {
    showingResult = !showingResult;
    window.countdownManualOverride = true;
    
    const body = document.body;
    const toggleBtn = document.getElementById('toggle-result-btn');
    
    if (showingResult) {
        // Save current state before switching to result
        if (body.classList.contains('state-before')) {
            demoPreviousState = 'state-before';
        } else if (body.classList.contains('state-active')) {
            demoPreviousState = 'state-active';
        }
        body.classList.remove('state-before', 'state-active', 'state-result');
        body.classList.add('state-result');
        syncHonorHall();
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="lang-vi">Xem hoạt động</span><span class="lang-cn">查看活动</span>';
        }
    } else {
        body.classList.remove('state-before', 'state-active', 'state-result');
        body.classList.add(demoPreviousState);
        // Reset season 2 and season 3 honor hall (season 1 is permanent)
        resetSeason2Hall();
        resetSeason3Hall();
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="lang-vi">Công bố ngườig thắng</span><span class="lang-cn">宣布获胜</span>';
        }
    }
    
    // Update auto script panel visibility
    updateAutoScriptVisibility();
    
    // Re-apply language
    const savedLang = localStorage.getItem('lang') || 'vi';
    document.body.setAttribute('data-lang', savedLang);
}

// Test mode for countdown - toggle between "before event" and "during event"
let testModeDuringEvent = false;
function toggleCountdownMode() {
    testModeDuringEvent = !testModeDuringEvent;
    window.countdownManualOverride = true;
    
    const body = document.body;
    const startBox = document.getElementById('countdown-start');
    const endBox = document.getElementById('countdown-end');
    
    if (testModeDuringEvent) {
        body.classList.remove('state-before', 'state-active', 'state-result');
        body.classList.add('state-active');
        if (startBox) startBox.style.display = 'none';
        if (endBox) {
            endBox.style.display = 'block';
            endBox.classList.add('active');
        }
    } else {
        body.classList.remove('state-before', 'state-active', 'state-result');
        body.classList.add('state-before');
        if (startBox) startBox.style.display = 'block';
        if (endBox) endBox.style.display = 'none';
    }
}

// ===========================
// Auto Script Panel (Season 2)
// ===========================

// Demo: toggle winner mode for testing
let demoIsWinner = false;
function toggleWinnerMode() {
    demoIsWinner = !demoIsWinner;
    const btn = document.getElementById('toggle-winner-btn');
    if (btn) {
        if (demoIsWinner) {
            btn.innerHTML = '<span class="lang-vi">👑 Đang là ngườig thắng</span><span class="lang-cn">👑 当前为获胜者</span>';
            btn.classList.add('active');
        } else {
            btn.innerHTML = '<span class="lang-vi">👑 Ngưới thắng</span><span class="lang-cn">👑 获胜者视角</span>';
            btn.classList.remove('active');
        }
    }
    updateAutoScriptVisibility();
}

// Auto script state machine
const AUTO_SCRIPT_STATE = {
    IDLE: 'idle',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    ERROR: 'error'
};

let autoScriptState = AUTO_SCRIPT_STATE.IDLE;
let autoScriptHistory = [];

function updateAutoScriptVisibility() {
    const panel = document.getElementById('auto-script-panel');
    const loginBox = document.getElementById('result-login-box');
    if (!panel) return;
    
    const body = document.body;
    const isResultState = body.classList.contains('state-result');
    
    if (!isResultState) {
        panel.style.display = 'none';
        if (loginBox) loginBox.style.display = 'none';
        return;
    }
    
    if (!isLoggedIn) {
        // Not logged in: show login prompt
        panel.style.display = 'none';
        if (loginBox) loginBox.style.display = 'block';
    } else if (!demoIsWinner) {
        // Logged in but not winner: hide everything
        panel.style.display = 'none';
        if (loginBox) loginBox.style.display = 'none';
    } else {
        // Logged in and is winner: show auto script panel
        if (loginBox) loginBox.style.display = 'none';
        panel.style.display = 'block';
        renderAutoScriptPanel();
    }
}

function renderAutoScriptPanel() {
    const btn = document.getElementById('btn-auto-script');
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');
    
    if (!btn || !statusDot || !statusText) return;
    
    const lang = document.body.getAttribute('data-lang') || 'vi';
    
    switch (autoScriptState) {
        case AUTO_SCRIPT_STATE.IDLE:
            btn.disabled = false;
            btn.className = 'btn btn-auto-script';
            btn.innerHTML = '<span class="btn-icon">🦕</span><span class="btn-text"><span class="lang-vi">Phóng to!</span><span class="lang-cn">变大！</span></span>';
            statusDot.className = 'status-dot idle';
            statusText.innerHTML = '<span class="lang-vi">Sẵn sàng kích hoạt</span><span class="lang-cn">准备就绪</span>';
            break;
            
        case AUTO_SCRIPT_STATE.PROCESSING:
            btn.disabled = true;
            btn.className = 'btn btn-auto-script processing';
            btn.innerHTML = '<span class="btn-spinner"></span><span class="btn-text"><span class="lang-vi">Đang thực hiện...</span><span class="lang-cn">执行中...</span></span>';
            statusDot.className = 'status-dot processing';
            statusText.innerHTML = '<span class="lang-vi">Đang thực hiện...</span><span class="lang-cn">执行中...</span>';
            break;
            
        case AUTO_SCRIPT_STATE.ERROR:
            btn.disabled = false;
            btn.className = 'btn btn-auto-script error';
            btn.innerHTML = '<span class="btn-icon">❌</span><span class="btn-text"><span class="lang-vi">Thất bại, thử lại</span><span class="lang-cn">失败，点击重试</span></span>';
            statusDot.className = 'status-dot error';
            statusText.innerHTML = '<span class="lang-vi">Thất bại</span><span class="lang-cn">失败</span>';
            break;
    }
    
    // Render history
    renderHistoryList();
}

function renderHistoryList() {
    const historyBox = document.getElementById('auto-script-history');
    const historyList = document.getElementById('history-list');
    if (!historyBox || !historyList) return;
    
    const lang = document.body.getAttribute('data-lang') || 'vi';
    
    if (autoScriptHistory.length > 0) {
        historyBox.style.display = 'block';
        historyList.innerHTML = autoScriptHistory.map(item => {
            const startStr = item.startTime.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            const label = lang === 'vi' 
                ? `Kích thước khủng long +150% • Tự động hóa`
                : `恐龙体型 +150% • 自动化脚本`;
            
            let statusHtml = '';
            if (item.status === 'processing') {
                statusHtml = `<span class="history-status processing">⏳ ${lang === 'vi' ? 'Đang thực hiện' : '执行中'}</span>`;
            } else if (item.status === 'completed') {
                statusHtml = `<span class="history-status success">✅ ${lang === 'vi' ? 'Thành công' : '成功'}</span>`;
            } else if (item.status === 'failed') {
                statusHtml = `<span class="history-status error">❌ ${lang === 'vi' ? 'Thất bại' : '失败'}</span>`;
            }
            
            return `<li><span class="history-time">${startStr}</span><span class="history-action">${label}</span>${statusHtml}</li>`;
        }).join('');
    } else {
        historyBox.style.display = 'none';
    }
}

function triggerAutoScript() {
    if (autoScriptState === AUTO_SCRIPT_STATE.PROCESSING) {
        return;
    }
    
    autoScriptState = AUTO_SCRIPT_STATE.PROCESSING;
    
    // Add history item with 'processing' status
    const historyItem = {
        id: Date.now(),
        startTime: new Date(),
        endTime: null,
        action: 'auto_script_150',
        status: 'processing'
    };
    autoScriptHistory.unshift(historyItem);
    
    renderAutoScriptPanel();
    
    // Simulate API call delay (2 seconds)
    setTimeout(() => {
        // Demo: 10% chance of error for testing
        if (Math.random() < 0.1) {
            autoScriptState = AUTO_SCRIPT_STATE.ERROR;
            historyItem.status = 'failed';
            historyItem.endTime = new Date();
        } else {
            autoScriptState = AUTO_SCRIPT_STATE.IDLE; // Back to idle, ready for next trigger
            historyItem.status = 'completed';
            historyItem.endTime = new Date();
        }
        renderAutoScriptPanel();
    }, 2000);
}

// Format number with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Format number with currency suffix based on current language
function formatCurrency(num) {
    const lang = document.body.getAttribute('data-lang') || 'vi';
    return formatNumber(num) + (lang === 'vi' ? ' vàng' : ' 金币');
}

// Mock data - initial values shown on page
const mockData = {
    topAmount: 0,
    rank2Amount: 0,
    rank3Amount: 0,
    userRank: 0,
    userAmount: 0
};

// Check if already logged in (for demo)
let isLoggedIn = false;

// Handle login - make it globally accessible
window.handleLogin = function() {
    console.log('Login clicked');
    isLoggedIn = true;
    
    // Hide login box
    const loginBox = document.getElementById('login-box');
    if (loginBox) {
        loginBox.style.display = 'none';
        console.log('Login box hidden');
    }
    
    // Show gap info
    const gapInfo = document.getElementById('gap-info');
    if (gapInfo) {
        gapInfo.style.display = 'block';
        console.log('Gap info shown');
    }
    
    // Update display
    updateUserDisplay();
    
    // Update auto script panel visibility
    updateAutoScriptVisibility();
};

// Update user display
function updateUserDisplay() {
    const gapAmountDisplay = document.getElementById('gap-amount-display');
    const gapRow = document.getElementById('gap-row');
    
    // Calculate and display gap
    if (mockData.userRank === 1) {
        if (gapRow) {
            gapRow.style.display = 'none';
        }
    } else {
        if (gapAmountDisplay) {
            const gap = mockData.topAmount - mockData.userAmount;
            gapAmountDisplay.textContent = formatCurrency(gap);
        }
    }
}

// Sync honor hall with result view data
function syncHonorHall() {
    // Only sync when in result state
    if (!document.body.classList.contains('state-result')) return;
    
    const winnerName = document.getElementById('winner-name');
    const winnerDate = document.getElementById('winner-date');
    const hallDate = document.getElementById('hall-date');
    const hallPlaceholder = document.getElementById('hall-placeholder-text');
    const hallCard = document.getElementById('hall-winner-card');
    
    // Season 1 data is fixed (HacThienLong1 / 13220491 / 17/04/2026)
    // Do NOT overwrite hall-name or hall-account text
    // Only update styles
    if (hallPlaceholder) hallPlaceholder.style.display = 'none';
    if (hallDate) hallDate.style.display = 'flex';
    if (hallCard) hallCard.classList.add('has-winner');
    
    // Also sync season 2 and season 3 hall cards
    syncSeason2Hall();
    syncSeason3Hall();
}

function resetSeason2Hall() {
    const s2Card = document.getElementById('hall-season2-card');
    const s2Name = document.getElementById('hall-s2-name');
    const s2Account = document.getElementById('hall-s2-account');
    const s2Text = document.getElementById('hall-s2-text');
    const s2Date = document.getElementById('hall-s2-date');

    if (s2Card) s2Card.classList.remove('has-winner');
    if (s2Name) {
        s2Name.textContent = '?';
        s2Name.style.display = 'none';
    }
    if (s2Account) {
        s2Account.textContent = '';
        s2Account.style.display = 'none';
    }
    if (s2Text) {
        s2Text.innerHTML = '<span class="lang-vi">Sắp diễn ra</span><span class="lang-cn">敬请期待</span>';
        s2Text.style.display = 'block';
    }
    if (s2Date) s2Date.style.display = 'none';
}

function resetSeason3Hall() {
    const s3Card = document.getElementById('hall-season3-card');
    const s3Name = document.getElementById('hall-s3-name');
    const s3Account = document.getElementById('hall-s3-account');
    const s3Text = document.getElementById('hall-s3-text');
    const s3Date = document.getElementById('hall-s3-date');

    if (s3Card) s3Card.classList.remove('has-winner');
    if (s3Name) {
        s3Name.textContent = '?';
        s3Name.style.display = 'none';
    }
    if (s3Account) {
        s3Account.textContent = '';
        s3Account.style.display = 'none';
    }
    if (s3Text) {
        s3Text.innerHTML = '<span class="lang-vi">Sắp diễn ra</span><span class="lang-cn">敬请期待</span>';
        s3Text.style.display = 'block';
    }
    if (s3Date) s3Date.style.display = 'none';
}

function syncSeason2Hall() {
    const winnerName = document.getElementById('winner-name');
    const winnerAccount = document.getElementById('winner-account');
    const winnerDate = document.getElementById('winner-date');
    const s2Card = document.getElementById('hall-season2-card');
    const s2Name = document.getElementById('hall-s2-name');
    const s2Account = document.getElementById('hall-s2-account');
    const s2Text = document.getElementById('hall-s2-text');
    const s2Date = document.getElementById('hall-s2-date');

    if (!winnerName || !s2Name) return;

    const name = winnerName.textContent.trim();
    const account = winnerAccount ? winnerAccount.textContent.trim() : '';

    if (name && name !== '?' && name !== '') {
        if (s2Card) s2Card.classList.add('has-winner');
        if (s2Name) {
            s2Name.textContent = name;
            s2Name.style.display = 'block';
        }
        if (s2Account) {
            s2Account.textContent = account;
            s2Account.style.display = 'block';
        }

        if (s2Text) s2Text.style.display = 'none';

        if (s2Date && winnerDate) {
            const date = winnerDate.textContent.trim();
            if (date && date !== '?') {
                const dateValue = s2Date.querySelector('.date-value');
                const shortDate = date.replace(/\/2026$/, '').replace(/2026年/, '');
                if (dateValue) dateValue.textContent = shortDate;
                s2Date.style.display = 'flex';
            }
        }
    }
}

function syncSeason3Hall() {
    const winnerName = document.getElementById('winner-name');
    const winnerAccount = document.getElementById('winner-account');
    const winnerDate = document.getElementById('winner-date');
    const s3Card = document.getElementById('hall-season3-card');
    const s3Name = document.getElementById('hall-s3-name');
    const s3Account = document.getElementById('hall-s3-account');
    const s3Text = document.getElementById('hall-s3-text');
    const s3Date = document.getElementById('hall-s3-date');

    if (!winnerName || !s3Name) return;

    const name = winnerName.textContent.trim();
    const account = winnerAccount ? winnerAccount.textContent.trim() : '';

    if (name && name !== '?' && name !== '') {
        if (s3Card) s3Card.classList.add('has-winner');
        if (s3Name) {
            s3Name.textContent = name;
            s3Name.style.display = 'block';
        }
        if (s3Account) {
            s3Account.textContent = account;
            s3Account.style.display = 'block';
        }

        if (s3Text) s3Text.style.display = 'none';

        if (s3Date && winnerDate) {
            const date = winnerDate.textContent.trim();
            if (date && date !== '?') {
                const dateValue = s3Date.querySelector('.date-value');
                const shortDate = date.replace(/\/2026$/, '').replace(/2026年/, '');
                if (dateValue) dateValue.textContent = shortDate;
                s3Date.style.display = 'flex';
            }
        }
    }
}

// Render all static and dynamic amounts with correct currency suffix
function renderAmounts() {
    const topAmountEl = document.getElementById('top-amount');
    const rank2AmountEl = document.getElementById('rank2-amount');
    const rank3AmountEl = document.getElementById('rank3-amount');
    const myAmountEl = document.getElementById('my-amount');
    const userAmountDisplay = document.getElementById('user-amount-display');
    const winnerAmountEl = document.getElementById('winner-amount');
    
    if (topAmountEl) topAmountEl.textContent = formatCurrency(mockData.topAmount);
    if (rank2AmountEl) rank2AmountEl.textContent = formatCurrency(mockData.rank2Amount);
    if (rank3AmountEl) rank3AmountEl.textContent = formatCurrency(mockData.rank3Amount);
    if (myAmountEl) myAmountEl.textContent = formatCurrency(mockData.userAmount);
    if (userAmountDisplay) userAmountDisplay.textContent = formatCurrency(mockData.userAmount);
    if (winnerAmountEl) winnerAmountEl.textContent = formatCurrency(mockData.topAmount);
    
    updateUserDisplay();
    renderAutoScriptPanel();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    console.log('Initializing Season 2...');
    
    // Language
    const savedLang = localStorage.getItem('lang') || 'vi';
    document.body.setAttribute('data-lang', savedLang);
    
    const langLabel = document.getElementById('current-lang');
    if (langLabel) {
        langLabel.textContent = savedLang === 'vi' ? 'VI / 中' : '中 / VI';
    }
    
    document.title = savedLang === 'vi' ? 'Chí Tôn Bạo Long Vương Mùa 3' : '至尊暴龙王 第三届';
    
    // Sync honor hall with result view data
    syncHonorHall();
    
    // Render all amounts with correct currency
    renderAmounts();
    
    // Attach login button handler
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Login button clicked');
            window.handleLogin();
        });
        console.log('Login button handler attached');
    } else {
        console.error('Login button not found');
    }
}

// Simulate top amount increasing (only if logged in)
setInterval(function() {
    if (isLoggedIn && Math.random() > 0.7) {
        mockData.topAmount += Math.floor(Math.random() * 888);
        
        // Update top amount display
        const topAmountEl = document.getElementById('top-amount');
        if (topAmountEl) {
            topAmountEl.textContent = formatCurrency(mockData.topAmount);
        }
        
        // Update gap
        const gapAmountDisplay = document.getElementById('gap-amount-display');
        if (gapAmountDisplay && mockData.userRank !== 1) {
            const gap = mockData.topAmount - mockData.userAmount;
            gapAmountDisplay.textContent = formatCurrency(gap);
        }
    }
}, 5000);
