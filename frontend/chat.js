import {initializeFirebase} from './firebase-init.js';
import {onAuthStateChanged, signOut} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let auth = null;

// State Management
const state = {
    user: null,
    sessionId: null,
    messages: []
};

const API_URL = window.location.origin;

// Initialize Firebase and check authentication
(async() => {
    try {
        const {auth: firebaseAuth} = await initializeFirebase();
        auth = firebaseAuth;

        // Check Authentication - redirect if not logged in
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User is authenticated
                state.user = user;
                state.sessionId = user.uid;
                document
                    .getElementById('username-display')
                    .textContent = user.displayName || user.email;

                // Enable input now that user is authenticated
                const userInput = document.getElementById('userInput');
                if (userInput) {
                    userInput.disabled = false;
                    userInput.placeholder = 'Type your question here...';
                }
            } else {
                // Not authenticated, redirect to login
                window
                    .location
                    .replace('login.html');
            }
        });

    } catch (error) {
        console.error('Chat initialization error:', error);
        // On error, redirect to login
        window
            .location
            .replace('login.html');
    }
})();

// Logout Handler
document
    .getElementById('logoutBtn')
    .addEventListener('click', async() => {
        try {
            await signOut(auth);
            // Redirect to login
            window
                .location
                .replace('login.html');
        } catch (error) {
            console.error('Logout error:', error);
            alert('Failed to logout. Please try again.');
        }
    });

// Chat Form Handler
document
    .getElementById('chatForm')
    .addEventListener('submit', async(e) => {
        e.preventDefault();

        const input = document.getElementById('userInput');
        const message = input
            .value
            .trim();
        const searchMethod = document
            .getElementById('searchMethod')
            .value;

        if (!message || !state.user) 
            return;
        
        addMessage(message, 'user');
        input.value = '';

        document
            .getElementById('loading')
            .classList
            .remove('hidden');

        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({message: message, sessionId: state.sessionId, userId: state.user.uid, preferredMethod: searchMethod})
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();

            // Show which method was used
            const methodBadge = data.method
                ? ` (${data.method})`
                : '';
            addMessage(data.reply + methodBadge, 'bot');

            state
                .messages
                .push({user: message, bot: data.reply, method: data.method, timestamp: new Date()});

        } catch (error) {
            console.error('Chat error:', error);
            addMessage('Sorry, I encountered an error. Please try again.', 'bot');
        } finally {
            document
                .getElementById('loading')
                .classList
                .add('hidden');
        }
    });

function addMessage(text, sender) {
    const messagesContainer = document.getElementById('chatMessages');
    const welcome = messagesContainer.querySelector('.welcome-message');
    if (welcome) 
        welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;

    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
