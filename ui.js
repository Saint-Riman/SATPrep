/**
 * ui.js — Premium Home · Hamburger · Practice / Tips / Skills / Profile
 * Interactive cards navigate deep into the app.
 */

const STORAGE_KEY = 'dsat_prep_hub_v1';
const OPENAI_KEY_STORAGE = 'dsat_openai_key';

const SECTION_TITLES = {
    home: 'Home',
    practice: 'Practice',
    tips: 'Tips',
    skills: 'Skills',
    profile: 'Profile'
};

class Storage {
    static load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { users: {}, session: null };
        } catch { return { users: {}, session: null }; }
    }
    static save(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    static getCurrentUser() {
        const data = this.load();
        return data.session ? (data.users[data.session] || null) : null;
    }
    static upsertUser(username, updates) {
        const data = this.load();
        if (!data.users[username]) {
            data.users[username] = {
                password: '',
                rwCurrent: 600, rwTarget: 750,
                mathCurrent: 600, mathTarget: 750,
                history: [], createdAt: new Date().toISOString()
            };
        }
        if (data.users[username].currentScore && !data.users[username].rwCurrent) {
            const half = Math.round((data.users[username].currentScore || 1200) / 2);
            data.users[username].rwCurrent = half;
            data.users[username].mathCurrent = half;
        }
        if (data.users[username].targetScore && !data.users[username].rwTarget) {
            const half = Math.round((data.users[username].targetScore || 1500) / 2);
            data.users[username].rwTarget = half;
            data.users[username].mathTarget = half;
        }
        Object.assign(data.users[username], updates);
        this.save(data);
        return data.users[username];
    }
    static setSession(username) {
        const data = this.load();
        data.session = username;
        this.save(data);
    }
    static clearSession() {
        const data = this.load();
        data.session = null;
        this.save(data);
    }
    static addTestResult(username, result) {
        const user = this.upsertUser(username, {});
        user.history.unshift(result);
        if (user.history.length > 30) user.history = user.history.slice(0, 30);
        this.upsertUser(username, { history: user.history });
    }
    static getOpenAIKey() { return localStorage.getItem(OPENAI_KEY_STORAGE) || ''; }
    static setOpenAIKey(key) {
        if (key) localStorage.setItem(OPENAI_KEY_STORAGE, key.trim());
        else localStorage.removeItem(OPENAI_KEY_STORAGE);
    }
}

class UIController {
    constructor() {
        this.views = {
            landing: document.getElementById('landing-view'),
            dashboard: document.getElementById('dashboard-view'),
            test: document.getElementById('test-view'),
            results: document.getElementById('results-view')
        };
        this.authMode = 'login';
        this.currentSection = 'home';
        this.bindLanding();
        this.bindAuth();
        this.bindNav();
        this.bindScores();
        this.bindResults();
        this.bindOpenAISettings();
        this.bindTestControls();
        this.boot();
    }

    boot() {
        const user = Storage.getCurrentUser();
        if (user) {
            this.hideLanding();
            this.hideAuth();
            this.showDashboard();
            this.refreshDashboard();
        } else {
            this.showLanding();
        }
    }

    bindLanding() {
        document.getElementById('landing-start-btn')?.addEventListener('click', () => {
            this.hideLanding();
            this.showAuth();
        });
    }
    showLanding() {
        this.hideAllViews();
        this.views.landing?.classList.remove('hidden');
    }
    hideLanding() {
        this.views.landing?.classList.add('hidden');
    }

