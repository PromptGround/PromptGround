const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../../data/prompts.db');

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath, {
  // verbose: process.env.NODE_ENV === 'development' ? console.log : null
});

// Configure SQLite for maximum concurrency & reliability
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = -64000'); // 64MB cache

function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // Migration: ensure assignee_id is nullable for collaborative peer review (like GitHub)
  try {
    const prCols = db.prepare("PRAGMA table_info(prompt_pull_requests)").all();
    const assigneeCol = prCols.find(c => c.name === 'assignee_id');
    if (assigneeCol && assigneeCol.notnull === 1) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE prompt_pull_requests_new (
          id TEXT PRIMARY KEY,
          prompt_id TEXT NOT NULL,
          source_version_id TEXT NOT NULL,
          target_environment TEXT CHECK(target_environment IN ('staging', 'production')) NOT NULL,
          author_id TEXT NOT NULL,
          assignee_id TEXT,
          status TEXT CHECK(status IN ('open', 'merged', 'rejected')) DEFAULT 'open',
          title TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (prompt_id) REFERENCES prompts(id),
          FOREIGN KEY (source_version_id) REFERENCES prompt_versions(id),
          FOREIGN KEY (author_id) REFERENCES users(id),
          FOREIGN KEY (assignee_id) REFERENCES users(id)
        );
        INSERT INTO prompt_pull_requests_new SELECT * FROM prompt_pull_requests;
        DROP TABLE prompt_pull_requests;
        ALTER TABLE prompt_pull_requests_new RENAME TO prompt_pull_requests;
        CREATE INDEX IF NOT EXISTS idx_pull_requests_status ON prompt_pull_requests(status);
      `);
      db.pragma('foreign_keys = ON');
    }
  } catch (e) {
    // Schema already current or table not initialized yet
  }

  seedInitialData();
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function syncAdminCredentials() {
  if (!process.env.ADMIN_USERNAME && !process.env.ADMIN_PASSWORD) {
    return;
  }
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  const existingAdmin = db.prepare("SELECT * FROM users WHERE username = ? OR role = 'admin' LIMIT 1").get(adminUsername);
  if (existingAdmin) {
    if (adminPassword) {
      const newHash = bcrypt.hashSync(adminPassword, 10);
      db.prepare("UPDATE users SET username = ?, password_hash = ?, role = 'admin' WHERE id = ?").run(adminUsername, newHash, existingAdmin.id);
      console.log(`[DB] Admin credentials synchronized from environment variables (username: ${adminUsername})`);
    } else {
      db.prepare("UPDATE users SET username = ? WHERE id = ?").run(adminUsername, existingAdmin.id);
      console.log(`[DB] Admin username updated from environment variable (username: ${adminUsername})`);
    }
  } else {
    const adminId = 'usr_' + uuidv4().slice(0, 8);
    const pwd = adminPassword || 'admin123';
    const newHash = bcrypt.hashSync(pwd, 10);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (?, ?, ?, 'admin', datetime('now'))
    `).run(adminId, adminUsername, newHash);

    ['development', 'staging', 'production'].forEach(env => {
      db.prepare(`
        INSERT OR IGNORE INTO user_environment_access (user_id, environment)
        VALUES (?, ?)
      `).run(adminId, env);
    });
    console.log(`[DB] Created new admin user from environment variables (username: ${adminUsername})`);
  }
}

