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
  firestoreEmulatorHost:
    process.env.FIRESTORE_EMULATOR_HOST || "localhost:8080",
  // Firestore database ID
  firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "knowledge-base",

  // Dialogflow settings
  useDialogflow: process.env.USE_DIALOGFLOW === "true",

  // Collection names
  qaCollection: "qa_pairs",
};

module.exports = config;
