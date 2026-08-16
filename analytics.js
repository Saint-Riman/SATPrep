/**
 * analytics.js
 * Scoring, deeper skill tracking, timer analytics, question review + explanations.
 */

const EXPERT_TIPS = {
    "Textual Evidence": "Lock in what the claim needs, then find the quote that directly supports it with no extra assumptions. If a choice requires inference the text never makes, eliminate it.",
    "Words in Context": "Cover the blank, put your own simple word in, then match the choice that has the same precise meaning and connotation.",
    "Transitions": "Cover the transition. Read the sentence before and after. Decide the relationship (continue, contrast, cause-effect, example) and pick the word that matches.",
    "Central Ideas and Details": "Identify the main point of the whole passage first. Wrong answers often zoom in on a true but minor detail.",
    "Cross-Text Connections": "Decide how the two passages relate (agree, disagree, illustrate). Evaluate every choice against that relationship.",
    "Advanced Math": "Graph when possible. When rewriting, keep structure intact and check by plugging in a simple number.",
    "Linear equations in one variable": "Isolate carefully, then plug your answer back into the original equation. Sign and distribution errors are the most common traps.",
    "Nonlinear equations": "Factor, substitute, or graph. Graphing both sides quickly shows the number of solutions.",
    "Ratios, rates, proportional relationships": "Set up the proportion with consistent units. Write the units next to every number.",
    "Boundaries": "Read the sentence in your head. Independent clauses need more than a single comma."
};

const DOMAIN_FOR_TAG = {
    "Textual Evidence": "Information and Ideas",
    "Central Ideas and Details": "Information and Ideas",
    "Quantitative Evidence": "Information and Ideas",
    "Words in Context": "Craft and Structure",
    "Text Structure and Purpose": "Craft and Structure",
    "Cross-Text Connections": "Craft and Structure",
    "Transitions": "Expression of Ideas",
    "Rhetorical Synthesis": "Expression of Ideas",
    "Boundaries": "Standard English Conventions",
    "Form, Structure, and Sense": "Standard English Conventions",
    "Linear equations in one variable": "Algebra",
    "Linear functions": "Algebra",
    "Systems of two linear equations": "Algebra",
    "Nonlinear functions": "Advanced Math",
    "Equivalent expressions": "Advanced Math",
    "Nonlinear equations": "Advanced Math",
    "Ratios, rates, proportional relationships": "Problem-Solving and Data Analysis",
    "Two-variable data": "Problem-Solving and Data Analysis",
    "Probability": "Problem-Solving and Data Analysis",
    "Area and volume": "Geometry and Trigonometry",
    "Lines, angles, and triangles": "Geometry and Trigonometry",
    "Right triangles and trigonometry": "Geometry and Trigonometry"
};

class AnalyticsEngine {
    static calculateScore(testData, userResponses) {
        const scoreSection = (sectionKey) => {
            const m1Qs = testData.sections[sectionKey].module1;
            const m1Resp = userResponses[sectionKey].module1;
            let m1Correct = 0;
            m1Qs.forEach(q => { if (this.isCorrect(q, m1Resp[q.id])) m1Correct++; });
            const m1Percent = m1Qs.length ? m1Correct / m1Qs.length : 0;

            const isHard = m1Percent >= 0.60;
            const m2Qs = isHard ? testData.sections[sectionKey].module2Hard : testData.sections[sectionKey].module2Easy;
            const m2Resp = userResponses[sectionKey].module2;
            let m2Correct = 0;
            m2Qs.forEach(q => { if (this.isCorrect(q, m2Resp[q.id])) m2Correct++; });
            const m2Percent = m2Qs.length ? m2Correct / m2Qs.length : 0;

            let score = 200;
            if (isHard) score = 400 + (m1Percent * 200) + (m2Percent * 200);
            else score = 200 + (m1Percent * 200) + (m2Percent * 180);
            return Math.min(800, Math.max(200, Math.round(score / 10) * 10));
        };

        const rw = scoreSection('RW');
        const math = scoreSection('MATH');
        return { rw, math, total: rw + math };
    }

    static isCorrect(q, response) {
        if (response === undefined || response === null || response === '') return false;
        if (q.type === 'SPR') {
            const normalize = (v) => String(v).trim().replace(/\s+/g, '').replace(/^0+/, '') || '0';
            return normalize(response) === normalize(q.correctAnswer);
        }
        return response == q.correctAnswer;
    }

    static formatAnswer(q, value) {
        if (value === undefined || value === null || value === '') return '—';
        if (q.type === 'MCQ') {
            const letters = ['A', 'B', 'C', 'D'];
            return letters[value] || String(value);
        }
        return String(value);
    }

    static getExplanation(q, isCorrect) {
        const tip = EXPERT_TIPS[q.tag] || 'Review the core concept for this skill and practice similar timed questions.';
        if (isCorrect) {
            return `You got this right. Key skill: ${q.tag}. ${tip}`;
        }
        return `Missed. Focus skill: ${q.tag}. ${tip}`;
    }

