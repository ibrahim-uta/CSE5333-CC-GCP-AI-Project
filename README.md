# CSE5333 Cloud Computing – Wikipedia QA Search Engine

## 1. Project overview

This project implements a production-style **question search engine** on Google Cloud that retrieves the best-matching question and answer from a corpus of over **443k Wikipedia QA pairs**. Instead of answering arbitrary user-typed free-text (which risks NLU errors and hallucinations), the system behaves like an *intelligent search box*: as the user types, it returns semantically relevant questions from the curated dataset, and the user explicitly selects one.  
This guarantees that every answer comes from a verified QA pair.

The application is deployed on **Cloud Run** with a modern UI, Firebase Authentication, Firestore-backed chat history, and a hybrid retrieval engine combining **semantic embeddings**, **fuzzy search**, and **keyword retrieval**.

This repository can serve as a template for organizations that want to build their own domain-specific “Google-like” search experience on top of a private set of FAQs or knowledge-base questions.

---

## 2. High-level architecture

The system uses three cloud services that satisfy course requirements:

| Role                    | Service / Technology                                                 |
|-------------------------|-----------------------------------------------------------------------|
| Compute service         | Cloud Run service running Node.js/Express                            |
| Persistence service     | Cloud Firestore for user chat history                                |
| Additional cloud service| Cloud Storage for embeddings and QA datasets                         |

Additional services:

- **Firebase Authentication** for login/signup.
- **Dialogflow** (optional) for NLU baseline comparison.

At container startup:

1. Dialogflow client is initialized (if enabled).
2. Semantic embeddings and QA metadata are downloaded from Cloud Storage.
3. The FAISS-format vectors are parsed into memory and used to build an in-memory lightweight semantic engine.
4. The backend exposes REST APIs consumed by the frontend.

---

## 3. Problem and solution

### Problem

Traditional free-text QA chatbots often:

- Misinterpret queries due to NLU errors.
- Produce hallucinated or incorrect answers.
- Cannot guarantee reliable retrieval over large curated datasets.

For organizations, **precision and verifiable answers** are often more important than generative flexibility.

### Solution

The system reframes the problem as **intelligent question retrieval**, not free-text answering:

- Maintain a corpus of verified QA pairs (443k+ from Wikipedia).
- When the user types, show the top matching questions rather than generating an answer.
- When the user selects a question, display the stored answer exactly.

Benefits:

- **Accuracy:** Answers always come from verified QA entries.
- **Speed:** Precomputed embeddings and in-memory search yield sub-500 ms suggestions at full scale.
- **Good UX:** Autocomplete-style interface with retrieval method labels and confidence scores.

This general architecture can be reused with any domain-specific dataset.

---

## 4. Components and code structure

### 4.1 Backend (Node.js / Express)

**Entry point**

- `server.js`  
  - Serves static frontend files (`frontend/`).
  - Initializes Firestore, Dialogflow, semantic engine, and keyword/fuzzy search index.
  - Exposes APIs:
    - `GET /api/health`
    - `GET /api/firebase-config`
    - `GET /api/search-questions`
    - `GET /api/sample-questions`
    - Chat-related endpoints:
      - `POST /api/chats`
      - `GET /api/chats`
      - `GET /api/chats/:chatId/messages`
      - `DELETE /api/chats/:chatId`

**Cloud integration**

- `utils/config.js` – environment variables and flags (Dialogflow, semantic engine, Firebase config, etc.)
- `utils/dialogflow.js` – optional NLU client.
- `utils/firestore.js` – Firestore initialization and helpers.

### 4.2 Semantic retrieval and hybrid search

**Semantic engine**

- `utils/semantic-matching-faiss.js`
  - Downloads embeddings (`qa_embeddings.faiss`) and QA metadata (`qa_data.json`) from Cloud Storage.
  - Loads 443k vectors (~650 MB).
  - Provides:
    - `initialize()`
    - `isReady()`
    - `searchTopK(query, k)`

**Text / keyword / fuzzy search**

