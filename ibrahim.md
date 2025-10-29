# **Wikipedia Chatbot Backend API Documentation**

## **Overview**

This backend API provides a REST interface for the Wikipedia General Knowledge Chatbot. It uses Firestore to store 500+ question-answer pairs from Wikipedia and provides endpoints for querying and interaction.

**Current Status:**
- Backend API fully functional locally
- 500 Wikipedia Q&A pairs loaded in Firestore
- ⏳ Cloud deployment scheduled for tomorrow morning

***

## **Quick Start**

### **Base URL (Local Development)**
```
http://localhost:3000
```

### **Base URL (Production - After Tomorrow's Deployment)**
```
https://YOUR-CLOUD-RUN-URL.run.app
```

***

## **API Endpoints**

### **1. Health Check / Server Status**

**GET** `/`

Returns server status and statistics.

**Request:**
```bash
GET http://localhost:3000/
```

**Response:**
```json
{
  "status": "ok",
  "service": "Wikipedia General Knowledge Chatbot",
  "environment": "local",
  "dataLoaded": true,
  "totalQuestions": 500,
  "timestamp": "2025-10-29T06:53:00.000Z"
}
```

**Use Case:** Check if backend is running and data is loaded before enabling the chat interface.

***

### **2. Chat Endpoint (Main Functionality)**

**POST** `/api/chat`