    static generateReport(testData, userResponses, scoreData, moduleTimings) {
        document.getElementById('final-total-score').textContent = scoreData.total;
        document.getElementById('final-rw-score').textContent = scoreData.rw;
        document.getElementById('final-math-score').textContent = scoreData.math;
        document.getElementById('final-percentile').textContent =
            `Approximately ${this.approxPercentile(scoreData.total)}th percentile nationally`;

        const allItems = [];
        const missedTags = {};
        const skillStats = {};

        const collect = (qs, resps, sectionLabel, moduleLabel) => {
            qs.forEach(q => {
                const resp = resps[q.id];
                const ok = this.isCorrect(q, resp);
                if (!ok) missedTags[q.tag] = (missedTags[q.tag] || 0) + 1;

                if (!skillStats[q.tag]) skillStats[q.tag] = { correct: 0, total: 0, domain: q.domain || DOMAIN_FOR_TAG[q.tag] || 'Other' };
                skillStats[q.tag].total++;
                if (ok) skillStats[q.tag].correct++;

                allItems.push({
                    id: q.id,
                    number: q.number,
                    section: sectionLabel,
                    module: moduleLabel,
                    domain: q.domain,
                    tag: q.tag,
                    type: q.type,
                    yourAnswer: this.formatAnswer(q, resp),
                    correctAnswer: this.formatAnswer(q, q.correctAnswer),
                    isCorrect: ok,
                    explanation: this.getExplanation(q, ok),
                    text: q.text,
                    aiGenerated: false
                });
            });
        };

        collect(testData.sections.RW.module1, userResponses.RW.module1, 'RW', 'Module 1');
        collect(testData.sections.RW.module2Easy, userResponses.RW.module2, 'RW', 'Module 2');
        collect(testData.sections.RW.module2Hard, userResponses.RW.module2, 'RW', 'Module 2');
        collect(testData.sections.MATH.module1, userResponses.MATH.module1, 'Math', 'Module 1');
        collect(testData.sections.MATH.module2Easy, userResponses.MATH.module2, 'Math', 'Module 2');
        collect(testData.sections.MATH.module2Hard, userResponses.MATH.module2, 'Math', 'Module 2');

        const seen = new Set();
        const reviewItems = allItems.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        const sorted = Object.entries(missedTags).sort((a, b) => b[1] - a[1]);
        const topWeaknesses = sorted.slice(0, 5).map(([tag]) => tag);

        const tagContainer = document.getElementById('weakness-tags');
        tagContainer.innerHTML = '';
        if (sorted.length === 0) {
            tagContainer.innerHTML = `<span class="weakness-tag good"><i class="fas fa-check-circle"></i> No major weaknesses detected</span>`;
        } else {
            sorted.slice(0, 5).forEach(([tag, count]) => {
                const span = document.createElement('span');
                span.className = 'weakness-tag';
                span.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${tag} (${count})`;
                tagContainer.appendChild(span);
            });
        }

        const tipContainer = document.getElementById('expert-tip-container');
        if (sorted.length > 0) {
            const top = sorted[0][0];
            tipContainer.innerHTML = `
                <h4><i class="fas fa-lightbulb" style="color:var(--accent-yellow)"></i> Priority Focus: ${top}</h4>
                <p>${EXPERT_TIPS[top] || 'Review this skill with timed practice.'}</p>
            `;
        } else {
            tipContainer.innerHTML = `
                <h4><i class="fas fa-trophy" style="color:var(--accent-yellow)"></i> Strong Performance</h4>
                <p>Maintain pacing and accuracy. You are in good shape.</p>
            `;
        }

        this.renderDomainBreakdown(missedTags);
        this.renderTimerAnalytics(moduleTimings);
        this.renderReviewList(reviewItems);

        const username = window.Storage && window.Storage.load().session;
        if (username) {
            const skillSnapshot = {};
            Object.entries(skillStats).forEach(([tag, s]) => {
                skillSnapshot[tag] = {
                    domain: s.domain,
                    correct: s.correct,
                    total: s.total,
                    accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0
                };
            });

            window.Storage.addTestResult(username, {
                id: testData.id,
                date: new Date().toISOString(),
                total: scoreData.total,
                rw: scoreData.rw,
                math: scoreData.math,
                topWeaknesses,
                skillSnapshot,
                moduleTimings,
                usedRealAnswers: !!testData.usedRealAnswers
            });
        }

        window._lastReviewItems = reviewItems;
    }

    static renderTimerAnalytics(timings) {
        const grid = document.getElementById('timer-grid');
        if (!grid || !timings) return;

        const fmt = (sec) => {
            if (sec == null) return '—';
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `${m}:${s.toString().padStart(2, '0')}`;
        };

        const official = {
            'RW Module 1': 32 * 60,
            'RW Module 2': 32 * 60,
            'Math Module 1': 35 * 60,
            'Math Module 2': 35 * 60
        };

        const rows = [
            { label: 'RW Module 1', used: timings.RW?.module1, limit: official['RW Module 1'] },
            { label: 'RW Module 2', used: timings.RW?.module2, limit: official['RW Module 2'] },
            { label: 'Math Module 1', used: timings.MATH?.module1, limit: official['Math Module 1'] },
            { label: 'Math Module 2', used: timings.MATH?.module2, limit: official['Math Module 2'] }
        ];

        grid.innerHTML = rows.map(r => {
            const remaining = r.used != null ? Math.max(0, r.limit - r.used) : null;
            return `<div class="timer-card">
                <div class="label">${r.label}</div>
                <div class="value">${fmt(r.used)}</div>
                <div class="sub">Limit ${fmt(r.limit)}${remaining != null ? ` · ${fmt(remaining)} left` : ''}</div>
            </div>`;
        }).join('');
    }

    static renderReviewList(items) {
        const list = document.getElementById('review-list');
        if (!list) return;

        const answered = items.filter(i => i.yourAnswer !== '—');
        const toShow = answered.length ? answered : items.slice(0, 40);

        list.innerHTML = toShow.map(item => `
            <div class="review-item ${item.isCorrect ? 'correct' : 'incorrect'}">
                <div class="review-meta">
                    <div>
                        <span class="review-qnum">${item.section} · ${item.module} · Q${item.number}</span>
                        <span class="review-tag">${item.tag}</span>
                    </div>
                    <span class="review-status ${item.isCorrect ? 'ok' : 'bad'}">
                        ${item.isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                </div>
                <div class="review-answers">
                    Your answer: <strong>${item.yourAnswer}</strong> &nbsp;·&nbsp; Correct: <strong>${item.correctAnswer}</strong>
                </div>
                <div class="review-explanation ${item.aiGenerated ? 'ai' : ''}">${item.explanation}</div>
            </div>
        `).join('');
    }

    static renderDomainBreakdown(missedTags) {
        const domains = [
            { name: 'Information and Ideas', tags: ['Textual Evidence', 'Central Ideas and Details', 'Quantitative Evidence'], desc: 'Evidence & central ideas' },
            { name: 'Craft and Structure', tags: ['Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections'], desc: 'Vocabulary & structure' },
            { name: 'Algebra', tags: ['Linear equations in one variable', 'Linear functions', 'Systems of two linear equations'], desc: 'Linear equations & systems' },
            { name: 'Advanced Math', tags: ['Nonlinear functions', 'Equivalent expressions', 'Nonlinear equations'], desc: 'Nonlinear & polynomials' }
        ];

        const container = document.getElementById('domain-breakdown');
        container.innerHTML = '';

        domains.forEach(d => {
            let missCount = 0;
            d.tags.forEach(t => { missCount += (missedTags[t] || 0); });
            let mastery = Math.max(40, 100 - missCount * 12);
            if (missCount === 0) mastery = 96;

            let status = 'On Track', fillClass = 'primary';
            if (mastery >= 90) { status = 'Excellent'; fillClass = 'success'; }
            else if (mastery >= 75) { status = 'On Track'; fillClass = 'primary'; }
            else if (mastery >= 60) { status = 'Needs Work'; fillClass = 'warning'; }
            else { status = 'Priority Focus'; fillClass = 'danger'; }

            const card = document.createElement('div');
            card.className = 'domain-card';
            card.innerHTML = `
                <h3>${d.name}</h3>
                <p>${d.desc}</p>
                <div class="progress-track"><div class="progress-fill ${fillClass}" style="width:${mastery}%"></div></div>
                <div class="domain-status">${status}</div>
            `;
            container.appendChild(card);
        });
    }

    static approxPercentile(total) {
        if (total >= 1550) return 99;
        if (total >= 1500) return 98;
        if (total >= 1450) return 96;
        if (total >= 1400) return 93;
        if (total >= 1350) return 90;
        if (total >= 1300) return 86;
        if (total >= 1250) return 81;
        if (total >= 1200) return 74;
        if (total >= 1150) return 67;
        if (total >= 1100) return 58;
        if (total >= 1050) return 50;
        return 40;
    }

    static buildSkillProfile(history) {
        const agg = {};
        history.forEach(h => {
            const snap = h.skillSnapshot || {};
            Object.entries(snap).forEach(([tag, s]) => {
                if (!agg[tag]) agg[tag] = { domain: s.domain, correct: 0, total: 0 };
                agg[tag].correct += s.correct || 0;
                agg[tag].total += s.total || 0;
            });
        });
        return Object.entries(agg)
            .map(([tag, s]) => ({
                tag,
                domain: s.domain,
                accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0,
                total: s.total
            }))
            .sort((a, b) => a.accuracy - b.accuracy);
    }
}

window.AnalyticsEngine = AnalyticsEngine;
