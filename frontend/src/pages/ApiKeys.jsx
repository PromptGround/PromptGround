import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  ShieldAlert, 
  Terminal, 
  AlertTriangle 
} from 'lucide-react';
import { api } from '../utils/api';
import EnvironmentBadge from '../components/EnvironmentBadge';
import Modal from '../components/Modal';

export default function ApiKeys({ currentUser }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create Key Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [keyEnv, setKeyEnv] = useState('production');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Secret Reveal Dialog
  const [createdKeyData, setCreatedKeyData] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchKeys = async () => {
    try {
      const res = await api.getApiKeys();
      setKeys(res.apiKeys || []);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await api.createApiKey({
        name: keyName,
        environment: keyEnv
      });

      setIsModalOpen(false);
      setKeyName('');
      setCreatedKeyData(res.apiKey);
      await fetchKeys();
    } catch (err) {
      setError(err.message || 'Failed to create API key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id, name) => {
    if (!window.confirm(`Revoke API Key "${name}"? Microservices using this key will immediately receive HTTP 401 Unauthorized.`)) {
      return;
    }

    try {
      await api.revokeApiKey(id);
      await fetchKeys();
    } catch (err) {
      alert(err.message || 'Failed to revoke API key');
    }
  };

  const copySecretKey = () => {
    if (!createdKeyData?.rawKey) return;
    navigator.clipboard.writeText(createdKeyData.rawKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title-group">
          <h1>Environment-Scoped API Keys</h1>
          <p>Microservices authenticate runtime fetches using bearer tokens validated via an in-memory lookup cache</p>
        </div>
        {currentUser?.role === 'admin' && (
          <div>
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={16} /> Generate Scoped API Key
            </button>
          </div>
        )}
      </div>

      {/* Secret Reveal Modal */}
      <Modal
        isOpen={!!createdKeyData}
        onClose={() => setCreatedKeyData(null)}
        title="API Key Created Successfully"
        maxWidth="600px"
      >
        <div className="modal-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', color: '#fbbf24', fontSize: '0.85rem' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Store this key immediately.</strong> For security, this secret token is cryptographically hashed in SQLite and cannot be viewed again.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Key Name & Environment Scope</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 600 }}>{createdKeyData?.name}</span>
              <EnvironmentBadge env={createdKeyData?.environment} size="sm" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Secret Token</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', color: '#38bdf8' }}
                value={createdKeyData?.rawKey || ''}
              />
              <button className="btn btn-primary btn-sm" onClick={copySecretKey}>
                {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                {copiedKey ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Integration Example</label>
            <pre className="code-block" style={{ fontSize: '0.75rem' }}>
              {`curl -X GET "http://localhost:8080/api/v1/runtime/prompts/<slug>?env=${createdKeyData?.environment}" \\\n  -H "Authorization: Bearer ${createdKeyData?.rawKey}"`}
            </pre>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary btn-sm" onClick={() => setCreatedKeyData(null)}>
            I Have Saved This Key
          </button>
        </div>
      </Modal>

      {/* Keys Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading API keys...
          </div>
        ) : keys.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Key size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p>No active API keys created yet.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key Description</th>
                  <th>Environment Scope</th>
                  <th>Key ID</th>
                  <th>Created By</th>
                  <th>Creation Date</th>
                  {currentUser?.role === 'admin' && (
                    <th style={{ textAlign: 'right' }}>Revoke</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.name}</div>
                    </td>
                    <td>
                      <EnvironmentBadge env={k.environment} size="sm" />
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {k.id}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.84rem' }}>{k.created_by_name || 'admin'}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    {currentUser?.role === 'admin' && (
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ padding: '4px 8px' }}
                          onClick={() => handleRevoke(k.id, k.name)}
                          title="Revoke key"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate API Key Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Generate Scoped API Key"
        maxWidth="540px"
      >
        <form onSubmit={handleCreateKey}>
          <div className="modal-body">
            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Key Descriptive Name</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="e.g. Production Billing Microservice"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Target Environment Scope</label>
              <select
                className="form-select"
                value={keyEnv}
                onChange={(e) => setKeyEnv(e.target.value)}
              >
                <option value="production">PRODUCTION</option>
                <option value="staging">STAGING</option>
                <option value="development">DEVELOPMENT</option>
              </select>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Calls using this key will only be permitted to retrieve active templates for the specified environment.
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={submitting || !keyName}
            >
              {submitting ? 'Generating...' : 'Generate Key'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
