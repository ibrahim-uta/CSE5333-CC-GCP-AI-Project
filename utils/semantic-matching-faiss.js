// utils/semantic-matching-faiss.js

const fs = require('fs');
const path = require('path');
const {Storage} = require('@google-cloud/storage');

// Embedding vectors and corresponding QA text
let qaVectors = []; // Array<float[dim]>
let qaText = []; // Array<{ question, answer, ... }>
let isInitialized = false;

// Optional: cosine similarity if you want it later
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) 
        return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0
        ? 0
        : dotProduct / denominator;
}

// ---------- Loaders ----------

async function loadFromLocal() {
    console.log('📊 Loading pre-computed Q&A data from local files...');

    const embeddingsPath = path.join(__dirname, '../qa_embeddings.faiss');
    const dataPath = path.join(__dirname, '../qa_data.json');

    if (!fs.existsSync(embeddingsPath)) {
        console.log('⚠️ qa_embeddings.faiss not found, skipping semantic search');
        isInitialized = false;
        return null;
    }

    if (!fs.existsSync(dataPath)) {
        console.log('⚠️ qa_data.json not found, skipping semantic search');
        isInitialized = false;
        return null;
    }

    const embeddingsBuffer = fs.readFileSync(embeddingsPath);
    const qaJson = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    return {embeddingsBuffer, qaJson};
}

// ---------- Loaders ----------
async function loadFromGCS() {
    const bucketName = process.env.EMBEDDINGS_BUCKET;
    const embeddingsFile = process.env.EMBEDDINGS_FILE;
    const qaDataFile = process.env.QA_DATA_FILE;

    console.log('[SEMANTIC] ENV EMBEDDINGS_BUCKET =', bucketName);
    console.log('[SEMANTIC] ENV EMBEDDINGS_FILE  =', embeddingsFile);
    console.log('[SEMANTIC] ENV QA_DATA_FILE     =', qaDataFile);

    if (!bucketName || !embeddingsFile || !qaDataFile) {
        console.log('[SEMANTIC] ⚠️ GCS env vars missing, cannot load embeddings from Cloud Storage');
        return null;
    }

    const t0 = Date.now();
    try {
        console.log(`[SEMANTIC] 📊 Loading from GCS bucket "${bucketName}"...`);

        const storage = new Storage(); // ADC on Cloud Run
        const bucket = storage.bucket(bucketName);

        console.log('[SEMANTIC]   → downloading', embeddingsFile);
        const [embeddingsBuffer] = await bucket
            .file(embeddingsFile)
            .download();
        console.log('[SEMANTIC]   ✓ embeddings downloaded in', Date.now() - t0, 'ms');

        const t1 = Date.now();
        console.log('[SEMANTIC]   → downloading', qaDataFile);
        const [qaJsonBuffer] = await bucket
            .file(qaDataFile)
            .download();
        console.log('[SEMANTIC]   ✓ qa_data downloaded in', Date.now() - t1, 'ms');

        console.log('[SEMANTIC]   sizes: embeddings =', embeddingsBuffer.length, 'bytes, qaJson =', qaJsonBuffer.length, 'bytes');

        const t2 = Date.now();
        const qaJson = JSON.parse(qaJsonBuffer.toString('utf8'));
        console.log('[SEMANTIC]   ✓ qa_data JSON parsed in', Date.now() - t2, 'ms');

        console.log('[SEMANTIC] ✓ GCS load total time =', Date.now() - t0, 'ms');
        return {embeddingsBuffer, qaJson};
    } catch (err) {
        console.error('[SEMANTIC] ❌ Error loading from GCS:');
        console.error('  name   =', err.name);
        console.error('  code   =', err.code);
        console.error('  message=', err.message);
        console.error('  stack  =', err.stack);
        return null;
    }
}

