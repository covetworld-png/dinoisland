// Main JavaScript for Chí Tôn Long Vương

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
    
    document.title = newLang === 'vi' ? 'Chí Tôn Long Vương' : '至尊龙王';
    
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
        // Reset honor hall to placeholder when leaving result view
        const hallCard = document.getElementById('hall-winner-card');
        const hallAccount = document.getElementById('hall-account');
        if (hallCard) hallCard.classList.remove('has-winner');
        if (hallAccount) hallAccount.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="lang-vi">Công bố ngưới thắng</span><span class="lang-cn">宣布获胜</span>';
        }
    }
    
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
    topAmount: 88888,
    rank2Amount: 66666,
    rank3Amount: 52000,
    userRank: 5,
    userAmount: 12800
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
    const winnerAccount = document.getElementById('winner-account');
    const winnerDate = document.getElementById('winner-date');
    const hallName = document.getElementById('hall-name');
    const hallAccount = document.getElementById('hall-account');
    const hallDate = document.getElementById('hall-date');
    const hallPlaceholder = document.getElementById('hall-placeholder-text');
    const hallCard = document.getElementById('hall-winner-card');
    
    if (!winnerName || !hallName) return;
    
    const name = winnerName.textContent.trim();
    // If result area has real winner data (not placeholder), sync to honor hall
    if (name && name !== '?' && name !== '') {
        hallName.textContent = name;
        if (hallAccount && winnerAccount) {
            const account = winnerAccount.textContent.trim();
            hallAccount.textContent = account !== '?' ? account : '';
        }
        if (hallPlaceholder) hallPlaceholder.style.display = 'none';
        if (hallDate && winnerDate) {
            const date = winnerDate.textContent.trim();
            if (date && date !== '?') {
                const dateValue = hallDate.querySelector('.date-value');
                if (dateValue) dateValue.textContent = date;
                hallDate.style.display = 'flex';
            }
        }
        if (hallCard) hallCard.classList.add('has-winner');
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
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    console.log('Initializing...');
    
    // Language
    const savedLang = localStorage.getItem('lang') || 'vi';
    document.body.setAttribute('data-lang', savedLang);
    
    const langLabel = document.getElementById('current-lang');
    if (langLabel) {
        langLabel.textContent = savedLang === 'vi' ? 'VI / 中' : '中 / VI';
    }
    
    document.title = savedLang === 'vi' ? 'Chí Tôn Long Vương' : '至尊龙王';
    
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
