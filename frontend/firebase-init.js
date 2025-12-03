// Fetch Firebase config from server and initialize
let firebaseApp = null;
let firebaseAuth = null;

async function initializeFirebase() {
    try {
        if (firebaseApp && firebaseAuth) {
            // Already initialized, return cached instances
            return {app: firebaseApp, auth: firebaseAuth};
        }

        // Fetch config from server
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            throw new Error('Failed to fetch Firebase config');
        }
        const firebaseConfig = await response.json();

        // Import Firebase modules
        const {initializeApp} = await import ('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const {getAuth, setPersistence, browserLocalPersistence} = await import ('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

        // Initialize Firebase
        firebaseApp = initializeApp(firebaseConfig);
        firebaseAuth = getAuth(firebaseApp);

        // Set persistence to LOCAL (survives browser close)
        await setPersistence(firebaseAuth, browserLocalPersistence);

        return {app: firebaseApp, auth: firebaseAuth};
    } catch (error) {
        console.error('Failed to initialize Firebase:', error);
        throw error;
    }
}

export {initializeFirebase};
