/**
 * engine.js
 * 
 * The core Test Engine for the DSAT Prep App.
 * Handles state management, the test timer, UI rendering for questions,
 * and the adaptive routing algorithm.
 */

class SATTestEngine {
    constructor() {
        this.testData = null;
        
        // Tracks the current state of the test
        this.currentState = {
            section: 'RW', // Starts with Reading & Writing
            module: 1,     // 1 or 2
            isHardModule: false,
            currentIndex: 0,
            timeRemaining: 0,
            timerInterval: null
        };
        
        // Stores user answers
        this.userResponses = {
            RW: { module1: {}, module2: {} },
            MATH: { module1: {}, module2: {} }
        };
        
        // Stores flagged questions for review
        this.flags = {
            RW: { module1: new Set(), module2: new Set() },
            MATH: { module1: new Set(), module2: new Set() }
        };

        this.bindEvents();
    }

    /**
     * Initializes and starts a new test.
     * @param {Object} parsedData - The JSON test structure from PDFProcessor.
     */
    startTest(parsedData) {
        this.testData = parsedData;
        this.currentState.section = 'RW';
        this.currentState.module = 1;
        this.loadModule();
    }

    // --- State Getters ---
    
    getCurrentQuestions() {
        const sec = this.currentState.section;
        if (this.currentState.module === 1) {
            return this.testData.sections[sec].module1;
        } else {
            return this.currentState.isHardModule 
                ? this.testData.sections[sec].module2Hard 
                : this.testData.sections[sec].module2Easy;
        }
    }

    getCurrentResponseMap() {
        return this.userResponses[this.currentState.section][`module${this.currentState.module}`];
    }

    getCurrentFlagsSet() {
        return this.flags[this.currentState.section][`module${this.currentState.module}`];
    }

    // --- Module & Timer Management ---

