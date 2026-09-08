const express = require('express');
const router = express.Router();
const { db } = require('../db');
const promptCache = require('../cache/promptCache');
const { authenticateUser } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.use(authenticateUser);

const emailService = require('../services/emailService');

// GET /api/v1/settings - Get all system settings (admin only)
router.get('/', requireRole(['admin']), (req, res) => {
  const rows = db.prepare('SELECT key, value FROM system_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json({ settings });
});

// PUT /api/v1/settings - Update a setting (admin only)
router.put('/', requireRole(['admin']), (req, res) => {
  const { key, value } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({ error: 'key and value are required' });
  }

  db.prepare(`
    INSERT INTO system_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));

  res.json({ message: 'Setting updated successfully', key, value });
});

// GET /api/v1/settings/smtp - Get SMTP configuration (admin only)
router.get('/smtp', requireRole(['admin']), (req, res) => {
  const config = emailService.getSmtpConfig();
  res.json({
    smtp: {
      ...config,
      pass: config.pass ? '••••••••' : '' // mask password
    }
  });
});

// PUT /api/v1/settings/smtp - Update SMTP configuration (admin only)
router.put('/smtp', requireRole(['admin']), (req, res) => {
  const { host, port, secure, user, pass, fromEmail, fromName } = req.body;

  const updates = [
    { key: 'smtp_host', val: host },
    { key: 'smtp_port', val: port ? String(port) : '587' },
    { key: 'smtp_secure', val: secure ? 'true' : 'false' },
    { key: 'smtp_user', val: user },
    { key: 'smtp_from_email', val: fromEmail },
    { key: 'smtp_from_name', val: fromName }
  ];

  // Only update pass if provided and not masked
  if (pass && pass !== '••••••••') {
    updates.push({ key: 'smtp_pass', val: pass });
  }

  const transaction = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO system_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    updates.forEach(u => {
      if (u.val !== undefined && u.val !== null) {
        stmt.run(u.key, String(u.val).trim());
      }
    });
  });

  transaction();

  res.json({ message: 'SMTP configuration updated successfully' });
});

// POST /api/v1/settings/smtp/test - Send verification test email (admin only)
router.post('/smtp/test', requireRole(['admin']), async (req, res) => {
  const { recipientEmail } = req.body;
  if (!recipientEmail) {
    return res.status(400).json({ error: 'recipientEmail is required' });
  }

  try {
    const result = await emailService.sendTestEmail(recipientEmail);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/v1/stats - Real-time telemetry and LLMOps operational metrics
router.get('/stats', (req, res) => {
  const cacheStats = promptCache.getStats();

  if (req.user && req.user.role !== 'admin') {
    const accessiblePromptRows = db.prepare(`
      SELECT id FROM prompts 
      WHERE created_by = ? OR id IN (SELECT prompt_id FROM user_prompt_access WHERE user_id = ?)
    `).all(req.user.id, req.user.id);
    const accessiblePromptIds = accessiblePromptRows.map(r => r.id);

    let versionsCount = 0;
    if (accessiblePromptIds.length > 0) {
      const placeholders = accessiblePromptIds.map(() => '?').join(',');
      versionsCount = db.prepare(`SELECT COUNT(*) as count FROM prompt_versions WHERE prompt_id IN (${placeholders})`).get(...accessiblePromptIds).count;
    }

    const openPRs = db.prepare(`
      SELECT COUNT(*) as count FROM prompt_pull_requests 
      WHERE status = 'open' AND (
        author_id = ? OR assignee_id = ? OR prompt_id IN (SELECT prompt_id FROM user_prompt_access WHERE user_id = ?)
      )
    `).get(req.user.id, req.user.id, req.user.id).count;

    const totalPRs = db.prepare(`
      SELECT COUNT(*) as count FROM prompt_pull_requests 
      WHERE (
        author_id = ? OR assignee_id = ? OR prompt_id IN (SELECT prompt_id FROM user_prompt_access WHERE user_id = ?)
      )
    `).get(req.user.id, req.user.id, req.user.id).count;

    return res.json({
      cache: cacheStats,
      counts: {
        prompts: accessiblePromptIds.length,
        versions: versionsCount,
        openPRs,
        totalPRs,
        apiKeys: 0,
        users: 1
      },
      environmentBreakdown: {
        development: req.user.environments && req.user.environments.includes('development') ? 1 : 0,
        staging: req.user.environments && req.user.environments.includes('staging') ? 1 : 0,
        production: req.user.environments && req.user.environments.includes('production') ? 1 : 0
      },
      storage: {
        mode: 'SQLite WAL',
        dbPath: 'Managed Cluster Volume'
      }
    });
  }

  const counts = {
    prompts: db.prepare('SELECT COUNT(*) as count FROM prompts').get().count,
    versions: db.prepare('SELECT COUNT(*) as count FROM prompt_versions').get().count,
    openPRs: db.prepare("SELECT COUNT(*) as count FROM prompt_pull_requests WHERE status = 'open'").get().count,
    totalPRs: db.prepare('SELECT COUNT(*) as count FROM prompt_pull_requests').get().count,
    apiKeys: db.prepare('SELECT COUNT(*) as count FROM api_keys').get().count,
    users: db.prepare('SELECT COUNT(*) as count FROM users').get().count
  };

  const environmentBreakdown = {
    development: db.prepare("SELECT COUNT(*) as count FROM prompt_versions WHERE environment = 'development'").get().count,
    staging: db.prepare("SELECT COUNT(*) as count FROM prompt_versions WHERE environment = 'staging'").get().count,
    production: db.prepare("SELECT COUNT(*) as count FROM prompt_versions WHERE environment = 'production'").get().count
  };

  res.json({
    cache: cacheStats,
    counts,
    environmentBreakdown,
    storage: {
      mode: 'SQLite WAL',
      dbPath: process.env.DATABASE_PATH || './data/prompts.db'
    }
  });
});

// POST /api/v1/settings/cache-flush - Force in-memory cache re-hydration
router.post('/cache-flush', requireRole(['admin']), (req, res) => {
  promptCache.hydrate(db);
  res.json({
    message: 'In-memory prompt & API key cache re-hydrated successfully',
    stats: promptCache.getStats()
  });
});

module.exports = router;
