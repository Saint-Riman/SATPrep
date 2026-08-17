/**
 * ui.js
 * Bluebook-style dashboard: practice test selector, tips, analytics, Desmos.
 * PDF upload removed — content is pre-loaded from tests-data.js
 */

const STORAGE_KEY = 'dsat_prep_hub_v1';
const OPENAI_KEY_STORAGE = 'dsat_openai_key';

class Storage {
    static load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { users: {}, session: null };
        } catch {
            return { users: {}, session: null };
        }
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
                password: '', currentScore: 1200, targetScore: 1500,
                history: [], createdAt: new Date().toISOString()
            };
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
    static getOpenAIKey() {
        return localStorage.getItem(OPENAI_KEY_STORAGE) || '';
    }
    static setOpenAIKey(key) {
        if (key) localStorage.setItem(OPENAI_KEY_STORAGE, key.trim());
        else localStorage.removeItem(OPENAI_KEY_STORAGE);
    }
}

class UIController {
    constructor() {
        this.views = {
            dashboard: document.getElementById('dashboard-view'),
            test: document.getElementById('test-view'),
            results: document.getElementById('results-view')
        };
        this.authMode = 'login';
        this.bindAuth();
        this.bindDashboard();
        this.bindTestControls();
        this.bindResults();
        this.bindOpenAISettings();
        this.checkSession();
    }

