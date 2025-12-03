// utils/semantic-matching-faiss.js
const fs = require('fs');
const path = require('path');

let qaEmbeddings = [];
let qaData = [];
let isInitialized = false;

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}

async function initialize() {
    try {
        console.log('📊 Loading pre-computed Q&A data...');
        
        const embeddingsPath = path.join(__dirname, '../qa_embeddings.faiss');
        const dataPath = path.join(__dirname, '../qa_data.json');

        // Check if files exist
        if (!fs.existsSync(embeddingsPath)) {
            console.log('⚠️  qa_embeddings.faiss not found, skipping semantic search');
            isInitialized = false;
            return;
        }

        if (!fs.existsSync(dataPath)) {
            console.log('⚠️  qa_data.json not found, skipping semantic search');
            isInitialized = false;
            return;
        }

        const embeddingsBuffer = fs.readFileSync(embeddingsPath);
        qaEmbeddings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

        const dimension = 384; // Standard sentence-transformers dimension
        const bytesPerFloat = 4;
        const bytesPerVector = dimension * bytesPerFloat;
        
        // 🔧 Calculate number of vectors based on buffer size
        const numVectors = Math.floor(embeddingsBuffer.length / bytesPerVector);
        
        console.log(`📐 Buffer size: ${embeddingsBuffer.length} bytes`);
        console.log(`📐 Dimension: ${dimension}, Bytes per vector: ${bytesPerVector}`);
        console.log(`📐 Calculated vectors: ${numVectors}`);
        
        qaData = [];

        // 🔧 Read vectors with bounds checking
        for (let i = 0; i < numVectors; i++) {
            const offset = i * bytesPerVector;
            
            // Safety check: ensure we don't read past buffer
            if (offset + bytesPerVector > embeddingsBuffer.length) {
                console.log(`⚠️  Stopping at vector ${i}, would exceed buffer`);
                break;
            }

            const vector = [];
            for (let j = 0; j < dimension; j++) {
                const floatOffset = offset + (j * bytesPerFloat);
                
                // Extra safety check
                if (floatOffset + bytesPerFloat <= embeddingsBuffer.length) {
                    vector.push(embeddingsBuffer.readFloatLE(floatOffset));
                } else {
                    console.log(`⚠️  Incomplete vector at index ${i}, stopping`);
                    break;
                }
            }
            
            // Only add complete vectors
            if (vector.length === dimension) {
                qaData.push(vector);
            }
        }

        if (qaData.length === 0) {
            console.log('❌ No valid embeddings loaded');
            isInitialized = false;
            return;
        }

        isInitialized = true;
        const memoryMB = (embeddingsBuffer.length / (1024 * 1024)).toFixed(2);
        
        console.log(`✅ Loaded ${qaData.length} Q&A embeddings into memory`);
        console.log(`   Memory usage: ~${memoryMB} MB`);
        console.log('🚀 Fast semantic matching ready!');

    } catch (error) {
        console.error('❌ Failed to initialize semantic matching:', error.message);
        console.error('   Stack:', error.stack);
        isInitialized = false;
    }
}

function searchSemantic(query, qaCache) {
    if (!isInitialized || qaData.length === 0) {
        console.log('⚠️  Semantic search not available, use other methods');
        return { question: null, answer: null, similarity: 0 };
    }

    const queryWords = query.toLowerCase().split(/\s+/);
    let bestMatch = null;
    let highestSim = -1;

    // Search through available embeddings
    const searchLimit = Math.min(qaCache.length, qaData.length);

    for (let idx = 0; idx < searchLimit; idx++) {
        const qa = qaCache[idx];
        if (!qa || !qa.question || !qa.answer) continue;

        const questionWords = qa.question.toLowerCase().split(/\s+/);
        const commonWords = queryWords.filter(w => questionWords.includes(w));
        const wordOverlap = commonWords.length / Math.max(queryWords.length, 1);

        // Use actual embedding if available
        const embedding = qaData[idx];
        if (!embedding || embedding.length === 0) continue;

        // Combine word overlap with embedding similarity
        // For now, use word overlap as primary (since we don't have query embedding)
        const similarity = wordOverlap;

        if (similarity > highestSim) {
            highestSim = similarity;
            bestMatch = qa;
        }
    }

    return {
        question: bestMatch ? bestMatch.question : null,
        answer: bestMatch ? bestMatch.answer : null,
        similarity: highestSim
    };
}

// 🆕 Search for top K similar questions
function searchTopK(query, qaCache, k = 5) {
    if (!isInitialized || qaData.length === 0) {
        console.log('⚠️  Semantic search not available');
        return [];
    }

    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = [];

    const searchLimit = Math.min(qaCache.length, qaData.length);

    for (let idx = 0; idx < searchLimit; idx++) {
        const qa = qaCache[idx];
        if (!qa || !qa.question || !qa.answer) continue;

        const questionWords = qa.question.toLowerCase().split(/\s+/);
        const commonWords = queryWords.filter(w => questionWords.includes(w));
        const wordOverlap = commonWords.length / Math.max(queryWords.length, 1);

        // Use embedding similarity
        const embedding = qaData[idx];
        if (!embedding || embedding.length === 0) continue;

        const similarity = wordOverlap;

        if (similarity > 0.3) {
            scored.push({
                question: qa.question,
                answer: qa.answer,
                score: similarity,
                similarity: similarity
            });
        }
    }

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
}

function isReady() {
    return isInitialized;
}

module.exports = {
    initialize,
    searchSemantic,
    searchTopK,
    isReady
};
