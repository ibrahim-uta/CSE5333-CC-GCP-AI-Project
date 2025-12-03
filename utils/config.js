require("dotenv").config();

const config = {
    // Environment settings
    environment: process.env.ENVIRONMENT || "local",
    isLocal: process.env.ENVIRONMENT === "local",
    isCloud: process.env.ENVIRONMENT === "cloud",

    // Server settings
    port: process.env.PORT || 3000,

    // GCP settings
    projectId: process.env.GCP_PROJECT_ID || "demo-chatbot-project",

    // Firestore settings
    firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST || "localhost:8080",
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "knowledge-base",

    // Dialogflow settings
    useDialogflow: process.env.USE_DIALOGFLOW === "true",

    // Collection names
    qaCollection: "qa_pairs",

    firebase: {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    }
};

module.exports = config;
