const express = require('express');
const router = express.Router();
const promptCache = require('../cache/promptCache');
const { authenticateRuntime } = require('../middleware/auth');
const { requireEnvironmentAccess, requirePromptAccess } = require('../middleware/rbac');

// Sub-millisecond runtime retrieval of active prompt template
// GET /api/v1/runtime/prompts/:slug?env=production
router.get(
  '/prompts/:slug',
  authenticateRuntime,
  requireEnvironmentAccess('env'),
  requirePromptAccess('read'),
  (req, res) => {
    const hrStart = process.hrtime.bigint();
    const { slug } = req.params;
    const environment = req.targetEnvironment;

    const cached = promptCache.getPrompt(slug, environment);

    const hrEnd = process.hrtime.bigint();
    const lookupDurationMicroseconds = Number(hrEnd - hrStart) / 1000;

    res.setHeader('X-Cache', cached ? 'HIT' : 'MISS');
    res.setHeader('X-Cache-Lookup-Time-Microseconds', lookupDurationMicroseconds.toFixed(2));

    if (!cached) {
      return res.status(404).json({
        error: 'Prompt not found in requested environment',
        slug,
        environment,
        cacheHit: false
      });
    }

    res.json({
      promptId: cached.promptId,
      slug: cached.slug,
      name: cached.name,
      version: cached.versionNumber,
      environment: cached.environment,
      templateContent: cached.templateContent,
      variables: cached.variables,
      updatedAt: cached.updatedAt,
      cacheHit: true,
      lookupLatencyMicroseconds: Number(lookupDurationMicroseconds.toFixed(2))
    });
  }
);

// Sub-millisecond runtime render endpoint: interpolates variables into template
// POST /api/v1/runtime/render/:slug
// Body: { env: "production", variables: { customer_name: "Alice", ... } }
router.post(
  '/render/:slug',
  authenticateRuntime,
  requireEnvironmentAccess('env'),
  requirePromptAccess('read'),
  (req, res) => {
    const { slug } = req.params;
    const environment = req.targetEnvironment;
    const inputVariables = req.body.variables || {};

    const rendered = promptCache.render(slug, environment, inputVariables);

    if (!rendered) {
      res.setHeader('X-Cache', 'MISS');
      return res.status(404).json({
        error: 'Prompt not found in requested environment',
        slug,
        environment,
        cacheHit: false
      });
    }

    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Render-Time-Microseconds', rendered.durationMicroseconds);

    res.json(rendered);
  }
);

// High-performance test playground execution endpoint:
// 1. Hydrates prompt against sub-millisecond cache
// 2. Invokes the selected connected LLM model
// POST /api/v1/runtime/execute/:slug
router.post(
  '/execute/:slug',
  authenticateRuntime,
  requireEnvironmentAccess('env'),
  requirePromptAccess('read'),
  async (req, res) => {
    const { slug } = req.params;
    const environment = req.targetEnvironment;
    const inputVariables = req.body.variables || {};
    const { modelId, options = {}, files = [] } = req.body;

    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required to execute prompt' });
    }

    // 1. Hydrate prompt from in-memory cache
    const rendered = promptCache.render(slug, environment, inputVariables);
    if (!rendered) {
      return res.status(404).json({ error: 'Prompt not found in requested environment', slug, environment });
    }

    // 2. Fetch connected model configuration
    const { db } = require('../db');
    const provider = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(modelId);
    if (!provider) {
      return res.status(404).json({ error: 'Selected LLM model provider not found' });
    }

    // 3. Execute prompt against model with optional file attachments
    const llmService = require('../services/llmService');
    try {
      const mergedFiles = Array.isArray(files) && files.length > 0 ? files : (options.files || []);
      const execResult = await llmService.executePrompt(provider, rendered.rendered, { ...options, files: mergedFiles });

      res.json({
        promptId: rendered.promptId,
        slug: rendered.slug,
        version: rendered.version,
        environment: rendered.environment,
        hydratedPrompt: rendered.rendered,
        modelOutput: execResult.output,
        modelLatencyMs: execResult.latencyMs,
        tokensUsed: execResult.tokensUsed,
        providerName: execResult.providerName,
        modelId: execResult.modelId,
        attachedFilesCount: execResult.attachedFilesCount || 0,
        cacheLookupMicroseconds: rendered.durationMicroseconds,
        cacheHit: true
      });
    } catch (err) {
      res.status(500).json({
        error: 'Model execution failed',
        message: err.message,
        hydratedPrompt: rendered.rendered
      });
    }
  }
);

module.exports = router;
