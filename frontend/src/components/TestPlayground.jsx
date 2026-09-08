import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Copy, 
  Check, 
  Terminal, 
  Zap, 
  Clock, 
  Cpu, 
  Sliders, 
  MessageSquare 
} from 'lucide-react';
import { api } from '../utils/api';
import EnvironmentBadge from './EnvironmentBadge';

export default function TestPlayground({ prompt, activeVersions = {} }) {
  const [selectedEnv, setSelectedEnv] = useState('development');
  const [variables, setVariables] = useState({});
  const [executionMode, setExecutionMode] = useState('model'); // 'template' | 'model'

  // Model selection
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  const [renderResult, setRenderResult] = useState(null);
  const [modelResult, setModelResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const activeVersion = activeVersions[selectedEnv];

  // Fetch configured models for playground invocation
  useEffect(() => {
    api.getModels().then(res => {
      const list = res.models || [];
      setModels(list);
      if (list.length > 0) {
        setSelectedModelId(list[0].id);
      }
    }).catch(() => {});
  }, []);

  // Update variable fields whenever prompt or selectedEnv changes
  useEffect(() => {
    if (activeVersion && activeVersion.variables) {
      const initialVars = {};
      const varList = Array.isArray(activeVersion.variables) 
        ? activeVersion.variables 
        : JSON.parse(activeVersion.variables || '[]');
      
      varList.forEach(v => {
        initialVars[v] = variables[v] || `Test ${v.replace(/_/g, ' ')}`;
      });
      setVariables(initialVars);
      setRenderResult(null);
      setModelResult(null);
      setError(null);
    }
  }, [selectedEnv, activeVersion]);

  const handleVariableChange = (key, value) => {
    setVariables(prev => ({ ...prev, [key]: value }));
  };

  const handleExecute = async () => {
    if (!prompt) return;
    setLoading(true);
    setError(null);

    try {
      if (executionMode === 'template') {
        const data = await api.renderPrompt(prompt.slug, selectedEnv, variables);
        setRenderResult(data);
        setModelResult(null);
      } else {
        // Execute with Connected LLM Model
        if (!selectedModelId) {
          throw new Error('Please select a connected LLM model or add one in Settings');
        }
        const data = await api.executeWithModel(prompt.slug, selectedEnv, variables, selectedModelId, {
          temperature: parseFloat(temperature),
          maxTokens: parseInt(maxTokens, 10)
        });
        setModelResult(data);
        setRenderResult(null);
      }
    } catch (err) {
      setError(err.message || 'Execution failed');
    } finally {
      setLoading(false);
    }
  };

  const selectedModel = models.find(m => m.id === selectedModelId);

  const copyText = (text, setCopiedState) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  const curlExample = executionMode === 'template'
    ? `curl -X POST "http://localhost:8080/api/v1/runtime/render/${prompt?.slug}?env=${selectedEnv}" \\
  -H "Authorization: Bearer ph_live_testkey_abcdef" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ variables }, null, 2)}'`
    : `curl -X POST "http://localhost:8080/api/v1/runtime/execute/${prompt?.slug}?env=${selectedEnv}" \\
  -H "Authorization: Bearer ph_live_testkey_abcdef" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ variables, modelId: selectedModelId, options: { temperature, maxTokens } }, null, 2)}'`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Target Environment & Mode Selector Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)', padding: '12px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Environment:</span>
          {['development', 'staging', 'production'].map(env => (
            <button
              key={env}
              type="button"
              onClick={() => setSelectedEnv(env)}
              style={{
                background: selectedEnv === env ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: selectedEnv === env ? '1px solid var(--border-focus)' : '1px solid transparent',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer'
              }}
            >
              <EnvironmentBadge env={env} size="sm" />
            </button>
          ))}
        </div>

        {/* Mode Selector */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            className={`btn btn-sm ${executionMode === 'model' ? 'btn-primary' : ''}`}
            style={{ background: executionMode === 'model' ? '' : 'transparent', border: 'none', fontSize: '0.78rem' }}
            onClick={() => setExecutionMode('model')}
          >
            <Cpu size={13} style={{ marginRight: '4px' }} /> Run with Connected Model
          </button>
          <button
            type="button"
            className={`btn btn-sm ${executionMode === 'template' ? 'btn-primary' : ''}`}
            style={{ background: executionMode === 'template' ? '' : 'transparent', border: 'none', fontSize: '0.78rem' }}
            onClick={() => setExecutionMode('template')}
          >
            <Zap size={13} style={{ marginRight: '4px' }} /> Template Hydration Only
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Variable Inputs & Model Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Model Config Panel (when in Model Execution Mode) */}
          {executionMode === 'model' && (
            <div className="card" style={{ padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cpu size={15} style={{ color: 'var(--accent-primary)' }} />
                  Select Model Endpoint
                </h4>
                {models.length === 0 ? (
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontWeight: 700 }}>
                    None
                  </span>
                ) : selectedModel && (
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', fontWeight: 700 }}>
                    {selectedModel.provider_type}
                  </span>
                )}
              </div>

              {models.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Active Model</label>
                    <select className="form-select" disabled value="">
                      <option value="">None (No models added by Admin)</option>
                    </select>
                  </div>
                  <div style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', color: '#fca5a5', fontSize: '0.82rem', lineHeight: '1.4' }}>
                    <strong>Model: None.</strong> No LLM models have been connected by the administrator. Go to <em>Engine Settings</em> (Admin) or switch to <strong>Template Hydration Only</strong> mode above.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Active Model</label>
                    <select
                      className="form-select"
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                    >
                      {models.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.model_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Temperature</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: '#a5b4fc' }}>{temperature}</span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value)}
                        style={{ accentColor: 'var(--accent-primary)' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Max Tokens</label>
                      <input
                        type="number"
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(e.target.value)}
                        placeholder="1024"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Variables Input Card */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} style={{ color: 'var(--accent-primary)' }} />
              Runtime Input Variables
            </h3>

            {Object.keys(variables).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                This prompt template has no parameterized variables.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {Object.keys(variables).map(varName => (
                  <div key={varName} className="form-group">
                    <label className="form-label" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#a5b4fc' }}>
                      &#123;&#123;{varName}&#125;&#125;
                    </label>
                    <textarea
                      className="form-textarea"
                      rows={2}
                      style={{ minHeight: '52px', fontSize: '0.84rem' }}
                      value={variables[varName]}
                      onChange={(e) => handleVariableChange(varName, e.target.value)}
                      placeholder={`Value for ${varName}`}
                    />
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '20px' }}>
              <button
                onClick={handleExecute}
                disabled={loading || !activeVersion || (executionMode === 'model' && models.length === 0)}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '12px',
                  opacity: (executionMode === 'model' && models.length === 0) ? 0.6 : 1,
                  cursor: (executionMode === 'model' && models.length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                <Play size={16} />
                {loading ? 'Invoking Model...' : (
                  executionMode === 'model' 
                    ? (models.length === 0 ? 'None (No Models Connected)' : `Execute with ${selectedModel?.name || 'Model'}`) 
                    : `Hydrate Prompt (${selectedEnv.toUpperCase()})`
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Output Pane */}
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', minHeight: '520px' }}>
          {/* Header with Telemetry */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {executionMode === 'model' ? (
                <>
                  <MessageSquare size={17} style={{ color: '#10b981' }} />
                  AI Model Completion Output
                </>
              ) : (
                <>
                  <Clock size={17} style={{ color: '#38bdf8' }} />
                  Hydrated Template Preview
                </>
              )}
            </h3>

            {/* Performance telemetry pill */}
            {modelResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.74rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 700 }}>
                  {modelResult.providerName}
                </span>
                <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 600 }}>
                  {modelResult.modelLatencyMs} ms
                </span>
              </div>
            )}

            {renderResult && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 700 }}>
                  CACHE HIT
                </span>
                <span style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                  {renderResult.durationMicroseconds} µs
                </span>
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: '12px 16px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '14px' }}>
              {error}
            </div>
          )}

          {/* Model Execution Mode Output */}
          {executionMode === 'model' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>MODEL GENERATION:</span>
                  {modelResult?.tokensUsed && (
                    <span>Tokens: {modelResult.tokensUsed}</span>
                  )}
                </div>
                <pre 
                  className="code-block" 
                  style={{ 
                    flex: 1, 
                    minHeight: '220px', 
                    color: modelResult ? '#f8fafc' : 'var(--text-muted)',
                    lineHeight: 1.6,
                    fontSize: '0.88rem'
                  }}
                >
                  {modelResult?.modelOutput || 'Click "Execute with Model" to invoke inference against the selected LLM provider...'}
                </pre>
              </div>

              {/* Collapsible / visible prompt payload sent */}
              {modelResult?.hydratedPrompt && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      HYDRATED PROMPT PAYLOAD (SENT TO MODEL):
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                      onClick={() => copyText(modelResult.hydratedPrompt, setCopiedPrompt)}
                    >
                      {copiedPrompt ? 'Copied' : 'Copy Prompt'}
                    </button>
                  </div>
                  <pre className="code-block" style={{ maxHeight: '110px', overflowY: 'auto', fontSize: '0.78rem', color: '#94a3b8' }}>
                    {modelResult.hydratedPrompt}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            /* Template Hydration Mode Output */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <pre 
                className="code-block" 
                style={{ 
                  flex: 1, 
                  minHeight: '340px', 
                  color: renderResult ? '#f8fafc' : 'var(--text-muted)',
                  lineHeight: 1.6
                }}
              >
                {renderResult?.rendered || 'Click "Hydrate Prompt" to test variable interpolation against the in-memory cache...'}
              </pre>
            </div>
          )}

          {/* Action buttons footer */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => copyText(curlExample, setCopiedCurl)}
              title="Copy curl command"
            >
              <Terminal size={14} />
              {copiedCurl ? 'Copied Curl!' : 'Copy cURL'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => copyText(modelResult?.modelOutput || renderResult?.rendered, setCopiedOutput)}
              disabled={!modelResult?.modelOutput && !renderResult?.rendered}
            >
              {copiedOutput ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
              {copiedOutput ? 'Copied Text!' : 'Copy Output'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