function seedLlmProviders(adminId) {
  // Only seed sample demo models if explicitly requested via environment variable
  if (process.env.SEED_SAMPLE_MODELS !== 'true') {
    return;
  }

  const count = db.prepare('SELECT COUNT(*) as count FROM llm_providers').get().count;
  if (count > 0) return;

  const insertModel = db.prepare(`
    INSERT INTO llm_providers (
      id, name, provider_type, base_url, api_key, model_id, custom_headers, default_params, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  insertModel.run(
    'mod_ollama_local',
    'Local Ollama Runner',
    'ollama',
    process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    '',
    'llama3.2:latest',
    '{}',
    JSON.stringify({ temperature: 0.7, max_tokens: 1024 }),
    adminId
  );
}

function seedSmtpSettings() {
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (key, value)
    VALUES (?, ?)
  `);

  insertSetting.run('smtp_host', process.env.SMTP_HOST || '');
  insertSetting.run('smtp_port', process.env.SMTP_PORT || '587');
  insertSetting.run('smtp_secure', process.env.SMTP_SECURE || 'false');
  insertSetting.run('smtp_user', process.env.SMTP_USER || '');
  insertSetting.run('smtp_pass', process.env.SMTP_PASS || '');
  insertSetting.run('smtp_from_email', process.env.SMTP_FROM_EMAIL || '');
  insertSetting.run('smtp_from_name', process.env.SMTP_FROM_NAME || 'PromptGround Notifications');
}

function purgeAllLegacySeedData() {
  db.pragma('foreign_keys = OFF');
  try {
    const sampleSlugs = ['customer-support-copilot', 'sql-query-generator', 'rag-summarizer'];
    for (const slug of sampleSlugs) {
      const prompt = db.prepare('SELECT id FROM prompts WHERE slug = ?').get(slug);
      if (prompt) {
        db.prepare('DELETE FROM prompt_pull_requests WHERE prompt_id = ?').run(prompt.id);
        db.prepare('DELETE FROM prompt_versions WHERE prompt_id = ?').run(prompt.id);
        db.prepare('DELETE FROM user_prompt_access WHERE prompt_id = ?').run(prompt.id);
        db.prepare('DELETE FROM prompts WHERE id = ?').run(prompt.id);
      }
    }
    db.prepare("DELETE FROM user_environment_access WHERE user_id IN (SELECT id FROM users WHERE username IN ('sarah_eng', 'alex_analyst'))").run();
    db.prepare("DELETE FROM users WHERE username IN ('sarah_eng', 'alex_analyst')").run();
    db.prepare("DELETE FROM api_keys WHERE id IN ('key_prod_1', 'key_stg_1', 'key_dev_1')").run();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function logAdminCredentials(username, password) {
  console.log('========================================================');
  console.log('🔐 PromptGround Admin Credentials:');
  console.log(`   Username: ${username}`);
  console.log(`   Password: ${password}`);
  if (process.env.ADMIN_USERNAME || process.env.ADMIN_PASSWORD) {
    console.log('   Source:   Configured via Environment Variables');
  } else {
    console.log('   Source:   Default Credentials (set ADMIN_USERNAME & ADMIN_PASSWORD to customize)');
  }
  console.log('========================================================');
}

function seedInitialData() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  // Ensure default system settings exist
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (key, value)
    VALUES (?, ?)
  `);

  insertSetting.run('cache_mode', 'in_memory_map');
  insertSetting.run('wal_checkpoint_mode', 'PASSIVE');
  insertSetting.run('runtime_telemetry', 'enabled');
  insertSetting.run('default_cache_ttl_seconds', '3600');
  insertSetting.run('company_name', 'PromptGround LLMOps');

  seedSmtpSettings();

  // Purge any legacy sample demo data that might exist in mounted volumes
  purgeAllLegacySeedData();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    syncAdminCredentials();
    logAdminCredentials(adminUsername, adminPassword);
    return;
  }

  console.log('[DB] Initializing fresh database with admin credentials...');

  const adminId = 'usr_' + uuidv4().slice(0, 8);
  const adminHash = bcrypt.hashSync(adminPassword, 10);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at)
    VALUES (?, ?, ?, 'admin', datetime('now'))
  `).run(adminId, adminUsername, adminHash);

  // Admin has access to all environments
  ['development', 'staging', 'production'].forEach(env => {
    db.prepare(`
      INSERT OR IGNORE INTO user_environment_access (user_id, environment)
      VALUES (?, ?)
    `).run(adminId, env);
  });

  logAdminCredentials(adminUsername, adminPassword);
}

module.exports = {
  db,
  initDatabase,
  hashApiKey,
  purgeAllLegacySeedData
};
