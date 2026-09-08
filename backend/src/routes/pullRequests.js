const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authenticateUser } = require('../middleware/auth');
const { requireRole, hasPromptAccess } = require('../middleware/rbac');
const { computeTextDiff, mergePromotionPullRequest } = require('../services/promptService');

router.use(authenticateUser);

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
    JOIN users assignee ON pr.assignee_id = assignee.id
    WHERE 1=1
  `;

  const params = [];
  if (status) {
    query += ' AND pr.status = ?';
    params.push(status);
  }
  if (promptId) {
    query += ' AND pr.prompt_id = ?';
    params.push(promptId);
  }

  // Non-admins can only see PRs where they are author, assignee, or have prompt access
  if (req.user.role !== 'admin') {
    query += ` AND (
      pr.author_id = ? 
      OR pr.assignee_id = ? 
      OR pr.prompt_id IN (SELECT prompt_id FROM user_prompt_access WHERE user_id = ?)
      OR p.created_by = ?
    )`;
    params.push(req.user.id, req.user.id, req.user.id, req.user.id);
  }

  query += ' ORDER BY pr.created_at DESC';

  const pullRequests = db.prepare(query).all(...params);
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

  // Find a default assignee if none provided (e.g. first admin)
  let finalAssigneeId = assignee_id;
  if (!finalAssigneeId) {
    const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    finalAssigneeId = adminUser ? adminUser.id : req.user.id;
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

  res.status(201).json({
    message: 'Promotion pull request created successfully',
    pullRequestId: prId
  });
});

// GET /api/v1/pull-requests/:id - View PR details and side-by-side diff
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
    JOIN users assignee ON pr.assignee_id = assignee.id
    WHERE pr.id = ?
  `).get(id);

  if (!pr) {
    return res.status(404).json({ error: 'Pull request not found' });
  }

  // Non-admins must have permission to view
  const canView = req.user.role === 'admin' 
    || pr.author_id === req.user.id 
    || pr.assignee_id === req.user.id 
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

  res.json({
    pullRequest: pr,
    sourceVersion,
    targetCurrentVersion: targetCurrentVersion || null,
    diff,
    originalContent,
    proposedContent
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

  // Enforce strict RBAC for non-admin editors
  if (req.user.role !== 'admin') {
    // 1. Must have environment access to target_environment
    if (!req.user.environments || !req.user.environments.includes(pr.target_environment)) {
      return res.status(403).json({
        error: 'Target Environment Access Denied',
        message: `You do not have authorization to deploy/merge into the '${pr.target_environment}' environment.`
      });
    }

    // 2. Must have prompt admin permission OR (be designated assignee AND have prompt write permission)
    const hasPromptAdmin = hasPromptAccess(req.user, pr.prompt_id, 'admin');
    const isAssigneeWithWrite = pr.assignee_id === req.user.id && hasPromptAccess(req.user, pr.prompt_id, 'write');

    if (!hasPromptAdmin && !isAssigneeWithWrite) {
      return res.status(403).json({
        error: 'Insufficient Prompt Permission',
        message: 'Merging promotion requests requires prompt administrator privileges or being the designated reviewer.'
      });
    }

    // 3. Separation of duties: author cannot approve/merge their own PR unless they are a prompt admin
    if (pr.author_id === req.user.id && !hasPromptAdmin) {
      return res.status(403).json({
        error: 'Separation of Duties',
        message: 'Authors cannot approve and merge their own pull requests without prompt administrator rights.'
      });
    }
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

// POST /api/v1/pull-requests/:id/reject - Reject PR
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

  // Enforce permissions for rejecting
  if (req.user.role !== 'admin') {
    const hasPromptAdmin = hasPromptAccess(req.user, pr.prompt_id, 'admin');
    const isAssignee = pr.assignee_id === req.user.id;
    if (!hasPromptAdmin && !isAssignee) {
      return res.status(403).json({
        error: 'Insufficient Permission',
        message: 'Rejecting promotion requests requires prompt administrator privileges or being the designated reviewer.'
      });
    }
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
