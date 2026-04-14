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
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="lang-vi">Xem hoạt động</span><span class="lang-cn">查看活动</span>';
        }
    } else {
        body.classList.remove('state-before', 'state-active', 'state-result');
        body.classList.add(demoPreviousState);
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

// Mock data - initial values shown on page
const mockData = {
    topAmount: 188888000,
    rank2Amount: 156000000,
    rank3Amount: 128000000,
    userRank: 5,
    userAmount: 45000000
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
            gapAmountDisplay.textContent = formatNumber(gap) + ' VND';
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function syncHonorHall() {
    const winnerName = document.getElementById('winner-name');
    const winnerDate = document.getElementById('winner-date');
    const hallName = document.getElementById('hall-name');
    const hallDate = document.getElementById('hall-date');
    const hallPlaceholder = document.getElementById('hall-placeholder-text');
    
    if (!winnerName || !hallName) return;
    
    const name = winnerName.textContent.trim();
    // If result area has real winner data (not default placeholder), sync to honor hall
    if (name && name !== '?' && name !== '') {
        hallName.textContent = name;
        if (hallPlaceholder) hallPlaceholder.style.display = 'none';
        if (hallDate && winnerDate) {
            const date = winnerDate.textContent.trim();
            if (date && date !== '?') {
                hallDate.textContent = date;
                hallDate.style.display = 'block';
            }
        }
    }
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
    
    // Initialize gap display
    updateUserDisplay();
    
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
        mockData.topAmount += Math.floor(Math.random() * 500000);
        
        // Update top amount display
        const topAmountEl = document.getElementById('top-amount');
        if (topAmountEl) {
            topAmountEl.textContent = formatNumber(mockData.topAmount) + ' VND';
        }
        
        // Update gap
        const gapAmountDisplay = document.getElementById('gap-amount-display');
        if (gapAmountDisplay && mockData.userRank !== 1) {
            const gap = mockData.topAmount - mockData.userAmount;
            gapAmountDisplay.textContent = formatNumber(gap) + ' VND';
        }
    }
}, 5000);