    bindAuth() {
        const form = document.getElementById('auth-form');
        const tabLogin = document.getElementById('tab-login');
        const tabSignup = document.getElementById('tab-signup');
        const submitBtn = document.getElementById('auth-submit-btn');

        tabLogin?.addEventListener('click', () => {
            this.authMode = 'login';
            tabLogin.classList.add('active');
            tabSignup?.classList.remove('active');
            if (submitBtn) submitBtn.textContent = 'Log In';
            document.getElementById('auth-error')?.classList.remove('show');
        });
        tabSignup?.addEventListener('click', () => {
            this.authMode = 'signup';
            tabSignup.classList.add('active');
            tabLogin?.classList.remove('active');
            if (submitBtn) submitBtn.textContent = 'Create Account';
            document.getElementById('auth-error')?.classList.remove('show');
        });

        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('auth-username').value.trim().toLowerCase();
            const password = document.getElementById('auth-password').value;
            if (username.length < 3) return this.showAuthError('Username must be at least 3 characters.');
            if (password.length < 4) return this.showAuthError('Password must be at least 4 characters.');

            const data = Storage.load();
            if (this.authMode === 'signup') {
                if (data.users[username]) return this.showAuthError('That username is already taken.');
                Storage.upsertUser(username, { password });
                Storage.setSession(username);
            } else {
                const user = data.users[username];
                if (!user || user.password !== password) return this.showAuthError('Incorrect username or password.');
                Storage.setSession(username);
            }
            this.hideAuth();
            this.currentSection = 'home';
            this.showDashboard();
            this.refreshDashboard();
        });

        document.getElementById('drawer-logout-btn')?.addEventListener('click', () => this.logout());
    }

    showAuthError(msg) {
        const el = document.getElementById('auth-error');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
    }
    showAuth() { document.getElementById('auth-modal')?.classList.remove('hidden'); }
    hideAuth() { document.getElementById('auth-modal')?.classList.add('hidden'); }

    logout() {
        Storage.clearSession();
        this.closeDrawer();
        this.hideAllViews();
        this.showLanding();
    }

    bindNav() {
        document.getElementById('hamburger-btn')?.addEventListener('click', () => this.openDrawer());
        document.getElementById('close-drawer-btn')?.addEventListener('click', () => this.closeDrawer());
        document.getElementById('nav-drawer-overlay')?.addEventListener('click', () => this.closeDrawer());

        // All elements with data-nav (drawer links + home cards + CTAs)
        document.addEventListener('click', (e) => {
            const navEl = e.target.closest('[data-nav]');
            if (!navEl) return;
            const section = navEl.dataset.nav;
            if (!section) return;
            // Only route if we're in the dashboard shell
            if (this.views.dashboard && !this.views.dashboard.classList.contains('hidden')) {
                this.switchSection(section);
                this.closeDrawer();
            }
        });

        document.getElementById('return-dashboard-btn')?.addEventListener('click', () => {
            this.currentSection = 'home';
            this.showDashboard();
            this.refreshDashboard();
        });
    }

    openDrawer() {
        document.getElementById('nav-drawer')?.classList.add('open');
        document.getElementById('nav-drawer-overlay')?.classList.remove('hidden');
        const nameEl = document.getElementById('drawer-username');
        if (nameEl) nameEl.textContent = Storage.load().session || 'Guest';
    }
    closeDrawer() {
        document.getElementById('nav-drawer')?.classList.remove('open');
        document.getElementById('nav-drawer-overlay')?.classList.add('hidden');
    }

    switchSection(name) {
        if (!['home', 'practice', 'tips', 'skills', 'profile'].includes(name)) return;
        this.currentSection = name;
        ['home', 'practice', 'tips', 'profile', 'skills'].forEach(s => {
            const el = document.getElementById(`section-${s}`);
            if (el) el.classList.toggle('hidden', s !== name);
        });
        document.querySelectorAll('.nav-link').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.nav === name);
        });
        const title = document.getElementById('app-header-title');
        if (title) title.textContent = SECTION_TITLES[name] || 'DSAT Prep';
        // Scroll top when switching
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    bindScores() {
        const ids = ['rw-current-input', 'rw-target-input', 'math-current-input', 'math-target-input'];
        const save = () => this.saveSectionScores();
        ids.forEach(id => {
            const el = document.getElementById(id);
            el?.addEventListener('change', save);
            el?.addEventListener('blur', save);
        });
    }

    saveSectionScores() {
        const user = Storage.getCurrentUser();
        if (!user) return;
        const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
        const rwC = clamp(parseInt(document.getElementById('rw-current-input')?.value, 10) || 600, 200, 800);
        const rwT = clamp(parseInt(document.getElementById('rw-target-input')?.value, 10) || 750, 200, 800);
        const mC = clamp(parseInt(document.getElementById('math-current-input')?.value, 10) || 600, 200, 800);
        const mT = clamp(parseInt(document.getElementById('math-target-input')?.value, 10) || 750, 200, 800);
        Storage.upsertUser(Storage.load().session, {
            rwCurrent: rwC, rwTarget: rwT,
            mathCurrent: mC, mathTarget: mT
        });
        this.updatePointsDisplay();
        this.renderHome();
    }

    updatePointsDisplay() {
        const rwC = parseInt(document.getElementById('rw-current-input')?.value, 10) || 0;
        const rwT = parseInt(document.getElementById('rw-target-input')?.value, 10) || 0;
        const mC = parseInt(document.getElementById('math-current-input')?.value, 10) || 0;
        const mT = parseInt(document.getElementById('math-target-input')?.value, 10) || 0;

        const fmt = (cur, tgt, elId) => {
            const el = document.getElementById(elId);
            if (!el) return;
            const d = tgt - cur;
            if (d > 0) el.textContent = `${d} points to go`;
            else if (d < 0) el.textContent = `${Math.abs(d)} points above target`;
            else el.textContent = 'Target reached';
        };
        fmt(rwC, rwT, 'rw-points-to-go');
        fmt(mC, mT, 'math-points-to-go');

        const totalEl = document.getElementById('combined-total-display');
        const targetEl = document.getElementById('combined-target-display');
        if (totalEl) totalEl.textContent = rwC + mC;
        if (targetEl) targetEl.textContent = rwT + mT;
    }

    bindOpenAISettings() {
        const input = document.getElementById('openai-key-input');
        const status = document.getElementById('openai-key-status');
        if (!input || !status) return;
        const saved = Storage.getOpenAIKey();
        if (saved) {
            input.value = saved;
            status.textContent = 'Key saved. GPT-4o-mini available in Review.';
            status.style.color = 'var(--success)';
        }
        document.getElementById('save-openai-key-btn')?.addEventListener('click', () => {
            const key = input.value.trim();
            if (!key.startsWith('sk-')) {
                status.textContent = 'Key should start with sk- or sk-proj-';
                status.style.color = 'var(--danger)';
                return;
            }
            Storage.setOpenAIKey(key);
            status.textContent = 'Key saved.';
            status.style.color = 'var(--success)';
        });
        document.getElementById('clear-openai-key-btn')?.addEventListener('click', () => {
            Storage.setOpenAIKey('');
            input.value = '';
            status.textContent = 'No key saved';
            status.style.color = 'var(--text-muted)';
        });
    }

    bindResults() {
        document.getElementById('review-questions-btn')?.addEventListener('click', () => {
            const section = document.getElementById('review-section');
            section?.classList.toggle('hidden');
            if (section && !section.classList.contains('hidden')) {
                section.scrollIntoView({ behavior: 'smooth' });
            }
        });
        document.getElementById('generate-ai-explanations-btn')?.addEventListener('click', () => this.generateAIExplanations());
    }

    async generateAIExplanations() {
        const key = Storage.getOpenAIKey();
        const status = document.getElementById('review-ai-status');
        const items = window._lastReviewItems || [];
        if (!key) { if (status) status.textContent = 'No OpenAI key saved. Add one in Profile.'; return; }
        if (!items.length) { if (status) status.textContent = 'No review items.'; return; }
        const toExplain = items.filter(i => !i.isCorrect).slice(0, 12);
        if (!toExplain.length) { if (status) status.textContent = 'No incorrect answers to explain.'; return; }
        if (status) status.textContent = `Generating ${toExplain.length} explanations…`;
        const btn = document.getElementById('generate-ai-explanations-btn');
        if (btn) btn.disabled = true;
        try {
            for (const item of toExplain) {
                const prompt = `You are a patient DSAT tutor. Explain in 3-5 sentences why the correct answer is right and the student's answer is wrong. Skill: ${item.tag}. Student: ${item.yourAnswer}. Correct: ${item.correctAnswer}.`;
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: 'Clear, encouraging Digital SAT tutor.' },
                            { role: 'user', content: prompt }
                        ],
                        max_tokens: 220, temperature: 0.4
                    })
                });
                if (!res.ok) throw new Error(`OpenAI ${res.status}`);
                const data = await res.json();
                const text = data.choices?.[0]?.message?.content?.trim();
                if (text) { item.explanation = text; item.aiGenerated = true; }
            }
            window.AnalyticsEngine?.renderReviewList?.(items);
            if (status) status.textContent = `AI explanations added for ${toExplain.length} question(s).`;
        } catch (err) {
            if (status) status.textContent = `Could not generate: ${err.message}`;
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    renderTestCards() {
        const container = document.getElementById('test-cards');
        if (!container || !window.OFFICIAL_TESTS) return;
        const tests = Object.values(window.OFFICIAL_TESTS);
        container.innerHTML = tests.map(t => {
            const available = t.available === true;
            const qCount = available && t.sections?.RW?.module1 ? t.sections.RW.module1.length : 0;
            return `<div class="test-card ${available ? '' : 'disabled'}">
                <div class="test-card-top">
                    <div class="test-card-icon"><i class="fas fa-book-open"></i></div>
                    <div>
                        <h3>${t.title}</h3>
                        <p class="text-sm text-secondary">${available ? `${qCount} questions · RW Module 1` : 'Coming soon'}</p>
                    </div>
                </div>
                <button class="btn ${available ? 'btn-primary' : 'btn-secondary'} btn-sm start-official-btn"
                    data-test-id="${t.testId}" ${available ? '' : 'disabled'}>
                    ${available ? '<i class="fas fa-play"></i> Start' : 'Soon'}
                </button>
            </div>`;
        }).join('');
        container.querySelectorAll('.start-official-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => this.startOfficialTest(btn.dataset.testId));
        });
    }

    renderTips() {
        const container = document.getElementById('tips-list');
        if (!container || !window.SAT_TIPS) return;
        container.innerHTML = window.SAT_TIPS.map(t =>
            `<div class="tip-card"><h4>${t.title}</h4><p>${t.tip}</p></div>`
        ).join('');
    }

    /** Premium Home — scores, weakness, highest, tests, recent */
    renderHome() {
        const user = Storage.getCurrentUser();
        if (!user) return;

        const username = Storage.load().session || 'Student';
        const greet = document.getElementById('home-greeting');
        if (greet) {
            const hour = new Date().getHours();
            const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
            greet.textContent = `${part}, ${username}`;
        }

        const rwC = user.rwCurrent ?? 600;
        const mC = user.mathCurrent ?? 600;
        const rwT = user.rwTarget ?? 750;
        const mT = user.mathTarget ?? 750;
        const total = rwC + mC;
        const target = rwT + mT;
        const gap = target - total;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('home-current-total', total);
        set('home-target-total', target);
        set('home-rw-math-line', `RW ${rwC} · Math ${mC}`);
        set('home-gap-line', gap > 0 ? `${gap} to go` : gap < 0 ? `${Math.abs(gap)} above target` : 'Target reached');

        const history = user.history || [];
        set('home-tests-count', String(history.length));

        if (history.length) {
            const highest = Math.max(...history.map(h => h.total || 0));
            const avg = Math.round(history.reduce((s, h) => s + (h.total || 0), 0) / history.length);
            set('home-highest', String(highest));
            set('home-avg', String(avg));

            const weaknessCount = {};
            history.forEach(h => (h.topWeaknesses || []).forEach(w => {
                weaknessCount[w] = (weaknessCount[w] || 0) + 1;
            }));
            const sorted = Object.entries(weaknessCount).sort((a, b) => b[1] - a[1]);
            set('home-weakness', sorted.length ? sorted[0][0] : 'None major');

            const list = document.getElementById('home-recent-list');
            if (list) {
                list.innerHTML = history.slice(0, 4).map(h => {
                    const date = new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    return `<div class="home-recent-item">
                        <div><span class="font-medium">${date}</span>
                        <span class="text-xs text-muted"> · RW ${h.rw} · Math ${h.math}</span></div>
                        <div class="home-recent-score">${h.total}</div>
                    </div>`;
                }).join('');
            }
        } else {
            set('home-highest', '—');
            set('home-avg', '—');
            set('home-weakness', 'Take a test');
            const list = document.getElementById('home-recent-list');
            if (list) list.innerHTML = '<div class="text-sm text-muted">No tests yet — start one to unlock insights.</div>';
        }
    }

    startOfficialTest(testId) {
        const test = window.OFFICIAL_TESTS?.[testId];
        if (!test || !test.available) {
            alert('This practice test is not yet available.');
            return;
        }
        const data = JSON.parse(JSON.stringify(test));
        if (!data.sections.RW.module2Easy?.length) data.sections.RW.module2Easy = data.sections.RW.module1.slice(0, 6);
        if (!data.sections.RW.module2Hard?.length) data.sections.RW.module2Hard = data.sections.RW.module1.slice(6);
        if (!data.sections.MATH.module1?.length) {
            data.sections.MATH.module1 = [];
            data.sections.MATH.module2Easy = [];
            data.sections.MATH.module2Hard = [];
        }
        if (window.TestEngineInstance) {
            window.TestEngineInstance.startTest(data);
            this.showTestView();
        } else {
            alert('Test engine failed to load.');
        }
    }

    refreshDashboard() {
        const user = Storage.getCurrentUser();
        if (!user) return;

        const username = Storage.load().session || 'Guest';
        const avatar = document.getElementById('user-avatar');
        if (avatar) avatar.textContent = username.charAt(0).toUpperCase();
        const drawerName = document.getElementById('drawer-username');
        if (drawerName) drawerName.textContent = username;

        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal('rw-current-input', user.rwCurrent ?? 600);
        setVal('rw-target-input', user.rwTarget ?? 750);
        setVal('math-current-input', user.mathCurrent ?? 600);
        setVal('math-target-input', user.mathTarget ?? 750);
        this.updatePointsDisplay();

        this.renderHome();
        this.renderTestCards();
        this.renderTips();

        const history = user.history || [];
        const avgEl = document.getElementById('avg-score-display');
        const avgSub = document.getElementById('avg-score-sub');
        const weakEl = document.getElementById('top-weakness-display');
        const weakSub = document.getElementById('top-weakness-sub');
        const histList = document.getElementById('history-list');
        const skillsGrid = document.getElementById('skills-grid');

        if (history.length === 0) {
            if (avgEl) avgEl.textContent = '—';
            if (avgSub) avgSub.textContent = 'No tests yet';
            if (weakEl) weakEl.textContent = '—';
            if (weakSub) weakSub.textContent = 'Complete a test to see data';
            if (histList) histList.innerHTML = '<div class="text-sm text-muted" style="padding:16px;">No practice tests yet.</div>';
            if (skillsGrid) skillsGrid.innerHTML = '<div class="text-sm text-muted">Complete tests to build your skill profile.</div>';
            this.switchSection(this.currentSection || 'home');
            return;
        }

        const avg = Math.round(history.reduce((s, h) => s + h.total, 0) / history.length);
        if (avgEl) avgEl.textContent = avg;
        if (avgSub) avgSub.textContent = `Across ${history.length} test${history.length > 1 ? 's' : ''}`;

        const weaknessCount = {};
        history.forEach(h => (h.topWeaknesses || []).forEach(w => {
            weaknessCount[w] = (weaknessCount[w] || 0) + 1;
        }));
        const sorted = Object.entries(weaknessCount).sort((a, b) => b[1] - a[1]);
        if (sorted.length) {
            if (weakEl) weakEl.textContent = sorted[0][0];
            if (weakSub) weakSub.textContent = `Seen in ${sorted[0][1]} test${sorted[0][1] > 1 ? 's' : ''}`;
        } else {
            if (weakEl) weakEl.textContent = 'None major';
            if (weakSub) weakSub.textContent = 'Strong overall';
        }

        const skills = window.AnalyticsEngine?.buildSkillProfile?.(history) || [];
        if (skillsGrid) {
            if (!skills.length) {
                skillsGrid.innerHTML = '<div class="text-sm text-muted">Skill data will appear after detailed tests.</div>';
            } else {
                // Sort weakest first so assessment is actionable
                const ranked = [...skills].sort((a, b) => a.accuracy - b.accuracy);
                skillsGrid.innerHTML = ranked.slice(0, 12).map(s => {
                    let color = 'var(--success)';
                    if (s.accuracy < 60) color = 'var(--danger)';
                    else if (s.accuracy < 75) color = 'var(--warning)';
                    else if (s.accuracy < 90) color = 'var(--primary)';
                    return `<div class="skill-card">
                        <h4>${s.tag}</h4>
                        <div class="domain">${s.domain || ''}</div>
                        <div class="skill-bar-bg"><div class="skill-bar-fill" style="width:${s.accuracy}%;background:${color}"></div></div>
                        <div class="skill-meta"><span>${s.accuracy}%</span><span>${s.total} Qs</span></div>
                    </div>`;
                }).join('');
            }
        }

        if (histList) {
            histList.innerHTML = history.slice(0, 8).map(h => {
                const date = new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                return `<div class="history-item">
                    <div><div class="font-medium">${date}</div>
                    <div class="text-xs text-muted">RW ${h.rw} · Math ${h.math}</div></div>
                    <div class="score">${h.total}</div>
                </div>`;
            }).join('');
        }

        this.switchSection(this.currentSection || 'home');
    }

    hideAllViews() {
        Object.values(this.views).forEach(v => v?.classList.add('hidden'));
    }
    showDashboard() {
        this.hideAllViews();
        this.views.dashboard?.classList.remove('hidden');
        this.switchSection(this.currentSection || 'home');
    }
    showTestView() {
        this.hideAllViews();
        this.views.test?.classList.remove('hidden');
        try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch (e) {}
    }
    showResultsView() {
        this.hideAllViews();
        this.views.results?.classList.remove('hidden');
        document.getElementById('review-section')?.classList.add('hidden');
        try {
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        } catch (e) {}
    }

    bindTestControls() {
        const hideBtn = document.getElementById('hide-time-btn');
        const timeSpan = document.getElementById('time-remaining');
        hideBtn?.addEventListener('click', () => {
            if (!timeSpan) return;
            if (timeSpan.style.visibility === 'hidden') {
                timeSpan.style.visibility = 'visible';
                hideBtn.textContent = 'Hide';
            } else {
                timeSpan.style.visibility = 'hidden';
                hideBtn.textContent = 'Show';
            }
        });
    }
}

window.UIControllerInstance = new UIController();
window.Storage = Storage;
