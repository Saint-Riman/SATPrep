/**
 * analytics.js
 * Adaptive scoring, weakness analysis, history, and clear student explanations.
 */

const EXPERT_TIPS = {
    "Textual Evidence": "When a question asks for the best evidence, first lock in what the claim actually needs. Then look for the quote that directly supports that exact claim — no extra assumptions allowed. If a choice requires you to infer something the text never says, eliminate it.",
    "Words in Context": "Cover the word or blank. Put your own simple word in the sentence (\"bad\", \"change\", \"support\"). Then look at the choices and pick the one that matches your simple word's meaning most precisely. Connotation matters.",
    "Transitions": "Read the sentence before and the sentence after while covering the transition. Decide the logical relationship: continuation, contrast, cause-effect, or example. Only then choose the transition that matches that relationship.",
    "Central Ideas and Details": "Identify the main point of the whole passage first. Wrong answers often focus on a true but minor detail or twist the main idea slightly. The correct choice will cover the broadest accurate summary.",
    "Cross-Text Connections": "Determine the relationship between the two passages (agree, disagree, illustrate, etc.). Then evaluate each choice against that specific relationship rather than against only one passage.",
    "Advanced Math": "For nonlinear equations and functions, graphing (Desmos) is often the fastest verification method. When rewriting expressions, keep the structure intact and check by plugging in a simple number.",
    "Linear equations in one variable": "Isolate the variable carefully. After solving, always plug your answer back into the original equation to confirm. Watch for distribution and sign errors — they are the most common traps.",
    "Nonlinear equations": "Consider factoring, substitution, or graphing. If the question asks for the number of solutions or specific values, graphing both sides quickly reveals intersections.",
    "Ratios, rates, proportional relationships": "Set up the proportion clearly and cross-multiply. Units must stay consistent. When rates are involved, writing the units next to every number prevents most mistakes.",
    "Boundaries": "Read the sentence aloud in your head. If a comma or semicolon feels awkward, it is probably wrong. Independent clauses need stronger separation than a single comma (comma splice)."
};

