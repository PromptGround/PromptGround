-- Users and authentication
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'editor', 'viewer')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Prompts metadata
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Version history and environment mapping
CREATE TABLE IF NOT EXISTS prompt_versions (
    id TEXT PRIMARY KEY,
    prompt_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    template_content TEXT NOT NULL,
    variables TEXT, -- JSON array of variable names
    environment TEXT CHECK(environment IN ('development', 'staging', 'production')) NOT NULL,
    changelog TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Global environment-level access control
CREATE TABLE IF NOT EXISTS user_environment_access (
    user_id TEXT NOT NULL,
    environment TEXT CHECK(environment IN ('development', 'staging', 'production')) NOT NULL,
    PRIMARY KEY (user_id, environment),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Granular prompt-level access control
CREATE TABLE IF NOT EXISTS user_prompt_access (
    user_id TEXT NOT NULL,
    prompt_id TEXT NOT NULL,
    access_level TEXT CHECK(access_level IN ('read', 'write', 'admin')) NOT NULL,
    PRIMARY KEY (user_id, prompt_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id)
);

-- Scoped API Keys for external microservice runtime calls
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    environment TEXT CHECK(environment IN ('development', 'staging', 'production')) NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Pull requests for environment promotion
CREATE TABLE IF NOT EXISTS prompt_pull_requests (
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

-- System configurations & notification settings
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Connected LLM Model Providers & Custom Endpoints
CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider_type TEXT CHECK(provider_type IN ('openai', 'anthropic', 'gemini', 'ollama', 'custom')) NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT,
    model_id TEXT NOT NULL,
    custom_headers TEXT, -- JSON key-value pairs
    default_params TEXT, -- JSON { temperature, max_tokens }
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Indexes for maximum query performance
CREATE INDEX IF NOT EXISTS idx_prompts_slug ON prompts(slug);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt_env ON prompt_versions(prompt_id, environment, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_pull_requests_status ON prompt_pull_requests(status);
CREATE INDEX IF NOT EXISTS idx_llm_providers_type ON llm_providers(provider_type);

