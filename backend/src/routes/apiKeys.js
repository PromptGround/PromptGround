const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { db, hashApiKey } = require('../db');
const promptCache = require('../cache/promptCache');
const { authenticateUser } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.use(authenticateUser);

// GET /api/v1/api-keys - List active API keys (Admin only)
router.get('/', requireRole(['admin']), (req, res) => {
  const keys = db.prepare(`
    SELECT 
      ak.id,
      ak.name,
      ak.environment,
      ak.created_at,
      u.username as created_by_name
    FROM api_keys ak
    LEFT JOIN users u ON ak.created_by = u.id
    ORDER BY ak.created_at DESC
  `).all();

  res.json({ apiKeys: keys });
});

// POST /api/v1/api-keys - Generate a scoped API key (Admin only)
router.post('/', requireRole(['admin']), (req, res) => {
  const { name, environment } = req.body;

  if (!name || !environment) {
    return res.status(400).json({ error: 'Key name and environment are required' });
  }

  if (!['development', 'staging', 'production'].includes(environment)) {
    return res.status(400).json({ error: 'Environment must be development, staging, or production' });
  }

  // Generate formatted API key
  const envPrefix = environment === 'production' ? 'live' : (environment === 'staging' ? 'stg' : 'dev');
  const secretPart = crypto.randomBytes(24).toString('hex');
  const rawKey = `ph_${envPrefix}_${secretPart}`;
  const keyHash = hashApiKey(rawKey);
  const keyId = 'key_' + uuidv4().slice(0, 8);

  db.prepare(`
    INSERT INTO api_keys (id, key_hash, name, environment, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(keyId, keyHash, name.trim(), environment, req.user.id);

  // Update in-memory lookup cache immediately
  promptCache.addApiKey(keyHash, {
    id: keyId,
    name: name.trim(),
    environment,
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  });

  res.status(201).json({
    message: 'API Key created successfully. Store this key safely as it will not be displayed again.',
    apiKey: {
      id: keyId,
      name: name.trim(),
      environment,
      rawKey
    }
  });
});

// DELETE /api/v1/api-keys/:id - Revoke API key
router.delete('/:id', requireRole(['admin']), (req, res) => {
  const { id } = req.params;

  const keyRecord = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id);
  if (!keyRecord) {
    return res.status(404).json({ error: 'API key not found' });
  }

  db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);

  // Evict from in-memory cache
  promptCache.revokeApiKey(keyRecord.key_hash);

  res.json({ message: 'API key successfully revoked' });
});

module.exports = router;
