// frontend/chat.js

import {initializeFirebase} from './firebase-init.js';
import {onAuthStateChanged, signOut} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let auth = null;

const state = {
    user: null,
    sessionId: null,
    messages: [],
    currentChatId: null,
    chats: []
};

const API_URL = window.location.origin;

let searchTimeout = null;
let selectedSuggestion = -1;
let currentSuggestions = [];

// -------------------- Bootstrap --------------------

(async() => {
    try {
        const {auth: firebaseAuth} = await initializeFirebase();
        auth = firebaseAuth;

        onAuthStateChanged(auth, async user => {
            if (!user) {
                window
                    .location
                    .replace('login.html');
                return;
            }

            state.user = user;
            state.sessionId = user.uid;

            const userInput = document.getElementById('userInput');
            const askBtn = document.getElementById('askBtn');
            if (userInput) 
                userInput.disabled = false;
            if (askBtn) 
                askBtn.disabled = false;
            
            setupEventListeners();

            await loadChats();
            await ensureCurrentChat();
            await loadSampleQuestions();
        });
    } catch (error) {
        console.error('Chat initialization error', error);
        window
            .location
            .replace('login.html');
    }
})();

// -------------------- Event wiring --------------------

function setupEventListeners() {
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.addEventListener('input', async e => {
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

        userInput.addEventListener('keydown', e => {
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
            } else if (e.key === 'Enter') {
                if (selectedSuggestion >= 0) {
                    e.preventDefault();
                    selectSuggestion(selectedSuggestion);
                }
            } else if (e.key === 'Escape') {
                hideSuggestions();
            }
        });
    }

    document.addEventListener('click', e => {
        if (!e.target.closest('.search-container')) {
            hideSuggestions();
        }
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async() => {
            try {
                await signOut(auth);
                window
                    .location
                    .replace('login.html');
            } catch (error) {
                console.error('Logout error', error);
                alert('Failed to logout. Please try again.');
            }
        });
    }

    const chatForm = document.getElementById('chatForm');
    if (chatForm) {
        chatForm.addEventListener('submit', async e => {
            e.preventDefault();
            const userInput = document.getElementById('userInput');
            const message = userInput
                .value
                .trim();
            if (!message) 
                return;
            
            userInput.value = '';
            hideSuggestions();
            await sendMessage(message);
        });
    }

    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', async() => {
            await createNewChat();
        });
    }
}

// -------------------- Chat history helpers --------------------

async function ensureCurrentChat() {
    if (state.chats.length === 0) {
        await createNewChat();
    } else if (!state.currentChatId) {
        const first = state.chats[0];
        state.currentChatId = first.id;
        await loadChatMessages(first.id);
    }
}

async function loadChats() {
    if (!state.user) 
        return;
    
    try {
        const res = await fetch(`${API_URL}/api/chats?userId=${encodeURIComponent(state.user.uid)}`);
        const data = await res.json();
        state.chats = data.chats || [];
        renderChatList();
    } catch (err) {
        console.error('Failed to load chats', err);
    }
}

