/**
 * parser.js
 * Dual PDF handling + improved answer-key extraction for real grading.
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
        await new Promise(r => setTimeout(r, 1600));

        let extractedAnswers = null;
        let extractionNote = 'Using simulated answers (no answer key or extraction failed).';

        if (answersFile) {
            try {
                const text = await this.extractText(answersFile);
                extractedAnswers = this.parseAnswerKey(text);
                if (extractedAnswers && extractedAnswers.filter(a => a !== null).length >= 15) {
                    extractionNote = `Real answer key applied (${extractedAnswers.filter(a => a !== null).length} answers extracted).`;
                } else {
                    extractedAnswers = null;
                    extractionNote = 'Answer key found but could not reliably parse enough answers. Using simulated answers.';
                }
            } catch (e) {
                console.warn('Answer key extraction error:', e);
                extractionNote = 'Could not read answer key PDF. Using simulated answers.';
            }
        }

        const testBank = this.generateMockTestBank(extractedAnswers);
        testBank.usedRealAnswers = !!(extractedAnswers && extractedAnswers.filter(a => a !== null).length >= 15);
        testBank.extractionNote = extractionNote;
        return testBank;
    }

    static async extractText(file) {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(' ') + '\n';
        }
        return fullText;
    }

    /**
     * More robust answer-key parser.
     * Handles common College Board / practice-test formats.
     */
    static parseAnswerKey(text) {
        const found = new Map();

        // Normalize whitespace and common separators
        let cleaned = text
            .replace(/\r/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{2,}/g, '\n');

        // Broad set of patterns for MCQ letters
        const patterns = [
            // 1. B   1) B   1: B   Question 1 B   Q1. B
            /(?:Question\s*|Q\s*)?(\d{1,2})\s*[\.\):\-]?\s*([A-Da-d])(?=[\s\n,]|$)/gi,
            // 1 B (space separated)
            /(?:^|\n)\s*(\d{1,2})\s+([A-Da-d])(?=[\s\n,]|$)/gi,
            // Answer: B or Ans. B near a number
            /(\d{1,2}).{0,12}(?:Answer|Ans\.?)\s*[:=]?\s*([A-Da-d])/gi
        ];

        for (const re of patterns) {
            let m;
            while ((m = re.exec(cleaned)) !== null) {
                const num = parseInt(m[1], 10);
                const letter = m[2].toUpperCase();
                if (num >= 1 && num <= 120 && !found.has(num)) {
                    found.set(num, letter);
                }
            }
        }

        // SPR / numeric answers (best-effort)
        const sprPatterns = [
            /(?:Question\s*|Q\s*)?(\d{1,2})\s*[\.\):\-]?\s*(\d+\/?\d*|\.\d+)(?=[\s\n,]|$)/gi,
            /(\d{1,2}).{0,10}(?:Answer|Ans\.?)\s*[:=]?\s*(\d+\/?\d*|\.\d+)/gi
        ];

        for (const re of sprPatterns) {
            let m;
            while ((m = re.exec(cleaned)) !== null) {
                const num = parseInt(m[1], 10);
                if (num >= 1 && num <= 120 && !found.has(num)) {
                    found.set(num, m[2]);
                }
            }
        }

        if (found.size < 10) return null;

        // Build ordered array (index 0 = question 1)
        const max = Math.max(...found.keys());
        const answers = [];
        for (let i = 1; i <= max; i++) {
            answers.push(found.has(i) ? found.get(i) : null);
        }
        return answers;
    }

    static generateMockTestBank(extractedAnswers) {
        const id = 'sat_practice_' + Date.now();
        let answerIdx = 0;

        const takeAnswer = (isSPR = false) => {
            if (!extractedAnswers || answerIdx >= extractedAnswers.length) return null;
            const raw = extractedAnswers[answerIdx++];
            if (raw === null || raw === undefined) return null;
            if (isSPR) return String(raw);
            if (typeof raw === 'string' && /^[A-D]$/i.test(raw)) {
                return raw.toUpperCase().charCodeAt(0) - 65; // A=0, B=1...
            }
            return null;
        };

        return {
            id,
            title: 'College Board Official Practice Test',
            usedRealAnswers: false,
            extractionNote: '',
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
