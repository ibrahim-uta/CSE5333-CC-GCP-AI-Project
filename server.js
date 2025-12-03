const express = require('express');
const cors = require('cors');
const {v4: uuidv4} = require('uuid');

const config = require('./utils/config');
const firestoreUtil = require('./utils/firestore');
const dialogflowUtil = require('./utils/dialogflow');
const matchingUtil = require('./utils/matching');
const semanticMatching = require('./utils/semantic-matching-faiss');

const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

// Serve static files from frontend folder at /frontend path
app.use('/frontend', express.static(path.join(__dirname, 'frontend')));

// Initialize services (don't wait for data here)
firestoreUtil.initializeFirestore();
dialogflowUtil.initializeDialogflow();

// Root route - serves the redirect index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Firebase config endpoint
app.get('/api/firebase-config', (req, res) => {
    res.json(config.firebase);
});

// Chat history endpoint
app.post('/api/chat-history', async(req, res) => {
    try {
        const {userId, message, reply, sessionId} = req.body;

        if (!userId) {
            return res
                .status(400)
                .json({error: 'userId is required'});
        }

        const historyRef = await firestoreUtil
            .getFirestore()
            .collection('chat_history')
            .add({
                userId: userId,
                message: message,
                reply: reply,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });

        res.json({success: true, id: historyRef.id});
    } catch (error) {
        console.error('Error saving chat history:', error);
        res
            .status(500)
            .json({error: 'Failed to save chat history'});
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    const isLoaded = firestoreUtil.isDataLoaded();
    res
        .status(200)
        .json({
            status: 'healthy', 
            dataLoaded: isLoaded, 
            dialogflowEnabled: config.useDialogflow
        });
});

// Main chat endpoint
app.post('/api/chat', async(req, res) => {
    try {
        const {message, sessionId, preferredMethod} = req.body;

        if (!message) {
            return res.status(400).json({error: 'Message is required'});
        }

        if (!firestoreUtil.isDataLoaded()) {
            return res.status(503).json({
                error: 'Service is loading data. Please try again in a moment.'
            });
        }

        const userSessionId = sessionId || uuidv4();
        console.log(`\n❓ User question: "${message}" [Method: ${preferredMethod || 'auto'}]`);

        let answer = null;
        let matchedQuestion = null;
        let confidence = 'none';
        let method = 'none';

        // Try Dialogflow if enabled and either preferred or auto
        if (dialogflowUtil.isDialogflowEnabled() && 
            (preferredMethod === 'dialogflow' || !preferredMethod)) {
            try {
                const dialogflowResult = await dialogflowUtil.detectIntent(message, userSessionId);
                if (dialogflowResult && dialogflowResult.confidence > 0.5) {
                    const result = await firestoreUtil.findAnswerByIntent(dialogflowResult.intent);
                    if (result) {
                        answer = result.answer;
                        matchedQuestion = result.question;
                        confidence = dialogflowResult.confidence > 0.8 ? 'high' : 'medium';
                        method = 'dialogflow';
                        console.log(`✓ Found via Dialogflow: "${matchedQuestion}" (confidence: ${(dialogflowResult.confidence * 100).toFixed(1)}%)`);
                    }
                }
            } catch (error) {
                console.error('Dialogflow error:', error.message);
                console.log('Falling back to other methods...');
            }
        }


        // Use user's preferred method
        if (!answer) {
            const qaCache = firestoreUtil.getCache();
            
            // Try semantic search if requested
            if (preferredMethod === 'semantic') {
                try {
                    const semanticResult = await semanticMatching.findBestSemanticMatch(message, qaCache);
                    
                    if (semanticResult) {
                        answer = semanticResult.match.answer;
                        matchedQuestion = semanticResult.match.question;
                        confidence = semanticResult.confidence;
                        method = 'cached-semantic';
                        console.log(`✓ Found via cached semantic search: "${matchedQuestion}"`);
                    }
                } catch (error) {
                    console.log('Semantic search error, falling back to keyword');
                }
            }
            
            // Fallback to keyword matching
            if (!answer) {
                const keywordResult = matchingUtil.findBestMatch(message, qaCache);
                if (keywordResult) {
                    answer = keywordResult.match.answer;
                    matchedQuestion = keywordResult.match.question;
                    confidence = keywordResult.score > 15 ? 'high' : 'medium';
                    method = 'keyword';
                    console.log(`✓ Found via keyword matching: "${matchedQuestion}"`);
                }
            }
        }

        if (answer) {
            res.json({
                reply: answer,
                matchedQuestion: matchedQuestion,
                confidence: confidence,
                method: method,
                sessionId: userSessionId,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`✗ No match found`);
            res.json({
                reply: "I'm sorry, I don't have a good answer to that question. Try asking about general knowledge topics!",
                confidence: 'none',
                method: 'none',
                sessionId: userSessionId,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({error: 'Internal server error', message: error.message});
    }
});

// Sample questions endpoint
app.get('/api/sample-questions', (req, res) => {
    const count = parseInt(req.query.count) || 10;
    if (!firestoreUtil.isDataLoaded()) {
        return res.status(503).json({error: 'Data not loaded yet'});
    }
    const qaCache = firestoreUtil.getCache();
    const samples = matchingUtil.getRandomSamples(qaCache, count);

    res.json({count: samples.length, questions: samples});
});


// Stats endpoint
app.get('/api/stats', (req, res) => {
    const stats = firestoreUtil.getCacheStats();

    res.json({
        environment: config.environment,
        dialogflowEnabled: config.useDialogflow,
        totalQuestions: stats.totalQuestions,
        isLoaded: stats.isLoaded,
        projectId: config.projectId,
        timestamp: new Date().toISOString()
    });
});

// Admin endpoint to add Q&A pairs
app.post('/api/admin/add-qa', async(req, res) => {
    try {
        const {intent, question, answer} = req.body;

        if (!question || !answer) {
            return res
                .status(400)
                .json({error: 'question and answer are required'});
        }

        const result = await firestoreUtil.addQAPair(intent, question, answer);

        res.json({message: 'Q&A pair added successfully', id: result.id});

    } catch (error) {
        console.error('Error adding Q&A:', error);
        res
            .status(500)
            .json({error: 'Failed to add Q&A pair', message: error.message});
    }
});

// Start server AFTER loading all data
async function startServer() {
    console.log('='.repeat(60));
    console.log(`Environment: ${config.environment}`);
    console.log(`Dialogflow: ${config.useDialogflow ? 'ENABLED' : 'DISABLED'}`);
    console.log(`Project ID: ${config.projectId}`);
    console.log('='.repeat(60) + '\n');

    try {
        console.log('📊 Loading Q&A data from Firestore...');
        await firestoreUtil.loadQACache();
        console.log('✅ Q&A data loaded into cache\n');

        console.log('🧠 Initializing semantic embedder...');
        await semanticMatching.initializeEmbedder();
        console.log('✅ Semantic matching ready\n');

        // Start server AFTER all data is loaded
        app.listen(config.port, () => {
            console.log('='.repeat(60));
            console.log(`🚀 Server running: http://localhost:${config.port}`);
            console.log(`✅ All services ready - accepting requests!`);
            console.log('='.repeat(60) + '\n');
        });

    } catch (error) {
        console.error('❌ Failed to initialize server:', error);
        console.error('Server NOT started. Fix the error and try again.');
        process.exit(1);
    }
}

// Initialize and start
startServer();
