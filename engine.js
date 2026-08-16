/**
 * engine.js
 * Core adaptive test engine (Bluebook-style modules, timer, navigation, routing).
 */

class SATTestEngine {
    constructor() {
        this.testData = null;
        this.currentState = {
            section: 'RW',
            module: 1,
            isHardModule: false,
            currentIndex: 0,
            timeRemaining: 0,
            timerInterval: null
        };
        this.userResponses = {
            RW: { module1: {}, module2: {} },
            MATH: { module1: {}, module2: {} }
        };
        this.flags = {
            RW: { module1: new Set(), module2: new Set() },
            MATH: { module1: new Set(), module2: new Set() }
        };
        this.bindEvents();
    }

    startTest(parsedData) {
        this.testData = parsedData;
        this.currentState.section = 'RW';
        this.currentState.module = 1;
        this.currentState.isHardModule = false;
        this.userResponses = {
            RW: { module1: {}, module2: {} },
            MATH: { module1: {}, module2: {} }
        };
        this.flags = {
            RW: { module1: new Set(), module2: new Set() },
            MATH: { module1: new Set(), module2: new Set() }
        };
        this.loadModule();
    }

    getCurrentQuestions() {
        const sec = this.currentState.section;
        if (this.currentState.module === 1) {
            return this.testData.sections[sec].module1;
        }
        return this.currentState.isHardModule
            ? this.testData.sections[sec].module2Hard
            : this.testData.sections[sec].module2Easy;
    }

    getCurrentResponseMap() {
        return this.userResponses[this.currentState.section][`module${this.currentState.module}`];
    }

    getCurrentFlagsSet() {
        return this.flags[this.currentState.section][`module${this.currentState.module}`];
    }

    loadModule() {
        this.currentState.currentIndex = 0;
        const isRW = this.currentState.section === 'RW';
        this.currentState.timeRemaining = isRW ? 32 * 60 : 35 * 60;

        document.getElementById('section-title').textContent =
            `${isRW ? 'Reading and Writing' : 'Math'}: Module ${this.currentState.module}`;

        const calcBtn = document.getElementById('calc-btn');
        if (isRW) calcBtn.classList.add('hidden');
        else calcBtn.classList.remove('hidden');

        this.renderNodes();
        this.renderQuestion();
        this.startTimer();
    }

    startTimer() {
        clearInterval(this.currentState.timerInterval);
        this.updateTimerDisplay();
        this.currentState.timerInterval = setInterval(() => {
            this.currentState.timeRemaining--;
            this.updateTimerDisplay();
            if (this.currentState.timeRemaining <= 0) {
                this.handleModuleEnd(true);
            }
        }, 1000);
    }

    updateTimerDisplay() {
        const timeSpan = document.getElementById('time-remaining');
        if (this.currentState.timeRemaining <= 0) {
            timeSpan.textContent = '0:00';
            return;
        }
        const mins = Math.floor(this.currentState.timeRemaining / 60);
        const secs = this.currentState.timeRemaining % 60;
        timeSpan.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        timeSpan.style.color = this.currentState.timeRemaining < 300 ? 'var(--danger)' : 'inherit';
    }

    renderNodes() {
        const container = document.getElementById('nav-nodes');
        container.innerHTML = '';
        const questions = this.getCurrentQuestions();
        const responses = this.getCurrentResponseMap();
        const flags = this.getCurrentFlagsSet();

        questions.forEach((q, index) => {
            const node = document.createElement('div');
            node.className = 'q-node';
            node.textContent = q.number;
            if (index === this.currentState.currentIndex) node.classList.add('active');
            if (responses[q.id] !== undefined && responses[q.id] !== '') node.classList.add('answered');
            if (flags.has(q.id)) node.classList.add('flagged');
            node.onclick = () => {
                this.currentState.currentIndex = index;
                this.renderQuestion();
                this.renderNodes();
            };
            container.appendChild(node);
        });
    }

