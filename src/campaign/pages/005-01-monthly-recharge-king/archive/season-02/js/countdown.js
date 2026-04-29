// Countdown for Chí Tôn Long Vươn
(function() {
    // Event times (UTC+7)
    const EVENT_START = new Date('2026-04-24T00:00:00+07:00').getTime();
    const EVENT_END = new Date('2026-04-24T23:59:59+07:00').getTime();
    
    function updateCountdown() {
        const now = new Date().getTime();
        
        const startBox = document.getElementById('countdown-start');
        const endBox = document.getElementById('countdown-end');
        const startDaysEl = document.getElementById('start-days');
        const startHoursEl = document.getElementById('start-hours');
        const startMinutesEl = document.getElementById('start-minutes');
        const startSecondsEl = document.getElementById('start-seconds');
        const endHoursEl = document.getElementById('end-hours');
        const endMinutesEl = document.getElementById('end-minutes');
        const endSecondsEl = document.getElementById('end-seconds');
        
        if (!startBox || !endBox) return;
        
        // Only auto-switch display if manual override is not active
        if (!window.countdownManualOverride) {
            const body = document.body;
            if (now < EVENT_START) {
                startBox.style.display = 'block';
                endBox.style.display = 'none';
                body.classList.remove('state-before', 'state-active', 'state-result');
                body.classList.add('state-before');
            } else if (now < EVENT_END) {
                startBox.style.display = 'none';
                endBox.style.display = 'block';
                body.classList.remove('state-before', 'state-active', 'state-result');
                body.classList.add('state-active');
            } else {
                startBox.style.display = 'none';
                endBox.style.display = 'block';
                body.classList.remove('state-before', 'state-active', 'state-result');
                body.classList.add('state-result');
            }
        }
        
        // Update numbers regardless of display mode
        const startDiff = Math.max(0, EVENT_START - now);
        const startDays = Math.floor(startDiff / (1000 * 60 * 60 * 24));
        const startHours = Math.floor((startDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const startMinutes = Math.floor((startDiff % (1000 * 60 * 60)) / (1000 * 60));
        const startSeconds = Math.floor((startDiff % (1000 * 60)) / 1000);
        
        if (startDaysEl) startDaysEl.textContent = String(startDays).padStart(2, '0');
        if (startHoursEl) startHoursEl.textContent = String(startHours).padStart(2, '0');
        if (startMinutesEl) startMinutesEl.textContent = String(startMinutes).padStart(2, '0');
        if (startSecondsEl) startSecondsEl.textContent = String(startSeconds).padStart(2, '0');
        
        let endDiff = EVENT_END - now;
        if (endDiff < 0) endDiff = 0;
        const endH = Math.floor(endDiff / (1000 * 60 * 60));
        const endM = Math.floor((endDiff % (1000 * 60 * 60)) / (1000 * 60));
        const endS = Math.floor((endDiff % (1000 * 60)) / 1000);
        
        if (endHoursEl) endHoursEl.textContent = String(endH).padStart(2, '0');
        if (endMinutesEl) endMinutesEl.textContent = String(endM).padStart(2, '0');
        if (endSecondsEl) endSecondsEl.textContent = String(endS).padStart(2, '0');
    }
    
    // Update immediately and every second
    updateCountdown();
    setInterval(updateCountdown, 1000);
})();
