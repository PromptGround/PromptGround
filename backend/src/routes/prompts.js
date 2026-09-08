const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const promptCache = require('../cache/promptCache');
const { authenticateUser } = require('../middleware/auth');
const { requireRole, requirePromptAccess } = require('../middleware/rbac');
const { extractVariables } = require('../services/promptService');

// All prompt routes require dashboard session
router.use(authenticateUser);

// GET /api/v1/prompts - List prompts accessible to the user
router.get('/', (req, res) => {
  let query = `
    SELECT 
      p.id,
      p.slug,
      p.name,
      p.description,
      p.created_at,
      u.username as created_by_name
    FROM prompts p
    LEFT JOIN users u ON p.created_by = u.id
  `;
  const params = [];

  // Non-admins can only see prompts assigned to them or created by them
  if (req.user.role !== 'admin') {
    query += ` WHERE (p.created_by = ? OR p.id IN (SELECT prompt_id FROM user_prompt_access WHERE user_id = ?))`;
    params.push(req.user.id, req.user.id);
  }

  query += ` ORDER BY p.created_at DESC`;
  const prompts = db.prepare(query).all(...params);

  // For each prompt, fetch active version per environment
  const getActiveVersions = db.prepare(`
    SELECT 
      pv.environment,
      pv.version_number,
      pv.id as version_id,
      pv.variables,
      pv.created_at
    FROM prompt_versions pv
    INNER JOIN (
      SELECT prompt_id, environment, MAX(version_number) as max_v
      FROM prompt_versions
      WHERE prompt_id = ?
      GROUP BY prompt_id, environment
    ) latest ON pv.prompt_id = latest.prompt_id 
            AND pv.environment = latest.environment 
            AND pv.version_number = latest.max_v
  `);

  const results = prompts.map(p => {
    const active = getActiveVersions.all(p.id);
    const environments = {
      development: null,
      staging: null,
      production: null
    };

    active.forEach(v => {
      let vars = [];
      try { vars = JSON.parse(v.variables); } catch (e) {}
      environments[v.environment] = {
        versionNumber: v.version_number,
        versionId: v.version_id,
        variableCount: vars.length,
        updatedAt: v.created_at
      };
    });

    return {
      ...p,
      activeEnvironments: environments
    };
  });

  res.json({ prompts: results });
});