// ---------- Initialization ---------- ---------- Initialization ----------
async function initialize() {
    try {
        console.log('📊 Loading pre-computed Q&A data...');
        console.log('[SEMANTIC] FORCING LOCAL LOAD (no GCS)');

        // Always use local files (inside the Docker image)
        const loaded = await loadFromLocal();

        if (!loaded) {
            console.error('[SEMANTIC] ❌ No data loaded from local files. Semantic search disabled.');
            isInitialized = false;
            return;
        }

        const {embeddingsBuffer, qaJson} = loaded;

        const dimension = 384; // sentence-transformers dimension
        const bytesPerFloat = 4;
        const bytesPerVector = dimension * bytesPerFloat;
        const numVectors = Math.floor(embeddingsBuffer.length / bytesPerVector);

        console.log(`[SEMANTIC] 📐 Buffer size: ${embeddingsBuffer.length} bytes`);
        console.log(`[SEMANTIC] 📐 Dimension: ${dimension}, Bytes per vector: ${bytesPerVector}`);
        console.log(`[SEMANTIC] 📐 Calculated vectors: ${numVectors}`);

        const vectors = [];

        for (let i = 0; i < numVectors; i++) {
            const offset = i * bytesPerVector;
            if (offset + bytesPerVector > embeddingsBuffer.length) {
                console.log(`[SEMANTIC] ⚠️ Stopping at vector ${i}, would exceed buffer`);
                break;
            }

            const vector = [];
            for (let j = 0; j < dimension; j++) {
                const floatOffset = offset + (j * bytesPerFloat);
                if (floatOffset + bytesPerFloat <= embeddingsBuffer.length) {
                    vector.push(embeddingsBuffer.readFloatLE(floatOffset));
                } else {
                    console.log(`[SEMANTIC] ⚠️ Incomplete vector at index ${i}, stopping inner loop`);
                    break;
                }
            }
            if (vector.length === dimension) {
                vectors.push(vector);
            }
        }

        if (vectors.length === 0 || !Array.isArray(qaJson) || qaJson.length === 0) {
            console.error('[SEMANTIC] ❌ No valid embeddings or QA data loaded after parsing.');
            console.error('[SEMANTIC] vectors.length =', vectors.length, 'qaJson length =', Array.isArray(qaJson)
                ? qaJson.length
                : 'NOT ARRAY');
            isInitialized = false;
            return;
        }

        const maxLen = Math.min(vectors.length, qaJson.length);
        qaVectors = new Array(maxLen);
        qaText = new Array(maxLen);
        for (let i = 0; i < maxLen; i++) {
            qaVectors[i] = vectors[i];
            qaText[i] = qaJson[i];
        }

        isInitialized = true;
        const memoryMB = (embeddingsBuffer.length / (1024 * 1024)).toFixed(2);
        console.log(`[SEMANTIC] ✅ Loaded ${maxLen} Q&A embeddings into memory`);
        console.log(`[SEMANTIC] Memory usage: ~${memoryMB} MB`);
        console.log('[SEMANTIC] 🚀 Fast semantic matching ready!');
    } catch (error) {
        console.error('[SEMANTIC] ❌ Failed to initialize semantic matching:');
        console.error('  name   =', error.name);
        console.error('  message=', error.message);
        console.error('  stack  =', error.stack);
        isInitialized = false;
    }
}

// ---------- Search ---------- Single best match
function searchSemantic(query) {
    if (!isInitialized || qaVectors.length === 0 || qaText.length === 0) {
        console.log('⚠️ Semantic search not available, use other methods');
        return {question: null, answer: null, similarity: 0};
    }

    const queryWords = query
        .toLowerCase()
        .split(/\s+/);
    let bestMatch = null;
    let highestSim = -1;

    const searchLimit = Math.min(qaText.length, qaVectors.length);
    for (let idx = 0; idx < searchLimit; idx++) {
        const qa = qaText[idx];
        if (!qa || !qa.question || !qa.answer) 
            continue;
        
        const questionWords = qa
            .question
            .toLowerCase()
            .split(/\s+/);
        const commonWords = queryWords.filter(w => questionWords.includes(w));
        const wordOverlap = commonWords.length / Math.max(queryWords.length, 1);

        const embedding = qaVectors[idx];
        if (!embedding || embedding.length === 0) 
            continue;
        
        // Right now we use wordOverlap as a simple similarity proxy
        const similarity = wordOverlap;

        if (similarity > highestSim) {
            highestSim = similarity;
            bestMatch = qa;
        }
    }

    return {
        question: bestMatch
            ? bestMatch.question
            : null,
        answer: bestMatch
            ? bestMatch.answer
            : null,
        similarity: highestSim
    };
}

// Top‑K suggestions
function searchTopK(query, k = 5) {
    if (!isInitialized || qaVectors.length === 0 || qaText.length === 0) {
        console.log('⚠️ Semantic search not available');
        return [];
    }

    const queryWords = query
        .toLowerCase()
        .split(/\s+/);
    const scored = [];

    const searchLimit = Math.min(qaText.length, qaVectors.length);
    for (let idx = 0; idx < searchLimit; idx++) {
        const qa = qaText[idx];
        if (!qa || !qa.question || !qa.answer) 
            continue;
        
        const questionWords = qa
            .question
            .toLowerCase()
            .split(/\s+/);
        const commonWords = queryWords.filter(w => questionWords.includes(w));
        const wordOverlap = commonWords.length / Math.max(queryWords.length, 1);

        const embedding = qaVectors[idx];
        if (!embedding || embedding.length === 0) 
            continue;
        
        const similarity = wordOverlap;
        if (similarity > 0.3) {
            scored.push({question: qa.question, answer: qa.answer, score: similarity, similarity: similarity});
        }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

function isReady() {
    return isInitialized;
}

function getQAJson() {
    return qaText;
}

module.exports = {
    initialize,
    searchSemantic,
    searchTopK,
    isReady,
    getQAJson,
    qaJson: qaText
};
