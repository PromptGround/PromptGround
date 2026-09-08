import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Database, 
  Zap, 
  Save, 
  RefreshCw, 
  Check, 
  Plus, 
  Trash2, 
  Edit3, 
  Cpu, 
  Mail, 
  Send, 
  Lock, 
  User, 
  AlertCircle,
  Activity,
  Key
} from 'lucide-react';
import { api } from '../utils/api';
import Modal from '../components/Modal';
import EnvironmentBadge from '../components/EnvironmentBadge';

export default function Settings({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';

  // Admin Data states
  const [settings, setSettings] = useState({});
  const [editValues, setEditValues] = useState({});
  const [stats, setStats] = useState(null);
  const [models, setModels] = useState([]);
  const [smtpConfig, setSmtpConfig] = useState({
    host: '', port: 587, secure: false, user: '', pass: '', fromEmail: '', fromName: ''
  });

  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [flushResult, setFlushResult] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  // Model Modal state (Admin)
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState(null);
  const [modelForm, setModelForm] = useState({
    name: '',
    provider_type: 'openai',
    base_url: 'http://localhost:8000/v1',
    api_key: '',
    model_id: 'gpt-4o',
    custom_headers: '{}',
    default_params: '{"temperature": 0.7, "max_tokens": 1024}'
  });
  const [modelTesting, setModelTesting] = useState(false);
  const [modelTestResult, setModelTestResult] = useState(null);
  const [modelSubmitting, setModelSubmitting] = useState(false);

  // SMTP Test State (Admin)
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSaveSuccess, setSmtpSaveSuccess] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null);

  // Self-service Password Change state (All users)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(null);
  const [pwError, setPwError] = useState(null);

  const fetchAdminData = async () => {
    try {
      const [settRes, statsRes, modRes, smtpRes] = await Promise.all([
        api.getSettings(),
        api.getStats(),
        api.getModels(),
        api.getSmtpConfig()
      ]);
      setSettings(settRes.settings || {});
      setEditValues(settRes.settings || {});
      setStats(statsRes);
      setModels(modRes.models || []);
      if (smtpRes.smtp) {
        setSmtpConfig(smtpRes.smtp);
      }
    } catch (err) {
      console.error('Failed to load admin settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAdminData();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  // Model Handlers
  const handleOpenNewModel = () => {
    setEditingModelId(null);
    setModelForm({
      name: '',
      provider_type: 'openai',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model_id: 'gpt-4o',
      custom_headers: '{}',
      default_params: '{"temperature": 0.7, "max_tokens": 1024}'
    });
    setModelTestResult(null);
    setIsModelModalOpen(true);
  };

  const handleEditModel = (m) => {
    setEditingModelId(m.id);
    setModelForm({
      name: m.name,
      provider_type: m.provider_type,
      base_url: m.base_url,
      api_key: '', // leave empty unless changing
      model_id: m.model_id,
      custom_headers: JSON.stringify(m.customHeaders || {}, null, 2),
      default_params: JSON.stringify(m.defaultParams || {}, null, 2)
    });
    setModelTestResult(null);
    setIsModelModalOpen(true);
  };

  const handleTestModelConnection = async () => {
    setModelTesting(true);
    setModelTestResult(null);
    try {
      const res = await api.testModelDirect({
        provider_type: modelForm.provider_type,
        base_url: modelForm.base_url,
        api_key: modelForm.api_key,
        model_id: modelForm.model_id,
        custom_headers: modelForm.custom_headers
      });
      setModelTestResult(res);
    } catch (err) {
      setModelTestResult({ success: false, message: err.message });
    } finally {
      setModelTesting(false);
    }
  };

  const handleSaveModel = async (e) => {
    e.preventDefault();
    setModelSubmitting(true);
    try {
      let custom_headers = {};
      let default_params = {};
      try { custom_headers = JSON.parse(modelForm.custom_headers); } catch (e) {}
      try { default_params = JSON.parse(modelForm.default_params); } catch (e) {}

      const payload = {
        name: modelForm.name,
        provider_type: modelForm.provider_type,
        base_url: modelForm.base_url,
        model_id: modelForm.model_id,
        custom_headers,
        default_params
      };
      if (modelForm.api_key) {
        payload.api_key = modelForm.api_key;
      }

      if (editingModelId) {
        await api.updateModel(editingModelId, payload);
      } else {
        await api.createModel(payload);
      }

      setIsModelModalOpen(false);
      await fetchAdminData();
    } catch (err) {
      alert(err.message || 'Failed to save model connection');
    } finally {
      setModelSubmitting(false);
    }
  };

  const handleDeleteModel = async (id, name) => {
    if (!window.confirm(`Delete model connection "${name}"?`)) return;
    try {
      await api.deleteModel(id);
      await fetchAdminData();
    } catch (err) {
      alert(err.message || 'Failed to delete model');
    }
  };

  // SMTP Handlers
  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    setSmtpSaving(true);
    setSmtpSaveSuccess(false);
    try {
      await api.updateSmtpConfig(smtpConfig);
      setSmtpSaveSuccess(true);
      setTimeout(() => setSmtpSaveSuccess(false), 3000);
    } catch (err) {
      alert(err.message || 'Failed to update SMTP settings');
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!testRecipient) {
      alert('Please enter a recipient email address to send test email');
      return;
    }
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const res = await api.testSmtp(testRecipient);
      setSmtpTestResult({ success: true, message: res.message });
    } catch (err) {
      setSmtpTestResult({ success: false, message: err.message });
    } finally {
      setSmtpTesting(false);
    }
  };

  // Cache and Cluster KV
  const handleSaveSetting = async (key) => {
    setSavingKey(key);
    try {
      await api.updateSetting(key, editValues[key]);
      await fetchAdminData();
    } catch (err) {
      alert(err.message || 'Failed to update setting');
    } finally {
      setSavingKey(null);
    }
  };

  const handleFlushCache = async () => {
    setFlushing(true);
    try {
      const res = await api.flushCache();
      setFlushResult(res.message);
      await fetchAdminData();
      setTimeout(() => setFlushResult(null), 4000);
    } catch (err) {
      alert(err.message || 'Failed to flush cache');
    } finally {
      setFlushing(false);
    }
  };

  // Password Change Handler (Available to ALL users)
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }

    setPwSubmitting(true);
    try {
      await api.changeOwnPassword(currentPassword, newPassword);
      setPwSuccess('Your password has been changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwSuccess(null), 4000);
    } catch (err) {
      setPwError(err.message || 'Failed to change password. Ensure current password is correct.');
    } finally {
      setPwSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
        Loading settings...
      </div>
    );
  }

  // ==========================================
  // VIEW FOR NORMAL USERS (Editor / Viewer)
  // ==========================================
  if (!isAdmin) {
    return (
      <div className="page-container" style={{ maxWidth: '800px' }}>
        <div className="page-header">
          <div className="page-title-group">
            <h1>My Account & Security</h1>
            <p>Manage your user credentials and password</p>
          </div>
        </div>

        {/* Profile Card */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="avatar" style={{ width: '48px', height: '48px', fontSize: '1.2rem' }}>
              {currentUser?.username?.[0] || 'U'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {currentUser?.username}
              </h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', fontWeight: 700 }}>
                  Role: {currentUser?.role}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Assigned Environments: {(currentUser?.environments || ['development']).join(', ')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Password Reset Form */}
        <div className="card">
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={18} style={{ color: 'var(--accent-primary)' }} />
            Change Your Password
          </h3>

          {pwSuccess && (
            <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Check size={16} /> {pwSuccess}
            </div>
          )}

          {pwError && (
            <div style={{ padding: '12px 16px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '16px' }}>
              {pwError}
            </div>
          )}

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input
                type="password"
                className="form-input"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="form-input"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={pwSubmitting || !currentPassword || !newPassword}
              >
                {pwSubmitting ? 'Updating Password...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW FOR ADMIN USERS
  // ==========================================
  const cache = stats?.cache || {};
  const storage = stats?.storage || {};

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title-group">
          <h1>Engine, Model & System Configurations</h1>
          <p>Admin control center for connected LLM endpoints, SMTP notifications, and caching architecture</p>
        </div>
      </div>

      {/* 1. Connected LLM Models & Custom Endpoints Section */}
      <div className="card" style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={20} style={{ color: 'var(--accent-primary)' }} />
              Connected LLM Models & Inference Endpoints
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Configure OpenAI, Anthropic, Ollama, self-hosted vLLM, or custom REST APIs. Configured models are instantly available to all team members in the Test Playground.
            </p>
          </div>

          <button className="btn btn-primary btn-sm" onClick={handleOpenNewModel}>
            <Plus size={15} /> Add LLM Model Connection
          </button>
        </div>

        {models.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            No models connected yet. Add your first model connection above.
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model Display Name</th>
                  <th>Provider Type</th>
                  <th>Model Identifier</th>
                  <th>Target Base URL</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {models.map(m => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</div>
                    </td>
                    <td>
                      <span style={{ 
                        fontSize: '0.72rem', 
                        textTransform: 'uppercase', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        background: m.provider_type === 'ollama' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                        color: m.provider_type === 'ollama' ? '#38bdf8' : '#a5b4fc',
                        fontWeight: 700
                      }}>
                        {m.provider_type}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#f8fafc' }}>
                        {m.model_id}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {m.base_url}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px' }}
                          onClick={() => handleEditModel(m)}
                          title="Edit model connection"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ padding: '4px 8px' }}
                          onClick={() => handleDeleteModel(m.id, m.name)}
                          title="Delete model connection"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. SMTP Email Notification Configuration */}
      <div className="card" style={{ marginBottom: '28px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mail size={20} style={{ color: '#06b6d4' }} />
          SMTP Email Notification Service
        </h3>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Configure outbound mail server for alert dispatches and promotion workflow notices.
        </p>

        {smtpSaveSuccess && (
          <div style={{ padding: '10px 14px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.84rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check size={14} /> SMTP settings saved successfully!
          </div>
        )}

        <form onSubmit={handleSaveSmtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">SMTP Host</label>
              <input
                type="text"
                className="form-input"
                required
                value={smtpConfig.host || ''}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                placeholder="smtp.sendgrid.net or smtp.gmail.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Port</label>
              <input
                type="number"
                className="form-input"
                required
                value={smtpConfig.port || 587}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                placeholder="587"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Security</label>
              <select
                className="form-select"
                value={smtpConfig.secure ? 'true' : 'false'}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, secure: e.target.value === 'true' })}
              >
                <option value="false">STARTTLS (587)</option>
                <option value="true">SSL / TLS (465)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">SMTP Username / API User</label>
              <input
                type="text"
                className="form-input"
                value={smtpConfig.user || ''}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                placeholder="apikey or user@domain.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">SMTP Password / API Key</label>
              <input
                type="password"
                className="form-input"
                value={smtpConfig.pass || ''}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, pass: e.target.value })}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Sender Email Address</label>
              <input
                type="email"
                className="form-input"
                required
                value={smtpConfig.fromEmail || ''}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, fromEmail: e.target.value })}
                placeholder="alerts@prompthub.internal"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Sender Display Name</label>
              <input
                type="text"
                className="form-input"
                value={smtpConfig.fromName || ''}
                onChange={(e) => setSmtpConfig({ ...smtpConfig, fromName: e.target.value })}
                placeholder="PromptHub Notifications"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="email"
                className="form-input"
                style={{ width: '260px', padding: '7px 12px', fontSize: '0.84rem' }}
                placeholder="Recipient email for test ping"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={smtpTesting || !testRecipient}
                onClick={handleTestSmtp}
              >
                <Send size={13} />
                {smtpTesting ? 'Testing Dispatch...' : 'Send Test Email'}
              </button>
            </div>

            <button type="submit" className="btn btn-primary btn-sm" disabled={smtpSaving}>
              <Save size={14} />
              {smtpSaving ? 'Saving...' : 'Save SMTP Settings'}
            </button>
          </div>
        </form>

        {smtpTestResult && (
          <div style={{
            marginTop: '14px',
            padding: '10px 14px',
            background: smtpTestResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            border: `1px solid ${smtpTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
            borderRadius: '8px',
            color: smtpTestResult.success ? '#34d399' : '#fca5a5',
            fontSize: '0.84rem'
          }}>
            {smtpTestResult.message}
          </div>
        )}
      </div>

      {/* 3. Cache & SQLite WAL Diagnostics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} style={{ color: '#38bdf8' }} />
              In-Memory Map Cache Engine
            </h3>
            <button
              className="btn btn-secondary btn-sm"
              disabled={flushing}
              onClick={handleFlushCache}
            >
              <RefreshCw size={13} className={flushing ? 'spin' : ''} />
              {flushing ? 'Hydrating...' : 'Re-Hydrate Cache'}
            </button>
          </div>

          {flushResult && (
            <div style={{ padding: '10px 14px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.84rem', marginBottom: '16px' }}>
              <Check size={14} style={{ display: 'inline', marginRight: '6px' }} />
              {flushResult}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: '6px', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Cached Prompt Templates:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{cache.cachedPromptsCount || 0} active entries</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: '6px', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Cached API Keys:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{cache.cachedApiKeysCount || 0} tokens</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: '6px', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Average Runtime Latency:</span>
              <strong style={{ color: '#38bdf8' }}>{cache.averageLatencyMicroseconds ? `${cache.averageLatencyMicroseconds} µs` : '< 0.5 ms'}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Database size={18} style={{ color: '#10b981' }} />
            SQLite Storage & WAL Architecture
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: '6px', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Journal Mode:</span>
              <strong style={{ color: '#34d399' }}>WAL (Write-Ahead Logging)</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: '6px', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Database Filepath:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#a5b4fc' }}>{storage.dbPath || '/data/prompts.db'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: '6px', fontSize: '0.84rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Docker Volume Mapping:</span>
              <strong style={{ color: 'var(--text-primary)' }}>registry_data:/data</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Admin Change Password Form */}
      <div className="card" style={{ marginBottom: '28px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Lock size={18} style={{ color: 'var(--accent-primary)' }} />
          Change Admin Password
        </h3>

        {pwSuccess && (
          <div style={{ padding: '10px 14px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.84rem', marginBottom: '14px' }}>
            <Check size={14} style={{ display: 'inline', marginRight: '6px' }} />
            {pwSuccess}
          </div>
        )}

        {pwError && (
          <div style={{ padding: '10px 14px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '14px' }}>
            {pwError}
          </div>
        )}

        <form onSubmit={handleChangePassword} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input
              type="password"
              className="form-input"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current admin password"
            />
          </div>

          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-input"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 chars"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input
              type="password"
              className="form-input"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
            />
          </div>

          <div>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={pwSubmitting || !currentPassword || !newPassword}
              style={{ height: '40px' }}
            >
              {pwSubmitting ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Model Add / Edit Modal (Admin) */}
      <Modal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        title={editingModelId ? 'Edit Connected LLM Model' : 'Connect New LLM Model Endpoint'}
        maxWidth="680px"
      >
        <form onSubmit={handleSaveModel}>
          <div className="modal-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Model Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Local Ollama or Claude Sonnet"
                  value={modelForm.name}
                  onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Provider Type</label>
                <select
                  className="form-select"
                  value={modelForm.provider_type}
                  onChange={(e) => setModelForm({ ...modelForm, provider_type: e.target.value })}
                >
                  <option value="openai">OpenAI / OpenAI-compatible (vLLM, Groq, DeepSeek)</option>
                  <option value="anthropic">Anthropic (Claude API)</option>
                  <option value="ollama">Ollama (Local / Self-hosted)</option>
                  <option value="custom">Custom HTTP REST API (Any format)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Endpoint Base URL</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="http://localhost:11434 or https://api.openai.com/v1"
                  value={modelForm.base_url}
                  onChange={(e) => setModelForm({ ...modelForm, base_url: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Model Identifier (ID)</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. llama3.2, gpt-4o, claude-3-5-sonnet"
                  value={modelForm.model_id}
                  onChange={(e) => setModelForm({ ...modelForm, model_id: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">API Key / Auth Token (Optional for local Ollama)</label>
              <input
                type="password"
                className="form-input"
                placeholder={editingModelId ? 'Leave blank to preserve stored secret' : 'sk-... or custom auth token'}
                value={modelForm.api_key}
                onChange={(e) => setModelForm({ ...modelForm, api_key: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Custom HTTP Request Headers (JSON)</label>
              <textarea
                className="form-textarea"
                rows={3}
                style={{ minHeight: '70px', fontSize: '0.8rem' }}
                placeholder='{"X-Tenant-ID": "corp-dev", "Authorization": "CustomToken"}'
                value={modelForm.custom_headers}
                onChange={(e) => setModelForm({ ...modelForm, custom_headers: e.target.value })}
              />
            </div>

            {modelTestResult && (
              <div style={{
                padding: '10px 14px',
                background: modelTestResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                border: `1px solid ${modelTestResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                borderRadius: '8px',
                color: modelTestResult.success ? '#34d399' : '#fca5a5',
                fontSize: '0.84rem'
              }}>
                {modelTestResult.message}
              </div>
            )}
          </div>

          <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={modelTesting || !modelForm.base_url}
              onClick={handleTestModelConnection}
            >
              <Activity size={13} />
              {modelTesting ? 'Testing Ping...' : 'Test Connection'}
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsModelModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={modelSubmitting || !modelForm.name || !modelForm.base_url || !modelForm.model_id}
              >
                {modelSubmitting ? 'Saving...' : 'Save Model'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
