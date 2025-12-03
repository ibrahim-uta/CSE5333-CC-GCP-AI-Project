// firestore.js

const {Firestore} = require("@google-cloud/firestore");
const config = require("./config");

let firestore;
let qaCache = [];
let isLoaded = false;

function initializeFirestore() {
    if (config.isLocal) {
        console.log("🔧 Connecting to Firestore Emulator");
        firestore = new Firestore({projectId: config.projectId, host: config.firestoreEmulatorHost, ssl: false});
    } else {
        console.log("☁️ Connecting to Cloud Firestore");
        delete process.env.FIRESTORE_EMULATOR_HOST;
        firestore = new Firestore({projectId: config.projectId, databaseId: config.firestoreDatabaseId});
    }
    return firestore;
}

async function loadQACache() {
    console.log("⚠️ Skipping Firestore bulk load (using FAISS + qa_data.json for search).");
    qaCache = []; // No cache needed for search
    isLoaded = true; // Mark as 'loaded' so health/search do not block
    return 0;
}

// Keep intent lookup and addQAPair as-is
async function findAnswerByIntent(intentName) {
    try {
        if (!firestore) {
            initializeFirestore();
        }

        const snapshot = await firestore
            .collection(config.qaCollection)
            .where("intent", "==", intentName)
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
                source: "firestore-intent"
            };
        }

        const match = qaCache.find((qa) => qa.intent && qa.intent.toLowerCase() === intentName.toLowerCase());

        if (match) {
            return {answer: match.answer, question: match.question, source: "cache-intent"};
        }

        return null;
    } catch (error) {
        console.error("Error finding answer by intent:", error);
        return null;
    }
}

async function addQAPair(intent, question, answer) {
    try {
        if (!firestore) {
            initializeFirestore();
        }

        const docRef = await firestore
            .collection(config.qaCollection)
            .add({
                intent: intent || `custom_${Date.now()}`,
                question: question,
                answer: answer,
                createdAt: new Date().toISOString()
            });

        // No need to reload whole cache
        return {success: true, id: docRef.id};
    } catch (error) {
        console.error("Error adding Q&A pair:", error);
        throw error;
    }
}

function getCacheStats() {
    return {isLoaded: isLoaded, totalQuestions: qaCache.length, cache: qaCache, error: null};
}

function getFirestore() {
    return firestore;
}

module.exports = {
    initializeFirestore,
    loadQACache,
    findAnswerByIntent,
    addQAPair,
    getCacheStats,
    getCache: () => qaCache,
    isDataLoaded: () => isLoaded,
    getFirestore: getFirestore
};
