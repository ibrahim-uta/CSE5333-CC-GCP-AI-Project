const express = require('express');
const cors = require('cors');
const {v4: uuidv4} = require('uuid');

const config = require('./utils/config');
const firestoreUtil = require('./utils/firestore');
const dialogflowUtil = require('./utils/dialogflow');
const matchingUtil = require('./utils/matching');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

firestoreUtil.initializeFirestore();
dialogflowUtil.initializeDialogflow();

app.get('/', (req, res) => {
    const stats = firestoreUtil.getCacheStats();
    res.json({
        status: 'ok',
        service: 'Wikipedia General Knowledge Chatbot',
        environment: config.environment,
        dialogflowEnabled: config.useDialogflow,
        dataLoaded: stats.isLoaded,
        totalQuestions: stats.totalQuestions,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    const isLoaded = firestoreUtil.isDataLoaded();
    res
        .status(200)
        .json({status: 'healthy', dataLoaded: isLoaded, dialogflowEnabled: config.useDialogflow});
});

app.post('/api/chat', async(req, res) => {
    try {
        const {message, sessionId} = req.body;

        // Validate input
        if (!message) {
            return res
                .status(400)
                .json({error: 'Message is required'});
        }

        // Check if data is loaded
        if (!firestoreUtil.isDataLoaded()) {
            return res
                .status(503)
                .json({error: 'Service is loading data. Please try again in a moment.'});
        }

        const userSessionId = sessionId || uuidv4();
        console.log(`\n❓ User question: "${message}"`);

        let answer = null;
        let matchedQuestion = null;
        let confidence = 'none';
        let method = 'none';

        if (dialogflowUtil.isDialogflowEnabled()) {
            try {
                const dialogflowResult = await dialogflowUtil.detectIntent(message, userSessionId);

                if (dialogflowResult && dialogflowResult.confidence > 0.5) {
                    const result = await firestoreUtil.findAnswerByIntent(dialogflowResult.intent);

                    if (result) {
                        answer = result.answer;
                        matchedQuestion = result.question;
                        confidence = dialogflowResult.confidence > 0.8
                            ? 'high'
                            : 'medium';
                        method = 'dialogflow';
                        console.log(`✓ Found via Dialogflow: "${matchedQuestion}"`);
                    }
                }
            } catch (error) {
                console.log('Dialogflow failed, falling back to keyword matching');
            }
        }

        // Fallback to keyword matching
        if (!answer) {
            const qaCache = firestoreUtil.getCache();
            const keywordResult = matchingUtil.findBestMatch(message, qaCache);

            if (keywordResult) {
                answer = keywordResult.match.answer;
                matchedQuestion = keywordResult.match.question;
                confidence = keywordResult.score > 15
                    ? 'high'
                    : 'medium';
                method = 'keyword';
                console.log(`✓ Found via keyword matching: "${matchedQuestion}"`);
            }
        }

        // Send response
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
                reply: "I'm sorry, I don't have a good answer to that question. Try asking about general" +
                        " knowledge topics like history, science, geography, or famous people!",
                confidence: 'none',
                method: 'none',
                sessionId: userSessionId,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('Error in /api/chat:', error);
        res
            .status(500)
            .json({error: 'Internal server error', message: error.message});
    }
});

app.get('/api/sample-questions', (req, res) => {
    const count = parseInt(req.query.count) || 10;

    if (!firestoreUtil.isDataLoaded()) {
        return res
            .status(503)
            .json({error: 'Data not loaded yet'});
    }

    const qaCache = firestoreUtil.getCache();
    const samples = matchingUtil.getRandomSamples(qaCache, count);

    res.json({count: samples.length, questions: samples});
});

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

app.listen(config.port, async() => {
    console.log(`🌍 Server: http://localhost:${config.port}`);
    console.log(`Environment: ${config.environment}`);
    console.log(`Dialogflow: ${config.useDialogflow
        ? 'ENABLED'
        : 'DISABLED'}`);
    console.log(`Project ID: ${config.projectId}`);
    console.log('='.repeat(60) + '\n');

    try {
        await firestoreUtil.loadQACache();
        console.log('Server ready to accept requests!\n');
    } catch (error) {
        console.error('Failed to load Q&A data:', error);
        console.log('Server running but data not loaded. Check Firestore connection.\n');
    }
});
