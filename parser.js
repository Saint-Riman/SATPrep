/**
 * parser.js
 * Handles dual PDF upload, answer-key extraction, and mock adaptive test generation.
 * When an answer key is provided we extract numbered answers and apply them for real grading.
 */

const SAT_DOMAINS = {
    RW: {
        domains: ["Information and Ideas", "Craft and Structure", "Expression of Ideas", "Standard English Conventions"],
        tags: {
            "Information and Ideas": ["Textual Evidence", "Central Ideas and Details", "Quantitative Evidence"],
            "Craft and Structure": ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"],
            "Expression of Ideas": ["Transitions", "Rhetorical Synthesis"],
            "Standard English Conventions": ["Boundaries", "Form, Structure, and Sense"]
        }
    },
    MATH: {
        domains: ["Algebra", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"],
        tags: {
            "Algebra": ["Linear equations in one variable", "Linear functions", "Systems of two linear equations"],
            "Advanced Math": ["Nonlinear functions", "Equivalent expressions", "Nonlinear equations"],
            "Problem-Solving and Data Analysis": ["Ratios, rates, proportional relationships", "Two-variable data", "Probability"],
            "Geometry and Trigonometry": ["Area and volume", "Lines, angles, and triangles", "Right triangles and trigonometry"]
        }
    }
};

class PDFProcessor {
    static async parseFiles(questionsFile, answersFile = null) {
        // Simulate realistic processing time
        await new Promise(r => setTimeout(r, 1800));

        let extractedAnswers = null;
        if (answersFile) {
            try {
                const text = await this.extractText(answersFile);
                extractedAnswers = this.parseAnswerKey(text);
                console.log('Extracted answers count:', extractedAnswers ? extractedAnswers.length : 0);
            } catch (e) {
                console.warn('Answer key extraction failed, falling back to mock answers.', e);
            }
        }

        const testBank = this.generateMockTestBank(extractedAnswers);
        testBank.usedRealAnswers = !!(extractedAnswers && extractedAnswers.length >= 20);
        return testBank;
    }

    static async extractText(file) {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        return fullText;
    }

    /**
     * Heuristic answer-key parser.
     * Looks for common patterns: 1. B, 1) C, Question 1: A, 1 B, etc.
     * Also captures simple numeric / fraction SPR answers.
     */
    static parseAnswerKey(text) {
        const answers = [];
        // Normalize
        const cleaned = text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ');

        // Pattern set for MCQ letters
        const mcqPatterns = [
            /(?:^|\n|\s)(?:Question\s*)?(\d{1,2})[\.\):\s]+([A-Da-d])(?:\s|$)/gi,
            /(?:^|\n)(\d{1,2})\s*\.\s*([A-Da-d])(?:\s|$)/gi,
            /(?:^|\n)(\d{1,2})\s+([A-Da-d])(?:\s|$)/gi
        ];

        const found = new Map(); // number -> answer

        for (const re of mcqPatterns) {
            let match;
            while ((match = re.exec(cleaned)) !== null) {
                const num = parseInt(match[1], 10);
                const letter = match[2].toUpperCase();
                if (num >= 1 && num <= 100 && !found.has(num)) {
                    found.set(num, letter);
                }
            }
        }

        // Simple SPR numeric capture near numbers (best-effort)
        const sprRe = /(?:^|\n|\s)(?:Question\s*)?(\d{1,2})[\.\):\s]+(\d+\/?\d*|\.\d+)(?:\s|$)/gi;
        let sprMatch;
        while ((sprMatch = sprRe.exec(cleaned)) !== null) {
            const num = parseInt(sprMatch[1], 10);
            if (num >= 1 && num <= 100 && !found.has(num)) {
                found.set(num, sprMatch[2]);
            }
        }

        // Convert to ordered array (1-based index becomes 0-based later)
        const maxNum = Math.max(...found.keys(), 0);
        for (let i = 1; i <= maxNum; i++) {
            answers.push(found.has(i) ? found.get(i) : null);
        }
        return answers.filter(a => a !== null).length >= 10 ? answers : null;
    }

    static generateMockTestBank(extractedAnswers) {
        const id = 'sat_practice_' + Date.now();
        let answerIdx = 0;

        const takeAnswer = (isSPR = false) => {
            if (!extractedAnswers || answerIdx >= extractedAnswers.length) {
                return null; // will use mock later
            }
            const raw = extractedAnswers[answerIdx++];
            if (raw === null || raw === undefined) return null;
            if (isSPR) return String(raw);
            // letter -> index
            if (typeof raw === 'string' && /^[A-D]$/i.test(raw)) {
                return raw.toUpperCase().charCodeAt(0) - 65;
            }
            return null;
        };

        return {
            id,
            title: 'College Board Official Practice Test',
            usedRealAnswers: false,
            sections: {
                RW: {
                    module1: this.generateQuestions(27, 'RW', 'mixed', takeAnswer),
                    module2Easy: this.generateQuestions(27, 'RW', 'easy', takeAnswer),
                    module2Hard: this.generateQuestions(27, 'RW', 'hard', takeAnswer)
                },
                MATH: {
                    module1: this.generateQuestions(22, 'MATH', 'mixed', takeAnswer),
                    module2Easy: this.generateQuestions(22, 'MATH', 'easy', takeAnswer),
                    module2Hard: this.generateQuestions(22, 'MATH', 'hard', takeAnswer)
                }
            }
        };
    }

    static generateQuestions(count, type, difficulty, takeAnswerFn) {
        const questions = [];
        const domainList = SAT_DOMAINS[type].domains;

        for (let i = 1; i <= count; i++) {
            const domain = domainList[i % domainList.length];
            const tagsList = SAT_DOMAINS[type].tags[domain];
            const tag = tagsList[Math.floor(Math.random() * tagsList.length)];
            const isSPR = type === 'MATH' && Math.random() > 0.78;
            const qType = isSPR ? 'SPR' : 'MCQ';

            let correct = takeAnswerFn ? takeAnswerFn(isSPR) : null;

            const q = {
                id: `${type}_${difficulty}_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                number: i,
                domain,
                tag,
                difficulty,
                type: qType,
                correctAnswer: correct,
                passage: null,
                text: null,
                options: null
            };

            if (type === 'RW') {
                q.passage = this.generateMockPassage(domain);
                q.text = `Which choice best completes the text or answers the question? (Focus: ${tag})`;
                q.options = [
                    'A distractor that is close but incomplete.',
                    'The option that best aligns with the passage evidence.',
                    'A choice that overgeneralizes beyond the text.',
                    'An extreme claim not supported by the passage.'
                ];
                if (q.correctAnswer === null) q.correctAnswer = 1;
            } else {
                q.text = `Solve the problem involving ${tag}. (Simulated ${difficulty} difficulty)`;
                if (qType === 'MCQ') {
                    q.options = ['12', '15', '18', '24'];
                    if (q.correctAnswer === null) q.correctAnswer = 2;
                } else {
                    if (q.correctAnswer === null) q.correctAnswer = '18';
                }
            }

            questions.push(q);
        }
        return questions;
    }

    static generateMockPassage(domain) {
        const passages = {
            'Information and Ideas': 'In a recent ecological study, researchers observed the foraging behaviors of the local bee population. They hypothesized that the bees would prefer the native wildflowers over the introduced species. However, data collected over a three-month period showed that 68% of the foraging time was spent on the introduced species. The researchers concluded that the higher nectar density of the introduced plants drove this unexpected preference.',
            'Craft and Structure': 'The architect\'s approach to the new civic center was highly unorthodox. While her contemporaries relied on brutalist concrete blocks, she favored a more porous design, utilizing glass and lightweight steel. This design choice was not merely aesthetic; it was a deliberate attempt to foster a sense of transparency and accessibility within local government.',
            'Expression of Ideas': 'While historical records often focus on the grand achievements of monarchs, the daily ledgers of merchants provide a more accurate picture of the era\'s economic realities. These documents reveal that inflation and supply chain disruptions were common, profoundly affecting the lives of ordinary citizens in ways that royal decrees rarely acknowledge.',
            'Standard English Conventions': 'The committee, after reviewing dozens of proposals and consulting with community leaders, finally selected a design that balanced aesthetic appeal with practical considerations for accessibility and sustainability.'
        };
        return passages[domain] || passages['Information and Ideas'];
    }
}

window.PDFProcessor = PDFProcessor;