Send a user's question and receive an AI-generated answer.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "message": "When was Fernando Eid born?"
}
```

**Response (Success):**
```json
{
  "reply": "20 June 1992",
  "matchedQuestion": "When was Fernando Eid born?",
  "confidence": "high",
  "timestamp": "2025-10-29T06:53:00.000Z"
}
```

**Response (No Match Found):**
```json
{
  "reply": "I'm sorry, I don't have a good answer to that question. Try asking about general knowledge topics like history, science, geography, or famous people!",
  "confidence": "none",
  "timestamp": "2025-10-29T06:53:00.000Z"
}
```

**Response Fields:**
- `reply` (string): The answer to the user's question
- `matchedQuestion` (string, optional): The original question from database that matched
- `confidence` (string): "high", "medium", or "none" - indicates match quality
- `timestamp` (string): ISO 8601 timestamp

**Error Response (400 - Bad Request):**
```json
{
  "error": "Message is required"
}
```

**Error Response (500 - Internal Server Error):**
```json
{
  "error": "Internal server error",
  "message": "Error details here"
}
```

***

### **3. Get Sample Questions**

**GET** `/api/sample-questions`

Returns random sample questions from the database to help users get started.

**Query Parameters:**
- `count` (optional, default: 10): Number of sample questions to return (1-100)

**Request:**
```bash
GET http://localhost:3000/api/sample-questions?count=5
```

**Response:**
```json
{
  "count": 5,
  "questions": [
    "When was Kadir Mısıroğlu born?",
    "How quickly does insulin aspart begin to work?",
    "What is the population of Dongguan as of the end of 2012?",
    "How many years did Brandon Jones play in the NFL?",
    "Which album was released by Sten & Stanley in 1985?"
  ]
}
```

**Use Case:** Display suggested questions to users when they first open the chat interface.

***

### **4. Get Statistics**

**GET** `/api/stats`

Returns backend statistics and configuration.

**Request:**
```bash
GET http://localhost:3000/api/stats
```

**Response:**
```json
{
  "environment": "local",
  "totalQuestions": 500,
  "isLoaded": true,
  "projectId": "demo-chatbot-project",
  "timestamp": "2025-10-29T06:53:00.000Z"
}
```

**Use Case:** Show statistics in the UI footer or about section.

***

## **Frontend Integration Example**

```html
<!DOCTYPE html>
<html>
<head>
    <title>Wikipedia Chatbot</title>
    <style>
        body { font-family: Arial; max-width: 700px; margin: 50px auto; padding: 20px; }
        #chat-box { border: 2px solid #1976d2; height: 400px; overflow-y: auto; padding: 15px; margin-bottom: 15px; }
        .message { margin: 10px 0; padding: 10px; border-radius: 8px; }
        .user { background: #e3f2fd; text-align: right; }
        .bot { background: #f5f5f5; }
        input { width: 80%; padding: 10px; }
        button { padding: 10px 20px; background: #1976d2; color: white; border: none; cursor: pointer; }
    </style>
</head>
<body>
    <h1>🤖 Wikipedia Knowledge Chatbot</h1>
    <div id="chat-box"></div>
    <input type="text" id="user-input" placeholder="Ask a question..." onkeypress="if(event.key==='Enter') sendMessage()">
    <button onclick="sendMessage()">Send</button>
    
    <script>
        const API_BASE_URL = 'http://localhost:3000'; // Change to cloud URL after deployment
        const chatBox = document.getElementById('chat-box');
        const userInput = document.getElementById('user-input');
        
        // Initialize: Check if backend is ready
        async function checkBackend() {
            try {
                const response = await fetch(`${API_BASE_URL}/`);
                const data = await response.json();
                
                if (data.dataLoaded) {
                    chatBox.innerHTML = `<div class="message bot">🤖 Bot: Hello! I have knowledge from ${data.totalQuestions} Wikipedia articles. Ask me anything!</div>`;
                    loadSampleQuestions();
                } else {
                    chatBox.innerHTML = '<div class="message bot">⚠️ Bot is loading data, please wait...</div>';
                }
            } catch (error) {
                chatBox.innerHTML = '<div class="message bot">Error: Cannot connect to backend.</div>';
            }
        }
        
        // Load sample questions
        async function loadSampleQuestions() {
            try {
                const response = await fetch(`${API_BASE_URL}/api/sample-questions?count=3`);
                const data = await response.json();
                
                if (data.questions && data.questions.length > 0) {
                    const suggestions = data.questions.map(q => `• ${q}`).join('<br>');
                    chatBox.innerHTML += `<div class="message bot">💡 Try asking:<br>${suggestions}</div>`;
                }
            } catch (error) {
                console.error('Error loading sample questions:', error);
            }
        }
        
        // Send message to chatbot
        async function sendMessage() {
            const message = userInput.value.trim();
            if (!message) return;
            
            // Show user message
            chatBox.innerHTML += `<div class="message user"><strong>You:</strong> ${message}</div>`;
            userInput.value = '';
            chatBox.scrollTop = chatBox.scrollHeight;
            
            try {
                // Call chat API
                const response = await fetch(`${API_BASE_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                
                // Show bot response
                chatBox.innerHTML += `<div class="message bot"><strong>🤖 Bot:</strong> ${data.reply}</div>`;
                chatBox.scrollTop = chatBox.scrollHeight;
                
            } catch (error) {
                chatBox.innerHTML += `<div class="message bot"><strong>Error:</strong> ${error.message}</div>`;
                chatBox.scrollTop = chatBox.scrollHeight;
            }
        }
        
        // Initialize on page load
        checkBackend();
    </script>
</body>
</html>
```

### **Example 2: jQuery**

```javascript
// Check backend
$.get('http://localhost:3000/', function(data) {
    if (data.dataLoaded) {
        console.log('Backend ready with', data.totalQuestions, 'questions');
    }
});

// Get sample questions
$.get('http://localhost:3000/api/sample-questions?count=5', function(data) {
    data.questions.forEach(q => {
        console.log('Sample:', q);
    });
});

// Send chat message
function sendMessage(message) {
    $.ajax({
        url: 'http://localhost:3000/api/chat',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ message: message }),
        success: function(data) {
            console.log('Bot reply:', data.reply);
            console.log('Confidence:', data.confidence);
        },
        error: function(error) {
            console.error('Error:', error);
        }
    });
}

// Usage
sendMessage('What is the population of Dongguan?');
```

## **Testing the API**

### **Using cURL (Command Line)**

```bash
# Health check
curl http://localhost:3000/

# Get sample questions
curl http://localhost:3000/api/sample-questions?count=5

# Ask a question
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "When was Fernando Eid born?"}'
```

### **Using PowerShell**

```powershell
# Health check
Invoke-RestMethod -Uri "http://localhost:3000/"

# Get sample questions
Invoke-RestMethod -Uri "http://localhost:3000/api/sample-questions?count=5"

# Ask a question
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/chat" -ContentType "application/json" -Body '{"message": "When was Fernando Eid born?"}'
```

***

## **Running the Backend Locally**

### **Prerequisites:**
- Node.js installed
- Firebase CLI installed (`npm install -g firebase-tools`)

### **Start Backend (3 Steps):**

**Terminal 1 - Start Firestore Emulator:**
```bash
cd chatbot-backend
firebase emulators:start --only firestore
```

**Terminal 2 - Start API Server:**
```bash
cd chatbot-backend
node server.js
```

**Backend will be available at:** `http://localhost:3000`

## **Sample Questions You Can Use for Testing**

```javascript
const testQuestions = [
    "When was Fernando Eid born?",
    "How quickly does insulin aspart begin to work?",
    "What is the population of Dongguan?",
    "How many years did Brandon Jones play in the NFL?",
    "What is the altitude range of the Zbrašov aragonite caves?",
    "What does a Flush deck refer to?",
    "What is a characteristic of coaxial cables?"
];
```
