const {Firestore} = require('@google-cloud/firestore');
const fs = require('fs');
require('dotenv').config();

const ENVIRONMENT = process.env.ENVIRONMENT || 'local';
const BATCH_SIZE = 500;

// --sample flag for testing
const USE_SAMPLE = process.argv[2] === '--sample';
const DATASET_FILE = USE_SAMPLE
    ? 'wikipedia_qa_sample.json'
    : 'wikipedia_qa_dataset.json';

let firestore;

if (ENVIRONMENT === 'local') {
    console.log('🔧 Using Firestore Emulator');
    firestore = new Firestore({
        projectId: process.env.GCP_PROJECT_ID || 'demo-chatbot-project',
        host: process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080',
        ssl: false
    });
} else {
    console.log('☁️  Using Cloud Firestore');
    firestore = new Firestore({projectId: process.env.GCP_PROJECT_ID});
}

async function clearCollection() {
    console.log('🗑️  Clearing existing data...');
    const snapshot = await firestore
        .collection('qa_pairs')
        .limit(1000)
        .get();

    if (snapshot.empty) {
        console.log('✓ Collection is empty');
        return;
    }

    const batch = firestore.batch();
    snapshot
        .docs
        .forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`✓ Deleted ${snapshot.size} documents`);

    if (snapshot.size === 1000) {
        await clearCollection();
    }
}

async function populateFirestore() {
    try {
        if (!fs.existsSync(DATASET_FILE)) {
            console.error(`Dataset file '${DATASET_FILE}' not found!`);
            console.log('💡 Run: python download_wikipedia_qa.py first');
            process.exit(1);
        }

        console.log(`\n📖 Reading dataset from ${DATASET_FILE}...`);
        const data = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf8'));

        console.log(`📊 Total Q&A pairs to load: ${data.length}`);

        if (USE_SAMPLE) {
            console.log('⚠️  Loading SAMPLE dataset for testing');
        } else {
            console.log('⚠️  Loading FULL dataset - this will take a while!');
        }

        await clearCollection();

        console.log(`⏳ Starting batch upload...\n`);

        let batch = firestore.batch();
        let batchCount = 0;
        let totalAdded = 0;
        const startTime = Date.now();

        for (let i = 0; i < data.length; i++) {
            const qa = data[i];
            const docRef = firestore
                .collection('qa_pairs')
                .doc();

            batch.set(docRef, qa);
            batchCount++;

            if (batchCount === BATCH_SIZE || i === data.length - 1) {
                await batch.commit();
                totalAdded += batchCount;

                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const rate = (totalAdded / (Date.now() - startTime) * 1000).toFixed(0);
                console.log(`✓ Progress: ${totalAdded}/${data.length} (${ (totalAdded / data.length * 100).toFixed(1)}%) | ${elapsed}s elapsed | ${rate} docs/sec`);

                batch = firestore.batch();
                batchCount = 0;
            }
        }

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\nSuccessfully loaded ${totalAdded} Q&A pairs in ${totalTime} seconds!`);

        const snapshot = await firestore
            .collection('qa_pairs')
            .count()
            .get();
        console.log(`📝 Verified: ${snapshot.data().count} documents in Firestore`);

    } catch (error) {
        console.error('Error populating Firestore:', error);
        process.exit(1);
    }
}

populateFirestore();
