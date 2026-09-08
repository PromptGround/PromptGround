const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { generateUserToken, authenticateUser } = require('../middleware/auth');

// POST /api/v1/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const passwordValid = bcrypt.compareSync(password, user.password_hash);
  if (!passwordValid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Get environment access
  const envRows = db.prepare('SELECT environment FROM user_environment_access WHERE user_id = ?').all(user.id);
  const environments = envRows.map(r => r.environment);

  const token = generateUserToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      environments,
      createdAt: user.created_at
    }
  });
});

// GET /api/v1/auth/me
router.get('/me', authenticateUser, (req, res) => {
  res.json({
    user: req.user
  });
});

// POST /api/v1/auth/register (for provisioning additional users or quick onboarding)
router.post('/register', (req, res) => {
  const { username, password, role = 'editor' } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  const id = 'usr_' + uuidv4().slice(0, 8);
  const hash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(id, username, hash, role);

  // Default dev access
  db.prepare(`
    INSERT INTO user_environment_access (user_id, environment)
    VALUES (?, 'development')
  `).run(id);

  res.status(201).json({
    message: 'User registered successfully',
    userId: id
  });
});

// PUT /api/v1/auth/password (self-service password change)
router.put('/password', authenticateUser, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const valid = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

  res.json({ message: 'Password updated successfully' });
});

module.exports = router;
