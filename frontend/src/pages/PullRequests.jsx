import React, { useState, useEffect } from 'react';
import { 
  GitPullRequest, 
  Check, 
  X, 
  User, 
  Calendar, 
  ArrowRight, 
  Layers, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { api } from '../utils/api';
import EnvironmentBadge from '../components/EnvironmentBadge';
import DiffViewer from '../components/DiffViewer';
import Modal from '../components/Modal';

export default function PullRequests({ initialPRId, currentUser }) {
  const [pullRequests, setPullRequests] = useState([]);
  const [selectedPR, setSelectedPR] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // Reject modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPRs = async () => {
    try {
      const data = await api.getPullRequests();
      setPullRequests(data.pullRequests || []);
      
      // Auto-select initial PR if passed, else first PR
      if (initialPRId) {
        loadPRDetail(initialPRId);
      } else if (data.pullRequests && data.pullRequests.length > 0 && !selectedPR) {
        loadPRDetail(data.pullRequests[0].id);
      }
    } catch (err) {
      console.error('Failed to load PRs:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPRDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await api.getPullRequest(id);
      setSelectedPR(res);
    } catch (err) {
      console.error('Failed to load PR detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchPRs();
  }, [initialPRId]);

  const handleMerge = async () => {
    if (!selectedPR) return;
    const confirmed = window.confirm(
      `Confirm merging PR #${selectedPR.pullRequest.id.slice(0, 7)} into ${selectedPR.pullRequest.target_environment.toUpperCase()}?\n\nThis will shift the active pointer and automatically update the in-memory cache.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      await api.mergePullRequest(selectedPR.pullRequest.id);
      await fetchPRs();
      await loadPRDetail(selectedPR.pullRequest.id);
    } catch (err) {
      alert(err.message || 'Failed to merge PR');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!selectedPR) return;
    setActionLoading(true);
    try {
      await api.rejectPullRequest(selectedPR.pullRequest.id, rejectReason);
      setIsRejectModalOpen(false);
      setRejectReason('');
      await fetchPRs();
      await loadPRDetail(selectedPR.pullRequest.id);
    } catch (err) {
      alert(err.message || 'Failed to reject PR');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredPRs = pullRequests.filter(pr => {
    if (statusFilter === 'all') return true;
    return pr.status === statusFilter;
  });

  const pr = selectedPR?.pullRequest;

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title-group">
          <h1>Environment Promotion Requests</h1>
          <p>Enforce governance and peer diff review before promoting templates to staging or production</p>
        </div>
      </div>

      {/* Main Layout: Left PR List, Right Detail & Diff Viewer */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: PR List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filter tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', padding: '3px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            {['all', 'open', 'merged', 'rejected'].map(st => (
              <button
                key={st}
                className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : ''}`}
                style={{ flex: 1, background: statusFilter === st ? '' : 'transparent', border: 'none', textTransform: 'capitalize', fontSize: '0.78rem' }}
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading pull requests...
              </div>
            ) : filteredPRs.length === 0 ? (
              <div className="card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                No {statusFilter !== 'all' ? statusFilter : ''} pull requests found.
              </div>
            ) : (
              filteredPRs.map(item => {
                const isSelected = pr?.id === item.id;
                let statusBadge = { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
                if (item.status === 'merged') {
                  statusBadge = { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
                } else if (item.status === 'rejected') {
                  statusBadge = { bg: 'rgba(244, 63, 94, 0.15)', text: '#fb7185', border: 'rgba(244, 63, 94, 0.3)' };
                }

                return (
                  <div
                    key={item.id}
                    className="card card-hover"
                    style={{
                      cursor: 'pointer',
                      padding: '16px',
                      borderColor: isSelected ? 'var(--border-focus)' : 'var(--border-subtle)',
                      boxShadow: isSelected ? 'var(--shadow-glow)' : 'none'
                    }}
                    onClick={() => loadPRDetail(item.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        textTransform: 'uppercase', 
                        fontWeight: 700, 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        background: statusBadge.bg,
                        color: statusBadge.text,
                        border: `1px solid ${statusBadge.border}`
                      }}>
                        {item.status}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        #{item.id.slice(0, 7)}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', lineHeight: 1.4 }}>
                      {item.title}
                    </h4>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      <Layers size={13} />
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{item.prompt_slug}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      <span>Target: <EnvironmentBadge env={item.target_environment} size="sm" /></span>
                      <span>by {item.author_name}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected PR Details & Diff */}
        <div>
          {detailLoading ? (
            <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading PR inspection details & diff...
            </div>
          ) : !selectedPR ? (
            <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a pull request from the left column to inspect changes and diffs.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* PR Header Card */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        textTransform: 'uppercase', 
                        fontWeight: 700, 
                        padding: '3px 10px', 
                        borderRadius: '6px',
                        background: pr.status === 'merged' ? 'rgba(16, 185, 129, 0.2)' : (pr.status === 'rejected' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)'),
                        color: pr.status === 'merged' ? '#34d399' : (pr.status === 'rejected' ? '#fb7185' : '#fbbf24'),
                        border: '1px solid currentColor'
                      }}>
                        {pr.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        #{pr.id}
                      </span>
                    </div>

                    <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
                      {pr.title}
                    </h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={14} /> Author: <strong style={{ color: 'var(--text-primary)' }}>{pr.author_name}</strong>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ShieldCheck size={14} /> Assignee: <strong style={{ color: 'var(--text-primary)' }}>{pr.assignee_name}</strong>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} /> {new Date(pr.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  {pr.status === 'open' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={actionLoading}
                        onClick={() => setIsRejectModalOpen(true)}
                      >
                        <X size={15} /> Reject
                      </button>
                      <button
                        className="btn btn-success btn-sm"
                        disabled={actionLoading}
                        onClick={handleMerge}
                      >
                        <Check size={15} /> Merge & Promote
                      </button>
                    </div>
                  )}
                </div>

                {/* Promotion Path Banner */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '12px 18px', 
                  background: 'var(--bg-elevated)', 
                  borderRadius: 'var(--radius-md)', 
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '16px' 
                }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Promotion Workflow:</span>
                  <EnvironmentBadge env={selectedPR.sourceVersion?.environment || 'development'} size="sm" />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#a5b4fc' }}>
                    v{selectedPR.sourceVersion?.version_number}
                  </span>
                  <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                  <EnvironmentBadge env={pr.target_environment} size="sm" />
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    Prompt: <strong style={{ color: 'var(--text-primary)' }}>{pr.prompt_name}</strong> ({pr.prompt_slug})
                  </span>
                </div>

                {pr.description && (
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '12px 16px', borderRadius: '8px', lineHeight: 1.5, borderLeft: '3px solid var(--accent-primary)' }}>
                    {pr.description}
                  </div>
                )}
              </div>

              {/* Side-by-Side and Unified Diff Inspection Card */}
              <div className="card">
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <GitPullRequest size={18} style={{ color: 'var(--accent-primary)' }} />
                  Prompt Template Diff Inspection
                </h3>

                <DiffViewer
                  diff={selectedPR.diff || []}
                  originalContent={selectedPR.originalContent}
                  proposedContent={selectedPR.proposedContent}
                  targetEnv={pr.target_environment}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Promotion Request"
        maxWidth="520px"
      >
        <form onSubmit={handleReject}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Rejection Reason / Feedback for Author</label>
              <textarea
                className="form-textarea"
                rows={4}
                required
                placeholder="Explain why this version does not meet quality criteria (e.g. failed hallucination checks)..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={() => setIsRejectModalOpen(false)}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-danger btn-sm"
              disabled={actionLoading}
            >
              Confirm Rejection
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