// POST /api/v1/prompts - Create new prompt with initial development version
router.post('/', requireRole(['admin', 'editor']), (req, res) => {
  const { slug, name, description = '', initialTemplate = '', environment = 'development' } = req.body;

  if (!slug || !name) {
    return res.status(400).json({ error: 'Slug and name are required' });
  }

  // Format slug (lowercase, alphanumeric and dashes)
  const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');

  const existing = db.prepare('SELECT id FROM prompts WHERE slug = ?').get(cleanSlug);
  if (existing) {
    return res.status(400).json({ error: `Prompt with slug '${cleanSlug}' already exists` });
  }

  const promptId = 'prm_' + uuidv4().slice(0, 8);
  const versionId = 'ver_' + uuidv4().slice(0, 8);
  const variables = extractVariables(initialTemplate);

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO prompts (id, slug, name, description, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(promptId, cleanSlug, name.trim(), description.trim(), req.user.id);

    db.prepare(`
      INSERT INTO prompt_versions (
        id, prompt_id, version_number, template_content, variables, environment, changelog, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      versionId,
      promptId,
      1,
      initialTemplate,
      JSON.stringify(variables),
      environment,
      'Initial version',
      req.user.id
    );

    // Update in-memory cache
    promptCache.updatePrompt(cleanSlug, environment, {
      promptId,
      slug: cleanSlug,
      name: name.trim(),
      versionId,
      versionNumber: 1,
      templateContent: initialTemplate,
      variables,
      environment
    });
  });

  transaction();

  res.status(201).json({
    message: 'Prompt created successfully',
    promptId,
    slug: cleanSlug,
    versionId
  });
});

// GET /api/v1/prompts/:idOrSlug - Get single prompt details and all versions
router.get('/:idOrSlug', requirePromptAccess('read'), (req, res) => {
  const { idOrSlug } = req.params;

  const prompt = db.prepare(`
    SELECT p.*, u.username as created_by_name
    FROM prompts p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ? OR p.slug = ?
  `).get(idOrSlug, idOrSlug);

  if (!prompt) {
    return res.status(404).json({ error: 'Prompt not found' });
  }

  // Fetch all versions
  const versions = db.prepare(`
    SELECT 
      pv.*,
      u.username as author_name
    FROM prompt_versions pv
    LEFT JOIN users u ON pv.created_by = u.id
    WHERE pv.prompt_id = ?
    ORDER BY pv.version_number DESC, pv.created_at DESC
  `).all(prompt.id);

  const parsedVersions = versions.map(v => {
    let vars = [];
    try { vars = JSON.parse(v.variables); } catch (e) {}
    return {
      ...v,
      variables: vars
    };
  });

  // Calculate active pointers
  const activeVersions = {
    development: null,
    staging: null,
    production: null
  };

  ['development', 'staging', 'production'].forEach(env => {
    const latest = parsedVersions.find(v => v.environment === env);
    if (latest) {
      activeVersions[env] = latest;
    }
  });

  res.json({
    prompt,
    activeVersions,
    versions: parsedVersions
  });
});

// POST /api/v1/prompts/:idOrSlug/versions - Create a new version for a prompt
router.post('/:idOrSlug/versions', requirePromptAccess('write'), (req, res) => {
  const { idOrSlug } = req.params;
  const { templateContent, environment = 'development', changelog = '' } = req.body;

  if (!templateContent) {
    return res.status(400).json({ error: 'templateContent is required' });
  }

  const prompt = db.prepare('SELECT * FROM prompts WHERE id = ? OR slug = ?').get(idOrSlug, idOrSlug);
  if (!prompt) {
    return res.status(404).json({ error: 'Prompt not found' });
  }

  // Direct writes to upper environments (staging/production) are restricted to admin
  // non-admins must write to development or use PR promotion workflow!
  if (environment !== 'development' && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Direct writes to upper environments are restricted',
      message: `Modifications to '${environment}' must be promoted via a Promotion Pull Request.`
    });
  }

  const maxVerRow = db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) as max_v
    FROM prompt_versions
    WHERE prompt_id = ? AND environment = ?
  `).get(prompt.id, environment);

  const nextVersionNumber = maxVerRow.max_v + 1;
  const versionId = 'ver_' + uuidv4().slice(0, 8);
  const variables = extractVariables(templateContent);

  db.prepare(`
    INSERT INTO prompt_versions (
      id, prompt_id, version_number, template_content, variables, environment, changelog, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    versionId,
    prompt.id,
    nextVersionNumber,
    templateContent,
    JSON.stringify(variables),
    environment,
    changelog.trim() || `Version ${nextVersionNumber}`,
    req.user.id
  );

  // Update in-memory cache directly
  promptCache.updatePrompt(prompt.slug, environment, {
    promptId: prompt.id,
    slug: prompt.slug,
    name: prompt.name,
    versionId,
    versionNumber: nextVersionNumber,
    templateContent,
    variables,
    environment
  });

  res.status(201).json({
    message: 'Version created successfully',
    versionId,
    versionNumber: nextVersionNumber,
    environment,
    variables
  });
});

// DELETE /api/v1/prompts/:idOrSlug - Delete prompt (admin only)
router.delete('/:idOrSlug', requireRole(['admin']), (req, res) => {
  const { idOrSlug } = req.params;

  const prompt = db.prepare('SELECT * FROM prompts WHERE id = ? OR slug = ?').get(idOrSlug, idOrSlug);
  if (!prompt) {
    return res.status(404).json({ error: 'Prompt not found' });
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM prompt_pull_requests WHERE prompt_id = ?').run(prompt.id);
    db.prepare('DELETE FROM user_prompt_access WHERE prompt_id = ?').run(prompt.id);
    db.prepare('DELETE FROM prompt_versions WHERE prompt_id = ?').run(prompt.id);
    db.prepare('DELETE FROM prompts WHERE id = ?').run(prompt.id);

    // Evict from cache
    ['development', 'staging', 'production'].forEach(env => {
      promptCache.invalidatePrompt(prompt.slug, env);
    });
  });

  transaction();

  res.json({ message: 'Prompt and associated versions deleted successfully' });
});

module.exports = router;
