const {SessionsClient} = require('@google-cloud/dialogflow');
const config = require('./config');

let dialogflowClient = null;

function initializeDialogflow() {
    if (config.useDialogflow) {
        console.log('Initializing Dialogflow client');
        dialogflowClient = new SessionsClient();
        return true;
    }
    console.log('Dialogflow disabled - using keyword matching');
    return false;
}

async function detectIntent(userMessage, sessionId) {
    if (!config.useDialogflow || !dialogflowClient) {
        return null;
    }

    try {
        const sessionPath = dialogflowClient.projectAgentSessionPath(config.projectId, sessionId);

        const request = {
            session: sessionPath,
            queryInput: {
                text: {
                    text: userMessage,
                    languageCode: 'en-US'
                }
            }
        };

        const [response] = await dialogflowClient.detectIntent(request);
        const result = response.queryResult;

        console.log(`Dialogflow detected intent: ${result.intent.displayName}`);
        console.log(`Confidence: ${(result.intentDetectionConfidence * 100).toFixed(1)}%`);

        return {intent: result.intent.displayName, confidence: result.intentDetectionConfidence, fulfillmentText: result.fulfillmentText};
    } catch (error) {
        console.error('Dialogflow error:', error.message);
        return null;
    }
}

function isDialogflowEnabled() {
    return config.useDialogflow && dialogflowClient !== null;
}

module.exports = {
    initializeDialogflow,
    detectIntent,
    isDialogflowEnabled
};
