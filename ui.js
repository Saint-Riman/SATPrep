/**
 * ui.js
 * Auth, view management, dual PDF upload, score inputs, history, and status feedback.
 */

const STORAGE_KEY = 'dsat_prep_hub_v1';

class Storage {
    static load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { users: {}, session: null };
        } catch {
            return { users: {}, session: null };
        }
    }

    static save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    static getCurrentUser() {
        const data = this.load();
        if (!data.session) return null;
        return data.users[data.session] || null;
    }

    static upsertUser(username, updates) {
        const data = this.load();
        if (!data.users[username]) {
            data.users[username] = {
                password: '',
                currentScore: 1200,
                targetScore: 1500,
                history: [],
                createdAt: new Date().toISOString()
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
}

class UIController {
    constructor() {
        this.views = {
            dashboard: document.getElementById('dashboard-view'),
            test: document.getElementById('test-view'),
            results: document.getElementById('results-view')
        };
        this.authMode = 'login';
        this.questionsFile = null;
        this.answersFile = null;

        this.bindAuth();
        this.bindDashboard();
        this.bindTestControls();
        this.checkSession();
    }

    // ---------- Auth ----------
    bindAuth() {
        const form = document.getElementById('auth-form');
        const tabLogin = document.getElementById('tab-login');
        const tabSignup = document.getElementById('tab-signup');
        const submitBtn = document.getElementById('auth-submit-btn');
        const errorEl = document.getElementById('auth-error');

        tabLogin.addEventListener('click', () => {
            this.authMode = 'login';
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            submitBtn.textContent = 'Log In';
            errorEl.classList.remove('show');
        });

        tabSignup.addEventListener('click', () => {
            this.authMode = 'signup';
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            submitBtn.textContent = 'Create Account';
            errorEl.classList.remove('show');
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('auth-username').value.trim().toLowerCase();
            const password = document.getElementById('auth-password').value;

            if (username.length < 3) {
                this.showAuthError('Username must be at least 3 characters.');
                return;
            }
            if (password.length < 4) {
                this.showAuthError('Password must be at least 4 characters.');
                return;
            }

            const data = Storage.load();

            if (this.authMode === 'signup') {
                if (data.users[username]) {
                    this.showAuthError('That username is already taken.');
                    return;
                }
                Storage.upsertUser(username, { password });
                Storage.setSession(username);
                this.hideAuth();
                this.refreshDashboard();
            } else {
                const user = data.users[username];
                if (!user || user.password !== password) {
                    this.showAuthError('Incorrect username or password.');
                    return;
                }
                Storage.setSession(username);
                this.hideAuth();
                this.refreshDashboard();
            }
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
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

    showAuth() {
        document.getElementById('auth-modal').classList.remove('hidden');
    }

    hideAuth() {
        document.getElementById('auth-modal').classList.add('hidden');
    }

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

    // ---------- Dashboard ----------
    bindDashboard() {
        const currentInput = document.getElementById('current-score-input');
        const targetInput = document.getElementById('target-score-input');

        const saveScores = () => {
            const user = Storage.getCurrentUser();
            if (!user) return;
            const current = parseInt(currentInput.value, 10) || 1200;
            const target = parseInt(targetInput.value, 10) || 1500;
            const username = Storage.load().session;
            Storage.upsertUser(username, {
                currentScore: Math.min(1600, Math.max(400, current)),
                targetScore: Math.min(1600, Math.max(400, target))
            });
            this.updatePointsToGo();
        };

        currentInput.addEventListener('change', saveScores);
        targetInput.addEventListener('change', saveScores);
        currentInput.addEventListener('blur', saveScores);
        targetInput.addEventListener('blur', saveScores);

        const qInput = document.getElementById('questions-input');
        const aInput = document.getElementById('answers-input');
        const qDrop = document.getElementById('questions-drop');
        const aDrop = document.getElementById('answers-drop');

        const setupDrop = (zone, input, type) => {
            ['dragenter', 'dragover'].forEach(evt => {
                zone.addEventListener(evt, e => {
                    e.preventDefault();
                    zone.classList.add('dragover');
                });
            });
            ['dragleave', 'drop'].forEach(evt => {
                zone.addEventListener(evt, e => {
                    e.preventDefault();
                    zone.classList.remove('dragover');
                });
            });
            zone.addEventListener('drop', e => {
                const file = e.dataTransfer.files[0];
                if (file && file.type === 'application/pdf') {
                    this.setFile(type, file);
                }
            });
            input.addEventListener('change', e => {
                const file = e.target.files[0];
                if (file) this.setFile(type, file);
            });
        };

        setupDrop(qDrop, qInput, 'questions');
        setupDrop(aDrop, aInput, 'answers');

        document.getElementById('start-test-btn').addEventListener('click', () => this.startTest());

        document.getElementById('return-dashboard-btn').addEventListener('click', () => {
            this.showDashboard();
            this.refreshDashboard();
        });
    }

    setFile(type, file) {
        if (type === 'questions') {
            this.questionsFile = file;
            const nameEl = document.getElementById('questions-file-name');
            nameEl.textContent = file.name;
            nameEl.classList.remove('hidden');
            document.getElementById('questions-drop').classList.add('has-file');
        } else {
            this.answersFile = file;
            const nameEl = document.getElementById('answers-file-name');
            nameEl.textContent = file.name;
            nameEl.classList.remove('hidden');
            document.getElementById('answers-drop').classList.add('has-file');
        }
        this.updateStartButton();
    }

    updateStartButton() {
        const btn = document.getElementById('start-test-btn');
        btn.disabled = !this.questionsFile;
    }

    async startTest() {
        if (!this.questionsFile) return;

        const status = document.getElementById('upload-status');
        const statusText = document.getElementById('upload-status-text');
        status.classList.remove('hidden');
        statusText.textContent = this.answersFile
            ? 'Extracting answer key and building adaptive modules…'
            : 'Building adaptive modules (no answer key provided)…';

        try {
            const parsed = await window.PDFProcessor.parseFiles(this.questionsFile, this.answersFile);
            status.classList.add('hidden');

            // Brief feedback about grading source
            if (parsed.extractionNote) {
                console.log(parsed.extractionNote);
            }

            if (window.TestEngineInstance) {
                window.TestEngineInstance.startTest(parsed);
                this.showTestView();
            } else {
                alert('Test engine failed to load.');
            }
        } catch (err) {
            console.error(err);
            status.classList.add('hidden');
            alert('Error processing PDFs. Please try again with official practice test files.');
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

        const history = user.history || [];
        if (history.length === 0) {
            document.getElementById('avg-score-display').textContent = '—';
            document.getElementById('avg-score-sub').textContent = 'No tests yet';
            document.getElementById('top-weakness-display').textContent = '—';
            document.getElementById('top-weakness-sub').textContent = 'Complete a test to see data';
            document.getElementById('history-list').innerHTML = '<div class="text-sm text-muted">No practice tests yet. Complete one to see your progress here.</div>';
        } else {
            const avg = Math.round(history.reduce((s, h) => s + h.total, 0) / history.length);
            document.getElementById('avg-score-display').textContent = avg;
            document.getElementById('avg-score-sub').textContent = `Across ${history.length} practice test${history.length > 1 ? 's' : ''}`;

            const weaknessCount = {};
            history.forEach(h => {
                (h.topWeaknesses || []).forEach(w => {
                    weaknessCount[w] = (weaknessCount[w] || 0) + 1;
                });
            });
            const sorted = Object.entries(weaknessCount).sort((a, b) => b[1] - a[1]);
            if (sorted.length) {
                document.getElementById('top-weakness-display').textContent = sorted[0][0];
                document.getElementById('top-weakness-sub').textContent = `Seen in ${sorted[0][1]} test${sorted[0][1] > 1 ? 's' : ''}`;
            } else {
                document.getElementById('top-weakness-display').textContent = 'None major';
                document.getElementById('top-weakness-sub').textContent = 'Strong across the board';
            }

            const list = document.getElementById('history-list');
            list.innerHTML = history.slice(0, 8).map(h => {
                const date = new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                const badge = h.usedRealAnswers
                    ? '<span style="font-size:0.7rem;background:#CCFBF1;color:#0D9488;padding:2px 6px;border-radius:4px;margin-left:6px;">Real key</span>'
                    : '';
                return `<div class="history-item">
                    <div>
                        <div class="font-medium">${date}${badge}</div>
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
