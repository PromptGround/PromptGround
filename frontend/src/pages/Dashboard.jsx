import React, { useState, useEffect } from 'react';
import {
  Zap,
  Activity,
  Layers,
  GitPullRequest,
  Key,
  Server,
  Terminal,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { api } from '../utils/api';
import EnvironmentBadge from '../components/EnvironmentBadge';

export default function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [recentPRs, setRecentPRs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, prsRes] = await Promise.all([
        api.getStats(),
        api.getPullRequests('?status=open')
      ]);
      setStats(statsRes);
      setRecentPRs(prsRes.pullRequests || []);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  const hostOrigin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://localhost:8080';
  const curlSnippet = `curl -X GET "${hostOrigin}/api/v1/runtime/prompts/customer-support-copilot?env=production" \\
  -H "Authorization: Bearer ph_live_testkey_abcdef"`;

  const copyCurl = () => {
    navigator.clipboard.writeText(curlSnippet);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  if (loading && !stats) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
        Loading LLMOps metrics...
      </div>
    );
  }

  const cache = stats?.cache || {};
  const counts = stats?.counts || {};
  const envs = stats?.environmentBreakdown || {};

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title-group">
          <h1>Observability & LLMOps Engine</h1>
          <p>Real-time sub-millisecond in-memory cache telemetry and operational status</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchDashboardData}>
            Refresh Metrics
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('prompts')}>
            <Layers size={15} /> View Registry
          </button>
        </div>
      </div>

      {/* Two-Column Operational Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginBottom: '32px' }}>
        {/* Left: Environment Deployment Breakdown */}
        <div className="card">
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={18} style={{ color: 'var(--accent-primary)' }} />
            Active Deployments by Environment
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Environment-isolated prompt versions loaded into container memory at startup.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <EnvironmentBadge env="production" />
                <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>Production Upper Env</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: '#34d399' }}>
                {envs.production || 0} versions
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <EnvironmentBadge env="staging" />
                <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>Pre-release Staging</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: '#fbbf24' }}>
                {envs.staging || 0} versions
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <EnvironmentBadge env="development" />
                <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>Development Sandbox</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: '#38bdf8' }}>
                {envs.development || 0} versions
              </span>
            </div>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Storage Engine: <strong>SQLite Write-Ahead Logging (WAL)</strong></span>
            <span>Mode: <strong>Persistent Docker Volume</strong></span>
          </div>
        </div>

        {/* Right: Runtime Microservice Integration Quickstart */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={18} style={{ color: '#06b6d4' }} />
              High-Throughput Runtime API
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={copyCurl} style={{ fontSize: '0.75rem' }}>
              {copiedCurl ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
              {copiedCurl ? 'Copied' : 'Copy cURL'}
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Fetch active templates or render with variable values directly with zero disk I/O overhead:
          </p>

          <pre className="code-block" style={{ fontSize: '0.78rem', marginBottom: '14px' }}>
            {curlSnippet}
          </pre>

          <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '12px', borderRadius: '8px', fontSize: '0.8rem', color: '#c7d2fe' }}>
            <strong>Response headers:</strong>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', marginTop: '4px', color: '#93c5fd' }}>
              X-Cache: HIT<br />
              X-Cache-Lookup-Time-Microseconds: 82.40
            </div>
          </div>
        </div>
      </div>

      {/* Open Promotion PRs Section */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitPullRequest size={18} style={{ color: '#fbbf24' }} />
              Pending Promotion Requests ({recentPRs.length})
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Direct writes to upper environments are guarded by promotion reviews
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('prs')}>
            View All Pull Requests <ArrowRight size={14} />
          </button>
        </div>

        {recentPRs.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            No pending promotion pull requests. All environments are in sync.
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pull Request</th>
                  <th>Prompt</th>
                  <th>Source Version</th>
                  <th>Target Env</th>
                  <th>Author</th>
                  <th>Reviewers / Mergers</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentPRs.map(pr => (
                  <tr key={pr.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{pr.title}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>#{pr.id.slice(0, 7)}</div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#818cf8' }}>
                        {pr.prompt_slug}
                      </span>
                    </td>
                    <td>
                      <span className="badge-env badge-dev" style={{ fontSize: '0.68rem' }}>
                        v{pr.source_version_number}
                      </span>
                    </td>
                    <td>
                      <EnvironmentBadge env={pr.target_environment} size="sm" />
                    </td>
                    <td style={{ fontSize: '0.84rem' }}>{pr.author_name}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {pr.eligibleMergers && pr.eligibleMergers.length > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                          <ShieldCheck size={13} style={{ color: '#10b981' }} />
                          {pr.eligibleMergers.length} can merge
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Admin only</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onNavigate('prs', { prId: pr.id })}
                      >
                        Inspect Diff
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
