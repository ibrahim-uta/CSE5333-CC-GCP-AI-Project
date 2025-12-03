// server.js

const express = require('express');
const path = require('path');
const cors = require('cors');
const {v4: uuidv4} = require('uuid');

const config = require('./utils/config');
const dialogflow = require('./utils/dialogflow');
const firestoreUtil = require('./utils/firestore');
const searchEngine = require('./utils/search-engine');
const semanticUtil = require('./utils/semantic-matching-faiss');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'frontend')));

let serverReady = false;

// ---------------- Initialization ----------------

async function initialize() {
    console.log('============================================================');
    console.log('Environment:', config.environment);
    console.log('Dialogflow:', config.useDialogflow
        ? 'ENABLED'
        : 'DISABLED');
    console.log('Project ID:', config.projectId);
    console.log('============================================================');

    try {
        if (config.useDialogflow) {
            dialogflow.initializeDialogflow();
        }

        // Load FAISS + qa_data.json into memory
        await semanticUtil.initialize();

        // Firestore only for history/intents (no QA bulk load)
        console.log('Initializing Firestore (no bulk cache)...');
        firestoreUtil
            .loadQACache()
            .catch(err => {
                console.error('Firestore init (non-critical) failed:', err.message);
            });

        // Build search index from FAISS QA data
        const qaFromFaiss = (semanticUtil.getQAJson && semanticUtil.getQAJson()) || semanticUtil.qaJson || [];
        console.log(`Initializing searchEngine with ${qaFromFaiss.length} QA pairs from FAISS data`);
        searchEngine.initialize(qaFromFaiss);

        serverReady = true;
        console.log(`Server is ready and listening on port ${config.port}`);
        console.log(`Local: http://localhost:${config.port}`);
    } catch (error) {
        console.error('Fatal initialization error:', error);
        process.exit(1);
    }
}

// ---------------- Health ----------------

app.get('/api/health', (req, res) => {
    const firestoreStats = firestoreUtil.getCacheStats();
    const engineStats = searchEngine.getStats
        ? searchEngine.getStats()
        : {
            indexSize: 0,
            cacheSize: 0,
            ready: searchEngine.ready
        };

    res.json({
        status: serverReady
            ? 'ready'
            : 'initializing',
        services: {
            firestore: {
                loaded: firestoreUtil.isDataLoaded(),
                docCount: (firestoreStats.cache || []).length,
                error: firestoreStats.error || null
            },
            semantic: {
                ready: semanticUtil.isReady(),
                error: null
            },
            searchEngine: {
                ready: engineStats.ready,
                indexSize: engineStats.indexSize,
                cacheSize: engineStats.cacheSize
            }
        },
        timestamp: new Date().toISOString()
    });
});

// ---------------- Firebase config for frontend ----------------

app.get('/api/firebase-config', (req, res) => {
    res.json(config.firebase);
});

// ---------------- Search suggestions ----------------

app.get('/api/search-questions', (req, res) => {
    const query = req.query.q;
    const limit = parseInt(req.query.limit) || 5;
    const method = req.query.method || 'hybrid';

    if (!query || query.length < 2) {
        return res.json({suggestions: []});
    }

    console.log(`Search: "${query}" [${method}, limit=${limit}]`);

    try {
        let results = [];
        let methodUsed = method;

        const semanticReady = semanticUtil.isReady();
        const wantSemantic = method === 'semantic' || (method === 'hybrid' && semanticReady);

        if (wantSemantic) {
            results = semanticUtil.searchTopK(query, limit) || [];
            methodUsed = 'semantic';
            console.log(`Semantic (FAISS): ${results.length} results`);
        } else {
            results = searchEngine.search(query, method, limit) || [];
            console.log(`${method}: ${results.length} results`);
        }

        const suggestions = results.map(r => ({
            question: r.question,
            answer: r.answer,
            score: r.score || r.similarity || 0,
            preview: (r.answer || '').substring(0, 120) + '...'
        }));

        res.json({suggestions, method: methodUsed, count: suggestions.length});
    } catch (error) {
        console.error('Search error:', error);
        res
            .status(500)
            .json({suggestions: [], error: 'Search failed'});
    }
});

