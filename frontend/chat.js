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

// Autocomplete variables
let searchTimeout = null;
let selectedSuggestion = -1;
let currentSuggestions = [];

// Initialize Firebase and check authentication
(async() => {
    try {
        const {auth: firebaseAuth} = await initializeFirebase();
        auth = firebaseAuth;

        // Check Authentication
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User is authenticated
                state.user = user;
                state.sessionId = user.uid;

                // Enable input
                const userInput = document.getElementById('userInput');
                const askBtn = document.getElementById('askBtn');
                if (userInput) {
                    userInput.disabled = false;
                }
                if (askBtn) {
                    askBtn.disabled = false;
                }

                // 🔧 Setup event listeners AFTER user is authenticated
                setupEventListeners();

                // Load sample questions
                loadSampleQuestions();
            } else {
                // Not authenticated
                window
                    .location
                    .replace('login.html');
            }
        });
    } catch (error) {
        console.error('Chat initialization error:', error);
        window
            .location
            .replace('login.html');
    }
})();

// 🆕 Setup all event listeners (called after auth)
function setupEventListeners() {
    // Search as user types (autocomplete)
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.addEventListener('input', async(e) => {
            const query = e
                .target
                .value
                .trim();

            clearTimeout(searchTimeout);

            if (query.length < 2) {
                hideSuggestions();
                return;
            }

            searchTimeout = setTimeout(async() => {
                await searchQuestions(query);
            }, 300);
        });

        // Keyboard navigation
        userInput.addEventListener('keydown', (e) => {
            const dropdown = document.getElementById('suggestions');

            if (!dropdown || dropdown.classList.contains('hidden')) 
                return;
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedSuggestion = Math.min(selectedSuggestion + 1, currentSuggestions.length - 1);
                highlightSuggestion();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedSuggestion = Math.max(selectedSuggestion - 1, -1);
                highlightSuggestion();
            } else if (e.key === 'Enter' && selectedSuggestion >= 0) {
                e.preventDefault();
                selectSuggestion(selectedSuggestion);
            } else if (e.key === 'Escape') {
                hideSuggestions();
            }
        });
    }

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            hideSuggestions();
        }
    });

    // Logout Handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async() => {
            try {
                await signOut(auth);
                window
                    .location
                    .replace('login.html');
            } catch (error) {
                console.error('Logout error:', error);
                alert('Failed to logout. Please try again.');
            }
        });
    }

    // Chat Form Handler
    const chatForm = document.getElementById('chatForm');
    if (chatForm) {
        chatForm.addEventListener('submit', async(e) => {
            e.preventDefault();

            const userInput = document.getElementById('userInput');
            const message = userInput
                .value
                .trim();

            if (!message) 
                return;
            
            // Clear input and hide suggestions
            userInput.value = '';
            hideSuggestions();

            // Send message
            await sendMessage(message);
        });
    }
}

// Load sample questions from API
async function loadSampleQuestions() {
    try {
        const container = document.getElementById('sampleQuestions');
        if (!container) 
            return;
        
        container
            .classList
            .add('refreshing');

        const response = await fetch(`${API_URL}/api/sample-questions?count=6`);
        const data = await response.json();

        container.innerHTML = '';
        data
            .questions
            .forEach(questionText => {
                const button = document.createElement('button');
                button.className = 'sample-question-btn';
                button.textContent = questionText;

                // Auto-submit when clicked
                button.onclick = () => {
                    sendMessage(questionText);
                };

                container.appendChild(button);
            });

        container
            .classList
            .remove('refreshing');
    } catch (error) {
        console.error('Failed to load sample questions:', error);
        const container = document.getElementById('sampleQuestions');
        if (container) {
            container.innerHTML = '<div class="loading-samples">Could not load suggestions</div>';
        }
    }
}

// Search for matching questions
async function searchQuestions(query) {
    try {
        const method = document
            .getElementById('searchMethodSelector')
            .value;
        const response = await fetch(`${API_URL}/api/search-questions?q=${encodeURIComponent(query)}&limit=5&method=${method}`);
        const data = await response.json();

        currentSuggestions = data.suggestions || [];
        showSuggestions(currentSuggestions, data.method);

    } catch (error) {
        console.error('Search error:', error);
    }
}

