import React, { useState, useEffect } from 'react';
import { Layers, Plus, Search, ArrowRight, Tag, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import EnvironmentBadge from '../components/EnvironmentBadge';
import Modal from '../components/Modal';

export default function PromptsList({ onSelectPrompt, currentUser }) {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [envFilter, setEnvFilter] = useState('all');

  // New Prompt Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptSlug, setNewPromptSlug] = useState('');
  const [newPromptDesc, setNewPromptDesc] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [newPromptEnv, setNewPromptEnv] = useState('development');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchPrompts = async () => {
    try {
      const data = await api.getPrompts();
      setPrompts(data.prompts || []);
    } catch (err) {
      console.error('Failed to fetch prompts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const handleNameChange = (val) => {
    setNewPromptName(val);
    const slugified = val.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
    setNewPromptSlug(slugified);
  };

  const handleCreatePrompt = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const res = await api.createPrompt({
        name: newPromptName,
        slug: newPromptSlug,
        description: newPromptDesc,
        initialTemplate: newPromptContent,
        environment: newPromptEnv
      });

      setIsModalOpen(false);
      setNewPromptName('');
      setNewPromptSlug('');
      setNewPromptDesc('');
      setNewPromptContent('');
      await fetchPrompts();
      onSelectPrompt(res.slug);
    } catch (err) {
      setFormError(err.message || 'Failed to create prompt');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter prompts
  const filteredPrompts = prompts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;

    if (envFilter === 'production') return !!p.activeEnvironments?.production;
    if (envFilter === 'staging') return !!p.activeEnvironments?.staging;
    if (envFilter === 'development') return !!p.activeEnvironments?.development;

    return true;
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title-group">
          <h1>Prompt Template Registry</h1>
          <p>Managed prompt templates with strict versioning and sub-millisecond memory caching</p>
        </div>
        <div>
          <button 
            className="btn btn-primary"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={16} /> Register New Prompt
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '38px' }}
            placeholder="Search prompt templates by slug, title, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-elevated)', padding: '3px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          {['all', 'production', 'staging', 'development'].map(env => (
            <button
              key={env}
              className={`btn btn-sm ${envFilter === env ? 'btn-primary' : ''}`}
              style={{ background: envFilter === env ? '' : 'transparent', border: 'none', textTransform: 'capitalize' }}
              onClick={() => setEnvFilter(env)}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      {/* Prompts Cards Grid */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading prompts from registry...
        </div>
      ) : filteredPrompts.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <Layers size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No prompt templates found</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px', maxWidth: '400px', margin: '6px auto 20px' }}>
            {searchQuery ? 'Try adjusting your search criteria or filter.' : 'Register your first prompt template to manage versioning and runtime delivery.'}
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => setIsModalOpen(true)}>
            <Plus size={15} /> Register Prompt
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
          {filteredPrompts.map(prompt => {
            const envs = prompt.activeEnvironments || {};
            return (
              <div 
                key={prompt.id} 
                className="card card-hover"
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                onClick={() => onSelectPrompt(prompt.slug)}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ 
                      fontFamily: 'var(--font-mono)', 
                      fontSize: '0.78rem', 
                      background: 'rgba(99, 102, 241, 0.12)', 
                      color: '#a5b4fc', 
                      padding: '3px 8px', 
                      borderRadius: '6px',
                      border: '1px solid rgba(99, 102, 241, 0.25)'
                    }}>
                      {prompt.slug}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      by {prompt.created_by_name || 'admin'}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    {prompt.name}
                  </h3>

                  <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.5, minHeight: '40px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {prompt.description || 'No description provided.'}
                  </p>
                </div>

                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {envs.production && (
                        <span className="badge-env badge-prod" style={{ fontSize: '0.68rem' }}>
                          PROD v{envs.production.versionNumber}
                        </span>
                      )}
                      {envs.staging && (
                        <span className="badge-env badge-stg" style={{ fontSize: '0.68rem' }}>
                          STG v{envs.staging.versionNumber}
                        </span>
                      )}
                      {envs.development && (
                        <span className="badge-env badge-dev" style={{ fontSize: '0.68rem' }}>
                          DEV v{envs.development.versionNumber}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-primary)', fontSize: '0.82rem', fontWeight: 600, gap: '4px' }}>
                      Open Studio <ArrowRight size={14} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Prompt Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Register New Prompt Template"
        maxWidth="680px"
      >
        <form onSubmit={handleCreatePrompt}>
          <div className="modal-body">
            {formError && (
              <div style={{ padding: '10px 14px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Prompt Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Lead Qualification Bot"
                  value={newPromptName}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Slug Identifier (API URI)</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="lead-qualification-bot"
                  value={newPromptSlug}
                  onChange={(e) => setNewPromptSlug(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description & Usage Intent</label>
              <input
                type="text"
                className="form-input"
                placeholder="Identifies B2B enterprise leads and categorizes buying intent"
                value={newPromptDesc}
                onChange={(e) => setNewPromptDesc(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Initial Prompt Template</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Wrap variables in &#123;&#123;var&#125;&#125;</span>
              </label>
              <textarea
                className="form-textarea"
                rows={7}
                required
                placeholder="You are a sales qualification specialist. Analyze the message from {{prospect_name}} at {{company_name}}..."
                value={newPromptContent}
                onChange={(e) => setNewPromptContent(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Initial Target Environment</label>
              <select 
                className="form-select"
                value={newPromptEnv}
                onChange={(e) => setNewPromptEnv(e.target.value)}
              >
                <option value="development">DEVELOPMENT (Recommended for testing)</option>
                {currentUser?.role === 'admin' && (
                  <>
                    <option value="staging">STAGING</option>
                    <option value="production">PRODUCTION</option>
                  </>
                )}
              </select>
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
              disabled={submitting || !newPromptName || !newPromptContent}
            >
              {submitting ? 'Registering...' : 'Register Prompt'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
