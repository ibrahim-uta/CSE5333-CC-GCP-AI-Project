const {Firestore} = require('@google-cloud/firestore');
const config = require('./config');

let firestore;
let qaCache = [];
let isLoaded = false;

function initializeFirestore() {
    if (config.isLocal) {
        console.log('🔧 Connecting to Firestore Emulator');
        firestore = new Firestore({projectId: config.projectId, host: config.firestoreEmulatorHost, ssl: false});
    } else {
        console.log('☁️  Connecting to Cloud Firestore');
        firestore = new Firestore({projectId: config.projectId});
    }

    return firestore;
}

async function loadQACache() {
    try {
        console.log('Loading Q&A pairs from Firestore...');

        if (!firestore) {
            initializeFirestore();
        }

        const snapshot = await firestore
            .collection(config.qaCollection)
            .get();

        qaCache = [];
        snapshot.forEach(doc => {
            qaCache.push({
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`Loaded ${qaCache.length} Q&A pairs into cache`);
        isLoaded = true;
        return qaCache.length;
    } catch (error) {
        console.error('Error loading Q&A cache:', error);
        throw error;
    }
}

async function findAnswerByIntent(intentName) {
    try {
        const snapshot = await firestore
            .collection(config.qaCollection)
            .where('intent', '==', intentName)
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            return {
                answer: doc
                    .data()
                    .answer,
                question: doc
                    .data()
                    .question,
                source: 'firestore-intent'
            };
        }

        const match = qaCache.find(qa => qa.intent && qa.intent.toLowerCase() === intentName.toLowerCase());

        if (match) {
            return {answer: match.answer, question: match.question, source: 'cache-intent'};
        }

        return null;
    } catch (error) {
        console.error('Error finding answer by intent:', error);
        return null;
    }
}

async function addQAPair(intent, question, answer) {
    try {
        const docRef = await firestore
            .collection(config.qaCollection)
            .add({
                intent: intent || `custom_${Date.now()}`,
                question: question,
                answer: answer,
                createdAt: new Date().toISOString()
            });

        await loadQACache();

        return {success: true, id: docRef.id};
    } catch (error) {
        console.error('Error adding Q&A pair:', error);
        throw error;
    }
}

function getCacheStats() {
    return {isLoaded: isLoaded, totalQuestions: qaCache.length, cache: qaCache};
}

module.exports = {
    initializeFirestore,
    loadQACache,
    findAnswerByIntent,
    addQAPair,
    getCacheStats,
    getCache: () => qaCache,
    isDataLoaded: () => isLoaded
};
