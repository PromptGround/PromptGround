const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authenticateUser } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.use(authenticateUser);

// GET /api/v1/users - List users with roles, environment access, and prompt permissions
router.get('/', (req, res) => {
  const { promptId, slug, targetEnvironment } = req.query;
  const targetPromptIdOrSlug = promptId || slug;

  // When querying for eligible reviewers/mergers for a specific prompt and environment
  if (targetPromptIdOrSlug) {
    const prompt = db.prepare('SELECT id, created_by FROM prompts WHERE id = ? OR slug = ?').get(targetPromptIdOrSlug, targetPromptIdOrSlug);
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    if (targetEnvironment) {
      // Return users who have edit access to this prompt AND access to targetEnvironment (or are admins)
      const eligibleUsers = db.prepare(`
        SELECT DISTINCT u.id, u.username, u.role
        FROM users u
        LEFT JOIN user_environment_access uea ON u.id = uea.user_id AND uea.environment = ?
        LEFT JOIN user_prompt_access upa ON u.id = upa.user_id AND upa.prompt_id = ?
        WHERE u.role = 'admin'
           OR (
             u.role = 'editor'
             AND uea.environment IS NOT NULL
             AND (u.id = ? OR upa.access_level IN ('write', 'admin'))
           )
        ORDER BY (u.role = 'admin') DESC, u.username ASC
      `).all(targetEnvironment, prompt.id, prompt.created_by);

      return res.json({ users: eligibleUsers });
    }

    const eligibleUsers = db.prepare(`
      SELECT DISTINCT u.id, u.username, u.role
      FROM users u
      LEFT JOIN user_prompt_access upa ON u.id = upa.user_id AND upa.prompt_id = ?
      WHERE u.role = 'admin'
         OR u.id = ?
         OR upa.prompt_id IS NOT NULL
      ORDER BY (u.role = 'admin') DESC, u.username ASC
    `).all(prompt.id, prompt.created_by);

    return res.json({ users: eligibleUsers });
  }

  // Non-admins only get minimal information for general queries
  if (req.user.role !== 'admin') {
    const reviewers = db.prepare(`
      SELECT id, username, role
      FROM users
      WHERE role IN ('admin', 'editor')
      ORDER BY username ASC
    `).all();
    return res.json({ users: reviewers });
  }

  const users = db.prepare(`
    SELECT id, username, role, created_at
    FROM users
    ORDER BY created_at ASC
  `).all();

  const getEnvAccess = db.prepare('SELECT environment FROM user_environment_access WHERE user_id = ?');
  const getPromptAccess = db.prepare(`
    SELECT upa.prompt_id, upa.access_level, p.name as prompt_name, p.slug as prompt_slug
    FROM user_prompt_access upa
    JOIN prompts p ON upa.prompt_id = p.id
    WHERE upa.user_id = ?
  `);

  const results = users.map(u => {
    const envs = getEnvAccess.all(u.id).map(r => r.environment);
    const promptOverrides = getPromptAccess.all(u.id);
    return {
      ...u,
      environments: envs,
      promptAccessOverrides: promptOverrides
    };
  });

  res.json({ users: results });
});

// POST /api/v1/users - Create new user (admin only)
router.post('/', requireRole(['admin']), (req, res) => {
  const { username, password, role = 'editor', environments = ['development'] } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin, editor, or viewer' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  const userId = 'usr_' + uuidv4().slice(0, 8);
  const hash = bcrypt.hashSync(password, 10);

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(userId, username.trim(), hash, role);

    const insertEnv = db.prepare(`
      INSERT INTO user_environment_access (user_id, environment)
      VALUES (?, ?)
    `);

    environments.forEach(env => {
      if (['development', 'staging', 'production'].includes(env)) {
        insertEnv.run(userId, env);
      }
    });
  });

  transaction();

  res.status(201).json({
    message: 'User created successfully',
    userId,
    username: username.trim(),
    role
  });
});

// PUT /api/v1/users/:id/role - Update user role
router.put('/:id/role', requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin, editor, or viewer' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  res.json({ message: 'User role updated successfully', role });
});

// PUT /api/v1/users/:id/environments - Update user environment permissions
router.put('/:id/environments', requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { environments = [] } = req.body;

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM user_environment_access WHERE user_id = ?').run(id);

    const insertEnv = db.prepare(`
      INSERT INTO user_environment_access (user_id, environment)
      VALUES (?, ?)
    `);

    environments.forEach(env => {
      if (['development', 'staging', 'production'].includes(env)) {
        insertEnv.run(id, env);
      }
    });
  });

  transaction();

  res.json({ message: 'Environment permissions updated successfully', environments });
});

// PUT /api/v1/users/:id/prompt-access - Set granular prompt-level access override
router.put('/:id/prompt-access', requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { prompt_id, access_level } = req.body;

  if (!prompt_id) {
    return res.status(400).json({ error: 'prompt_id is required' });
  }

  if (access_level && !['read', 'write', 'admin'].includes(access_level)) {
    return res.status(400).json({ error: 'access_level must be read, write, or admin' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!access_level) {
    // Clear override
    db.prepare('DELETE FROM user_prompt_access WHERE user_id = ? AND prompt_id = ?').run(id, prompt_id);
    return res.json({ message: 'Prompt override removed' });
  }

  db.prepare(`
    INSERT INTO user_prompt_access (user_id, prompt_id, access_level)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, prompt_id) DO UPDATE SET access_level = excluded.access_level
  `).run(id, prompt_id, access_level);

  res.json({ message: 'Prompt access override updated', prompt_id, access_level });
});

// PUT /api/v1/users/:id/password - Admin reset user's password directly
router.put('/:id/password', requireRole(['admin']), (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);

  res.json({ message: `Password reset successfully for user '${user.username}'` });
});

module.exports = router;