    loadModule() {
        this.currentState.currentIndex = 0;
        let isRW = this.currentState.section === 'RW';
        
        // Official Timing: RW = 32 mins, Math = 35 mins per module
        this.currentState.timeRemaining = isRW ? 32 * 60 : 35 * 60; 
        
        document.getElementById('section-title').innerText = 
            `${isRW ? 'Reading and Writing' : 'Math'}: Module ${this.currentState.module}`;
        
        // Show/hide calculator button based on section
        const calcBtn = document.getElementById('calc-btn');
        if (isRW) {
            calcBtn.classList.add('hidden');
        } else {
            calcBtn.classList.remove('hidden');
        }

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
                this.handleModuleEnd(true); // true = forced due to timeout
            }
        }, 1000);
    }

    updateTimerDisplay() {
        const timeSpan = document.getElementById('time-remaining');
        if (this.currentState.timeRemaining <= 0) {
            timeSpan.innerText = "0:00";
            return;
        }
        const mins = Math.floor(this.currentState.timeRemaining / 60);
        const secs = this.currentState.timeRemaining % 60;
        timeSpan.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        // Warning color if under 5 minutes
        if (this.currentState.timeRemaining < 300) {
            timeSpan.style.color = "var(--danger-red)";
        } else {
            timeSpan.style.color = "inherit";
        }
    }

    // --- Rendering Engine ---

    renderNodes() {
        const container = document.getElementById('nav-nodes');
        container.innerHTML = '';
        
        const questions = this.getCurrentQuestions();
        const responses = this.getCurrentResponseMap();
        const flags = this.getCurrentFlagsSet();

        questions.forEach((q, index) => {
            const node = document.createElement('div');
            node.className = 'q-node';
            node.innerText = q.number;
            
            if (index === this.currentState.currentIndex) node.classList.add('active');
            if (responses[q.id] !== undefined && responses[q.id] !== "") node.classList.add('answered');
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

        // Update Question Number Display
        document.getElementById('question-number-display').innerText = 
            `Question ${q.number} of ${questions.length}`;

        // Update Flag Icon State
        const flagIcon = document.getElementById('flag-icon');
        const flagBtn = document.getElementById('flag-btn');
        if (flags.has(q.id)) {
            flagIcon.className = 'fas fa-bookmark';
            flagBtn.style.color = 'var(--warning-orange)';
        } else {
            flagIcon.className = 'far fa-bookmark';
            flagBtn.style.color = 'var(--text-muted)';
        }

        // Handle Reading/Writing Passage Layout
        const passageContainer = document.getElementById('passage-container');
        if (q.passage) {
            passageContainer.style.display = 'block';
            passageContainer.innerHTML = `<p>${q.passage}</p>`;
            document.getElementById('rw-layout').style.flexDirection = 'row';
        } else {
            // Hide passage pane for Math questions that don't have long passages
            passageContainer.style.display = 'none';
            document.getElementById('rw-layout').style.flexDirection = 'column';
        }

        // Render Question Text
        // Uses MathJax-style delimiters (simulated for now)
        document.getElementById('question-container').innerHTML = `<p>${q.text}</p>`;

        // Render Options (MCQ or SPR)
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
                    <p class="text-muted mb-3 text-small">Enter your answer below. Fractions and decimals are accepted.</p>
                    <input type="text" class="spr-input" id="spr-input-${q.id}" placeholder="Enter answer" 
                        value="${responses[q.id] || ''}">
                </div>
            `;
            // Attach event listener immediately
            const inputField = document.getElementById(`spr-input-${q.id}`);
            inputField.addEventListener('input', (e) => {
                responses[q.id] = e.target.value.trim();
                this.renderNodes(); // Update the node color as they type
            });
        }

        // Update Next Button Text
        const nextBtn = document.getElementById('next-btn');
        if (this.currentState.currentIndex === questions.length - 1) {
            nextBtn.innerHTML = `End Module <i class="fas fa-flag-checkered"></i>`;
        } else {
            nextBtn.innerHTML = `Next <i class="fas fa-chevron-right"></i>`;
        }
    }

    // --- User Interactions ---

    toggleFlag() {
        const q = this.getCurrentQuestions()[this.currentState.currentIndex];
        const flags = this.getCurrentFlagsSet();
        if (flags.has(q.id)) {
            flags.delete(q.id);
        } else {
            flags.add(q.id);
        }
        this.renderQuestion();
        this.renderNodes();
    }

    nextQuestion() {
        const questions = this.getCurrentQuestions();
        if (this.currentState.currentIndex < questions.length - 1) {
            this.currentState.currentIndex++;
            this.renderQuestion();
            this.renderNodes();
            
            // Scroll options back to top
            document.querySelector('.question-pane').scrollTop = 0;
        } else {
            if (confirm("Are you sure you want to end this module? You cannot return to these questions.")) {
                this.handleModuleEnd(false);
            }
        }
    }

    // --- Adaptive Routing & Workflow ---

    handleModuleEnd(isTimeout) {
        clearInterval(this.currentState.timerInterval);
        
        if (isTimeout) alert("Time is up! Moving to the next section.");
        
        if (this.currentState.module === 1) {
            // ADAPTIVE ROUTING LOGIC
            const questions = this.getCurrentQuestions();
            const responses = this.getCurrentResponseMap();
            let correct = 0;
            
            questions.forEach(q => {
                if (responses[q.id] == q.correctAnswer) correct++;
            });
            
            const percentCorrect = correct / questions.length;
            
            // Threshold for routing: If > 60% correct in Module 1, route to Hard Module 2
            this.currentState.isHardModule = (percentCorrect >= 0.60);
            this.currentState.module = 2;
            
            alert(`Module 1 Complete. Preparing Module 2...`);
            this.loadModule();
            
        } else {
            // Finished Module 2
            if (this.currentState.section === 'RW') {
                alert("Reading and Writing Section Complete. You will now begin the Math Section.");
                this.currentState.section = 'MATH';
                this.currentState.module = 1;
                this.loadModule();
            } else {
                alert("Test Complete! Calculating your scores...");
                this.finishTest();
            }
        }
    }

    finishTest() {
        clearInterval(this.currentState.timerInterval);
        
        // We will call the globally available modules (defined in analytics.js and ui.js)
        if (window.AnalyticsEngine && window.UIControllerInstance) {
            const results = window.AnalyticsEngine.calculateScore(this.testData, this.userResponses);
            window.AnalyticsEngine.generateReport(this.testData, this.userResponses, results);
            window.UIControllerInstance.showResultsView();
        } else {
            console.error("Analytics or UI Controller not loaded.");
        }
    }

    bindEvents() {
        document.getElementById('next-btn').addEventListener('click', () => this.nextQuestion());
        document.getElementById('flag-btn').addEventListener('click', () => this.toggleFlag());
        
        document.getElementById('end-test-early-btn').addEventListener('click', () => {
            if (confirm("Are you sure you want to exit the test early? Your current progress will be scored.")) {
                this.finishTest();
            }
        });
    }
}

// Attach to window so ui.js can initialize it
window.TestEngineInstance = new SATTestEngine();