    bindOpenAISettings() {
        const input = document.getElementById('openai-key-input');
        const status = document.getElementById('openai-key-status');
        if (!input || !status) return;
        const saved = Storage.getOpenAIKey();
        if (saved) {
            input.value = saved;
            status.textContent = 'Key saved in this browser. GPT-4o-mini explanations available in Review.';
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
            status.textContent = 'Key saved. It never leaves this browser except when calling OpenAI.';
            status.style.color = 'var(--success)';
        });
        document.getElementById('clear-openai-key-btn')?.addEventListener('click', () => {
            Storage.setOpenAIKey('');
            input.value = '';
            status.textContent = 'No key saved — using local explanations.';
            status.style.color = 'var(--text-muted)';
        });
    }

    bindAuth() {
        const form = document.getElementById('auth-form');
        const tabLogin = document.getElementById('tab-login');
        const tabSignup = document.getElementById('tab-signup');
        const submitBtn = document.getElementById('auth-submit-btn');
        const errorEl = document.getElementById('auth-error');

        tabLogin?.addEventListener('click', () => {
            this.authMode = 'login';
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            submitBtn.textContent = 'Log In';
            errorEl.classList.remove('show');
        });
        tabSignup?.addEventListener('click', () => {
            this.authMode = 'signup';
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            submitBtn.textContent = 'Create Account';
            errorEl.classList.remove('show');
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
                this.hideAuth();
                this.refreshDashboard();
            } else {
                const user = data.users[username];
                if (!user || user.password !== password) return this.showAuthError('Incorrect username or password.');
                Storage.setSession(username);
                this.hideAuth();
                this.refreshDashboard();
            }
        });

        document.getElementById('logout-btn')?.addEventListener('click', () => {
            Storage.clearSession();
            this.showAuth();
            this.views.dashboard.classList.add('hidden');
        });
    }

    showAuthError(msg) {
        const el = document.getElementById('auth-error');
        el.textContent = msg;
        el.classList.add('show');
    }
    showAuth() { document.getElementById('auth-modal').classList.remove('hidden'); }
    hideAuth() { document.getElementById('auth-modal').classList.add('hidden'); }

    checkSession() {
        const user = Storage.getCurrentUser();
        if (user) {
            this.hideAuth();
            this.refreshDashboard();
        } else {
            this.showAuth();
            this.views.dashboard.classList.add('hidden');
        }
    }

    bindDashboard() {
        const currentInput = document.getElementById('current-score-input');
        const targetInput = document.getElementById('target-score-input');
        const saveScores = () => {
            const user = Storage.getCurrentUser();
            if (!user) return;
            const current = parseInt(currentInput.value, 10) || 1200;
            const target = parseInt(targetInput.value, 10) || 1500;
            Storage.upsertUser(Storage.load().session, {
                currentScore: Math.min(1600, Math.max(400, current)),
                targetScore: Math.min(1600, Math.max(400, target))
            });
            this.updatePointsToGo();
        };
        currentInput?.addEventListener('change', saveScores);
        targetInput?.addEventListener('change', saveScores);
        currentInput?.addEventListener('blur', saveScores);
        targetInput?.addEventListener('blur', saveScores);

        document.getElementById('return-dashboard-btn')?.addEventListener('click', () => {
            this.showDashboard();
            this.refreshDashboard();
        });
    }

    bindResults() {
        document.getElementById('review-questions-btn')?.addEventListener('click', () => {
            const section = document.getElementById('review-section');
            section.classList.toggle('hidden');
            if (!section.classList.contains('hidden')) {
                section.scrollIntoView({ behavior: 'smooth' });
            }
        });
        document.getElementById('generate-ai-explanations-btn')?.addEventListener('click', () => this.generateAIExplanations());
    }

    async generateAIExplanations() {
        const key = Storage.getOpenAIKey();
        const status = document.getElementById('review-ai-status');
        const items = window._lastReviewItems || [];
        if (!key) { status.textContent = 'No OpenAI key saved. Add one on the dashboard first.'; return; }
        if (!items.length) { status.textContent = 'No review items available.'; return; }
        const toExplain = items.filter(i => !i.isCorrect).slice(0, 12);
        if (!toExplain.length) { status.textContent = 'No incorrect answers to explain.'; return; }
        status.textContent = `Generating explanations for ${toExplain.length} missed questions…`;
        const btn = document.getElementById('generate-ai-explanations-btn');
        btn.disabled = true;
        try {
            for (const item of toExplain) {
                const prompt = `You are a patient DSAT tutor. Explain clearly and briefly (3-5 sentences) why the correct answer is right and why the student's answer is wrong for this skill: ${item.tag}.\n\nStudent answered: ${item.yourAnswer}\nCorrect answer: ${item.correctAnswer}\n\nKeep it practical for a high-school student.`;
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: 'You are a clear, encouraging Digital SAT tutor.' },
                            { role: 'user', content: prompt }
                        ],
                        max_tokens: 220,
                        temperature: 0.4
                    })
                });
                if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
                const data = await res.json();
                const text = data.choices?.[0]?.message?.content?.trim();
                if (text) { item.explanation = text; item.aiGenerated = true; }
            }
            window.AnalyticsEngine.renderReviewList(items);
            status.textContent = `AI explanations added for ${toExplain.length} missed question(s).`;
        } catch (err) {
            console.error(err);
            status.textContent = `Could not generate AI explanations: ${err.message}`;
        } finally {
            btn.disabled = false;
        }
    }

    /** Render official practice test cards */
    renderTestCards() {
        const container = document.getElementById('test-cards');
        if (!container || !window.OFFICIAL_TESTS) return;

        const tests = Object.values(window.OFFICIAL_TESTS);
        container.innerHTML = tests.map(t => {
            const available = t.available === true;
            const qCount = available && t.sections?.RW?.module1
                ? t.sections.RW.module1.length
                : 0;
            return `
                <div class="test-card ${available ? '' : 'disabled'}" data-test-id="${t.testId}">
                    <div class="test-card-top">
                        <div class="test-card-icon"><i class="fas fa-book-open"></i></div>
                        <div>
                            <h3>${t.title}</h3>
                            <p class="text-sm text-secondary">${available ? `${qCount} questions ready · RW Module 1` : 'Content being prepared'}</p>
                        </div>
                    </div>
                    <button class="btn ${available ? 'btn-primary' : 'btn-secondary'} btn-sm start-official-btn"
                            data-test-id="${t.testId}" ${available ? '' : 'disabled'}>
                        ${available ? '<i class="fas fa-play"></i> Start' : 'Coming soon'}
                    </button>
                </div>`;
        }).join('');

        container.querySelectorAll('.start-official-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => this.startOfficialTest(btn.dataset.testId));
        });
    }

    /** Render tips & tricks */
    renderTips() {
        const container = document.getElementById('tips-list');
        if (!container || !window.SAT_TIPS) return;
        container.innerHTML = window.SAT_TIPS.map(t => `
            <div class="tip-card">
                <h4>${t.title}</h4>
                <p>${t.tip}</p>
            </div>`).join('');
    }

    /** Start a pre-loaded official practice test */
    startOfficialTest(testId) {
        const test = window.OFFICIAL_TESTS?.[testId];
        if (!test || !test.available) {
            alert('This practice test is not yet available. Content is being structured.');
            return;
        }

        // Ensure module2 has at least some questions so the adaptive path doesn't break
        const data = JSON.parse(JSON.stringify(test)); // deep clone
        if (!data.sections.RW.module2Easy?.length) {
            data.sections.RW.module2Easy = data.sections.RW.module1.slice(0, 6);
        }
        if (!data.sections.RW.module2Hard?.length) {
            data.sections.RW.module2Hard = data.sections.RW.module1.slice(6);
        }
        // Temporary empty math so engine doesn't crash — will be filled later
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
        this.views.dashboard.classList.remove('hidden');

        const username = Storage.load().session;
        document.getElementById('user-display-name').textContent = username;
        document.getElementById('user-avatar').textContent = username.charAt(0).toUpperCase();
        document.getElementById('current-score-input').value = user.currentScore || 1200;
        document.getElementById('target-score-input').value = user.targetScore || 1500;
        this.updatePointsToGo();

        // Always re-render test cards + tips
        this.renderTestCards();
        this.renderTips();

        const history = user.history || [];
        if (history.length === 0) {
            document.getElementById('avg-score-display').textContent = '—';
            document.getElementById('avg-score-sub').textContent = 'No tests yet';
            document.getElementById('top-weakness-display').textContent = '—';
            document.getElementById('top-weakness-sub').textContent = 'Complete a test to see data';
            document.getElementById('history-list').innerHTML = '<div class="text-sm text-muted">No practice tests yet.</div>';
            document.getElementById('skills-grid').innerHTML = '<div class="text-sm text-muted">Complete tests to build your skill profile.</div>';
        } else {
            const avg = Math.round(history.reduce((s, h) => s + h.total, 0) / history.length);
            document.getElementById('avg-score-display').textContent = avg;
            document.getElementById('avg-score-sub').textContent = `Across ${history.length} test${history.length > 1 ? 's' : ''}`;

            const weaknessCount = {};
            history.forEach(h => (h.topWeaknesses || []).forEach(w => {
                weaknessCount[w] = (weaknessCount[w] || 0) + 1;
            }));
            const sorted = Object.entries(weaknessCount).sort((a, b) => b[1] - a[1]);
            if (sorted.length) {
                document.getElementById('top-weakness-display').textContent = sorted[0][0];
                document.getElementById('top-weakness-sub').textContent = `Seen in ${sorted[0][1]} test${sorted[0][1] > 1 ? 's' : ''}`;
            } else {
                document.getElementById('top-weakness-display').textContent = 'None major';
                document.getElementById('top-weakness-sub').textContent = 'Strong overall';
            }

            const skills = window.AnalyticsEngine?.buildSkillProfile?.(history) || [];
            const grid = document.getElementById('skills-grid');
            if (skills.length === 0) {
                grid.innerHTML = '<div class="text-sm text-muted">Skill data will appear after tests with detailed tracking.</div>';
            } else {
                grid.innerHTML = skills.slice(0, 12).map(s => {
                    let color = 'var(--success)';
                    if (s.accuracy < 60) color = 'var(--danger)';
                    else if (s.accuracy < 75) color = 'var(--warning)';
                    else if (s.accuracy < 90) color = 'var(--primary)';
                    return `<div class="skill-card">
                        <h4>${s.tag}</h4>
                        <div class="domain">${s.domain || ''}</div>
                        <div class="skill-bar-bg"><div class="skill-bar-fill" style="width:${s.accuracy}%;background:${color}"></div></div>
                        <div class="skill-meta"><span>${s.accuracy}% accuracy</span><span>${s.total} Qs</span></div>
                    </div>`;
                }).join('');
            }

            const list = document.getElementById('history-list');
            list.innerHTML = history.slice(0, 8).map(h => {
                const date = new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                return `<div class="history-item">
                    <div>
                        <div class="font-medium">${date}</div>
                        <div class="text-xs text-muted">RW ${h.rw} · Math ${h.math}</div>
                    </div>
                    <div class="score">${h.total}</div>
                </div>`;
            }).join('');
        }
    }

    updatePointsToGo() {
        const current = parseInt(document.getElementById('current-score-input').value, 10) || 0;
        const target = parseInt(document.getElementById('target-score-input').value, 10) || 0;
        const diff = target - current;
        const el = document.getElementById('points-to-go');
        if (diff > 0) el.textContent = `${diff} points to go`;
        else if (diff < 0) el.textContent = `${Math.abs(diff)} points above target`;
        else el.textContent = 'Target reached';
    }

    hideAllViews() {
        Object.values(this.views).forEach(v => v && v.classList.add('hidden'));
    }
    showDashboard() {
        this.hideAllViews();
        this.views.dashboard.classList.remove('hidden');
    }
    showTestView() {
        this.hideAllViews();
        this.views.test.classList.remove('hidden');
        try {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
        } catch (e) {}
    }
    showResultsView() {
        this.hideAllViews();
        this.views.results.classList.remove('hidden');
        document.getElementById('review-section')?.classList.add('hidden');
        try {
            if (document.exitFullscreen && document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        } catch (e) {}
    }

    bindTestControls() {
        const hideBtn = document.getElementById('hide-time-btn');
        const timeSpan = document.getElementById('time-remaining');
        if (hideBtn && timeSpan) {
            hideBtn.addEventListener('click', () => {
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
}

window.UIControllerInstance = new UIController();
window.Storage = Storage;