- `utils/search-engine.js`
  - Builds an in-memory inverted index from all questions.
  - Supports keyword, fuzzy, Dialogflow-backed, and hybrid retrieval.
  - Exposes:
    - `initialize()`
    - `search(query, method, limit)`
    - `getStats()`

**Hybrid retrieval pipeline**

1. Check if semantic engine is ready.
2. Run semantic search; fall back to keyword/fuzzy search if unavailable.
3. Normalize results into a unified format with question, answer, similarity, and method label.

---

## 5. Frontend experience

All frontend assets live in `frontend/` and are served by the same Cloud Run container.

### 5.1 Authentication and routing

- `login.html`, `register.html`
- `chat.html` – main application UI
- `firebase-init.js` – loads Firebase config from backend
- `auth.js` – handles user login/registration and redirects

### 5.2 Chat and search UX

- `chat.js`
  - Calls `/api/health` on load.
  - Fetches sample questions.
  - Loads user chat history.
  - Performs debounced calls to `/api/search-questions`.
  - Displays search suggestions with score + method tags.
  - Stores selected questions/answers into Firestore chat history.

This ensures users always choose from the known QA corpus.

---

## 6. Dataset and preprocessing

Dataset:

- ~443,000 Wikipedia QA pairs.
- Offline preprocessing:
  - Cleaning and normalization
  - 384-dim transformer embeddings
- Two output files:
  - `qa_data.json`
  - `qa_embeddings.faiss`
- Stored in Cloud Storage and downloaded on startup.

Preprocessing scripts (e.g., `precompute_embeddings.py`) are included in the repo for reproducibility.

---

## 7. Cloud deployment and configuration

Example Cloud Run deploy:

```

gcloud run deploy wikipedia-chatbot 
--image gcr.io/PROJECT_ID/wiki-qa-chatbot 
--platform=managed 
--region=us-south1 
--allow-unauthenticated 
--memory=8Gi --cpu=2 
--set-env-vars 
ENVIRONMENT=cloud,GCP_PROJECT_ID=PROJECT_ID,USE_DIALOGFLOW=true,USE_SEMANTIC_MATCHING=true 
--set-env-vars 
FIREBASE_API_KEY=...,
FIREBASE_AUTH_DOMAIN=...,
FIREBASE_PROJECT_ID=...,
FIREBASE_STORAGE_BUCKET=...,
FIREBASE_MESSAGING_SENDER_ID=...,
FIREBASE_APP_ID=... 
--set-env-vars 
EMBEDDINGS_BUCKET=chatbot-data-bucket-faiss,EMBEDDINGS_FILE=qa_embeddings.faiss,QA_DATA_FILE=qa_data.json

```

Notes:

- The container allocates **8 GiB RAM** to safely load embeddings + index + Node.js heap.
- `/api/health` is used by Cloud Run and the frontend to verify system readiness.

---

## 8. How this meets course requirements

1. **Compute:** Cloud Run service running Node.js backend.  
2. **Persistence:** Cloud Firestore + Cloud Storage.  
3. **Additional service:** Dialogflow + Firebase Authentication.

This demonstrates a realistic end-to-end cloud deployment with authentication, persistent storage, and a computational search workload.

---

## 9. Technical contribution and evaluation

This project’s main contribution is an efficient hybrid retrieval engine capable of:

- Searching **443k** QA entries in under **500 ms**.
- Providing semantically relevant suggestions.
- Achieving near-perfect functional accuracy by constraining users to validated QA pairs.

Suggested evaluation metrics:

- Latency (P50, P95) of `/api/search-questions`
- Quality metrics:
  - Recall@k
  - Mean Reciprocal Rank (MRR)
- Comparison of:
  - Keyword search
  - Fuzzy search
  - Dialogflow intents
  - Hybrid semantic + keyword search

---

## 10. How a company could reuse this

Steps to adapt:

1. Replace the Wikipedia QA dataset with internal domain-specific questions.
2. Run the embedding preprocessing scripts to generate new embedding + metadata files.
3. Upload them to Cloud Storage and update environment variables.
4. Update the frontend branding / text.

The backend, retrieval engine, and cloud deployment remain the same.