/**
 * parser.js
 * Dual PDF handling + real question/option extraction + improved answer-key extraction.
 *
 * Key fix: Questions PDF is now actually parsed. Options that arrive
 * "bundled" inside the question stem are split out with multiple
 * robust patterns so the UI can display A/B/C/D choices correctly.
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
        await new Promise(r => setTimeout(r, 800)); // small UX delay

        let extractedAnswers = null;
        let extractionNote = 'Using simulated answers (no answer key or extraction failed).';
        let realQuestions = null;

        // ---- 1. Extract answer key (if provided) ----
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

        // ---- 2. Extract real questions + options from Questions PDF ----
        try {
            const qText = await this.extractText(questionsFile);
            realQuestions = this.parseQuestionsFromText(qText);
            if (realQuestions && realQuestions.length >= 20) {
                extractionNote += ` Extracted ${realQuestions.length} real questions from the Questions PDF.`;
            } else {
                realQuestions = null;
                extractionNote += ' Could not extract enough structured questions; falling back to simulated bank.';
            }
        } catch (e) {
            console.warn('Questions PDF extraction error:', e);
            realQuestions = null;
            extractionNote += ' Questions PDF could not be read; using simulated bank.';
        }

        const testBank = this.generateTestBank(extractedAnswers, realQuestions);
        testBank.usedRealAnswers = !!(extractedAnswers && extractedAnswers.filter(a => a !== null).length >= 15);
        testBank.usedRealQuestions = !!(realQuestions && realQuestions.length >= 20);
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
            // Join with space; later cleaners handle extra whitespace
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

        let cleaned = text
            .replace(/\r/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{2,}/g, '\n');

        const patterns = [
            /(?:Question\s*|Q\s*)?(\d{1,2})\s*[\.\):\-]?\s*([A-Da-d])(?=[\s\n,]|$)/gi,
            /(?:^|\n)\s*(\d{1,2})\s+([A-Da-d])(?=[\s\n,]|$)/gi,
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

        const max = Math.max(...found.keys());
        const answers = [];
        for (let i = 1; i <= max; i++) {
            answers.push(found.has(i) ? found.get(i) : null);
        }
        return answers;
    }

    /**
     * Extract questions + options from the full Questions PDF text.
     * Handles the common case where the stem and the four options arrive
     * as one continuous block of text ("bundled").
     */
    static parseQuestionsFromText(rawText) {
        if (!rawText || rawText.length < 200) return null;

        // Normalize whitespace while preserving paragraph-ish breaks
        let text = rawText
            .replace(/\r/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        const questions = [];

        // Split candidate blocks that look like numbered questions
        // Patterns: "1. ", "1) ", "Question 1", "Q1.", etc.
        const blockRegex = /(?:^|\n)\s*(?:Question\s*|Q\s*)?(\d{1,2})\s*[\.\)]\s+/gi;
        const starts = [];
        let m;
        while ((m = blockRegex.exec(text)) !== null) {
            starts.push({ index: m.index, num: parseInt(m[1], 10), matchLen: m[0].length });
        }

        if (starts.length < 10) {
            // Fallback: look for lines that begin with a number followed by a capital letter (common in some extracts)
            const altRegex = /(?:^|\n)\s*(\d{1,2})\s+([A-Z])/g;
            starts.length = 0;
            while ((m = altRegex.exec(text)) !== null) {
                starts.push({ index: m.index, num: parseInt(m[1], 10), matchLen: m[0].length - 1 });
            }
        }

        if (starts.length < 8) return null;

        for (let i = 0; i < starts.length; i++) {
            const start = starts[i];
            const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
            let block = text.slice(start.index + start.matchLen, end).trim();

            if (block.length < 20) continue;

            // ---- Split stem from options (the "bundled" case) ----
            const { stem, options } = this.splitStemAndOptions(block);

            if (!stem || stem.length < 10) continue;

            const isMCQ = options && options.length === 4;
            const isSPR = !isMCQ; // treat as student-produced response if we cannot find 4 clean options

            questions.push({
                number: start.num,
                text: stem,
                options: isMCQ ? options : null,
                type: isMCQ ? 'MCQ' : 'SPR',
                // domain/tag will be assigned later by the bank builder
                domain: null,
                tag: null
            });
        }

        // Deduplicate by number (keep first occurrence)
        const seen = new Set();
        const unique = [];
        for (const q of questions) {
            if (!seen.has(q.number) && q.number >= 1 && q.number <= 80) {
                seen.add(q.number);
                unique.push(q);
            }
        }

        return unique.length >= 15 ? unique : null;
    }

    /**
     * Core splitter: given a block that may contain the stem + A/B/C/D
     * all smashed together, pull the four options out cleanly.
     */
    static splitStemAndOptions(block) {
        // Common option markers after PDF text extraction
        const optionStartPatterns = [
            /\s([A-D])\)\s+/g,           // A)  B)  C)  D)
            /\s([A-D])\.\s+/g,           // A.  B.  C.  D.
            /\s\(([A-D])\)\s+/g,         // (A) (B) (C) (D)
            /\s([A-D])\s{2,}/g,          // A   B   (double space)
            /\n\s*([A-D])[\.\)]\s+/g     // newline + A. or A)
        ];

        let best = null;

        for (const re of optionStartPatterns) {
            const matches = [];
            let m;
            // Reset lastIndex
            re.lastIndex = 0;
            while ((m = re.exec(block)) !== null) {
                matches.push({
                    letter: m[1].toUpperCase(),
                    index: m.index,
                    fullMatch: m[0],
                    matchLen: m[0].length
                });
            }

            // We need exactly the sequence A B C D (or at least 4 consecutive letters)
            if (matches.length >= 4) {
                // Find the first run of A-B-C-D
                for (let i = 0; i <= matches.length - 4; i++) {
                    const a = matches[i], b = matches[i+1], c = matches[i+2], d = matches[i+3];
                    if (a.letter === 'A' && b.letter === 'B' && c.letter === 'C' && d.letter === 'D') {
                        const stem = block.slice(0, a.index).trim();
                        const optA = block.slice(a.index + a.matchLen, b.index).trim();
                        const optB = block.slice(b.index + b.matchLen, c.index).trim();
                        const optC = block.slice(c.index + c.matchLen, d.index).trim();
                        const optD = block.slice(d.index + d.matchLen).trim();

                        // Basic quality check – each option should have some text
                        if (optA.length > 1 && optB.length > 1 && optC.length > 1 && optD.length > 1) {
                            best = {
                                stem: stem || '(Question stem could not be cleanly separated)',
                                options: [optA, optB, optC, optD]
                            };
                            break;
                        }
                    }
                }
            }
            if (best) break;
        }

        // Fallback: try a more aggressive split on "A) " style even if letters are not perfectly sequential
        if (!best) {
            const aggressive = block.split(/\s(?=[A-D][\.\)]\s)/);
            if (aggressive.length >= 5) {
                // first piece is stem, next four are options
                const stem = aggressive[0].trim();
                const opts = aggressive.slice(1, 5).map(s => s.replace(/^[A-D][\.\)]\s*/, '').trim());
                if (opts.every(o => o.length > 1)) {
                    best = { stem, options: opts };
                }
            }
        }

        if (best) return best;

        // No clean options found → treat whole block as stem (SPR or later fallback)
        return { stem: block.trim(), options: null };
    }

    static generateTestBank(extractedAnswers, realQuestions) {
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

        // Prefer real questions when we have them; otherwise pure mock
        if (realQuestions && realQuestions.length >= 20) {
            return this.buildBankFromReal(realQuestions, takeAnswer, id);
        }

        // Classic mock path
        return {
            id,
            title: 'College Board Official Practice Test (Simulated Content)',
            usedRealAnswers: false,
            usedRealQuestions: false,
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

    /**
     * Build adaptive modules from the questions we successfully extracted.
     * We still assign domains/tags randomly (or by simple heuristics) because
     * full domain classification from raw PDF text is unreliable without an LLM.
     */
    static buildBankFromReal(realQs, takeAnswerFn, id) {
        // Separate roughly into RW-ish vs Math-ish by looking for math keywords
        const mathKeywords = /equation|solve|function|graph|triangle|angle|ratio|percent|probability|volume|area|linear|quadratic|x\s*=|y\s*=|\d+\s*[\+\-\*\/]/i;

        const rwPool = [];
        const mathPool = [];

        realQs.forEach(q => {
            if (mathKeywords.test(q.text) || (q.options && q.options.some(o => /^\d+(\.\d+)?$/.test(o.trim())))) {
                mathPool.push(q);
            } else {
                rwPool.push(q);
            }
        });

        // Ensure we have enough; pad with generated questions if necessary
        const ensureCount = (pool, type, needed) => {
            while (pool.length < needed) {
                const mock = this.generateQuestions(1, type, 'mixed', () => null)[0];
                pool.push(mock);
            }
            return pool.slice(0, needed);
        };

        const makeModule = (pool, type, count, difficulty) => {
            const selected = ensureCount([...pool], type, count);
            return selected.map((raw, idx) => {
                const domainList = SAT_DOMAINS[type].domains;
                const domain = domainList[idx % domainList.length];
                const tagsList = SAT_DOMAINS[type].tags[domain];
                const tag = tagsList[Math.floor(Math.random() * tagsList.length)];

                const isSPR = raw.type === 'SPR' || (type === 'MATH' && !raw.options);
                let correct = takeAnswerFn ? takeAnswerFn(isSPR) : null;

                const q = {
                    id: `${type}_${difficulty}_${idx + 1}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    number: idx + 1,
                    domain,
                    tag,
                    difficulty,
                    type: isSPR ? 'SPR' : 'MCQ',
                    correctAnswer: correct,
                    passage: type === 'RW' ? (raw.passage || this.generateMockPassage(domain)) : null,
                    text: raw.text || `Question about ${tag}`,
                    options: isSPR ? null : (raw.options || [
                        'A distractor that is close but incomplete.',
                        'The option that best aligns with the passage evidence.',
                        'A choice that overgeneralizes beyond the text.',
                        'An extreme claim not supported by the passage.'
                    ])
                };

                if (q.correctAnswer === null) {
                    q.correctAnswer = isSPR ? '18' : 1;
                }
                return q;
            });
        };

        return {
            id,
            title: 'College Board Official Practice Test (Extracted Content)',
            usedRealAnswers: false,
            usedRealQuestions: true,
            extractionNote: '',
            sections: {
                RW: {
                    module1: makeModule(rwPool, 'RW', 27, 'mixed'),
                    module2Easy: makeModule(rwPool, 'RW', 27, 'easy'),
                    module2Hard: makeModule(rwPool, 'RW', 27, 'hard')
                },
                MATH: {
                    module1: makeModule(mathPool, 'MATH', 22, 'mixed'),
                    module2Easy: makeModule(mathPool, 'MATH', 22, 'easy'),
                    module2Hard: makeModule(mathPool, 'MATH', 22, 'hard')
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