class AnalyticsEngine {
    static calculateScore(testData, userResponses) {
        const scoreSection = (sectionKey) => {
            const m1Qs = testData.sections[sectionKey].module1;
            const m1Resp = userResponses[sectionKey].module1;
            let m1Correct = 0;
            m1Qs.forEach(q => {
                if (this.isCorrect(q, m1Resp[q.id])) m1Correct++;
            });
            const m1Percent = m1Qs.length ? m1Correct / m1Qs.length : 0;

            const isHard = m1Percent >= 0.60;
            const m2Qs = isHard ? testData.sections[sectionKey].module2Hard : testData.sections[sectionKey].module2Easy;
            const m2Resp = userResponses[sectionKey].module2;
            let m2Correct = 0;
            m2Qs.forEach(q => {
                if (this.isCorrect(q, m2Resp[q.id])) m2Correct++;
            });
            const m2Percent = m2Qs.length ? m2Correct / m2Qs.length : 0;

            let score = 200;
            if (isHard) {
                score = 400 + (m1Percent * 200) + (m2Percent * 200);
            } else {
                score = 200 + (m1Percent * 200) + (m2Percent * 180);
            }
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

    static generateReport(testData, userResponses, scoreData) {
        document.getElementById('final-total-score').textContent = scoreData.total;
        document.getElementById('final-rw-score').textContent = scoreData.rw;
        document.getElementById('final-math-score').textContent = scoreData.math;

        const pct = this.approxPercentile(scoreData.total);
        document.getElementById('final-percentile').textContent = `Approximately ${pct}th percentile nationally`;

        const missedTags = {};
        const analyze = (qs, resps) => {
            qs.forEach(q => {
                if (!this.isCorrect(q, resps[q.id])) {
                    missedTags[q.tag] = (missedTags[q.tag] || 0) + 1;
                }
            });
        };

        analyze(testData.sections.RW.module1, userResponses.RW.module1);
        analyze(testData.sections.RW.module2Easy, userResponses.RW.module2);
        analyze(testData.sections.RW.module2Hard, userResponses.RW.module2);
        analyze(testData.sections.MATH.module1, userResponses.MATH.module1);
        analyze(testData.sections.MATH.module2Easy, userResponses.MATH.module2);
        analyze(testData.sections.MATH.module2Hard, userResponses.MATH.module2);

        const sorted = Object.entries(missedTags).sort((a, b) => b[1] - a[1]);
        const topWeaknesses = sorted.slice(0, 3).map(([tag]) => tag);

        const tagContainer = document.getElementById('weakness-tags');
        tagContainer.innerHTML = '';
        if (sorted.length === 0) {
            tagContainer.innerHTML = `<span class="weakness-tag good"><i class="fas fa-check-circle"></i> Excellent performance — no major weaknesses detected</span>`;
        } else {
            sorted.slice(0, 4).forEach(([tag, count]) => {
                const span = document.createElement('span');
                span.className = 'weakness-tag';
                span.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${tag} (${count} missed)`;
                tagContainer.appendChild(span);
            });
        }

        const tipContainer = document.getElementById('expert-tip-container');
        if (sorted.length > 0) {
            const top = sorted[0][0];
            const tip = EXPERT_TIPS[top] || 'Review the core concept for this topic and practice timed sets. Focus on understanding why the correct answer is right, not just memorizing it.';
            tipContainer.innerHTML = `
                <h4><i class="fas fa-lightbulb" style="color:var(--accent-yellow)"></i> Focus Area: ${top}</h4>
                <p>${tip}</p>
            `;
        } else {
            tipContainer.innerHTML = `
                <h4><i class="fas fa-trophy" style="color:var(--accent-yellow)"></i> Top Scorer Territory</h4>
                <p>You answered nearly everything correctly. Maintain your pacing and accuracy under timed conditions and you are in excellent shape for test day.</p>
            `;
        }

        // Show grading source note if available
        if (testData.extractionNote) {
            const note = document.createElement('p');
            note.className = 'text-sm text-secondary';
            note.style.marginTop = '0.75rem';
            note.textContent = testData.extractionNote;
            tipContainer.appendChild(note);
        }

        this.renderDomainBreakdown(missedTags);

        const username = window.Storage && window.Storage.load().session;
        if (username) {
            window.Storage.addTestResult(username, {
                id: testData.id,
                date: new Date().toISOString(),
                total: scoreData.total,
                rw: scoreData.rw,
                math: scoreData.math,
                topWeaknesses,
                usedRealAnswers: !!testData.usedRealAnswers
            });
        }
    }

    static renderDomainBreakdown(missedTags) {
        const domains = [
            { name: 'Information and Ideas', tags: ['Textual Evidence', 'Central Ideas and Details', 'Quantitative Evidence'], desc: 'Command of Evidence, Central Ideas' },
            { name: 'Craft and Structure', tags: ['Words in Context', 'Text Structure and Purpose', 'Cross-Text Connections'], desc: 'Words in Context, Text Structure' },
            { name: 'Algebra', tags: ['Linear equations in one variable', 'Linear functions', 'Systems of two linear equations'], desc: 'Linear equations, systems, functions' },
            { name: 'Advanced Math', tags: ['Nonlinear functions', 'Equivalent expressions', 'Nonlinear equations'], desc: 'Nonlinear equations, polynomials' }
        ];

        const container = document.getElementById('domain-breakdown');
        container.innerHTML = '';

        domains.forEach(d => {
            let missCount = 0;
            d.tags.forEach(t => { missCount += (missedTags[t] || 0); });
            let mastery = Math.max(40, 100 - missCount * 12);
            if (missCount === 0) mastery = 96;

            let status = 'On Track';
            let fillClass = 'primary';
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
}

window.AnalyticsEngine = AnalyticsEngine;
