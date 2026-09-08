import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  GitPullRequest, 
  Plus, 
  Layers, 
  Clock, 
  Terminal, 
  Check, 
  Trash2, 
  History, 
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { api } from '../utils/api';
import EnvironmentBadge from '../components/EnvironmentBadge';
import PromptEditor from '../components/PromptEditor';
import TestPlayground from '../components/TestPlayground';
import Modal from '../components/Modal';

export default function PromptDetail({ slug, onBack, onNavigateToPR, currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('deployments'); // 'deployments' | 'editor' | 'playground' | 'history'

  // Promotion Modal
  const [isPRModalOpen, setIsPRModalOpen] = useState(false);
  const [prSourceVersionId, setPrSourceVersionId] = useState('');
  const [prTargetEnv, setPrTargetEnv] = useState('staging');
  const [prTitle, setPrTitle] = useState('');
  const [prDesc, setPrDesc] = useState('');
  const [prSubmitting, setPrSubmitting] = useState(false);
  const [prError, setPrError] = useState(null);

  // Eligible mergers list (users with prompt edit access & target environment access)
  const [eligibleMergers, setEligibleMergers] = useState([]);

  const [savingVersion, setSavingVersion] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);

  const fetchPromptDetails = async () => {
    setLoading(true);
    try {
      const res = await api.getPrompt(slug);
      setData(res);
      // default PR source version to latest version
      if (res.versions && res.versions.length > 0) {
        setPrSourceVersionId(res.versions[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch prompt details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromptDetails();
  }, [slug]);

  useEffect(() => {
    if (slug) {
      api.getUsers({ promptId: slug, targetEnvironment: prTargetEnv }).then(u => {
        setEligibleMergers(u.users || []);
      }).catch(() => {});
    }
  }, [slug, prTargetEnv]);

  const handleSaveVersion = async (versionPayload) => {
    setSavingVersion(true);
    try {
      await api.createVersion(slug, versionPayload);
      setSaveSuccessMsg(`Published v${versionPayload.environment} release successfully!`);
      await fetchPromptDetails();
      setTimeout(() => setSaveSuccessMsg(null), 4000);
      setActiveTab('deployments');
    } catch (err) {
      alert(err.message || 'Failed to publish version');
    } finally {
      setSavingVersion(false);
    }
  };

  const handleCreatePR = async (e) => {
    e.preventDefault();
    if (!data?.prompt) return;
    setPrSubmitting(true);
    setPrError(null);

    try {
      const res = await api.createPullRequest({
        prompt_id: data.prompt.id,
        source_version_id: prSourceVersionId,
        target_environment: prTargetEnv,
        title: prTitle,
        description: prDesc
      });

      setIsPRModalOpen(false);
      setPrTitle('');
      setPrDesc('');
      onNavigateToPR(res.pullRequestId);
    } catch (err) {
      setPrError(err.message || 'Failed to create promotion pull request');
    } finally {
      setPrSubmitting(false);
    }
  };

  const handleDeletePrompt = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete prompt '${slug}' and all associated versions? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.deletePrompt(slug);
      onBack();
    } catch (err) {
      alert(err.message || 'Failed to delete prompt');
    }
  };

  if (loading && !data) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
        Loading prompt studio...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '60px 0' }}>
        <p style={{ color: '#f87171', marginBottom: '16px' }}>{error || 'Prompt not found'}</p>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Back to Registry
        </button>
      </div>
    );
  }

  const { prompt, activeVersions, versions } = data;

  // Allowed environments for current user
  const allowedEnvs = currentUser?.role === 'admin' 
    ? ['development', 'staging', 'production'] 
    : ['development'];

  return (
    <div className="page-container">
      {/* Top Breadcrumb & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ gap: '6px' }}>
          <ArrowLeft size={14} /> Back to Registry
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn btn-primary btn-sm"
            onClick={() => {
              setPrTitle(`Promote ${prompt.name} to ${prTargetEnv}`);
              setIsPRModalOpen(true);
            }}
          >
            <GitPullRequest size={15} /> Propose Promotion PR
          </button>

          {currentUser?.role === 'admin' && (
            <button 
              className="btn btn-danger btn-sm"
              onClick={handleDeletePrompt}
              title="Delete prompt"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Prompt Header Card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {prompt.name}
              </h1>
              <span style={{ 
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.82rem', 
                background: 'rgba(99, 102, 241, 0.15)', 
                color: '#a5b4fc', 
                padding: '3px 10px', 
                borderRadius: '6px',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}>
                {prompt.slug}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '750px' }}>
              {prompt.description || 'No description provided.'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Active Version Pointers:</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span className="badge-env badge-prod" style={{ fontSize: '0.72rem' }}>
                PROD: {activeVersions.production ? `v${activeVersions.production.version_number}` : 'None'}
              </span>
              <span className="badge-env badge-stg" style={{ fontSize: '0.72rem' }}>
                STG: {activeVersions.staging ? `v${activeVersions.staging.version_number}` : 'None'}
              </span>
              <span className="badge-env badge-dev" style={{ fontSize: '0.72rem' }}>
                DEV: {activeVersions.development ? `v${activeVersions.development.version_number}` : 'None'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {saveSuccessMsg && (
        <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.88rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={16} /> {saveSuccessMsg}
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="tabs-nav">
        <button 
          className={`tab-button ${activeTab === 'deployments' ? 'active' : ''}`}
          onClick={() => setActiveTab('deployments')}
        >
          Active Deployments
        </button>
        <button 
          className={`tab-button ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          Draft New Version
        </button>
        <button 
          className={`tab-button ${activeTab === 'playground' ? 'active' : ''}`}
          onClick={() => setActiveTab('playground')}
        >
          Live Test Playground
        </button>
        <button 
          className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Version History ({versions.length})
        </button>
      </div>

      {/* Tab Content: Active Deployments */}
      {activeTab === 'deployments' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {['production', 'staging', 'development'].map(env => {
            const active = activeVersions[env];
            return (
              <div key={env} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <EnvironmentBadge env={env} />
                    {active ? (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        v{active.version_number}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Not deployed</span>
                    )}
                  </div>

                  {active ? (
                    <>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Updated: {new Date(active.created_at).toLocaleString()}
                      </div>
                      <pre className="code-block" style={{ fontSize: '0.78rem', maxHeight: '180px', overflowY: 'auto' }}>
                        {active.template_content}
                      </pre>
                    </>
                  ) : (
                    <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No active version currently promoted to {env}.
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {active ? `${active.variables.length} runtime variables` : 'Zero variables'}
                  </span>
                  {active && (
                    <button 
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                      onClick={() => {
                        setActiveTab('playground');
                      }}
                    >
                      Test in Runtime
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab Content: Prompt Editor */}
      {activeTab === 'editor' && (
        <div className="card">
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Draft New Prompt Version
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Variables wrapped in <code style={{ color: '#a5b4fc' }}>&#123;&#123;variable_name&#125;&#125;</code> will be automatically extracted and indexed for runtime interpolation.
            </p>
          </div>

          <PromptEditor
            initialContent={activeVersions.development?.template_content || activeVersions.production?.template_content || ''}
            initialChangelog=""
            allowedEnvironments={allowedEnvs}
            onSave={handleSaveVersion}
            isSubmitting={savingVersion}
          />
        </div>
      )}

      {/* Tab Content: Live Test Playground */}
      {activeTab === 'playground' && (
        <TestPlayground prompt={prompt} activeVersions={activeVersions} />
      )}

      {/* Tab Content: Version History */}
      {activeTab === 'history' && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Environment</th>
                <th>Variables</th>
                <th>Changelog</th>
                <th>Author</th>
                <th>Release Date</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(v => (
                <tr key={v.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      v{v.version_number}
                    </span>
                  </td>
                  <td>
                    <EnvironmentBadge env={v.environment} size="sm" />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {v.variables.map(varName => (
                        <span key={varName} className="variable-pill" style={{ fontSize: '0.68rem', padding: '1px 5px' }}>
                          {varName}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {v.changelog || 'Version release'}
                  </td>
                  <td style={{ fontSize: '0.84rem' }}>{v.author_name || 'admin'}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {new Date(v.created_at).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.74rem' }}
                      onClick={() => {
                        setPrSourceVersionId(v.id);
                        setPrTitle(`Promote v${v.version_number} (${v.environment})`);
                        setIsPRModalOpen(true);
                      }}
                    >
                      <GitPullRequest size={12} /> Promote
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Propose Promotion PR Modal */}
      <Modal
        isOpen={isPRModalOpen}
        onClose={() => setIsPRModalOpen(false)}
        title="Propose Promotion Pull Request"
        maxWidth="640px"
      >
        <form onSubmit={handleCreatePR}>
          <div className="modal-body">
            {prError && (
              <div style={{ padding: '10px 14px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem' }}>
                {prError}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">PR Title</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="e.g. Promote Customer Support Copilot v3 with VIP handling"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Source Version</label>
                <select
                  className="form-select"
                  value={prSourceVersionId}
                  onChange={(e) => setPrSourceVersionId(e.target.value)}
                >
                  {versions.map(v => (
                    <option key={v.id} value={v.id}>
                      v{v.version_number} ({v.environment.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Target Environment</label>
                <select
                  className="form-select"
                  value={prTargetEnv}
                  onChange={(e) => setPrTargetEnv(e.target.value)}
                >
                  <option value="staging">STAGING</option>
                  <option value="production">PRODUCTION</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Eligible Reviewers & Mergers</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Users with edit access &amp; {prTargetEnv.toUpperCase()} access can merge
                </span>
              </label>
              {eligibleMergers.length === 0 ? (
                <div style={{ color: '#f59e0b', fontSize: '0.82rem', padding: '10px 14px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                  ⚠️ No non-admin reviewers currently have edit access to this prompt and the {prTargetEnv} environment. System administrators will be able to review &amp; merge this PR.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  {eligibleMergers.map(u => (
                    <span key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '16px', fontSize: '0.76rem', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                      <strong>{u.username}</strong>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>({u.role})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Change Description & Rationale</label>
              <textarea
                className="form-textarea"
                rows={4}
                placeholder="Explain the improvements, eval benchmarks, or testing performed..."
                value={prDesc}
                onChange={(e) => setPrDesc(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={() => setIsPRModalOpen(false)}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary btn-sm"
              disabled={prSubmitting || !prTitle}
            >
              {prSubmitting ? 'Creating PR...' : 'Create Promotion PR'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
