const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authenticateUser } = require('../middleware/auth');
const { requireRole, hasPromptAccess } = require('../middleware/rbac');
const { computeTextDiff, mergePromotionPullRequest } = require('../services/promptService');

router.use(authenticateUser);

// Helper: get list of users who have permission to review & merge a PR into targetEnvironment
function getEligibleMergers(promptId, targetEnvironment) {
  const prompt = db.prepare('SELECT id, created_by FROM prompts WHERE id = ? OR slug = ?').get(promptId, promptId);
  if (!prompt) return [];

  // Admins always have merge rights across all prompts and environments
  // Editors have merge rights if:
  // 1. They have write/admin access on the prompt (or created it)
  // 2. They have access to the target environment
  return db.prepare(`
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
}

// Helper: check if a specific user can merge a PR
function canUserMergePR(user, pr) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'editor') return false;

  // 1. Must have environment access to target_environment
  const hasEnvAccess = user.environments && user.environments.includes(pr.target_environment);
  if (!hasEnvAccess) {
    const envRow = db.prepare('SELECT 1 FROM user_environment_access WHERE user_id = ? AND environment = ?').get(user.id, pr.target_environment);
    if (!envRow) return false;
  }

  // 2. Must have edit/write access to this prompt
  return hasPromptAccess(user, pr.prompt_id, 'write');
}

// GET /api/v1/pull-requests - List pull requests
router.get('/', (req, res) => {
  const { status, promptId } = req.query;

  let query = `
    SELECT 
      pr.*,
      p.slug as prompt_slug,
      p.name as prompt_name,
      pv.version_number as source_version_number,
      pv.environment as source_environment,
      author.username as author_name,
      assignee.username as assignee_name
    FROM prompt_pull_requests pr
    JOIN prompts p ON pr.prompt_id = p.id
    JOIN prompt_versions pv ON pr.source_version_id = pv.id
    JOIN users author ON pr.author_id = author.id
    LEFT JOIN users assignee ON pr.assignee_id = assignee.id
    WHERE 1=1
  `;

  const params = [];
  if (status) {
    query += ' AND pr.status = ?';
    params.push(status);
  }
  if (promptId) {
    query += ' AND (pr.prompt_id = ? OR p.slug = ?)';
    params.push(promptId, promptId);
  }

  // Non-admins can only see PRs where they are author, assignee, or have prompt access
  if (req.user.role !== 'admin') {
    query += ` AND (
      pr.author_id = ? 
      OR (pr.assignee_id IS NOT NULL AND pr.assignee_id = ?)
      OR pr.prompt_id IN (SELECT prompt_id FROM user_prompt_access WHERE user_id = ?)
      OR p.created_by = ?
    )`;
    params.push(req.user.id, req.user.id, req.user.id, req.user.id);
  }

  query += ' ORDER BY pr.created_at DESC';

  const rawPRs = db.prepare(query).all(...params);
  const pullRequests = rawPRs.map(item => ({
    ...item,
    eligibleMergers: getEligibleMergers(item.prompt_id, item.target_environment),
    canMerge: canUserMergePR(req.user, item)
  }));

  res.json({ pullRequests });
});

// POST /api/v1/pull-requests - Create a new promotion pull request
router.post('/', requireRole(['admin', 'editor']), (req, res) => {
  const { prompt_id, source_version_id, target_environment, title, description = '', assignee_id } = req.body;

  if (!prompt_id || !source_version_id || !target_environment || !title) {
    return res.status(400).json({ error: 'prompt_id, source_version_id, target_environment, and title are required' });
  }

  if (!['staging', 'production'].includes(target_environment)) {
    return res.status(400).json({ error: 'Target environment must be staging or production' });
  }

  // Check prompt write access
  if (!hasPromptAccess(req.user, prompt_id, 'write')) {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'You do not have write access to this prompt to raise a promotion request.'
    });
  }

  // Verify prompt and source version exist
  const sourceVersion = db.prepare('SELECT * FROM prompt_versions WHERE id = ? AND prompt_id = ?').get(source_version_id, prompt_id);
  if (!sourceVersion) {
    return res.status(400).json({ error: 'Invalid source_version_id for this prompt' });
  }

  // Optional assignee
  let finalAssigneeId = assignee_id || null;
  if (finalAssigneeId) {
    const assignee = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(finalAssigneeId);
    if (!assignee) {
      return res.status(400).json({ error: 'Assignee not found', message: 'The selected reviewer does not exist.' });
    }
    if (!hasPromptAccess(assignee, prompt_id, 'read')) {
      return res.status(403).json({
        error: 'Invalid Assignee',
        message: `The selected reviewer '${assignee.username}' does not have access permissions to this prompt.`
      });
    }
  }

  const prId = 'pr_' + uuidv4().slice(0, 8);

  db.prepare(`
    INSERT INTO prompt_pull_requests (
      id, prompt_id, source_version_id, target_environment, author_id, assignee_id, status, title, description, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, datetime('now'))
  `).run(
    prId,
    prompt_id,
    source_version_id,
    target_environment,
    req.user.id,
    finalAssigneeId,
    title.trim(),
    description.trim()
  );

  const eligibleMergers = getEligibleMergers(prompt_id, target_environment);

  res.status(201).json({
    message: 'Promotion pull request created successfully',
    pullRequestId: prId,
    eligibleMergers
  });
});

// GET /api/v1/pull-requests/:id - View PR details, diff, and eligible mergers
router.get('/:id', (req, res) => {
  const { id } = req.params;

  const pr = db.prepare(`
    SELECT 
      pr.*,
      p.slug as prompt_slug,
      p.name as prompt_name,
      p.description as prompt_description,
      author.username as author_name,
      assignee.username as assignee_name
    FROM prompt_pull_requests pr
    JOIN prompts p ON pr.prompt_id = p.id
    JOIN users author ON pr.author_id = author.id
    LEFT JOIN users assignee ON pr.assignee_id = assignee.id
    WHERE pr.id = ?
  `).get(id);

  if (!pr) {
    return res.status(404).json({ error: 'Pull request not found' });
  }

  // Non-admins must have permission to view:
  // author, assignee, prompt read access, or admin
  const canView = req.user.role === 'admin' 
    || pr.author_id === req.user.id 
    || (pr.assignee_id && pr.assignee_id === req.user.id)
    || hasPromptAccess(req.user, pr.prompt_id, 'read');

  if (!canView) {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'You do not have authorization to view this pull request.'
    });
  }

  // 1. Fetch source version content
  const sourceVersion = db.prepare(`
    SELECT pv.*, u.username as author_name
    FROM prompt_versions pv
    LEFT JOIN users u ON pv.created_by = u.id
    WHERE pv.id = ?
  `).get(pr.source_version_id);

  // 2. Fetch current active version in the target environment (for diff comparison)
  const targetCurrentVersion = db.prepare(`
    SELECT pv.*, u.username as author_name
    FROM prompt_versions pv
    LEFT JOIN users u ON pv.created_by = u.id
    WHERE pv.prompt_id = ? AND pv.environment = ?
    ORDER BY pv.version_number DESC
    LIMIT 1
  `).get(pr.prompt_id, pr.target_environment);

  const originalContent = targetCurrentVersion ? targetCurrentVersion.template_content : '';
  const proposedContent = sourceVersion ? sourceVersion.template_content : '';

  const diff = computeTextDiff(originalContent, proposedContent);
  const eligibleMergers = getEligibleMergers(pr.prompt_id, pr.target_environment);
  const canMerge = canUserMergePR(req.user, pr);

  res.json({
    pullRequest: pr,
    sourceVersion,
    targetCurrentVersion: targetCurrentVersion || null,
    diff,
    originalContent,
    proposedContent,
    eligibleMergers,
    canMerge
  });
});

// POST /api/v1/pull-requests/:id/merge - Merge PR and promote prompt
router.post('/:id/merge', requireRole(['admin', 'editor']), (req, res) => {
  const { id } = req.params;

  const pr = db.prepare('SELECT * FROM prompt_pull_requests WHERE id = ?').get(id);
  if (!pr) {
    return res.status(404).json({ error: 'Pull request not found' });
  }

  if (pr.status !== 'open') {
    return res.status(400).json({ error: `Cannot merge PR with status '${pr.status}'` });
  }

  // Enforce merge permissions: user must have prompt write/admin access and target environment access
  if (!canUserMergePR(req.user, pr)) {
    return res.status(403).json({
      error: 'Insufficient Merge Permission',
      message: `Merging promotion requests requires editor privileges with edit access to this prompt and access to the '${pr.target_environment}' environment.`
    });
  }

  try {
    const result = mergePromotionPullRequest(id, req.user.id);
    res.json({
      message: `Promotion successfully merged into ${result.promotedToEnvironment}`,
      ...result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/v1/pull-requests/:id/reject - Reject / Close PR
router.post('/:id/reject', requireRole(['admin', 'editor']), (req, res) => {
  const { id } = req.params;
  const { rejectionReason = '' } = req.body;

  const pr = db.prepare('SELECT * FROM prompt_pull_requests WHERE id = ?').get(id);
  if (!pr) {
    return res.status(404).json({ error: 'Pull request not found' });
  }

  if (pr.status !== 'open') {
    return res.status(400).json({ error: `Cannot reject PR with status '${pr.status}'` });
  }

  // Enforce permissions for rejecting: author, eligible merger, or admin
  const canReject = req.user.role === 'admin'
    || pr.author_id === req.user.id
    || canUserMergePR(req.user, pr);

  if (!canReject) {
    return res.status(403).json({
      error: 'Insufficient Permission',
      message: 'Rejecting promotion requests requires being the PR author, having prompt edit & target environment access, or administrator rights.'
    });
  }

  const updatedDescription = pr.description + (rejectionReason ? `\n\n[Rejection Note by ${req.user.username}]: ${rejectionReason}` : '');

  db.prepare(`
    UPDATE prompt_pull_requests
    SET status = 'rejected', description = ?
    WHERE id = ?
  `).run(updatedDescription, id);

  res.json({ message: 'Pull request rejected', pullRequestId: id });
});

module.exports = router;