// Show suggestions dropdown
function showSuggestions(suggestions, method) {
    const dropdown = document.getElementById('suggestions');
    if (!dropdown) 
        return;
    
    if (suggestions.length === 0) {
        dropdown.innerHTML = '<div class="no-results">No matching questions found</div>';
        dropdown
            .classList
            .remove('hidden');
        return;
    }

    dropdown.innerHTML = '';
    selectedSuggestion = -1;

    // Method badge
    const badge = document.createElement('div');
    badge.className = 'search-method-badge';
    badge.textContent = `Using ${method} search`;
    dropdown.appendChild(badge);

    suggestions.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';

        const confidence = Math.round(item.score * 100);
        const emoji = confidence >= 80
            ? '🟢'
            : confidence >= 50
                ? '🟡'
                : '🟠';

        div.innerHTML = `
            <div class="suggestion-question">
                ${emoji} ${item.question}
                <span class="confidence-score">${confidence}%</span>
            </div>
            <div class="suggestion-preview">${item.preview}</div>
        `;

        div.onclick = () => selectSuggestion(index);
        dropdown.appendChild(div);
    });

    dropdown
        .classList
        .remove('hidden');
}

// Hide suggestions
function hideSuggestions() {
    const dropdown = document.getElementById('suggestions');
    if (dropdown) {
        dropdown
            .classList
            .add('hidden');
    }
    selectedSuggestion = -1;
}

// Select suggestion
function selectSuggestion(index) {
    if (index >= 0 && index < currentSuggestions.length) {
        const selected = currentSuggestions[index];
        const userInput = document.getElementById('userInput');
        if (userInput) {
            userInput.value = selected.question;
            hideSuggestions();
            userInput.focus();
        }
    }
}

// Highlight selected
function highlightSuggestion() {
    const items = document.querySelectorAll('.suggestion-item');
    items.forEach((item, idx) => {
        if (idx === selectedSuggestion) {
            item
                .classList
                .add('selected');
        } else {
            item
                .classList
                .remove('selected');
        }
    });
}

// Unified send message function
async function sendMessage(message) {
    if (!message || !state.user) 
        return;
    
    // Add user message
    addMessage(message, 'user');

    // Get answer
    try {
        const method = document
            .getElementById('searchMethodSelector')
            .value;
        const response = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({message: message, preferredMethod: method, sessionId: state.sessionId, userId: state.user.uid})
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();

        // ✅ Pass confidence and method separately
        addMessage(data.reply, 'bot', {
            confidence: data.confidence,
            method: data.method
        });

        // Save to state
        state
            .messages
            .push({user: message, bot: data.reply, method: data.method, confidence: data.confidence, timestamp: new Date()});

        // Refresh suggested questions
        await loadSampleQuestions();

    } catch (error) {
        console.error('Chat error:', error);
        addMessage('Sorry, an error occurred. Please try again.', 'bot');
    }
}

function addMessage(text, sender, metadata = null) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) 
        return;
    
    // Compact welcome message after first chat
    const welcome = messagesContainer.querySelector('.welcome-message');
    if (welcome && sender === 'user' && state.messages.length === 0) {
        welcome
            .classList
            .add('compact');
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;

    messageDiv.appendChild(contentDiv);

    // ✅ Add confidence badge below bot messages
    if (sender === 'bot' && metadata && metadata.method) {
        const confidenceDiv = document.createElement('div');
        confidenceDiv.className = 'message-metadata';

        const confidence = Math.round((metadata.confidence || 0) * 100);
        const methodEmoji = {
            'dialogflow': '☁️',
            'semantic': '🧠',
            'fuzzy': '🔤',
            'keyword': '⚡',
            'hybrid': '🎯'
        }[metadata.method] || '📊';

        confidenceDiv.textContent = `${methodEmoji} ${metadata.method} • ${confidence}% confidence`;
        messageDiv.appendChild(confidenceDiv);
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
