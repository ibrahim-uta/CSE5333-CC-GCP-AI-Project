import json
import numpy as np
from sentence_transformers import SentenceTransformer
from google.cloud import firestore
import os
from tqdm import tqdm
import torch
import faiss

device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Using device: {device}")

os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = './serviceAccountKey.json'
db = firestore.Client(project='cse5333-cc-gcp-ai-project', database='knowledge-base')

print("Loading model...")
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2', device=device)
print("✅ Model loaded!")

print("\nFetching Q&A pairs from Firestore (with pagination)...")
qa_collection = db.collection('qa_pairs')

qa_pairs = []
last_doc = None
batch_size = 10000  # Fetch 10k at a time
total_fetched = 0

with tqdm(desc="Fetching documents", unit=" docs") as pbar:
    while True:
        # Query with pagination
        if last_doc:
            query = qa_collection.order_by('__name__').start_after(last_doc).limit(batch_size)
        else:
            query = qa_collection.order_by('__name__').limit(batch_size)
        
        docs = list(query.stream())
        
        if not docs:
            break  # No more documents
        
        # Process batch
        for doc in docs:
            data = doc.to_dict()
            qa_pairs.append({
                'id': doc.id,
                'question': data.get('question', ''),
                'answer': data.get('answer', ''),
                'intent': data.get('intent', '')
            })
            total_fetched += 1
            pbar.update(1)
        
        # Update for next batch
        last_doc = docs[-1]
        pbar.set_description(f"Fetching documents [{total_fetched:,} fetched]")

print(f"✅ Fetched {len(qa_pairs):,} Q&A pairs\n")

# Compute embeddings with progress
print("Computing embeddings...")
questions = [qa['question'] for qa in qa_pairs]
embeddings = model.encode(
    questions, 
    convert_to_numpy=True, 
    show_progress_bar=True, 
    batch_size=512
)
print(f"✅ Computed {len(embeddings):,} embeddings\n")

# Build FAISS index
print("Building FAISS index...")
dimension = embeddings.shape[1]
print(f"  Embedding dimension: {dimension}")
index = faiss.IndexFlatIP(dimension)

print("  Normalizing embeddings...")
faiss.normalize_L2(embeddings)

print("  Adding to index...")
index.add(embeddings)
print(f"✅ FAISS index built with {index.ntotal:,} vectors\n")

# Save everything
print("Saving files...")
print("  Writing FAISS index...")
faiss.write_index(index, 'qa_embeddings.faiss')

print("  Writing Q&A data...")
with open('qa_data.json', 'w', encoding='utf-8') as f:
    json.dump(qa_pairs, f, ensure_ascii=False)

print("\n" + "="*60)
print("✅ Successfully created:")
print(f"  - qa_embeddings.faiss ({os.path.getsize('qa_embeddings.faiss') / (1024*1024):.2f} MB)")
print(f"  - qa_data.json ({os.path.getsize('qa_data.json') / (1024*1024):.2f} MB)")
print("="*60)
