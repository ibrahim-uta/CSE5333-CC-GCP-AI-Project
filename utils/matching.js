/**
    Keyword-based question matching (fallback when Dialogflow is disabled)
    Find best matching question using keyword similarity
 */
function findBestMatch(userQuestion, qaCache) {
    const userWords = userQuestion
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2);

    let bestMatch = null;
    let bestScore = 0;

    for (const qa of qaCache) {
        const qaWords = qa
            .question
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/);

        let score = 0;
        for (const userWord of userWords) {
            for (const qaWord of qaWords) {
                if (userWord === qaWord || (userWord.length > 3 && qaWord.includes(userWord)) || (qaWord.length > 3 && userWord.includes(qaWord))) {
                    score++;
                    break;
                }
            }
        }

        // Calculate match quality
        const matchRatio = score / Math.max(userWords.length, qaWords.length);
        const finalScore = score * 10 + matchRatio * 5;

        if (finalScore > bestScore) {
            bestScore = finalScore;
            bestMatch = qa;
        }
    }

    return bestScore > 5
        ? {
            match: bestMatch,
            score: bestScore
        }
        : null;
}

function getRandomSamples(qaCache, count) {
    const samples = [];
    const used = new Set();

    while (samples.length < count && samples.length < qaCache.length) {
        const idx = Math.floor(Math.random() * qaCache.length);
        if (!used.has(idx)) {
            used.add(idx);
            samples.push(qaCache[idx].question);
        }
    }

    return samples;
}

module.exports = {
    findBestMatch,
    getRandomSamples
};
