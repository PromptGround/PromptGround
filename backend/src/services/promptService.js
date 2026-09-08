const { v4: uuidv4 } = require('uuid');
const promptCache = require('../cache/promptCache');
const { db } = require('../db');

// Extracts {{variable}} or {{ variable }} names
function extractVariables(content) {
  if (!content || typeof content !== 'string') return [];
  const regex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
  const vars = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

// Simple and robust line-by-line diff generator
function computeTextDiff(originalText = '', proposedText = '') {
  const oldLines = originalText.split('\n');
  const newLines = proposedText.split('\n');

  const diffResult = [];
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      diffResult.push({
        type: 'unchanged',
        oldLineNumber: i + 1,
        newLineNumber: i + 1,
        content: oldLine
      });
    } else if (oldLine !== undefined && newLine !== undefined) {
      diffResult.push({
        type: 'removed',
        oldLineNumber: i + 1,
        newLineNumber: null,
        content: oldLine
      });
      diffResult.push({
        type: 'added',
        oldLineNumber: null,
        newLineNumber: i + 1,
        content: newLine
      });
    } else if (oldLine !== undefined) {
      diffResult.push({
        type: 'removed',
        oldLineNumber: i + 1,
        newLineNumber: null,
        content: oldLine
      });
    } else if (newLine !== undefined) {
      diffResult.push({
        type: 'added',
        oldLineNumber: null,
        newLineNumber: i + 1,
        content: newLine
      });
    }
  }

  return diffResult;
}

// Merges a promotion PR: copies or promotes source version to target environment
function mergePromotionPullRequest(prId, reviewerId) {
  const transaction = db.transaction(() => {
    // 1. Get PR
    const pr = db.prepare(`
      SELECT * FROM prompt_pull_requests WHERE id = ?
    `).get(prId);

    if (!pr) {
      throw new Error('Pull request not found');
    }

    if (pr.status !== 'open') {
      throw new Error(`Cannot merge PR with status '${pr.status}'`);
    }

    // 2. Get source version
    const sourceVersion = db.prepare(`
      SELECT * FROM prompt_versions WHERE id = ?
    `).get(pr.source_version_id);

    if (!sourceVersion) {
      throw new Error('Source prompt version not found');
    }

    // 3. Get prompt details
    const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(pr.prompt_id);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    // 4. Determine next version number in target environment
    const maxVerRow = db.prepare(`
      SELECT COALESCE(MAX(version_number), 0) AS max_v
      FROM prompt_versions
      WHERE prompt_id = ? AND environment = ?
    `).get(pr.prompt_id, pr.target_environment);

    const nextVersionNumber = maxVerRow.max_v + 1;
    const newVersionId = 'ver_' + uuidv4().slice(0, 8);

    // 5. Insert new version in target environment
    db.prepare(`
      INSERT INTO prompt_versions (
        id, prompt_id, version_number, template_content, variables, environment, changelog, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      newVersionId,
      pr.prompt_id,
      nextVersionNumber,
      sourceVersion.template_content,
      sourceVersion.variables,
      pr.target_environment,
      `Promoted via PR #${pr.id.slice(0, 7)}: "${pr.title}"`,
      reviewerId
    );

    // 6. Update PR status
    db.prepare(`
      UPDATE prompt_pull_requests 
      SET status = 'merged'
      WHERE id = ?
    `).run(prId);

    // 7. Update in-memory cache directly!
    let vars = [];
    try {
      vars = JSON.parse(sourceVersion.variables);
    } catch (e) {
      vars = [];
    }

    promptCache.updatePrompt(prompt.slug, pr.target_environment, {
      promptId: prompt.id,
      slug: prompt.slug,
      name: prompt.name,
      versionId: newVersionId,
      versionNumber: nextVersionNumber,
      templateContent: sourceVersion.template_content,
      variables: vars,
      environment: pr.target_environment
    });

    return {
      success: true,
      prId: pr.id,
      promptSlug: prompt.slug,
      promotedToEnvironment: pr.target_environment,
      newVersionNumber: nextVersionNumber,
      newVersionId
    };
  });

  return transaction();
}

module.exports = {
  extractVariables,
  computeTextDiff,
  mergePromotionPullRequest
};
