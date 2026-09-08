const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { db, initDatabase } = require('./src/db');
const promptCache = require('./src/cache/promptCache');

// Route modules
const authRoutes = require('./src/routes/auth');
const runtimeRoutes = require('./src/routes/runtime');
const promptRoutes = require('./src/routes/prompts');
const pullRequestRoutes = require('./src/routes/pullRequests');
const apiKeyRoutes = require('./src/routes/apiKeys');
const userRoutes = require('./src/routes/users');
const settingRoutes = require('./src/routes/settings');
const modelRoutes = require('./src/routes/models');

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS and JSON parsing
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize DB schema, WAL mode, and seed records
initDatabase();

// Hydrate In-Memory Cache on Container / Server Startup
promptCache.hydrate(db);

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: 'SQLite WAL',
    cacheHydrated: !!promptCache.stats.lastHydratedAt,
    activeCachedPrompts: promptCache.prompts.size,
    activeApiKeys: promptCache.apiKeys.size
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/runtime', runtimeRoutes);
app.use('/api/v1/prompts', promptRoutes);
app.use('/api/v1/pull-requests', pullRequestRoutes);
app.use('/api/v1/api-keys', apiKeyRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/settings', settingRoutes);
app.use('/api/v1/models', modelRoutes);

// Single-container Monolith: Serve compiled frontend in production
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  console.log(`[Server] Serving frontend static build from ${publicDir}`);
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });
} else {
  console.log('[Server] No public static directory found. Running in API-only or development proxy mode.');
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred'
  });
});

// Start Server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`🚀 Prompt Registry & LLMOps Engine running on port ${PORT}`);
  console.log(`📡 High-throughput Runtime API: http://localhost:${PORT}/api/v1/runtime/`);
  console.log(`🖥️ Dashboard UI & Admin API:   http://localhost:${PORT}/`);
  console.log(`⚡ Caching Layer: In-memory JavaScript Map (WAL enabled)`);
  console.log(`========================================================`);
});

// Graceful shutdown handling with SQLite WAL checkpoint
function shutdown() {
  console.log('\n[Server] Shutting down gracefully...');
  try {
    // Checkpoint WAL to main database file
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    console.log('[DB] SQLite WAL checkpointed and closed.');
  } catch (e) {
    console.error('[DB] Error during WAL shutdown checkpoint:', e.message);
  }
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