// ---------------- Sample questions ---------------- sample questions
app.get('/api/sample-questions', (req, res) => {
    try {
        const count = parseInt(req.query.count) || 6;

        // Prefer the FAISS QA data (same as searchEngine initialization)
        const qaFromFaiss = (semanticUtil.getQAJson && semanticUtil.getQAJson()) || semanticUtil.qaJson || [];

        const cache = qaFromFaiss;

        if (!cache || cache.length === 0) {
            return res.json({questions: []});
        }

        const samples = [];
        const used = new Set();

        while (samples.length < count && samples.length < cache.length) {
            const idx = Math.floor(Math.random() * cache.length);
            const row = cache[idx];
            if (!used.has(idx) && row && row.question && row.answer) {
                used.add(idx);
                samples.push({question: row.question, answer: row.answer});
            }
        }

        res.json({questions: samples});
    } catch (error) {
        console.error('Error fetching sample questions:', error);
        res.json({questions: []});
    }
});

// ---------------- Chat history (Firestore) ---------------- create chat
app.post('/api/chats', async(req, res) => {
    const {userId, title} = req.body;
    if (!userId) 
        return res.status(400).json({error: 'userId required'});
    
    try {
        const db = firestoreUtil.getFirestore() || firestoreUtil.initializeFirestore();
        const docRef = await db
            .collection('users')
            .doc(userId)
            .collection('chats')
            .add({
                title: title || 'New chat',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

        res.json({chatId: docRef.id});
    } catch (err) {
        console.error('Create chat error:', err);
        res
            .status(500)
            .json({error: 'Failed to create chat'});
    }
});

// list chats
app.get('/api/chats', async(req, res) => {
    const {userId} = req.query;
    if (!userId) 
        return res.status(400).json({error: 'userId required'});
    
    try {
        const db = firestoreUtil.getFirestore() || firestoreUtil.initializeFirestore();
        const snap = await db
            .collection('users')
            .doc(userId)
            .collection('chats')
            .orderBy('updatedAt', 'desc')
            .get();

        const chats = snap
            .docs
            .map(d => ({
                id: d.id,
                ...d.data()
            }));
        res.json({chats});
    } catch (err) {
        console.error('List chats error:', err);
        res
            .status(500)
            .json({error: 'Failed to list chats'});
    }
});

// get messages
app.get('/api/chats/:chatId/messages', async(req, res) => {
    const {userId} = req.query;
    const {chatId} = req.params;
    if (!userId || !chatId) 
        return res.status(400).json({error: 'userId and chatId required'});
    
    try {
        const db = firestoreUtil.getFirestore() || firestoreUtil.initializeFirestore();
        const snap = await db
            .collection('users')
            .doc(userId)
            .collection('chats')
            .doc(chatId)
            .collection('messages')
            .orderBy('createdAt', 'asc')
            .get();

        const messages = snap
            .docs
            .map(d => d.data());
        res.json({messages});
    } catch (err) {
        console.error('Get messages error:', err);
        res
            .status(500)
            .json({error: 'Failed to get messages'});
    }
});

// delete chat
app.delete('/api/chats/:chatId', async(req, res) => {
    const {userId} = req.query;
    const {chatId} = req.params;
    if (!userId || !chatId) 
        return res.status(400).json({error: 'userId and chatId required'});
    
    try {
        const db = firestoreUtil.getFirestore() || firestoreUtil.initializeFirestore();
        const chatRef = db
            .collection('users')
            .doc(userId)
            .collection('chats')
            .doc(chatId);

        const msgSnap = await chatRef
            .collection('messages')
            .get();
        const batch = db.batch();
        msgSnap.forEach(doc => batch.delete(doc.ref));
        batch.delete(chatRef);
        await batch.commit();

        res.json({success: true});
    } catch (err) {
        console.error('Delete chat error:', err);
        res
            .status(500)
            .json({error: 'Failed to delete chat'});
    }
});

// ---------------- Main chat endpoint ---------------- chat endpoint (saves
// messages to history)
app.post('/api/chat', async(req, res) => {
    const {
        message,
        sessionId,
        userId,
        preferredMethod,
        chatId,

        // NEW: optional ground-truth fields
        groundTruthQuestion,
        groundTruthAnswer,
        groundTruthMethod,
        groundTruthConfidence
    } = req.body;

    if (!message || !sessionId || !userId || !chatId) {
        return res
            .status(400)
            .json({error: 'message, sessionId, userId, chatId required'});
    }

    console.log(`User question: ${message} [method=${preferredMethod}]`);

    try {
        let reply;
        let questionForLog = message;
        let methodUsed = preferredMethod || null;
        let confidence;

        // --------- 1. Ground-truth fast path ----------
        if (groundTruthAnswer) {
            reply = groundTruthAnswer;
            questionForLog = groundTruthQuestion || message;
            methodUsed = groundTruthMethod || preferredMethod || 'ground-truth';
            confidence = typeof groundTruthConfidence === 'number'
                ? groundTruthConfidence
                : 1.0;
        } else {
            // --------- 2. Existing retrieval pipeline ----------
            const qaCache = firestoreUtil.isDataLoaded()
                ? firestoreUtil.getCache()
                : [];

            let result = null;

            // Dialogflow first (if enabled and in dialogflow/hybrid mode)
            if (config.useDialogflow && (preferredMethod === 'dialogflow' || preferredMethod === 'hybrid')) {
                try {
                    // NOTE: correct order: (message, sessionId)
                    const df = await dialogflow.detectIntent(message, sessionId);
                    if (df && df.answer) {
                        result = df;
                        methodUsed = 'dialogflow';
                    }
                } catch (e) {
                    console.log('Dialogflow failed, falling back');
                }
            }

            // Semantic FAISS
            if (!result && (preferredMethod === 'semantic' || preferredMethod === 'hybrid') && semanticUtil.isReady()) {
                const sem = semanticUtil.searchTopK(message, 1);
                if (sem && sem.length > 0) {
                    result = sem[0];
                    methodUsed = 'semantic';
                }
            }

            // Fuzzy
            if (!result && preferredMethod === 'fuzzy') {
                const fuzzy = searchEngine.search(message, 'fuzzy', 1);
                if (fuzzy && fuzzy.length > 0) {
                    result = fuzzy[0];
                    methodUsed = 'fuzzy';
                }
            }

            // Keyword fallback
            if (!result) {
                const kw = searchEngine.search(message, 'keyword', 1);
                if (kw && kw.length > 0) {
                    result = kw[0];
                    methodUsed = 'keyword';
                }
            }

            if (!result || !result.answer) {
                return res.json({reply: "I couldn't find an answer. Please try searching from the suggestions.", method: 'none'});
            }

            reply = result.answer;
            questionForLog = result.question;
            confidence = result.score || result.similarity || 0;
        }

        // --------- Logging to Firestore (unchanged structure) ----------
        const db = firestoreUtil.getFirestore() || firestoreUtil.initializeFirestore();
        const chatRef = db
            .collection('users')
            .doc(userId)
            .collection('chats')
            .doc(chatId);
        const msgs = chatRef.collection('messages');
        const now = new Date().toISOString();

        // User message
        await msgs.add({id: uuidv4(), role: 'user', text: questionForLog, createdAt: now});

        // Bot message
        await msgs.add({
            id: uuidv4(),
            role: 'bot',
            text: reply,
            method: methodUsed,
            confidence: confidence || 0,
            createdAt: now
        });

        // Auto-rename chat to first question
        const chatSnap = await chatRef.get();
        const updateFields = {
            updatedAt: now
        };
        if (chatSnap.exists) {
            const data = chatSnap.data() || {};
            if (!data.title || data.title === 'New chat') {
                const maxLen = 80;
                const title = questionForLog.length > maxLen
                    ? questionForLog.slice(0, maxLen - 3) + '...'
                    : questionForLog;
                updateFields.title = title;
            }
        }
        await chatRef.update(updateFields);

        res.json({
            reply,
            question: questionForLog,
            method: methodUsed,
            confidence: confidence || 0
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.json({reply: 'An error occurred. Please try again.', method: 'error'});
    }
});

// ---------------- SPA catch‑all ----------------

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'chat.html'));
});

// ---------------- Start server ----------------

app.listen(config.port, () => {
    initialize();
});
