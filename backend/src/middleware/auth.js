const jwt = require('jsonwebtoken');
const promptCache = require('../cache/promptCache');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'promptground_super_secret_jwt_key_98765';

function generateUserToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Authenticates dashboard user sessions (JWT)
function authenticateUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch user details and current environment access
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const envRows = db.prepare('SELECT environment FROM user_environment_access WHERE user_id = ?').all(user.id);
    user.environments = envRows.map(r => r.environment);

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token', details: err.message });
  }
}

// Authenticates external runtime calls (Bearer API Key or Dashboard JWT)
function authenticateRuntime(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Runtime calls require Authorization: Bearer <api_key>' 
    });
  }

  const token = authHeader.split(' ')[1];

  // 1. Check in-memory API key cache (sub-millisecond)
  const apiKey = promptCache.validateApiKey(token);
  if (apiKey) {
    req.authType = 'api_key';
    req.apiKey = apiKey;
    return next();
  }

  // 2. Allow dashboard JWT session to test runtime endpoints directly
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(decoded.id);
    if (user) {
      const envRows = db.prepare('SELECT environment FROM user_environment_access WHERE user_id = ?').all(user.id);
      user.environments = envRows.map(r => r.environment);
      req.authType = 'user_jwt';
      req.user = user;
      return next();
    }
  } catch (err) {
    // ignore jwt error, key check already failed
  }

  return res.status(401).json({ 
    error: 'Invalid API key or token',
    message: 'The provided Bearer token is not recognized or has been revoked.' 
  });
}

module.exports = {
  JWT_SECRET,
  generateUserToken,
  authenticateUser,
  authenticateRuntime
};
