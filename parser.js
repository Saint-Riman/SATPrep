/**
 * parser.js
 * Dual PDF handling + real question/option extraction tuned for
 * official College Board digital SAT practice-test PDFs.
 *
 * The key fix: correctly split the short "A) word  B) word ..." options
 * that appear after "Which choice completes the text..." so the UI no
 * longer falls back to the four mock distractor strings.
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
        await new Promise(r => setTimeout(r, 600));

        let extractedAnswers = null;
        let extractionNote = 'Using simulated answers (no answer key or extraction failed).';
        let realQuestions = null;

        // ---- 1. Answer key ----
        if (answersFile) {
            try {
                const text = await this.extractText(answersFile);
                extractedAnswers = this.parseAnswerKey(text);
                const count = extractedAnswers ? extractedAnswers.filter(a => a !== null).length : 0;
                if (count >= 15) {
                    extractionNote = `Real answer key applied (${count} answers extracted).`;
                } else {
                    extractedAnswers = null;
                    extractionNote = 'Answer key found but could not reliably parse enough answers. Using simulated answers.';
                }
            } catch (e) {
                console.warn('Answer key extraction error:', e);
                extractionNote = 'Could not read answer key PDF. Using simulated answers.';
            }
        }

        // ---- 2. Questions + real options ----
        try {
            const qText = await this.extractText(questionsFile);
            realQuestions = this.parseQuestionsFromText(qText);
            if (realQuestions && realQuestions.length >= 15) {
                const withOpts = realQuestions.filter(q => q.options && q.options.length === 4).length;
                extractionNote += ` Extracted ${realQuestions.length} questions (${withOpts} with real A/B/C/D options).`;
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
        testBank.usedRealQuestions = !!(realQuestions && realQuestions.length >= 15);
        testBank.extractionNote = extractionNote;
        console.log('[SATPrep]', extractionNote);
        return testBank;
    }

    static async extractText(file) {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            // Keep a space between items; later cleaners collapse runs
            fullText += content.items.map(item => item.str).join(' ') + '\n';
        }
        return fullText;
    }

    /* ------------------------------------------------------------------ */
    /*  Answer-key parser ("QUESTION 1  Choice B is the best answer...")  */
    /* ------------------------------------------------------------------ */
    static parseAnswerKey(text) {
        const found = new Map();
        let cleaned = text
            .replace(/\r/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{2,}/g, '\n');

        // Primary pattern used by College Board answer explanations:
        //   QUESTION 1
        //   Choice B is the best answer because...
        const primary = /QUESTION\s*(\d{1,2})\s*[\s\S]{0,40}?Choice\s*([A-Da-d])\s+is\s+the\s+best\s+answer/gi;
        let m;
        while ((m = primary.exec(cleaned)) !== null) {
            const num = parseInt(m[1], 10);
            if (num >= 1 && num <= 120 && !found.has(num)) {
                found.set(num, m[2].toUpperCase());
            }
        }

        // Fallbacks for other formats
        const fallbacks = [
            /(?:Question\s*|Q\s*)?(\d{1,2})\s*[\.\):\-]?\s*([A-Da-d])(?=[\s\n,]|$)/gi,
            /(?:^|\n)\s*(\d{1,2})\s+([A-Da-d])(?=[\s\n,]|$)/gi,
            /(\d{1,2}).{0,12}(?:Answer|Ans\.?)\s*[:=]?\s*([A-Da-d])/gi
        ];
        for (const re of fallbacks) {
            while ((m = re.exec(cleaned)) !== null) {
                const num = parseInt(m[1], 10);
                if (num >= 1 && num <= 120 && !found.has(num)) {
                    found.set(num, m[2].toUpperCase());
                }
            }
        }

        // SPR / numeric
        const spr = [
            /(?:Question\s*|Q\s*)?(\d{1,2})\s*[\.\):\-]?\s*(\d+\/?\d*|\.\d+)(?=[\s\n,]|$)/gi,
            /(\d{1,2}).{0,10}(?:Answer|Ans\.?)\s*[:=]?\s*(\d+\/?\d*|\.\d+)/gi
        ];
        for (const re of spr) {
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

    /* ------------------------------------------------------------------ */
    /*  Question + option extractor (tuned for digital SAT PDFs)          */
    /* ------------------------------------------------------------------ */
    static parseQuestionsFromText(rawText) {
        if (!rawText || rawText.length < 300) return null;

        // Collapse whitespace but keep a single space so option markers stay intact
        let text = rawText
            .replace(/\r/g, '\n')
            .replace(/[ \t\u00A0]+/g, ' ')
            .replace(/\n{2,}/g, '\n')
            .trim();

        // Remove common footer / header noise that confuses the splitter
        text = text
            .replace(/Unauthorized copying or reuse of any part of this page is illegal\.?/gi, ' ')
            .replace(/CO\s*NTI\s*N\s*U\s*E/gi, ' ')
            .replace(/Module\s*\d+/gi, ' ')
            .replace(/\.{10,}/g, ' ');

        const questions = [];

        // Strategy 1 – look for the characteristic digital-SAT prompt that almost always
        // precedes the four options. This is far more reliable than pure numbering.
        const promptRe = /Which choice (?:completes the text with the most logical and precise word or phrase|best (?:states|describes|completes|illustrates|supports|uses data|most effectively|most accurately|most logically)[^.?]{0,80}\?)/gi;

        // Also catch the numbered starts that appear in the two-column layout
        const numberStarts = [];
        const numRe = /(?:^|\n|\s)(\d{1,2})\s+(?=[A-Z“"])/g;
        let m;
        while ((m = numRe.exec(text)) !== null) {
            const num = parseInt(m[1], 10);
            if (num >= 1 && num <= 40) {
                numberStarts.push({ index: m.index + m[0].indexOf(m[1]), num });
            }
        }

        // Build candidate blocks around each number start
        for (let i = 0; i < numberStarts.length; i++) {
            const start = numberStarts[i];
            const end = i + 1 < numberStarts.length ? numberStarts[i + 1].index : Math.min(start.index + 1800, text.length);
            let block = text.slice(start.index, end).trim();

            // Strip the leading number itself
            block = block.replace(/^\d{1,2}\s+/, '');

            if (block.length < 30) continue;

            const { stem, options } = this.splitStemAndOptions(block);

            if (!stem || stem.length < 15) continue;

            const isMCQ = options && options.length === 4 && options.every(o => o.length > 0);

            questions.push({
                number: start.num,
                text: stem,
                options: isMCQ ? options : null,
                type: isMCQ ? 'MCQ' : 'SPR',
                domain: null,
                tag: null
            });
        }

        // Deduplicate (keep first occurrence of each number)
        const seen = new Set();
        const unique = [];
        for (const q of questions) {
            if (!seen.has(q.number)) {
                seen.add(q.number);
                unique.push(q);
            }
        }

        // Prefer questions that actually got real options
        const withOptions = unique.filter(q => q.options && q.options.length === 4);
        if (withOptions.length >= 12) return withOptions;
        if (unique.length >= 15) return unique;
        return null;
    }

    /**
     * Split a question block into stem + four options.
     * Handles the exact short-option format produced by pdf.js on digital SAT PDFs:
     *   ... phrase? A) attached B) collected C) followed D) replaced
     * as well as longer multi-word options.
     */
    static splitStemAndOptions(block) {
        // Primary pattern – the four options appear as A) ... B) ... C) ... D) ...
        // We look for the *last* clean A-B-C-D sequence in the block (options are at the end).
        const optionMarker = /\s([A-D])\)\s*/g;
        const markers = [];
        let m;
        while ((m = optionMarker.exec(block)) !== null) {
            markers.push({
                letter: m[1].toUpperCase(),
                index: m.index,
                matchLen: m[0].length
            });
        }

        // Find the rightmost A-B-C-D run
        for (let i = markers.length - 4; i >= 0; i--) {
            const a = markers[i], b = markers[i+1], c = markers[i+2], d = markers[i+3];
            if (a.letter === 'A' && b.letter === 'B' && c.letter === 'C' && d.letter === 'D') {
                const stem = block.slice(0, a.index).trim();
                // Clean trailing prompt fragments that sometimes stick to the stem
                const cleanStem = stem
                    .replace(/\s*Which choice (?:completes the text with the most logical and precise word or phrase|best [^.?]{0,90})\??\s*$/i, '')
                    .trim();

                const optA = block.slice(a.index + a.matchLen, b.index).trim();
                const optB = block.slice(b.index + b.matchLen, c.index).trim();
                const optC = block.slice(c.index + c.matchLen, d.index).trim();
                let optD = block.slice(d.index + d.matchLen).trim();

                // Trim any trailing page noise from the last option
                optD = optD
                    .replace(/\s*Unauthorized copying.*$/i, '')
                    .replace(/\s*CO\s*NTI\s*N\s*U\s*E.*$/i, '')
                    .replace(/\s*\d{1,3}\s*$/, '')
                    .trim();

                if (optA.length >= 1 && optB.length >= 1 && optC.length >= 1 && optD.length >= 1) {
                    return {
                        stem: cleanStem || stem,
                        options: [optA, optB, optC, optD]
                    };
                }
            }
        }

        // Secondary pattern – A. B. C. D.
        const dotMarker = /\s([A-D])\.\s+/g;
        const dots = [];
        while ((m = dotMarker.exec(block)) !== null) {
            dots.push({ letter: m[1].toUpperCase(), index: m.index, matchLen: m[0].length });
        }
        for (let i = dots.length - 4; i >= 0; i--) {
            const a = dots[i], b = dots[i+1], c = dots[i+2], d = dots[i+3];
            if (a.letter === 'A' && b.letter === 'B' && c.letter === 'C' && d.letter === 'D') {
                const stem = block.slice(0, a.index).trim();
                const optA = block.slice(a.index + a.matchLen, b.index).trim();
                const optB = block.slice(b.index + b.matchLen, c.index).trim();
                const optC = block.slice(c.index + c.matchLen, d.index).trim();
                const optD = block.slice(d.index + d.matchLen).trim()
                    .replace(/\s*Unauthorized copying.*$/i, '')
                    .trim();
                if (optA && optB && optC && optD) {
                    return { stem, options: [optA, optB, optC, optD] };
                }
            }
        }

        // Aggressive fallback – split on the four markers even if spacing is irregular
        const aggressive = block.split(/\s+(?=[A-D]\)\s*)/);
        if (aggressive.length >= 5) {
            const stem = aggressive[0].trim()
                .replace(/\s*Which choice (?:completes the text with the most logical and precise word or phrase|best [^.?]{0,90})\??\s*$/i, '')
                .trim();
            const opts = aggressive.slice(1, 5).map(s =>
                s.replace(/^[A-D]\)\s*/, '').replace(/\s*Unauthorized copying.*$/i, '').trim()
            );
            if (opts.every(o => o.length >= 1)) {
                return { stem, options: opts };
            }
        }

        // No options found
        return { stem: block.trim(), options: null };
    }

    /* ------------------------------------------------------------------ */
    /*  Build the adaptive test bank                                      */
    /* ------------------------------------------------------------------ */
    static generateTestBank(extractedAnswers, realQuestions) {
        const id = 'sat_practice_' + Date.now();
        let answerIdx = 0;

        const takeAnswer = (isSPR = false) => {
            if (!extractedAnswers || answerIdx >= extractedAnswers.length) return null;
            const raw = extractedAnswers[answerIdx++];
            if (raw === null || raw === undefined) return null;
            if (isSPR) return String(raw);
            if (typeof raw === 'string' && /^[A-D]$/i.test(raw)) {
                return raw.toUpperCase().charCodeAt(0) - 65;
            }
            return null;
        };

        if (realQuestions && realQuestions.length >= 15) {
            return this.buildBankFromReal(realQuestions, takeAnswer, id);
        }

        // Pure mock fallback
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

    static buildBankFromReal(realQs, takeAnswerFn, id) {
        const mathKeywords = /equation|solve|function|graph|triangle|angle|ratio|percent|probability|volume|area|linear|quadratic|x\s*=|y\s*=|\d+\s*[\+\-\*\/]|ablation|mycorrhizal|organic farms/i;

        const rwPool = [];
        const mathPool = [];

        realQs.forEach(q => {
            if (mathKeywords.test(q.text) || (q.options && q.options.some(o => /^[\d\.\/]+$/.test(o.trim())))) {
                mathPool.push(q);
            } else {
                rwPool.push(q);
            }
        });

        const ensureCount = (pool, type, needed) => {
            const copy = [...pool];
            while (copy.length < needed) {
                const mock = this.generateQuestions(1, type, 'mixed', () => null)[0];
                copy.push(mock);
            }
            return copy.slice(0, needed);
        };

        const makeModule = (pool, type, count, difficulty) => {
            const selected = ensureCount(pool, type, count);
            return selected.map((raw, idx) => {
                const domainList = SAT_DOMAINS[type].domains;
                const domain = domainList[idx % domainList.length];
                const tagsList = SAT_DOMAINS[type].tags[domain];
                const tag = tagsList[Math.floor(Math.random() * tagsList.length)];

                const isSPR = raw.type === 'SPR' || (type === 'MATH' && !raw.options);
                let correct = takeAnswerFn ? takeAnswerFn(isSPR) : null;

                // Prefer the real options when we successfully extracted them
                let options = null;
                if (!isSPR) {
                    if (raw.options && raw.options.length === 4) {
                        options = raw.options;
                    } else {
                        // Only fall back to mock distractors if extraction truly failed
                        options = [
                            'A distractor that is close but incomplete.',
                            'The option that best aligns with the passage evidence.',
                            'A choice that overgeneralizes beyond the text.',
                            'An extreme claim not supported by the passage.'
                        ];
                    }
                }

                const q = {
                    id: `${type}_${difficulty}_${idx + 1}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    number: idx + 1,
                    domain,
                    tag,
                    difficulty,
                    type: isSPR ? 'SPR' : 'MCQ',
                    correctAnswer: correct,
                    passage: type === 'RW' ? (raw.passage || null) : null,
                    text: raw.text || `Question about ${tag}`,
                    options
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
