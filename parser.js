/**
 * parser.js
 * 
 * Simulates the backend AI pipeline that parses a College Board PDF
 * and transforms it into a structured JSON format for the adaptive test engine.
 */

// Define the official SAT domains and tags for the mock data
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
    /**
     * Simulates uploading and parsing the PDF.
     * @param {File} file - The PDF file uploaded by the user.
     * @returns {Promise<Object>} - The structured test data.
     */
    static async parseFile(file) {
        return new Promise(resolve => {
            // Simulate a 2.5 second delay for "AI processing"
            setTimeout(() => {
                const parsedData = this.generateMockTestBank();
                console.log("PDF parsed successfully:", parsedData);
                resolve(parsedData);
            }, 2500);
        });
    }

    /**
     * Generates a complete 2-stage adaptive test structure.
     * RW: 27 questions per module. Math: 22 questions per module.
     */
    static generateMockTestBank() {
        return {
            id: "sat_practice_test_" + Date.now(),
            title: "College Board Official Practice Test",
            sections: {
                RW: {
                    module1: this.generateQuestions(27, 'RW', 'mixed'),
                    module2Easy: this.generateQuestions(27, 'RW', 'easy'),
                    module2Hard: this.generateQuestions(27, 'RW', 'hard')
                },
                MATH: {
                    module1: this.generateQuestions(22, 'MATH', 'mixed'),
                    module2Easy: this.generateQuestions(22, 'MATH', 'easy'),
                    module2Hard: this.generateQuestions(22, 'MATH', 'hard')
                }
            }
        };
    }

    /**
     * Generates a specific set of questions for a module.
     */
    static generateQuestions(count, type, difficulty) {
        let questions = [];
        const domainList = SAT_DOMAINS[type].domains;

        for (let i = 1; i <= count; i++) {
            // Cycle through domains to ensure a balanced test
            let domain = domainList[i % domainList.length];
            
            // Pick a random tag within that domain
            let tagsList = SAT_DOMAINS[type].tags[domain];
            let tag = tagsList[Math.floor(Math.random() * tagsList.length)];

            // 80% Multiple Choice, 20% Math Grid-in (SPR) for Math section
            let qType = (type === 'MATH' && Math.random() > 0.8) ? "SPR" : "MCQ";
            
            let questionObj = {
                id: `${type}_${difficulty}_${i}_${Date.now()}`,
                number: i,
                domain: domain,
                tag: tag,
                difficulty: difficulty,
                type: qType,
                correctAnswer: null, // Will be set below
                passage: null,
                text: null,
                options: null
            };

            // Generate Mock Content based on section type
            if (type === 'RW') {
                questionObj.passage = this.generateMockPassage(domain, tag);
                questionObj.text = `Which choice best summarizes the main idea of the text? (Simulated ${tag} question)`;
                questionObj.options = [
                    "A plausible but factually incorrect distractor.",
                    "The correct answer that aligns with the passage.",
                    "A choice that focuses on a minor detail rather than the main point.",
                    "An extreme claim that goes beyond the text."
                ];
                questionObj.correctAnswer = 1; // Index 1 (Option B)
            } else {
                // Math Section
                questionObj.text = `Simulated Math Problem: Solve for $x$ in the context of ${tag}.`;
                
                if (qType === "MCQ") {
                    questionObj.options = ["12", "15", "18", "24"];
                    questionObj.correctAnswer = 2; // Index 2 (Option C)
                } else {
                    // SPR (Student-Produced Response)
                    questionObj.correctAnswer = "18"; 
                }
            }

            questions.push(questionObj);
        }
        
        return questions;
    }

    /**
     * Generates placeholder text for Reading and Writing passages.
     */
    static generateMockPassage(domain, tag) {
        if (domain === "Information and Ideas") {
            return `In a recent ecological study, researchers observed the foraging behaviors of the local bee population. They hypothesized that the bees would prefer the native wildflowers over the introduced species. However, data collected over a three-month period showed that 68% of the foraging time was spent on the introduced species. The researchers concluded that the higher nectar density of the introduced plants drove this unexpected preference.`;
        } else if (domain === "Craft and Structure") {
            return `The architect's approach to the new civic center was highly unorthodox. While her contemporaries relied on brutalist concrete blocks, she favored a more porous design, utilizing glass and lightweight steel. This design choice was not merely aesthetic; it was a deliberate attempt to foster a sense of transparency and accessibility within local government.`;
        } else {
            return `While historical records often focus on the grand achievements of monarchs, the daily ledgers of merchants provide a more accurate picture of the era's economic realities. These documents reveal that inflation and supply chain disruptions were common, profoundly affecting the lives of ordinary citizens in ways that royal decrees rarely acknowledge.`;
        }
    }
}

// Make the class globally available so UI.js and Engine.js can access it
window.PDFProcessor = PDFProcessor;
