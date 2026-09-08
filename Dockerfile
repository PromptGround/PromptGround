# --- Stage 1: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Build Backend & Combine ---
FROM node:20-alpine AS runtime
WORKDIR /app

# Install build tools required for native better-sqlite3 compilation in Alpine
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist ./public

RUN mkdir -p /data
EXPOSE 8080

ENV PORT=8080
ENV DATABASE_PATH=/data/prompts.db
ENV NODE_ENV=production

CMD ["node", "server.js"]
