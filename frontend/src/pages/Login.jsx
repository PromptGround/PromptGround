import React, { useState } from 'react';
import { Sparkles, Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import { saveAuth } from '../utils/auth';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.login(username, password);
      saveAuth(res.token, res.user);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillQuickAccount = (u, p) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 30%, rgba(99, 102, 241, 0.15) 0%, transparent 60%), #07090e',
      padding: '20px'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '36px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(99, 102, 241, 0.2)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.6)',
            marginBottom: '14px'
          }}>
            <Sparkles size={24} color="#fff" />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>
            PromptHub
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Enterprise Prompt Registry & LLMOps Engine
          </p>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '8px',
            color: '#fca5a5',
            fontSize: '0.84rem',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} /> Username
            </label>
            <input
              type="text"
              className="form-input"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={14} /> Password
            </label>
            <input
              type="password"
              className="form-input"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '8px', padding: '12px' }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Hub'}
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Quick-Fill Demo Roles */}
        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', textAlign: 'center' }}>
            Quick-Login Role Switcher
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, fontSize: '0.74rem' }}
              onClick={() => fillQuickAccount('admin', 'admin123')}
            >
              Admin
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, fontSize: '0.74rem' }}
              onClick={() => fillQuickAccount('sarah_eng', 'editor123')}
            >
              Editor
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, fontSize: '0.74rem' }}
              onClick={() => fillQuickAccount('alex_analyst', 'viewer123')}
            >
              Viewer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
