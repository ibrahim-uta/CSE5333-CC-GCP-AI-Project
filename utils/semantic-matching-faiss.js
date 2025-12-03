const fs = require('fs');
const path = require('path');

let qaData = null;

// Load pre-computed Q&A data
function loadEmbeddings() {
    try {
        const dataPath = path.join(__dirname, '..', 'qa_data.json');

        if (!fs.existsSync(dataPath)) {
            console.log('⚠️  qa_data.json not found. Run: python precompute_embeddings_faiss.py');
            return false;
        }

        console.log('📦 Loading pre-computed Q&A data...');
        const rawData = fs.readFileSync(dataPath, 'utf-8');
        qaData = JSON.parse(rawData);

        console.log(`✅ Loaded ${qaData.length} Q&A pairs into memory`);
        console.log(`   Memory usage: ~${ (rawData.length / (1024 * 1024)).toFixed(2)} MB`);

        return true;
    } catch (error) {
        console.error('Error loading Q&A data:', error);
        return false;
    }
}

// Fast keyword matching on pre-loaded data
async function findBestSemanticMatch(userQuestion, qaCache) {
    try {
        if (!qaData || qaData.length === 0) {
            console.log('⚠️  Data not loaded, falling back');
            return null;
        }

        // Normalize user question
        const userWords = userQuestion
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2);

        let bestMatch = null;
        let bestScore = 0;

        // Search through pre-loaded data (very fast!)
        for (const qa of qaData) {
            const qaQuestion = qa
                .question
                .toLowerCase();
            const qaWords = qaQuestion
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/);

            let score = 0;

            // Exact phrase match bonus
            if (qaQuestion.includes(userQuestion.toLowerCase())) {
                score += 20;
            }

            // Word matching with partial matching
            for (const userWord of userWords) {
                for (const qaWord of qaWords) {
                    if (userWord === qaWord) {
                        score += 3; // Exact match
                    } else if (userWord.length > 3 && qaWord.includes(userWord)) {
                        score += 2; // Partial match
                    } else if (qaWord.length > 3 && userWord.includes(qaWord)) {
                        score += 2; // Reverse partial match
                    }
                }
            }

            // Update best match
            if (score > bestScore) {
                bestScore = score;
                bestMatch = qa;
            }
        }

        // Return match if score is above threshold
        if (bestScore > 5) {
            return {
                match: bestMatch,
                score: Math.min(bestScore * 3, 100), // Scale to 0-100
                confidence: bestScore > 15
                    ? 'high'
                    : 'medium'
            };
        }

        return null;

    } catch (error) {
        console.error('Semantic matching error:', error);
        return null;
    }
}

// Initialize on module load
async function initializeEmbedder() {
    const loaded = loadEmbeddings();
    if (loaded) {
        console.log('🧠 Fast semantic matching ready!');
    }
    return loaded;
}

module.exports = {
    initializeEmbedder,
    findBestSemanticMatch
};
