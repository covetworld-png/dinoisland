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

// Toggle between activity view and result view
let showingResult = false;
function toggleResult() {
    showingResult = !showingResult;
    
    const activityView = document.getElementById('activity-view');
    const resultView = document.getElementById('result-view');
    const toggleBtn = document.getElementById('toggle-result-btn');
    
    const rankSection = document.getElementById('rank');
    const heroKingImg = document.getElementById('hero-king-img');
    if (showingResult) {
        if (activityView) activityView.style.display = 'none';
        if (resultView) resultView.style.display = 'block';
        if (rankSection) rankSection.style.display = 'none';
        if (heroKingImg) heroKingImg.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="lang-vi">Xem hoạt động</span><span class="lang-cn">查看活动</span>';
        }
    } else {
        if (activityView) activityView.style.display = 'block';
        if (heroKingImg) heroKingImg.style.display = 'block';
        if (resultView) resultView.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<span class="lang-vi">Công bố người thắng</span><span class="lang-cn">宣布获胜</span>';
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
    
    const startBox = document.getElementById('countdown-start');
    const endBox = document.getElementById('countdown-end');
    const rankSection = document.getElementById('rank');
    
    if (testModeDuringEvent) {
        if (startBox) startBox.style.display = 'none';
        if (endBox) {
            endBox.style.display = 'block';
            endBox.classList.add('active');
        }
        if (rankSection) rankSection.style.display = 'block';
    } else {
        if (startBox) startBox.style.display = 'block';
        if (endBox) endBox.style.display = 'none';
        if (rankSection) rankSection.style.display = 'none';
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
