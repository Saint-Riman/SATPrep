/**
 * ui.js
 * 
 * Manages view transitions, drag-and-drop PDF uploads,
 * and overall user interface interactions for the DSAT Prep app.
 */

class UIController {
    constructor() {
        // Cache view elements
        this.views = {
            dashboard: document.getElementById('dashboard-view'),
            test: document.getElementById('test-view'),
            results: document.getElementById('results-view')
        };

        this.bindEvents();
    }

    /**
     * Hides all application views.
     */
    hideAllViews() {
        Object.values(this.views).forEach(v => {
            if (v) v.classList.add('hidden');
        });
    }

    /**
     * Displays the dashboard view.
     */
    showDashboard() {
        this.hideAllViews();
        if (this.views.dashboard) {
            this.views.dashboard.classList.remove('hidden');
        }
    }

    /**
     * Displays the Bluebook test engine view.
     */
    showTestView() {
        this.hideAllViews();
        if (this.views.test) {
            this.views.test.classList.remove('hidden');
        }
        // Attempt to request full-screen mode to mimic official Bluebook testing environment
        try {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            }
        } catch (e) {
            console.log("Fullscreen request blocked or not supported.");
        }
    }

    /**
     * Displays the results and AI analytics view.
     */
    showResultsView() {
        this.hideAllViews();
        if (this.views.results) {
            this.views.results.classList.remove('hidden');
        }
        // Exit full-screen mode when viewing results
        try {
            if (document.exitFullscreen && document.fullscreenElement) {
                document.exitFullscreen();
            }
        } catch (e) {
            console.log("Exit fullscreen error.");
        }
    }

    /**
     * Binds global UI event listeners (file upload, timer toggle, navigation).
     */
    bindEvents() {
        // File Upload via Button
        const fileInput = document.getElementById('file-input');
        const uploadBtn = document.getElementById('upload-btn');
        const dropZone = document.getElementById('drop-zone');

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    await this.handleFileUpload(file);
                }
            });
        }

        // Drag and Drop Upload Support
        if (dropZone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    dropZone.classList.add('dragover');
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('dragover');
                }, false);
            });

            dropZone.addEventListener('drop', async (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files.length > 0 && files[0].type === 'application/pdf') {
                    await this.handleFileUpload(files[0]);
                } else {
                    alert("Please drop a valid PDF file.");
                }
            });
        }

        // Timer Hide/Show Toggle
        const hideTimeBtn = document.getElementById('hide-time-btn');
        const timeRemainingSpan = document.getElementById('time-remaining');
        if (hideTimeBtn && timeRemainingSpan) {
            hideTimeBtn.addEventListener('click', () => {
                if (timeRemainingSpan.style.visibility === 'hidden') {
                    timeRemainingSpan.style.visibility = 'visible';
                    hideTimeBtn.innerText = 'Hide';
                } else {
                    timeRemainingSpan.style.visibility = 'hidden';
                    hideTimeBtn.innerText = 'Show';
                }
            });
        }

        // Return to Dashboard from Results View
        const returnDashboardBtn = document.getElementById('return-dashboard-btn');
        if (returnDashboardBtn) {
            returnDashboardBtn.addEventListener('click', () => {
                this.showDashboard();
            });
        }
    }

    /**
     * Processes the uploaded PDF file and initiates the test engine.
     */
    async handleFileUpload(file) {
        if (file.type !== 'application/pdf') {
            alert("Only PDF files are supported.");
            return;
        }

        const statusDiv = document.getElementById('upload-status');
        if (statusDiv) statusDiv.classList.remove('hidden');

        try {
            // Call PDFProcessor from parser.js
            const parsedTest = await window.PDFProcessor.parseFile(file);
            
            if (statusDiv) statusDiv.classList.add('hidden');

            // Start test using TestEngineInstance from engine.js
            if (window.TestEngineInstance) {
                window.TestEngineInstance.startTest(parsedTest);
                this.showTestView();
            } else {
                alert("Test Engine failed to load properly.");
            }
        } catch (error) {
            console.error("Error parsing PDF:", error);
            if (statusDiv) statusDiv.classList.add('hidden');
            alert("An error occurred while parsing the PDF document.");
        }
    }
}

// Instantiate and attach globally so engine.js and html can reference it
window.UIControllerInstance = new UIController();
