const { db } = require('../db');

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User authentication required' });
    }

    if (req.user.role === 'admin') {
      return next(); // Admins bypass role checks
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: `Action requires one of the following roles: ${allowedRoles.join(', ')}. Current role: ${req.user.role}` 
      });
    }

    next();
  };
}

// Checks environment-level authorization for runtime fetches & UI promotions
function requireEnvironmentAccess(targetEnvParamName = 'env') {
  return (req, res, next) => {
    const targetEnv = (req.query[targetEnvParamName] || req.body[targetEnvParamName] || req.params[targetEnvParamName] || 'production').toLowerCase();

    if (!['development', 'staging', 'production'].includes(targetEnv)) {
      return res.status(400).json({ error: `Invalid environment '${targetEnv}'. Must be development, staging, or production.` });
    }

    req.targetEnvironment = targetEnv;

    // 1. If runtime request with API Key
    if (req.authType === 'api_key' && req.apiKey) {
      if (req.apiKey.environment !== targetEnv) {
        return res.status(403).json({
          error: 'Scope mismatch',
          message: `This API key is scoped strictly for '${req.apiKey.environment}', but the request targeted '${targetEnv}'.`
        });
      }
      return next();
    }

    // 2. If user request
    if (req.user) {
      if (req.user.role === 'admin') {
        return next();
      }

      if (req.user.environments && req.user.environments.includes(targetEnv)) {
        return next();
      }

      return res.status(403).json({
        error: 'Environment Access Denied',
        message: `You do not have authorization to access the '${targetEnv}' environment.`
      });
    }

    return res.status(401).json({ error: 'Unauthorized' });
  };
}

// Helper function to check prompt access programmatically
function hasPromptAccess(user, promptId, requiredLevel = 'read') {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const prompt = db.prepare('SELECT id, created_by FROM prompts WHERE id = ? OR slug = ?').get(promptId, promptId);
  if (!prompt) return false;

  // Creator has full access on their own prompts
  if (prompt.created_by === user.id) return true;

  // Check explicit prompt access
  const access = db.prepare(`
    SELECT access_level FROM user_prompt_access 
    WHERE user_id = ? AND prompt_id = ?
  `).get(user.id, prompt.id);

  if (!access) return false;

  const levels = { read: 1, write: 2, admin: 3 };
  return (levels[access.access_level] || 0) >= (levels[requiredLevel] || 1);
}

// Checks granular prompt-level access override
function requirePromptAccess(requiredLevel = 'read') {
  return (req, res, next) => {
    // API key calls are scoped by environment rather than individual user prompts
    if (req.authType === 'api_key') {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    const promptIdOrSlug = req.params.promptId || req.params.slug || req.params.idOrSlug || req.body.promptId || req.body.prompt_id;
    if (!promptIdOrSlug) {
      return next();
    }

    // Find prompt
    const prompt = db.prepare('SELECT id, created_by FROM prompts WHERE id = ? OR slug = ?').get(promptIdOrSlug, promptIdOrSlug);
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    req.currentPromptId = prompt.id;

    // Creator has full permissions
    if (prompt.created_by === req.user.id) {
      return next();
    }

    // Check prompt-level assignment
    const access = db.prepare(`
      SELECT access_level FROM user_prompt_access 
      WHERE user_id = ? AND prompt_id = ?
    `).get(req.user.id, prompt.id);

    if (access) {
      const levels = { read: 1, write: 2, admin: 3 };
      if (levels[access.access_level] >= levels[requiredLevel]) {
        return next();
      }
      return res.status(403).json({
        error: 'Insufficient Prompt Permission',
        message: `Your access level on this prompt is '${access.access_level}', but '${requiredLevel}' is required.`
      });
    }

    // No assignment and not creator -> strictly FORBIDDEN!
    return res.status(403).json({
      error: 'Access Denied',
      message: `No access permissions have been assigned to your account for this prompt. Contact an Administrator to request access.`
    });
  };
}

module.exports = {
  requireRole,
  requireEnvironmentAccess,
  requirePromptAccess,
  hasPromptAccess
};
