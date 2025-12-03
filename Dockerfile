# -------- Dependencies layer --------
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Install minimal OS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Install Node deps
COPY package*.json ./
RUN npm ci --omit=dev

# -------- Runtime image --------
FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules from deps image
COPY --from=deps /app/node_modules ./node_modules

# Copy application code (backend + frontend + utils, etc.)
COPY . .

# Large local data files are ok for local dev; on Cloud Run you can
# either keep them in the image or load from Cloud Storage.
# If you want a smaller image, you can later move qa_data.json / qa_embeddings.faiss
# into a bucket and stop copying them.

EXPOSE 3000

# Start Express server
CMD ["node", "server.js"]
