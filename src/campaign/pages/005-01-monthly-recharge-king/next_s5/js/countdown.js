// Countdown for Chí Tôn Bạo Long Vương - Season 5
(function() {
    // Event times (UTC+7) - 6 days accumulation
    const WEEK_START = new Date('2026-05-12T00:00:00+07:00').getTime();
    const WEEK_END = new Date('2026-05-17T23:59:59+07:00').getTime();
    const DAY_MS = 1000 * 60 * 60 * 24;

    // Date strings for timeline-current
    const DAY_DATES_VI = ['12/05', '13/05', '14/05', '15/05', '16/05', '17/05'];
    const DAY_DATES_CN = ['5/12', '5/13', '5/14', '5/15', '5/16', '5/17'];

    // Store original mock data for mini-timeline
    const miniDayData = [];
    const miniDays = document.querySelectorAll('.mini-day');
    miniDays.forEach((day) => {
        const nameEl = day.querySelector('.day-name');
        const amountEl = day.querySelector('.day-amount');
        const statusEl = day.querySelector('.day-status');
        miniDayData.push({
            name: nameEl ? nameEl.innerHTML : '',
            amount: amountEl ? amountEl.innerHTML : '',
            hasStatus: !!statusEl
        });
    });

    function updateMiniTimeline(currentDayIndex) {
        miniDays.forEach((day, index) => {
            const nameEl = day.querySelector('.day-name');
            const amountEl = day.querySelector('.day-amount');
            const statusEl = day.querySelector('.day-status');

            day.classList.remove('current');

            if (currentDayIndex === -1) {
                // state-before: all days show placeholder
                if (nameEl) nameEl.textContent = '—';
                if (amountEl) amountEl.innerHTML = '—';
                if (statusEl) statusEl.style.display = 'none';
                day.classList.remove('leading');
            } else if (currentDayIndex === 6) {
                // state-result: show all original data
                if (nameEl) nameEl.innerHTML = miniDayData[index].name;
                if (amountEl) amountEl.innerHTML = miniDayData[index].amount;
                if (statusEl) statusEl.style.display = '';
            } else if (index < currentDayIndex) {
                // Past day: show original data
                if (nameEl) nameEl.innerHTML = miniDayData[index].name;
                if (amountEl) amountEl.innerHTML = miniDayData[index].amount;
                if (statusEl) statusEl.style.display = '';
            } else if (index === currentDayIndex) {
                // Current day: show "in progress"
                day.classList.add('current');
                if (nameEl) nameEl.textContent = '?';
                if (amountEl) {
                    amountEl.innerHTML = '<span class="lang-vi">Đang diễn ra</span><span class="lang-cn">进行中</span>';
                }
                if (statusEl) statusEl.style.display = 'none';
                day.classList.remove('leading');
            } else {
                // Future day: hide data
                if (nameEl) nameEl.textContent = '—';
                if (amountEl) amountEl.innerHTML = '—';
                if (statusEl) statusEl.style.display = 'none';
                day.classList.remove('leading');
            }
        });
    }

    function updateTimelineHighlight(currentDayIndex) {
        // Main timeline
        const days = document.querySelectorAll('.timeline-day');
        days.forEach((day, index) => {
            day.classList.remove('current', 'completed');
            if (currentDayIndex === -1) {
                // state-before: no highlight
            } else if (currentDayIndex === 6) {
                // state-result: all completed
                day.classList.add('completed');
            } else if (index === currentDayIndex) {
                day.classList.add('current');
            } else if (index < currentDayIndex) {
                day.classList.add('completed');
            }
        });

        // Mini timeline (side track)
        updateMiniTimeline(currentDayIndex);

        // Update timeline-current text
        const viActive = document.querySelector('.timeline-current .state-active-only.lang-vi');
        const cnActive = document.querySelector('.timeline-current .state-active-only.lang-cn');
        if (viActive && currentDayIndex >= 0 && currentDayIndex < 6) {
            viActive.textContent = '↓ Hiện tại: Ngày ' + (currentDayIndex + 1) + ' · ' + DAY_DATES_VI[currentDayIndex];
        }
        if (cnActive && currentDayIndex >= 0 && currentDayIndex < 6) {
            cnActive.textContent = '↓ 当前：第' + (currentDayIndex + 1) + '天 · ' + DAY_DATES_CN[currentDayIndex] + '日';
        }
    }

    function updateCountdown() {
        const now = new Date().getTime();

        const startBox = document.getElementById('countdown-start');
        const endBox = document.getElementById('countdown-end');
        const startDaysEl = document.getElementById('start-days');
        const startHoursEl = document.getElementById('start-hours');
        const startMinutesEl = document.getElementById('start-minutes');
        const startSecondsEl = document.getElementById('start-seconds');
        const endDaysEl = document.getElementById('end-days');
        const endHoursEl = document.getElementById('end-hours');
        const endMinutesEl = document.getElementById('end-minutes');
        const endSecondsEl = document.getElementById('end-seconds');

        if (!startBox || !endBox) return;

        // Calculate current day index (0-5 for day 1-6, -1 for before, 6 for after)
        let currentDayIndex = -1;
        if (now >= WEEK_START && now <= WEEK_END) {
            currentDayIndex = Math.floor((now - WEEK_START) / DAY_MS);
            if (currentDayIndex > 5) currentDayIndex = 5;
        } else if (now > WEEK_END) {
            currentDayIndex = 6;
        }

        // Only auto-switch display if manual override is not active
        if (!window.countdownManualOverride) {
            const body = document.body;
            const wasResult = body.classList.contains('state-result');
            if (now < WEEK_START) {
                startBox.style.display = 'block';
                endBox.style.display = 'none';
                body.classList.remove('state-before', 'state-active', 'state-result');
                body.classList.add('state-before');
            } else if (now < WEEK_END) {
                startBox.style.display = 'none';
                endBox.style.display = 'block';
                body.classList.remove('state-before', 'state-active', 'state-result');
                body.classList.add('state-active');
            } else {
                startBox.style.display = 'none';
                endBox.style.display = 'block';
                body.classList.remove('state-before', 'state-active', 'state-result');
                body.classList.add('state-result');
                // Auto-sync honor hall when entering result state
                if (!wasResult && typeof syncHonorHall === 'function') {
                    syncHonorHall();
                }
            }
        }

        updateTimelineHighlight(currentDayIndex);

        // Update numbers regardless of display mode
        const startDiff = Math.max(0, WEEK_START - now);
        const startDays = Math.floor(startDiff / DAY_MS);
        const startHours = Math.floor((startDiff % DAY_MS) / (1000 * 60 * 60));
        const startMinutes = Math.floor((startDiff % (1000 * 60 * 60)) / (1000 * 60));
        const startSeconds = Math.floor((startDiff % (1000 * 60)) / 1000);

        if (startDaysEl) startDaysEl.textContent = String(startDays).padStart(2, '0');
        if (startHoursEl) startHoursEl.textContent = String(startHours).padStart(2, '0');
        if (startMinutesEl) startMinutesEl.textContent = String(startMinutes).padStart(2, '0');
        if (startSecondsEl) startSecondsEl.textContent = String(startSeconds).padStart(2, '0');

        let endDiff = WEEK_END - now;
        if (endDiff < 0) endDiff = 0;
        const endDays = Math.floor(endDiff / DAY_MS);
        const endH = Math.floor((endDiff % DAY_MS) / (1000 * 60 * 60));
        const endM = Math.floor((endDiff % (1000 * 60 * 60)) / (1000 * 60));
        const endS = Math.floor((endDiff % (1000 * 60)) / 1000);

        if (endDaysEl) endDaysEl.textContent = String(endDays).padStart(2, '0');
        if (endHoursEl) endHoursEl.textContent = String(endH).padStart(2, '0');
        if (endMinutesEl) endMinutesEl.textContent = String(endM).padStart(2, '0');
        if (endSecondsEl) endSecondsEl.textContent = String(endS).padStart(2, '0');
    }

    // Update immediately and every second
    updateCountdown();
    setInterval(updateCountdown, 1000);
})();
