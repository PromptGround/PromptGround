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

  seedInitialData();
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function syncAdminCredentials() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const newHash = bcrypt.hashSync(adminPassword, 10);

  const existingAdmin = db.prepare("SELECT * FROM users WHERE username = ? OR role = 'admin' LIMIT 1").get(adminUsername);
  if (existingAdmin) {
    db.prepare("UPDATE users SET username = ?, password_hash = ?, role = 'admin' WHERE id = ?").run(adminUsername, newHash, existingAdmin.id);
  } else {
    const adminId = 'usr_' + uuidv4().slice(0, 8);
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

function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    syncAdminCredentials();
    seedSmtpSettings();
    if (process.env.SEED_SAMPLE_MODELS === 'true') {
      const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
      seedLlmProviders(adminUser ? adminUser.id : 'usr_admin');
    }
    return;
  }

  console.log('[DB] Seeding initial database records...');

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  const insertEnvAccess = db.prepare(`
    INSERT INTO user_environment_access (user_id, environment)
    VALUES (?, ?)
  `);

  const adminId = 'usr_' + uuidv4().slice(0, 8);
  const editorId = 'usr_' + uuidv4().slice(0, 8);
  const viewerId = 'usr_' + uuidv4().slice(0, 8);

  const adminHash = bcrypt.hashSync(adminPassword, 10);
  const editorHash = bcrypt.hashSync('editor123', 10);
  const viewerHash = bcrypt.hashSync('viewer123', 10);

  insertUser.run(adminId, adminUsername, adminHash, 'admin');
  insertUser.run(editorId, 'sarah_eng', editorHash, 'editor');
  insertUser.run(viewerId, 'alex_analyst', viewerHash, 'viewer');

  // Environment Access
  ['development', 'staging', 'production'].forEach(env => insertEnvAccess.run(adminId, env));
  ['development', 'staging'].forEach(env => insertEnvAccess.run(editorId, env));
  ['development'].forEach(env => insertEnvAccess.run(viewerId, env));

  // Prompts & Versions
  const insertPrompt = db.prepare(`
    INSERT INTO prompts (id, slug, name, description, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  const insertVersion = db.prepare(`
    INSERT INTO prompt_versions (id, prompt_id, version_number, template_content, variables, environment, changelog, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  // 1. Customer Support Copilot
  const p1Id = 'prm_' + uuidv4().slice(0, 8);
  insertPrompt.run(
    p1Id,
    'customer-support-copilot',
    'Customer Support Copilot',
    'High-empathy, context-aware AI assistant prompt for handling enterprise customer queries.',
    adminId
  );

  const v1Content = `You are an expert customer support agent for Acme Cloud.
Customer: {{customer_name}}
Account Tier: {{account_tier}}
Category: {{issue_category}}

Recent history:
{{conversation_history}}

Guidelines:
1. Provide a polite and direct answer.
2. If account tier is Enterprise, offer dedicated VIP escalation.
3. Keep response under 150 words.`;

  const v2Content = `You are a world-class customer support specialist for Acme Cloud.
Customer: {{customer_name}}
Account Tier: {{account_tier}}
Category: {{issue_category}}

Recent conversation context:
{{conversation_history}}

Guidelines:
1. Greet {{customer_name}} warmly and acknowledge their {{account_tier}} status.
2. Provide step-by-step resolution steps.
3. If {{account_tier}} is "Enterprise" or "Pro", include priority hotline info.
4. Conclude with a helpful proactive follow-up question.`;

  const v3Content = `You are a premium AI customer support copilot for Acme Cloud.
Customer Name: {{customer_name}}
Account Tier: {{account_tier}}
Issue Category: {{issue_category}}

Conversation History:
{{conversation_history}}

Strict Instructions:
1. Tone: Empathetic, concise, professional.
2. Address {{customer_name}} personally.
3. Immediate resolution for {{issue_category}}.
4. For Enterprise tiers: provide instant ticket escalation link.`;

  const p1v1Id = 'ver_' + uuidv4().slice(0, 8);
  const p1v2Id = 'ver_' + uuidv4().slice(0, 8);
  const p1v3Id = 'ver_' + uuidv4().slice(0, 8);

  insertVersion.run(p1v1Id, p1Id, 1, v1Content, JSON.stringify(['customer_name', 'account_tier', 'issue_category', 'conversation_history']), 'production', 'Initial production release', adminId);
  insertVersion.run(p1v2Id, p1Id, 2, v2Content, JSON.stringify(['customer_name', 'account_tier', 'issue_category', 'conversation_history']), 'staging', 'Refined empathy & tier-based priority', editorId);
  insertVersion.run(p1v3Id, p1Id, 3, v3Content, JSON.stringify(['customer_name', 'account_tier', 'issue_category', 'conversation_history']), 'development', 'Added strict ticket escalation links and tone constraints', editorId);

  // 2. SQL Query Generator
  const p2Id = 'prm_' + uuidv4().slice(0, 8);
  insertPrompt.run(
    p2Id,
    'sql-query-generator',
    'SQL Query Generator',
    'Translates natural language questions into safe, optimized read-only SQL queries.',
    editorId
  );

  const sqlV1Content = `You are a principal database engineer. Generate a syntax-valid {{dialect}} query based on this schema:
{{schema_definition}}

User Question: {{user_question}}

Output strictly the SQL code block. No explanations. Only SELECT queries are permitted.`;

  const p2v1Id = 'ver_' + uuidv4().slice(0, 8);
  insertVersion.run(p2v1Id, p2Id, 1, sqlV1Content, JSON.stringify(['dialect', 'schema_definition', 'user_question']), 'production', 'Initial SQL generator release', editorId);

  // 3. RAG Summarizer
  const p3Id = 'prm_' + uuidv4().slice(0, 8);
  insertPrompt.run(
    p3Id,
    'rag-summarizer',
    'RAG Document Synthesizer',
    'Synthesizes multi-document retrieval results into actionable executive briefings.',
    adminId
  );

  const ragV1Content = `Synthesize the following documents to address the query:
Query: {{user_query}}

Source Documents:
{{context_documents}}

Provide a {{max_length}} word executive summary with bullet-pointed citations.`;

  const p3v1Id = 'ver_' + uuidv4().slice(0, 8);
  insertVersion.run(p3v1Id, p3Id, 1, ragV1Content, JSON.stringify(['user_query', 'context_documents', 'max_length']), 'staging', 'Initial RAG synthesizer for staging testing', adminId);

  // Open Pull Request for customer-support-copilot v3 to staging
  const prId = 'pr_' + uuidv4().slice(0, 8);
  const insertPR = db.prepare(`
    INSERT INTO prompt_pull_requests (id, prompt_id, source_version_id, target_environment, author_id, assignee_id, status, title, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, datetime('now'))
  `);
  insertPR.run(
    prId,
    p1Id,
    p1v3Id,
    'staging',
    editorId,
    adminId,
    'Promote Customer Support v3 with strict tone constraints',
    'Proposing v3 promotion from development to staging. Adds explicit escalation link formatting and tighter empathy rules.'
  );

  // API Keys (Seed known keys for microservice integration testing)
  // dev key: ph_dev_testkey_12345
  // stg key: ph_stg_testkey_67890
  // prod key: ph_live_testkey_abcdef
  const insertApiKey = db.prepare(`
    INSERT INTO api_keys (id, key_hash, name, environment, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  insertApiKey.run('key_prod_1', hashApiKey('ph_live_testkey_abcdef'), 'Production Service Key (Primary)', 'production', adminId);
  insertApiKey.run('key_stg_1', hashApiKey('ph_stg_testkey_67890'), 'Staging CI/CD Runner', 'staging', editorId);
  insertApiKey.run('key_dev_1', hashApiKey('ph_dev_testkey_12345'), 'Local Development Microservice', 'development', editorId);

  // System Settings
  const insertSetting = db.prepare(`
    INSERT INTO system_settings (key, value)
    VALUES (?, ?)
  `);

  insertSetting.run('cache_mode', 'in_memory_map');
  insertSetting.run('wal_checkpoint_mode', 'PASSIVE');
  insertSetting.run('runtime_telemetry', 'enabled');
  insertSetting.run('default_cache_ttl_seconds', '3600');
  insertSetting.run('company_name', 'PromptGround LLMOps');

  console.log('[DB] Database successfully initialized and seeded.');
  console.log('[DB] Default credentials:');
  console.log('     Admin:   username=admin,        password=admin123');
  console.log('     Editor:  username=sarah_eng,    password=editor123');
  console.log('     Viewer:  username=alex_analyst, password=viewer123');
  console.log('[DB] Seed API Keys:');
  console.log('     Production:  ph_live_testkey_abcdef');
  console.log('     Staging:     ph_stg_testkey_67890');
  console.log('     Development: ph_dev_testkey_12345');
}

module.exports = {
  db,
  initDatabase,
  hashApiKey
};
