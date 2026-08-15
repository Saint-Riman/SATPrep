/**
 * analytics.js
 * 
 * Handles scoring curve calculations (IRT simulation) and 
 * the AI Weakness Diagnostic engine for the DSAT Prep app.
 */

const EXPERT_TIPS = {
    "Textual Evidence": "Perfect Scorer Tip: For Textual Evidence questions, never read the options first. Read the claim in the prompt, identify exactly what needs to be proven, and formulate your own idea of what the quote must say. Then, find the choice that strictly matches without requiring logical leaps.",
    "Words in Context": "Perfect Scorer Tip: Treat the blank as a math variable. Read the sentence and put your own simple word in the blank (like 'bad' or 'changing'). Only then look at the choices and eliminate anything that doesn't match your simple word's exact connotation.",
    "Transitions": "Perfect Scorer Tip: Cover up the transition word. Read the sentence before, then read the sentence after. Ask yourself: Are these sentences agreeing (therefore/thus), disagreeing (however/conversely), or adding information (furthermore)?",
    "Advanced Math": "Perfect Scorer Tip: When dealing with complex vertex form quadratics, don't expand. Use the axis of symmetry formula or manipulate the vertex form directly. Desmos is your best friend here—graph it instantly to verify vertex coordinates.",
    "Linear equations in one variable": "Perfect Scorer Tip: Isolate variables systematically. Check your arithmetic by plugging your final answer back into the original equation before selecting your choice."
};

class AnalyticsEngine {
    /**
     * Calculates the scaled SAT score (200 - 800 per section) using adaptive pathways.
     */
    static calculateScore(testData, userResponses) {
        const scoreSection = (sectionStr) => {
            const m1Qs = testData.sections[sectionStr].module1;
            const m1Resp = userResponses[sectionStr].module1;
            let m1Correct = 0;
            m1Qs.forEach(q => { if (m1Resp[q.id] == q.correctAnswer) m1Correct++; });
            const m1Percent = m1Qs.length > 0 ? m1Correct / m1Qs.length : 0;

            // Determine if they were routed to the hard module
            const isHard = m1Percent >= 0.60;
            const m2Qs = isHard ? testData.sections[sectionStr].module2Hard : testData.sections[sectionStr].module2Easy;
            const m2Resp = userResponses[sectionStr].module2;
            let m2Correct = 0;
            m2Qs.forEach(q => { if (m2Resp[q.id] == q.correctAnswer) m2Correct++; });
            const m2Percent = m2Qs.length > 0 ? m2Correct / m2Qs.length : 0;

            let score = 200;
            if (isHard) {
                // Hard module allows access up to 800
                score = 400 + (m1Percent * 200) + (m2Percent * 200);
            } else {
                // Easy module caps potential score around 600-650
                score = 200 + (m1Percent * 200) + (m2Percent * 180);
            }

            return Math.min(800, Math.max(200, Math.round(score / 10) * 10));
        };

        const rwScore = scoreSection('RW');
        const mathScore = scoreSection('MATH');

        return {
            rw: rwScore,
            math: mathScore,
            total: rwScore + mathScore
        };
    }

    /**
     * Analyzes missed questions by tag to generate weakness tags and expert tips.
     */
    static generateReport(testData, userResponses, scoreData) {
        // Update Score Hero display in DOM
        document.getElementById('final-total-score').innerText = scoreData.total;
        document.getElementById('final-rw-score').innerText = scoreData.rw;
        document.getElementById('final-math-score').innerText = scoreData.math;

        const missedTags = {};

        const analyzeModule = (qs, resps) => {
            qs.forEach(q => {
                if (resps[q.id] != q.correctAnswer) {
                    missedTags[q.tag] = (missedTags[q.tag] || 0) + 1;
                }
            });
        };

        // Aggregate across all modules taken
        analyzeModule(testData.sections.RW.module1, userResponses.RW.module1);
        analyzeModule(testData.sections.RW.module2Easy, userResponses.RW.module2);
        analyzeModule(testData.sections.RW.module2Hard, userResponses.RW.module2);
        
        analyzeModule(testData.sections.MATH.module1, userResponses.MATH.module1);
        analyzeModule(testData.sections.MATH.module2Easy, userResponses.MATH.module2);
        analyzeModule(testData.sections.MATH.module2Hard, userResponses.MATH.module2);

        const sortedWeaknesses = Object.entries(missedTags).sort((a, b) => b[1] - a[1]);

        const tagContainer = document.getElementById('weakness-tags');
        tagContainer.innerHTML = '';

        const tipContainer = document.getElementById('expert-tip-container');
        tipContainer.innerHTML = '';

        if (sortedWeaknesses.length > 0) {
            // Render top weakness tags
            sortedWeaknesses.slice(0, 3).forEach(([tag, count]) => {
                const span = document.createElement('span');
                span.className = 'weakness-tag';
                span.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${tag} (${count} missed)`;
                tagContainer.appendChild(span);
            });

            // Extract the top weakness and fetch expert tip
            const topWeakness = sortedWeaknesses[0][0];
            const tip = EXPERT_TIPS[topWeakness] || "Review core concepts for this specific topic and complete timed practice modules to improve precision and speed.";

            tipContainer.innerHTML = `
                <h4 class="primary-text mb-1" style="display:flex; align-items:center; gap:0.5rem;">
                    <i class="fas fa-lightbulb" style="color: var(--accent-yellow);"></i> Target Area: ${topWeakness}
                </h4>
                <p>${tip}</p>
            `;
        } else {
            tagContainer.innerHTML = `<span class="weakness-tag" style="background: #D1FAE5; color: var(--success-green);"><i class="fas fa-check-circle"></i> Flawless Performance! No major weaknesses detected.</span>`;
            tipContainer.innerHTML = `
                <h4 class="primary-text mb-1"><i class="fas fa-trophy" style="color: var(--accent-yellow);"></i> Top Scorer Status</h4>
                <p>You answered everything correctly. Focus on maintaining your pacing and stamina for official test day!</p>
            `;
        }
    }
}

// Make globally accessible
window.AnalyticsEngine = AnalyticsEngine;
