# --- Stage 1: Build Frontend ---
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Build Backend & Combine ---
FROM node:20-slim AS runtime
WORKDIR /app

# Install build dependencies in case native compilation fallback is required
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install --production
COPY backend/src ./src
COPY backend/server.js ./
COPY --from=frontend-builder /app/frontend/dist ./public

RUN mkdir -p /data
EXPOSE 8080

ENV PORT=8080
ENV DATABASE_PATH=/data/prompts.db
ENV NODE_ENV=production
ENV ADMIN_USERNAME=admin
ENV ADMIN_PASSWORD=admin123

CMD ["node", "server.js"]
