import React, { useState } from 'react';
import { Database, Zap, RefreshCw, PanelLeft, PanelLeftClose } from 'lucide-react';
import { api } from '../utils/api';

export default function Navbar({ activeTab, onRefresh, sidebarCollapsed = false, onToggleSidebar }) {
  const [flushing, setFlushing] = useState(false);
  const [flushMessage, setFlushMessage] = useState(null);

  const titles = {
    dashboard: 'LLMOps Observability & Metrics',
    prompts: 'Prompt Template Registry',
    prs: 'Environment Promotion Pull Requests',
    keys: 'Environment-Scoped API Keys',
    users: 'Team & Granular Access Control',
    settings: 'Engine & Persistence Configurations'
  };

  const handleFlush = async () => {
    setFlushing(true);
    try {
      const res = await api.flushCache();
      setFlushMessage('Cache Hydrated!');
      if (onRefresh) onRefresh();
      setTimeout(() => setFlushMessage(null), 3000);
    } catch (err) {
      setFlushMessage('Flush failed');
      setTimeout(() => setFlushMessage(null), 3000);
    } finally {
      setFlushing(false);
    }
  };

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button
          type="button"
          onClick={onToggleSidebar}
          className="sidebar-toggle-btn"
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {titles[activeTab] || 'Dashboard'}
        </h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Engine Status Pills */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '0.75rem',
          color: '#34d399',
          fontWeight: 600
        }}>
          <Zap size={13} />
          <span>In-Memory Map Cache</span>
          <span className="pulse-dot" style={{ background: '#34d399' }} />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border-subtle)',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)'
        }}>
          <Database size={13} style={{ color: '#38bdf8' }} />
          <span>SQLite WAL</span>
        </div>

        <button 
          className="btn btn-secondary btn-sm"
          onClick={handleFlush}
          disabled={flushing}
          title="Re-hydrate in-memory prompt cache"
          style={{ fontSize: '0.75rem' }}
        >
          <RefreshCw size={13} className={flushing ? 'spin' : ''} />
          {flushMessage || (flushing ? 'Flushing...' : 'Flush Cache')}
        </button>
      </div>
    </header>
  );
}
