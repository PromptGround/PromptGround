import React, { useState, useEffect } from 'react';
import { Sparkles, Tag, GitCommit, Check } from 'lucide-react';

export default function PromptEditor({ 
  initialContent = '', 
  initialChangelog = '', 
  allowedEnvironments = ['development'],
  onSave, 
  isSubmitting = false 
}) {
  const [content, setContent] = useState(initialContent);
  const [changelog, setChangelog] = useState(initialChangelog);
  const [targetEnv, setTargetEnv] = useState(allowedEnvironments[0] || 'development');
  const [detectedVars, setDetectedVars] = useState([]);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // Real-time variable extraction
  useEffect(() => {
    const regex = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
    const vars = new Set();
    let match;
    while ((match = regex.exec(content)) !== null) {
      vars.add(match[1]);
    }
    setDetectedVars(Array.from(vars));
  }, [content]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSave({
      templateContent: content,
      environment: targetEnv,
      changelog: changelog.trim()
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="form-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} style={{ color: 'var(--accent-primary)' }} />
            Prompt Template Content
          </label>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Use <code style={{ color: '#a5b4fc' }}>{`{{variable_name}}`}</code> for dynamic runtime inputs
          </span>
        </div>
        <textarea
          className="form-textarea"
          rows={12}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="You are an AI assistant helping {{customer_name}} with {{issue_description}}..."
          required
          style={{ minHeight: '220px', lineHeight: 1.6 }}
        />
      </div>

      {/* Detected variables chip list */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <Tag size={13} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Detected Runtime Variables ({detectedVars.length}):
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '32px' }}>
          {detectedVars.length === 0 ? (
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No variables detected yet. Wrap tokens in &#123;&#123;name&#125;&#125; to parameterize.
            </span>
          ) : (
            detectedVars.map((v) => (
              <span key={v} className="variable-pill">
                &#123;&#123;{v}&#125;&#125;
              </span>
            ))
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="form-group">
          <label className="form-label">Target Environment for this Release</label>
          <select 
            className="form-select"
            value={targetEnv}
            onChange={(e) => setTargetEnv(e.target.value)}
          >
            {allowedEnvironments.map(env => (
              <option key={env} value={env}>
                {env.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <GitCommit size={14} /> Version Changelog
          </label>
          <input
            type="text"
            className="form-input"
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            placeholder="e.g. Added guardrails for tier classification"
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button 
          type="submit" 
          className="btn btn-primary" 
          disabled={isSubmitting || !content.trim()}
        >
          <Check size={16} />
          {isSubmitting ? 'Saving Version...' : 'Save & Publish Version'}
        </button>
      </div>
    </form>
  );
}
