const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authenticateUser } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const llmService = require('../services/llmService');

router.use(authenticateUser);

// GET /api/v1/models - List all models (accessible to all logged-in users, masks sensitive credentials)
router.get('/', (req, res) => {
  const models = db.prepare(`
    SELECT 
      m.id,
      m.name,
      m.provider_type,
      m.base_url,
      m.model_id,
      m.custom_headers,
      m.default_params,
      m.created_at,
      u.username as created_by_name
    FROM llm_providers m
    LEFT JOIN users u ON m.created_by = u.id
    ORDER BY m.created_at DESC
  `).all();

  const formatted = models.map(m => {
    let customHeaders = {};
    let defaultParams = {};
    try { customHeaders = JSON.parse(m.custom_headers || '{}'); } catch (e) {}
    try { defaultParams = JSON.parse(m.default_params || '{}'); } catch (e) {}

    return {
      ...m,
      customHeaders,
      defaultParams,
      hasApiKey: true // indication that auth is stored
    };
  });

  res.json({ models: formatted });
});

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  anthropic: 'https://api.anthropic.com/v1'
};

const PROVIDER_NAMES = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic'
};

// POST /api/v1/models - Register new model connection (Admin only)
router.post('/', requireRole(['admin']), (req, res) => {
  const { 
    name, 
    provider_type, 
    base_url, 
    api_key = '', 
    model_id, 
    custom_headers = {}, 
    default_params = {} 
  } = req.body;

  if (!provider_type || !model_id) {
    return res.status(400).json({ error: 'provider_type and model_id are required' });
  }

  if (!['openai', 'gemini', 'anthropic'].includes(provider_type)) {
    return res.status(400).json({ error: 'Invalid provider_type. Supported providers are strictly: openai, gemini, and anthropic' });
  }

  // Auto-generate standard API endpoint if not provided
  const finalBaseUrl = (base_url && base_url.trim()) ? base_url.trim() : DEFAULT_BASE_URLS[provider_type];

  // Auto-generate clean display name if not provided
  const finalName = (name && name.trim()) ? name.trim() : `${PROVIDER_NAMES[provider_type]} - ${model_id.trim()}`;

  const id = 'mod_' + uuidv4().slice(0, 8);

  const headersJson = typeof custom_headers === 'string' ? custom_headers : JSON.stringify(custom_headers);
  const paramsJson = typeof default_params === 'string' ? default_params : JSON.stringify(default_params);

  db.prepare(`
    INSERT INTO llm_providers (
      id, name, provider_type, base_url, api_key, model_id, custom_headers, default_params, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    finalName,
    provider_type,
    finalBaseUrl,
    api_key.trim(),
    model_id.trim(),
    headersJson,
    paramsJson,
    req.user.id
  );

  res.status(201).json({
    message: 'Model connection registered successfully',
    modelId: id,
    name: finalName,
    provider_type,
    base_url: finalBaseUrl
  });
});

// PUT /api/v1/models/:id - Update model connection (Admin only)
router.put('/:id', requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { 
    name, 
    provider_type, 
    base_url, 
    api_key, 
    model_id, 
    custom_headers, 
    default_params 
  } = req.body;

  const existing = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Model connection not found' });
  }

  const updatedType = provider_type !== undefined ? provider_type : existing.provider_type;
  if (!['openai', 'gemini', 'anthropic'].includes(updatedType)) {
    return res.status(400).json({ error: 'Invalid provider_type. Supported providers are strictly: openai, gemini, and anthropic' });
  }

  const updatedModelId = model_id !== undefined ? model_id.trim() : existing.model_id;
  const updatedUrl = (base_url !== undefined && base_url.trim()) ? base_url.trim() : (existing.base_url || DEFAULT_BASE_URLS[updatedType]);
  const updatedName = (name !== undefined && name.trim()) ? name.trim() : (existing.name || `${PROVIDER_NAMES[updatedType]} - ${updatedModelId}`);

  // If api_key is empty string or omitted in edit, preserve existing key
  const updatedKey = (api_key !== undefined && api_key !== '') ? api_key.trim() : existing.api_key;
  const updatedHeaders = custom_headers !== undefined ? (typeof custom_headers === 'string' ? custom_headers : JSON.stringify(custom_headers)) : existing.custom_headers;
  const updatedParams = default_params !== undefined ? (typeof default_params === 'string' ? default_params : JSON.stringify(default_params)) : existing.default_params;

  db.prepare(`
    UPDATE llm_providers 
    SET name = ?, provider_type = ?, base_url = ?, api_key = ?, model_id = ?, custom_headers = ?, default_params = ?
    WHERE id = ?
  `).run(
    updatedName,
    updatedType,
    updatedUrl,
    updatedKey,
    updatedModelId,
    updatedHeaders,
    updatedParams,
    id
  );

  res.json({ message: 'Model connection updated successfully' });
});

// DELETE /api/v1/models/:id - Delete model connection (Admin only)
router.delete('/:id', requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM llm_providers WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Model connection not found' });
  }

  db.prepare('DELETE FROM llm_providers WHERE id = ?').run(id);
  res.json({ message: 'Model connection removed' });
});

// POST /api/v1/models/test-direct - Test connection before saving or test existing
router.post('/test-direct', requireRole(['admin']), async (req, res) => {
  const provider = { ...req.body };
  if (!provider.provider_type) {
    return res.status(400).json({ error: 'provider_type is required' });
  }

  if (!['openai', 'gemini', 'anthropic'].includes(provider.provider_type)) {
    return res.status(400).json({ error: 'Only openai, gemini, and anthropic are supported' });
  }

  if (!provider.base_url) {
    provider.base_url = DEFAULT_BASE_URLS[provider.provider_type];
  }

  try {
    const result = await llmService.testConnection(provider);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