    renderQuestion() {
        const questions = this.getCurrentQuestions();
        const q = questions[this.currentState.currentIndex];
        const responses = this.getCurrentResponseMap();
        const flags = this.getCurrentFlagsSet();

        document.getElementById('question-number-display').textContent =
            `Question ${q.number} of ${questions.length}`;

        const flagIcon = document.getElementById('flag-icon');
        const flagBtn = document.getElementById('flag-btn');
        if (flags.has(q.id)) {
            flagIcon.className = 'fas fa-bookmark';
            flagBtn.style.color = 'var(--warning)';
        } else {
            flagIcon.className = 'far fa-bookmark';
            flagBtn.style.color = 'var(--text-muted)';
        }

        const passageContainer = document.getElementById('passage-container');
        if (q.passage) {
            passageContainer.style.display = 'block';
            passageContainer.innerHTML = `<p>${q.passage}</p>`;
            document.getElementById('rw-layout').style.flexDirection = 'row';
        } else {
            passageContainer.style.display = 'none';
            document.getElementById('rw-layout').style.flexDirection = 'column';
        }

        document.getElementById('question-container').innerHTML = `<p>${q.text}</p>`;

        const optsContainer = document.getElementById('options-container');
        optsContainer.innerHTML = '';
        const letters = ['A', 'B', 'C', 'D'];

        if (q.type === 'MCQ') {
            const list = document.createElement('ul');
            list.className = 'options-list';
            q.options.forEach((optText, index) => {
                const li = document.createElement('li');
                li.className = 'option-item';
                if (responses[q.id] === index) li.classList.add('selected');
                li.innerHTML = `
                    <div class="option-letter">${letters[index]}</div>
                    <div class="option-content">${optText}</div>
                `;
                li.onclick = () => {
                    responses[q.id] = index;
                    this.renderQuestion();
                    this.renderNodes();
                };
                list.appendChild(li);
            });
            optsContainer.appendChild(list);
        } else if (q.type === 'SPR') {
            optsContainer.innerHTML = `
                <div class="spr-input-container">
                    <p class="text-muted text-sm mb-2">Enter your answer. Fractions and decimals are accepted.</p>
                    <input type="text" class="spr-input" id="spr-input-${q.id}" placeholder="Enter answer"
                        value="${responses[q.id] || ''}">
                </div>
            `;
            const inputField = document.getElementById(`spr-input-${q.id}`);
            inputField.addEventListener('input', (e) => {
                responses[q.id] = e.target.value.trim();
                this.renderNodes();
            });
        }

        const nextBtn = document.getElementById('next-btn');
        if (this.currentState.currentIndex === questions.length - 1) {
            nextBtn.innerHTML = `End Module <i class="fas fa-flag-checkered"></i>`;
        } else {
            nextBtn.innerHTML = `Next <i class="fas fa-chevron-right"></i>`;
        }
    }

    toggleFlag() {
        const q = this.getCurrentQuestions()[this.currentState.currentIndex];
        const flags = this.getCurrentFlagsSet();
        if (flags.has(q.id)) flags.delete(q.id);
        else flags.add(q.id);
        this.renderQuestion();
        this.renderNodes();
    }

    nextQuestion() {
        const questions = this.getCurrentQuestions();
        if (this.currentState.currentIndex < questions.length - 1) {
            this.currentState.currentIndex++;
            this.renderQuestion();
            this.renderNodes();
            document.querySelector('.question-pane').scrollTop = 0;
        } else {
            if (confirm('Are you sure you want to end this module? You cannot return to these questions.')) {
                this.handleModuleEnd(false);
            }
        }
    }

    handleModuleEnd(isTimeout) {
        clearInterval(this.currentState.timerInterval);
        if (isTimeout) alert('Time is up! Moving to the next section.');

        if (this.currentState.module === 1) {
            // Adaptive routing
            const questions = this.getCurrentQuestions();
            const responses = this.getCurrentResponseMap();
            let correct = 0;
            questions.forEach(q => {
                if (window.AnalyticsEngine.isCorrect(q, responses[q.id])) correct++;
            });
            const percentCorrect = questions.length ? correct / questions.length : 0;
            this.currentState.isHardModule = percentCorrect >= 0.60;
            this.currentState.module = 2;
            alert(`Module 1 complete. Preparing Module 2 (${this.currentState.isHardModule ? 'Harder' : 'Easier'} path)…`);
            this.loadModule();
        } else {
            if (this.currentState.section === 'RW') {
                alert('Reading and Writing complete. Starting Math section.');
                this.currentState.section = 'MATH';
                this.currentState.module = 1;
                this.currentState.isHardModule = false;
                this.loadModule();
            } else {
                alert('Test complete! Calculating your scores…');
                this.finishTest();
            }
        }
    }

    finishTest() {
        clearInterval(this.currentState.timerInterval);
        if (window.AnalyticsEngine && window.UIControllerInstance) {
            const results = window.AnalyticsEngine.calculateScore(this.testData, this.userResponses);
            window.AnalyticsEngine.generateReport(this.testData, this.userResponses, results);
            window.UIControllerInstance.showResultsView();
        }
    }

    bindEvents() {
        document.getElementById('next-btn').addEventListener('click', () => this.nextQuestion());
        document.getElementById('flag-btn').addEventListener('click', () => this.toggleFlag());
        document.getElementById('end-test-early-btn').addEventListener('click', () => {
            if (confirm('Exit the test early? Your current progress will be scored.')) {
                this.finishTest();
            }
        });
    }
}

window.TestEngineInstance = new SATTestEngine();
