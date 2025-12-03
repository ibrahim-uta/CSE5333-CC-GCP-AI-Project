const {pipeline} = require('@xenova/transformers');

let embedder = null;

async function initializeEmbedder() {
    if (!embedder) {
        console.log('🧠 Loading semantic similarity model...');
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('✅ Model loaded!');
    }
    return embedder;
}

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbedding(text) {
    const model = await initializeEmbedder();
    const output = await model(text, {
        pooling: 'mean',
        normalize: true
    });
    return Array.from(output.data);
}

async function findBestSemanticMatch(userQuestion, qaCache) {
    try {
        const userEmbedding = await getEmbedding(userQuestion);

        let bestMatch = null;
        let bestScore = 0;

        for (const qa of qaCache) {
            const qaEmbedding = await getEmbedding(qa.question);
            const similarity = cosineSimilarity(userEmbedding, qaEmbedding);

            if (similarity > bestScore) {
                bestScore = similarity;
                bestMatch = qa;
            }
        }

        return bestScore > 0.6
            ? {
                match: bestMatch,
                score: bestScore * 100,
                confidence: bestScore > 0.8
                    ? 'high'
                    : 'medium'
            }
            : null;

    } catch (error) {
        console.error('Semantic matching error:', error);
        return null;
    }
}

module.exports = {
    initializeEmbedder,
    findBestSemanticMatch
};
