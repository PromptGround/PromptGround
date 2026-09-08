import { getStoredAuth, clearAuth } from './auth';

const BASE_URL = '/api/v1';

export async function apiRequest(endpoint, options = {}) {
  const auth = getStoredAuth();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (auth && auth.token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // If not a login request, clear auth
    if (!endpoint.includes('/auth/login')) {
      clearAuth();
      window.location.reload();
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || data.error || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Auth
  login: (username, password) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  getMe: () => apiRequest('/auth/me'),
  changeOwnPassword: (currentPassword, newPassword) => apiRequest('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),

  // Stats & Health
  getStats: () => apiRequest('/settings/stats'),
  getHealth: () => apiRequest('/health'),
  flushCache: () => apiRequest('/settings/cache-flush', { method: 'POST' }),

  // Prompts
  getPrompts: () => apiRequest('/prompts'),
  getPrompt: (idOrSlug) => apiRequest(`/prompts/${idOrSlug}`),
  createPrompt: (payload) => apiRequest('/prompts', { method: 'POST', body: JSON.stringify(payload) }),
  createVersion: (idOrSlug, payload) => apiRequest(`/prompts/${idOrSlug}/versions`, { method: 'POST', body: JSON.stringify(payload) }),
  deletePrompt: (idOrSlug) => apiRequest(`/prompts/${idOrSlug}`, { method: 'DELETE' }),

  // Pull Requests
  getPullRequests: (params = '') => apiRequest(`/pull-requests${params}`),
  getPullRequest: (id) => apiRequest(`/pull-requests/${id}`),
  createPullRequest: (payload) => apiRequest('/pull-requests', { method: 'POST', body: JSON.stringify(payload) }),
  mergePullRequest: (id) => apiRequest(`/pull-requests/${id}/merge`, { method: 'POST' }),
  rejectPullRequest: (id, rejectionReason) => apiRequest(`/pull-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ rejectionReason }) }),

  // API Keys
  getApiKeys: () => apiRequest('/api-keys'),
  createApiKey: (payload) => apiRequest('/api-keys', { method: 'POST', body: JSON.stringify(payload) }),
  revokeApiKey: (id) => apiRequest(`/api-keys/${id}`, { method: 'DELETE' }),

  // Users & Access Control
  getUsers: () => apiRequest('/users'),
  createUser: (payload) => apiRequest('/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUserRole: (id, role) => apiRequest(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  updateUserEnvironments: (id, environments) => apiRequest(`/users/${id}/environments`, { method: 'PUT', body: JSON.stringify({ environments }) }),
  updateUserPromptAccess: (id, prompt_id, access_level) => apiRequest(`/users/${id}/prompt-access`, { method: 'PUT', body: JSON.stringify({ prompt_id, access_level }) }),
  adminResetPassword: (id, newPassword) => apiRequest(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ newPassword }) }),

  // Settings & SMTP
  getSettings: () => apiRequest('/settings'),
  updateSetting: (key, value) => apiRequest('/settings', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  getSmtpConfig: () => apiRequest('/settings/smtp'),
  updateSmtpConfig: (payload) => apiRequest('/settings/smtp', { method: 'PUT', body: JSON.stringify(payload) }),
  testSmtp: (recipientEmail) => apiRequest('/settings/smtp/test', { method: 'POST', body: JSON.stringify({ recipientEmail }) }),

  // Models Management
  getModels: () => apiRequest('/models'),
  createModel: (payload) => apiRequest('/models', { method: 'POST', body: JSON.stringify(payload) }),
  updateModel: (id, payload) => apiRequest(`/models/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteModel: (id) => apiRequest(`/models/${id}`, { method: 'DELETE' }),
  testModelDirect: (payload) => apiRequest('/models/test-direct', { method: 'POST', body: JSON.stringify(payload) }),

  // Runtime API
  renderPrompt: (slug, env, variables, customApiKey) => {
    const headers = customApiKey ? { 'Authorization': `Bearer ${customApiKey}` } : {};
    return apiRequest(`/runtime/render/${slug}?env=${env}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ variables })
    });
  },

  executeWithModel: (slug, env, variables, modelId, options = {}) => {
    return apiRequest(`/runtime/execute/${slug}?env=${env}`, {
      method: 'POST',
      body: JSON.stringify({ variables, modelId, options })
    });
  }
};
