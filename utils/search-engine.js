// utils/search-engine.js Optimized hybrid search for 443k+ questions

class SearchEngine {
    constructor() {
        this.qaCache = [];
        this.questionIndex = new Map();
        this.ready = false;
    }

    // Initialize with Q&A data
    initialize(qaCache) {
        console.log('🔍 Building search index...');
        this.qaCache = qaCache || [];
        this.questionIndex = new Map(); // Reset index when re-initializing
        this.buildWordIndex();
        this.ready = true;
        console.log(`✅ Search index ready: ${this.questionIndex.size} unique terms`);
    }

    // Build inverted index for fast keyword search
    buildWordIndex() {
        this
            .qaCache
            .forEach((qa, idx) => {
                // 🔧 Safety check: skip if question is missing
                if (!qa || !qa.question || typeof qa.question !== 'string') {
                    return;
                }

                const words = this.tokenize(qa.question);
                words.forEach(word => {
                    if (!this.questionIndex.has(word)) {
                        this
                            .questionIndex
                            .set(word, new Set());
                    }
                    this
                        .questionIndex
                        .get(word)
                        .add(idx);
                });
            });
    }

    // Tokenize and normalize
    tokenize(text) {
        // 🔧 Safety check: handle null/undefined
        if (!text || typeof text !== 'string') {
            return [];
        }

        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2);
    }

    // Main search method
    search(query, method = 'hybrid', limit = 5) {
        if (!this.ready) 
            return [];
        
        const startTime = Date.now();
        let results = [];

        switch (method) {
            case 'fuzzy':
                results = this.fuzzySearch(query, limit);
                break;
            case 'keyword':
                results = this.keywordSearch(query, limit);
                break;
            case 'hybrid':
            default:
                results = this.hybridSearch(query, limit);
                break;
        }

        const elapsed = Date.now() - startTime;
        console.log(` ⚡ Search completed in ${elapsed}ms`);

        return results;
    }

    // Hybrid: keyword candidates + fuzzy scoring
    hybridSearch(query, limit) {
        const candidates = this.getCandidates(query, 200);

        if (candidates.length === 0) {
            return this.fuzzySearch(query, limit);
        }

        const scored = candidates.map(idx => {
            const qa = this.qaCache[idx];
            // 🔧 Safety check
            if (!qa || !qa.question || !qa.answer) 
                return null;
            
            return {
                question: qa.question,
                answer: qa.answer,
                score: this.calculateScore(query, qa.question)
            };
        }).filter(item => item !== null && item.score > 0.25);

        return scored.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    // Keyword search using inverted index
    keywordSearch(query, limit) {
        const candidates = this.getCandidates(query, limit * 2);

        return candidates
            .slice(0, limit)
            .map(idx => {
                const qa = this.qaCache[idx];
                return {question: qa.question, answer: qa.answer, score: 0.8};
            })
            .filter(item => item.question && item.answer);
    }

    // Get candidate indices using inverted index
    getCandidates(query, maxCandidates = 200) {
        const queryWords = this.tokenize(query);
        const candidateScores = new Map();

        queryWords.forEach(word => {
            const indices = this
                .questionIndex
                .get(word);
            if (indices) {
                indices.forEach(idx => {
                    candidateScores.set(idx, (candidateScores.get(idx) || 0) + 1);
                });
            }
        });

        return Array
            .from(candidateScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxCandidates)
            .map(([idx]) => idx);
    }

    // Fuzzy search with sampling
    fuzzySearch(query, limit) {
        const queryLower = query.toLowerCase();
        const sampleSize = Math.min(this.qaCache.length, 5000);
        const step = Math.max(1, Math.floor(this.qaCache.length / sampleSize));

        const scored = [];
        for (let i = 0; i < this.qaCache.length; i += step) {
            const qa = this.qaCache[i];

            // 🔧 Safety check
            if (!qa || !qa.question || !qa.answer) 
                continue;
            
            const score = this.calculateScore(queryLower, qa.question.toLowerCase());

            if (score > 0.25) {
                scored.push({question: qa.question, answer: qa.answer, score: score});
            }

            if (scored.length >= limit * 20) 
                break;
            }
        
        return scored.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    // Calculate similarity score
    calculateScore(query, question) {
        // 🔧 Safety check
        if (!query || !question) 
            return 0;
        
        const queryLower = query.toLowerCase();
        const questionLower = question.toLowerCase();

        // Exact substring match
        if (questionLower.includes(queryLower)) 
            return 0.95;
        if (queryLower.includes(questionLower)) 
            return 0.85;
        
        // Word overlap
        const queryWords = this.tokenize(query);
        const questionWords = this.tokenize(question);

        if (queryWords.length === 0 || questionWords.length === 0) 
            return 0;
        
        const commonWords = queryWords.filter(w => questionWords.includes(w));
        const wordScore = commonWords.length / Math.max(queryWords.length, 1);

        // Character similarity (simplified)
        const charScore = this.jaccardSimilarity(queryLower, questionLower);

        return (wordScore * 0.7) + (charScore * 0.3);
    }

    // Jaccard similarity (fast)
    jaccardSimilarity(str1, str2) {
        // 🔧 Safety check
        if (!str1 || !str2) 
            return 0;
        
        const set1 = new Set(str1.split(''));
        const set2 = new Set(str2.split(''));

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([
            ...set1,
            ...set2
        ]);

        if (union.size === 0) 
            return 0;
        
        return intersection.size / union.size;
    }

    // 🆕 NEW: Get engine stats for health check
    getStats() {
        return {indexSize: this.questionIndex.size, cacheSize: this.qaCache.length, ready: this.ready};
    }
}

module.exports = new SearchEngine();
