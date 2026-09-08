const crypto = require('crypto');

class PromptCache {
  constructor() {
    // Map of "slug:environment" -> PromptEntry
    this.prompts = new Map();
    // Map of "key_hash" -> ApiKeyEntry
    this.apiKeys = new Map();

    this.stats = {
      hits: 0,
      misses: 0,
      renders: 0,
      totalLatencyMicroseconds: 0,
      lastHydratedAt: null
    };
  }

  hashKey(rawKey) {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  hydrate(db) {
    const startTime = process.hrtime.bigint();
    this.prompts.clear();
    this.apiKeys.clear();

    // 1. Hydrate active prompts for each environment
    // An active prompt for an environment is the highest version_number for that prompt & environment
    const promptRows = db.prepare(`
      SELECT 
        p.id AS prompt_id,
        p.slug,
        p.name,
        pv.id AS version_id,
        pv.version_number,
        pv.template_content,
        pv.variables,
        pv.environment,
        pv.created_at
      FROM prompts p
      JOIN prompt_versions pv ON p.id = pv.prompt_id
      INNER JOIN (
        SELECT prompt_id, environment, MAX(version_number) AS max_version
        FROM prompt_versions
        GROUP BY prompt_id, environment
      ) latest ON pv.prompt_id = latest.prompt_id 
              AND pv.environment = latest.environment 
              AND pv.version_number = latest.max_version
    `).all();

    for (const row of promptRows) {
      const key = `${row.slug}:${row.environment}`.toLowerCase();
      let variables = [];
      try {
        variables = typeof row.variables === 'string' ? JSON.parse(row.variables) : (row.variables || []);
      } catch (e) {
        variables = [];
      }

      this.prompts.set(key, {
        promptId: row.prompt_id,
        slug: row.slug,
        name: row.name,
        versionId: row.version_id,
        versionNumber: row.version_number,
        templateContent: row.template_content,
        variables,
        environment: row.environment,
        updatedAt: row.created_at
      });
    }

    // 2. Hydrate API Keys
    const keyRows = db.prepare(`
      SELECT id, key_hash, name, environment, created_by, created_at
      FROM api_keys
    `).all();

    for (const keyRow of keyRows) {
      this.apiKeys.set(keyRow.key_hash, {
        id: keyRow.id,
        name: keyRow.name,
        environment: keyRow.environment,
        createdBy: keyRow.created_by,
        createdAt: keyRow.created_at
      });
    }

    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    this.stats.lastHydratedAt = new Date().toISOString();
    console.log(`[Cache] Hydrated ${this.prompts.size} active prompt templates & ${this.apiKeys.size} API keys in ${durationMs.toFixed(3)}ms`);
  }

  getPrompt(slug, environment) {
    const key = `${slug}:${environment}`.toLowerCase();
    const entry = this.prompts.get(key);
    if (entry) {
      this.stats.hits++;
      return entry;
    }
    this.stats.misses++;
    return null;
  }

  updatePrompt(slug, environment, promptData) {
    const key = `${slug}:${environment}`.toLowerCase();
    this.prompts.set(key, {
      ...promptData,
      updatedAt: new Date().toISOString()
    });
    console.log(`[Cache] Updated active prompt cache for: ${key} (v${promptData.versionNumber})`);
  }

  invalidatePrompt(slug, environment, db) {
    const key = `${slug}:${environment}`.toLowerCase();
    if (!db) {
      this.prompts.delete(key);
      return;
    }

    // Re-fetch latest version from db
    const row = db.prepare(`
      SELECT 
        p.id AS prompt_id,
        p.slug,
        p.name,
        pv.id AS version_id,
        pv.version_number,
        pv.template_content,
        pv.variables,
        pv.environment,
        pv.created_at
      FROM prompts p
      JOIN prompt_versions pv ON p.id = pv.prompt_id
      WHERE p.slug = ? AND pv.environment = ?
      ORDER BY pv.version_number DESC
      LIMIT 1
    `).get(slug, environment);

    if (row) {
      let variables = [];
      try {
        variables = typeof row.variables === 'string' ? JSON.parse(row.variables) : (row.variables || []);
      } catch (e) {
        variables = [];
      }

      this.prompts.set(key, {
        promptId: row.prompt_id,
        slug: row.slug,
        name: row.name,
        versionId: row.version_id,
        versionNumber: row.version_number,
        templateContent: row.template_content,
        variables,
        environment: row.environment,
        updatedAt: row.created_at
      });
      console.log(`[Cache] Refreshed prompt: ${key} to v${row.version_number}`);
    } else {
      this.prompts.delete(key);
      console.log(`[Cache] Evicted prompt: ${key} (no versions found)`);
    }
  }

  validateApiKey(rawKey) {
    if (!rawKey) return null;
    const hash = this.hashKey(rawKey);
    return this.apiKeys.get(hash) || null;
  }

  addApiKey(keyHash, keyData) {
    this.apiKeys.set(keyHash, keyData);
    console.log(`[Cache] Added API Key ${keyData.name} (${keyData.environment}) to cache`);
  }

  revokeApiKey(keyHash) {
    this.apiKeys.delete(keyHash);
    console.log(`[Cache] Revoked API Key from cache`);
  }

  render(slug, environment, inputVariables = {}) {
    const hrStart = process.hrtime.bigint();
    const prompt = this.getPrompt(slug, environment);

    if (!prompt) {
      return null;
    }

    const rawTemplate = prompt.templateContent;
    const missingVariables = [];
    const usedVariables = {};

    // Replace {{var_name}} and {{ var_name }}
    const rendered = rawTemplate.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, varName) => {
      if (inputVariables[varName] !== undefined && inputVariables[varName] !== null) {
        usedVariables[varName] = inputVariables[varName];
        return String(inputVariables[varName]);
      } else {
        missingVariables.push(varName);
        return match; // keep original token if missing
      }
    });

    const hrEnd = process.hrtime.bigint();
    const durationMicroseconds = Number(hrEnd - hrStart) / 1000;

    this.stats.renders++;
    this.stats.totalLatencyMicroseconds += durationMicroseconds;

    return {
      promptId: prompt.promptId,
      slug: prompt.slug,
      name: prompt.name,
      version: prompt.versionNumber,
      environment: prompt.environment,
      rendered,
      rawTemplate,
      usedVariables,
      missingVariables,
      cacheHit: true,
      durationMicroseconds: Number(durationMicroseconds.toFixed(2))
    };
  }

  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? ((this.stats.hits / totalRequests) * 100).toFixed(1) : '100.0';
    const avgLatency = this.stats.renders > 0 
      ? (this.stats.totalLatencyMicroseconds / this.stats.renders).toFixed(2) 
      : '0.12';

    return {
      cachedPromptsCount: this.prompts.size,
      cachedApiKeysCount: this.apiKeys.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRatePercentage: Number(hitRate),
      totalRenders: this.stats.renders,
      averageLatencyMicroseconds: Number(avgLatency),
      lastHydratedAt: this.stats.lastHydratedAt
    };
  }
}

const promptCache = new PromptCache();

module.exports = promptCache;