async function createNewChat() {
    if (!state.user) 
        return;
    
    try {
        const res = await fetch(`${API_URL}/api/chats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({userId: state.user.uid, title: 'New chat'})
        });

        const data = await res.json();
        state.currentChatId = data.chatId;
        await loadChats();
        state.messages = [];
        renderMessages([]);
    } catch (err) {
        console.error('Create chat failed', err);
    }
}

async function selectChat(chatId) {
    state.currentChatId = chatId;
    await loadChatMessages(chatId);
    renderChatList();
}

async function deleteChat(chatId, ev) {
    ev.stopPropagation();
    if (!state.user) 
        return;
    if (!confirm('Delete this chat?')) 
        return;
    
    try {
        await fetch(`${API_URL}/api/chats/${encodeURIComponent(chatId)}?userId=${encodeURIComponent(state.user.uid)}`, {method: 'DELETE'});

        if (state.currentChatId === chatId) 
            state.currentChatId = null;
        await loadChats();
        await ensureCurrentChat();
    } catch (err) {
        console.error('Delete chat failed', err);
    }
}

async function loadChatMessages(chatId) {
    if (!state.user) 
        return;
    
    try {
        const res = await fetch(`${API_URL}/api/chats/${encodeURIComponent(chatId)}/messages?userId=${encodeURIComponent(state.user.uid)}`);
        const data = await res.json();

        const msgs = (data.messages || []).map(m => ({
            text: m.text,
            sender: m.role === 'user'
                ? 'user'
                : 'bot',
            metadata: m.method
                ? {
                    method: m.method,
                    confidence: m.confidence || 0
                }
                : null
        }));

        state.messages = msgs;
        renderMessages(msgs);
    } catch (err) {
        console.error('Load messages failed', err);
    }
}

function renderChatList() {
    const list = document.getElementById('chatList');
    if (!list) 
        return;
    
    list.innerHTML = '';

    state
        .chats
        .forEach(chat => {
            const li = document.createElement('li');
            li.className = 'chat-list-item';
            if (chat.id === state.currentChatId) 
                li.classList.add('active');
            li.onclick = () => selectChat(chat.id);

            const title = document.createElement('span');
            title.className = 'chat-list-title';
            title.textContent = chat.title || 'Chat';

            const del = document.createElement('button');
            del.className = 'chat-delete-btn';
            del.textContent = '✕';
            del.onclick = ev => deleteChat(chat.id, ev);

            li.appendChild(title);
            li.appendChild(del);
            list.appendChild(li);
        });
}

// -------------------- Sample questions -------------------- Sample questions
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
        (data.questions || []).forEach(item => {
            // item = { question, answer }
            const button = document.createElement('button');
            button.className = 'sample-question-btn';
            button.textContent = item.question;
            button.onclick = () => sendGroundTruth(item);
            container.appendChild(button);
        });

        container
            .classList
            .remove('refreshing');
    } catch (error) {
        console.error('Failed to load sample questions', error);
    }
}

// -------------------- Search suggestions -------------------- Autocomplete
// search over 443k questions
async function searchQuestions(query) {
    const methodSelector = document.getElementById('searchMethodSelector');
    const preferredMethod = methodSelector
        ? methodSelector.value
        : 'hybrid';

    try {
        const res = await fetch(`${API_URL}/api/search-questions?q=${encodeURIComponent(query)}&limit=6&method=${encodeURIComponent(preferredMethod)}`);
        const data = await res.json();

        currentSuggestions = data.suggestions || [];
        selectedSuggestion = -1;
        showSuggestions(currentSuggestions, data.method || preferredMethod);
    } catch (err) {
        console.error('Search failed', err);
        hideSuggestions();
    }
}

function showSuggestions(items, methodLabel) {
    const dropdown = document.getElementById('suggestions');
    if (!dropdown) 
        return;
    
    if (!items || items.length === 0) {
        dropdown
            .classList
            .add('hidden');
        dropdown.innerHTML = '';
        return;
    }

    dropdown.innerHTML = '';
    items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.dataset.index = index.toString();

        const confidence = Math.round((item.score || 0) * 100);
        const emoji = confidence >= 80
            ? '🟢'
            : confidence >= 50
                ? '🟡'
                : '🟠';

        div.innerHTML = `
      <div class="suggestion-question">
        ${emoji} ${item.question}
        <span class="confidence-score">${confidence}%</span>
        <span class="method-badge">${methodLabel}</span>
      </div>
    `;

        div.onclick = () => {
            selectSuggestion(index);
        };

        dropdown.appendChild(div);
    });

    dropdown
        .classList
        .remove('hidden');
    highlightSuggestion();
}

function selectSuggestion(index) {
    const item = currentSuggestions[index];
    if (!item) 
        return;
    
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.value = ''; // clear box after selection
    }

    hideSuggestions();

    // Use the known QA pair as ground truth
    sendGroundTruth(item);
}

function hideSuggestions() {
    const dropdown = document.getElementById('suggestions');
    if (dropdown) 
        dropdown.classList.add('hidden');
    selectedSuggestion = -1;
    currentSuggestions = [];
}

function highlightSuggestion() {
    const dropdown = document.getElementById('suggestions');
    if (!dropdown) 
        return;
    
    const items = dropdown.querySelectorAll('.suggestion-item');
    items.forEach((item, idx) => {
        if (idx === selectedSuggestion) 
            item.classList.add('selected');
        else 
            item
                .classList
                .remove('selected');
        }
    );
}


// -------------------- Messaging --------------------

async function sendMessage(message) {
    if (!state.user) 
        return;
    
    if (!state.currentChatId) {
        await ensureCurrentChat();
    }

    const methodSelector = document.getElementById('searchMethodSelector');
    const preferredMethod = methodSelector
        ? methodSelector.value
        : 'hybrid';

    // optimistic user bubble
    const userMsg = {
        text: message,
        sender: 'user',
        metadata: null
    };
    state
        .messages
        .push(userMsg);
    renderMessages(state.messages);

    try {
        const res = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({message, sessionId: state.sessionId, userId: state.user.uid, preferredMethod, chatId: state.currentChatId})
        });

        const data = await res.json();
        if (!res.ok) {
            console.error('Chat API error', data);
            return;
        }

        const botMsg = {
            text: data.reply,
            sender: 'bot',
            metadata: data.method
                ? {
                    method: data.method,
                    confidence: data.confidence || 0
                }
                : null
        };
        state
            .messages
            .push(botMsg);
        renderMessages(state.messages);

        // Refresh chat list so updatedAt ordering is correct
        await loadChats();

        // NEW: refresh the suggested questions so the one you used is replaced
        await loadSampleQuestions();
    } catch (err) {
        console.error('Send message failed', err);
    }
}

async function sendGroundTruth(item) {
    if (!state.user) 
        return;
    
    if (!state.currentChatId) {
        await ensureCurrentChat();
    }

    const methodSelector = document.getElementById('searchMethodSelector');
    const preferredMethod = methodSelector
        ? methodSelector.value
        : 'hybrid';

    const question = item.question;
    const answer = item.answer;
    const confidence = item.score || 1.0;
    const method = item.method || preferredMethod || 'ground-truth';

    // Optimistic UI: show user question immediately
    state
        .messages
        .push({text: question, sender: 'user', metadata: null});
    renderMessages(state.messages);

    try {
        const res = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: question,
                sessionId: state.sessionId,
                userId: state.user.uid,
                preferredMethod,
                chatId: state.currentChatId,

                // NEW: ground-truth fields
                groundTruthQuestion: question,
                groundTruthAnswer: answer,
                groundTruthMethod: method,
                groundTruthConfidence: confidence
            })
        });

        const data = await res.json();

        const botMsg = {
            text: data.reply,
            sender: 'bot',
            metadata: data.method
                ? {
                    method: data.method,
                    confidence: data.confidence || 0
                }
                : null
        };
        state
            .messages
            .push(botMsg);
        renderMessages(state.messages);

        // Keep chat list in sync
        await loadChats();
        // NEW: refresh suggested questions so you get a fresh set
        await loadSampleQuestions();
    } catch (err) {
        console.error('Send ground truth failed', err);
    }
}

function renderMessages(msgs) {
    const container = document.getElementById('messages');
    if (!container) 
        return;
    
    container.innerHTML = '';
    msgs.forEach(m => {
        addMessage(m.text, m.sender, m.metadata || null);
    });

    container.scrollTop = container.scrollHeight;
}

function addMessage(text, sender, metadata) {
    const container = document.getElementById('messages');
    if (!container) 
        return;
    
    const wrapper = document.createElement('div');
    wrapper.className = `message ${sender}`;

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;
    wrapper.appendChild(content);

    if (metadata && metadata.method) {
        const meta = document.createElement('div');
        meta.className = 'message-metadata';

        const conf = typeof metadata.confidence === 'number'
            ? ` (confidence ${ (metadata.confidence * 100).toFixed(1)}%)`
            : '';

        meta.textContent = `Answer source: ${metadata.method}${conf}`;
        wrapper.appendChild(meta);
    }

    container.appendChild(wrapper);
}
