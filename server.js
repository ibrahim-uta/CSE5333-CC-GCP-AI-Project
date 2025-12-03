const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// Import utilities
const config = require('./utils/config');
const firestoreUtil = require('./utils/firestore');
const dialogflowUtil = require('./utils/dialogflow');
const matchingUtil = require('./utils/matching');
const semanticUtil = require('./utils/semantic-matching-faiss');
const searchEngine = require('./utils/search-engine'); // 🆕 NEW

console.log('============================================================');
console.log(`Environment: ${config.environment}`);
console.log(`Dialogflow: ${config.useDialogflow
    ? 'ENABLED'
    : 'DISABLED'}`);
console.log(`Project ID: ${config.projectId}`);
console.log('============================================================\n');

// Initialize services
let serverReady = false;

async function initializeServices() {
    try {
        // ✅ Initialize Dialogflow FIRST
        if (config.useDialogflow) {
            dialogflowUtil.initializeDialogflow();
        }

        // Load Q&A data from Firestore
        console.log('📊 Loading Q&A data from Firestore...');
        await firestoreUtil.loadQACache();
        const qaCache = firestoreUtil.getCache();
        console.log(`✅ Q&A data loaded into cache\n`);

        // Initialize search engine
        searchEngine.initialize(qaCache);

        // Initialize semantic matching
        console.log('🧠 Initializing semantic embedder...');
        await semanticUtil.initialize();
        console.log('✅ Semantic matching ready\n');

        serverReady = true;

        console.log('============================================================');
        console.log(`🚀 Server running: http://localhost:${PORT}`);
        console.log('✅ All services ready - accepting requests!');
        console.log('============================================================\n');
    } catch (error) {
        console.error('❌ Initialization error:', error);
        process.exit(1);
    }
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: serverReady
            ? 'ready'
            : 'initializing',
        services: {
            firestore: firestoreUtil.isDataLoaded(),
            semantic: semanticUtil.isReady(),
            searchEngine: searchEngine.ready
        }
    });
});

// 🆕 Firebase config endpoint (ADDED TO FIX YOUR ERROR)
app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: config.firebase.apiKey,
        authDomain: config.firebase.authDomain,
        projectId: config.firebase.projectId,
        storageBucket: config.firebase.storageBucket,
        messagingSenderId: config.firebase.messagingSenderId,
        appId: config.firebase.appId
    });
});

// 🆕 OPTIMIZED SEARCH ENDPOINT (NEW!)
app.get('/api/search-questions', (req, res) => {
    const query = req.query.q;
    const limit = parseInt(req.query.limit) || 5;
    const method = req.query.method || 'hybrid';

    if (!query || query.length < 2) {
        return res.json({suggestions: []});
    }

    if (!firestoreUtil.isDataLoaded()) {
        return res.json({suggestions: [], error: 'Data not loaded'});
    }

    console.log(`🔍 Search: "${query}" [${method}, limit=${limit}]`);

    try {
        let results = [];
        const qaCache = firestoreUtil.getCache();

        if (method === 'semantic' && semanticUtil.isReady()) {
            // Use FAISS semantic search
            results = semanticUtil.searchTopK(query, qaCache, limit);
            console.log(`  ✓ Semantic (FAISS): ${results.length} results`);
        } else {
            // Use optimized search engine
            results = searchEngine.search(query, method, limit);
            console.log(`  ✓ ${method}: ${results.length} results`);
        }

        const suggestions = results.map(r => ({
            question: r.question,
            answer: r.answer,
            score: r.score || r.similarity || 0,
            preview: r
                .answer
                .substring(0, 80) + '...'
        }));

        res.json({suggestions, method, count: suggestions.length, totalQuestions: qaCache.length});
    } catch (error) {
        console.error('Search error:', error);
        res.json({suggestions: [], error: 'Search failed'});
    }
});

// Chat endpoint Chat endpoint Chat endpoint
app.post('/api/chat', async(req, res) => {
    const {message, sessionId, userId, preferredMethod} = req.body;
    console.log(`\n❓ User question: "${message}" [Method: ${preferredMethod}]`);

    if (!firestoreUtil.isDataLoaded()) {
        return res
            .status(503)
            .json({error: 'Service initializing'});
    }

    const qaCache = firestoreUtil.getCache();
    let result = null;
    let method = '';

    try {
        // Try Dialogflow first if enabled and (dialogflow selected OR hybrid mode)
        if (config.useDialogflow && (preferredMethod === 'dialogflow' || preferredMethod === 'hybrid')) {
            try {
                result = await dialogflowUtil.detectIntent(message, sessionId);
                if (result && result.answer) {
                    method = 'dialogflow';
                    console.log(`✓ Dialogflow response`);
                }
            } catch (error) {
                console.log(`⚠️ Dialogflow failed, falling back...`);
            }
        }

        // Semantic search (if not found yet and semantic/hybrid selected)
        if (!result && (preferredMethod === 'semantic' || preferredMethod === 'hybrid') && semanticUtil.isReady()) {
            result = semanticUtil.searchSemantic(message, qaCache);
            method = 'semantic';
            console.log(`✓ Found via semantic search: "${result.question}"`);
        }

        // Fuzzy search (if fuzzy selected)
        if (!result && preferredMethod === 'fuzzy') {
            const fuzzyResults = searchEngine.search(message, 'fuzzy', 1);
            if (fuzzyResults && fuzzyResults.length > 0) {
                result = fuzzyResults[0];
                method = 'fuzzy';
                console.log(`✓ Found via fuzzy search: "${result.question}"`);
            }
        }

        // Keyword matching (fallback or if keyword selected)
        if (!result) {
            result = matchingUtil.findBestMatch(message, qaCache);
            method = 'keyword';
            console.log(`✓ Found via keyword matching: "${result.question}"`);
        }

        if (!result || !result.answer) {
            return res.json({reply: "I couldn't find an answer. Please try searching from the suggestions.", method: 'none'});
        }

        res.json({
            reply: result.answer,
            question: result.question,
            method: method,
            confidence: result.score || result.similarity || 0
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.json({reply: "An error occurred. Please try again.", method: 'error'});
    }
});

// Sample questions endpoint
app.get('/api/sample-questions', (req, res) => {
    const count = parseInt(req.query.count) || 6;

    if (!firestoreUtil.isDataLoaded()) {
        return res.json({questions: []});
    }

    const qaCache = firestoreUtil.getCache();

    // Get random sample questions
    const samples = [];
    const used = new Set();

    while (samples.length < count && samples.length < qaCache.length) {
        const idx = Math.floor(Math.random() * qaCache.length);
        if (!used.has(idx) && qaCache[idx] && qaCache[idx].question) {
            samples.push(qaCache[idx].question);
            used.add(idx);
        }
    }

    res.json({questions: samples});
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'chat.html'));
});

// Start server
app.listen(PORT, () => {
    initializeServices();
});
