import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Shield, 
  Lock, 
  Layers, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { api } from '../utils/api';
import Modal from '../components/Modal';

export default function UsersAdmin({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add User modal
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [newEnvs, setNewEnvs] = useState(['development']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Prompt Overrides modal
  const [selectedUserForOverride, setSelectedUserForOverride] = useState(null);
  const [overridePromptId, setOverridePromptId] = useState('');
  const [overrideLevel, setOverrideLevel] = useState('write');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  // Admin Password Reset modal
  const [userForPasswordReset, setUserForPasswordReset] = useState(null);
  const [adminResetNewPassword, setAdminResetNewPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);

  const fetchUsersAndPrompts = async () => {
    try {
      const [uRes, pRes] = await Promise.all([
        api.getUsers(),
        api.getPrompts()
      ]);
      setUsers(uRes.users || []);
      setPrompts(pRes.prompts || []);
      if (pRes.prompts && pRes.prompts.length > 0) {
        setOverridePromptId(pRes.prompts[0].id);
      }
    } catch (err) {
      console.error('Failed to load user access data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersAndPrompts();
  }, []);

  const handleRoleChange = async (userId, newRoleVal) => {
    try {
      await api.updateUserRole(userId, newRoleVal);
      await fetchUsersAndPrompts();
    } catch (err) {
      alert(err.message || 'Failed to update user role');
    }
  };

  const handleEnvToggle = async (user, env) => {
    const currentEnvs = user.environments || [];
    let updated;
    if (currentEnvs.includes(env)) {
      updated = currentEnvs.filter(e => e !== env);
    } else {
      updated = [...currentEnvs, env];
    }

    try {
      await api.updateUserEnvironments(user.id, updated);
      await fetchUsersAndPrompts();
    } catch (err) {
      alert(err.message || 'Failed to update environment access');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.createUser({
        username: newUsername,
        password: newPassword,
        role: newRole,
        environments: newEnvs
      });

      setIsAddUserOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('editor');
      setNewEnvs(['development']);
      await fetchUsersAndPrompts();
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePromptOverride = async (e) => {
    e.preventDefault();
    if (!selectedUserForOverride || !overridePromptId) return;
    setOverrideSubmitting(true);

    try {
      await api.updateUserPromptAccess(selectedUserForOverride.id, overridePromptId, overrideLevel);
      await fetchUsersAndPrompts();
      // refresh current user override modal state
      const updatedUser = users.find(u => u.id === selectedUserForOverride.id);
      setSelectedUserForOverride(updatedUser || null);
    } catch (err) {
      alert(err.message || 'Failed to update prompt override');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleRemoveOverride = async (promptId) => {
    if (!selectedUserForOverride) return;
    try {
      await api.updateUserPromptAccess(selectedUserForOverride.id, promptId, null);
      await fetchUsersAndPrompts();
      const updatedUser = users.find(u => u.id === selectedUserForOverride.id);
      setSelectedUserForOverride(updatedUser || null);
    } catch (err) {
      alert(err.message || 'Failed to remove override');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-title-group">
          <h1>Access Control & Team Permissions</h1>
          <p>Enforce environment-level allowances and granular per-prompt permission overrides</p>
        </div>
        {currentUser?.role === 'admin' && (
          <div>
            <button className="btn btn-primary" onClick={() => setIsAddUserOpen(true)}>
              <Plus size={16} /> Add Team Member
            </button>
          </div>
        )}
      </div>

      {/* Role Definitions Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Shield size={16} style={{ color: '#818cf8' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>Admin</span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Full system control. Direct deployment to production, merge PRs, delete prompts, and manage credentials.
          </p>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Layers size={16} style={{ color: '#fbbf24' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>Editor</span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Author versions in development sandbox. Propose promotion PRs to staging and production.
          </p>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Lock size={16} style={{ color: '#34d399' }} />
            <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>Viewer</span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Read-only prompt inspection and runtime playground testing on authorized environments.
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading team members...
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User Profile</th>
                  <th>Global Role</th>
                  <th>Environment Access Matrix</th>
                  <th>Prompt Overrides</th>
                  <th style={{ textAlign: 'right' }}>Granular Access</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const envs = u.environments || [];
                  const overrides = u.promptAccessOverrides || [];
                  const isCurrentUserAdmin = currentUser?.role === 'admin';

                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="avatar" style={{ width: '30px', height: '30px', fontSize: '0.75rem' }}>
                            {u.username[0]}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.username}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{u.id}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        {isCurrentUserAdmin ? (
                          <select
                            className="form-select"
                            style={{ width: '130px', padding: '4px 8px', fontSize: '0.8rem' }}
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          >
                            <option value="admin">Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: '0.85rem' }}>
                            {u.role}
                          </span>
                        )}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          {['development', 'staging', 'production'].map(envName => {
                            const hasAccess = u.role === 'admin' || envs.includes(envName);
                            return (
                              <label 
                                key={envName} 
                                style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '5px', 
                                  fontSize: '0.78rem', 
                                  cursor: isCurrentUserAdmin && u.role !== 'admin' ? 'pointer' : 'default',
                                  opacity: hasAccess ? 1 : 0.4
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={hasAccess}
                                  disabled={!isCurrentUserAdmin || u.role === 'admin'}
                                  onChange={() => handleEnvToggle(u, envName)}
                                />
                                {envName.slice(0, 4).toUpperCase()}
                              </label>
                            );
                          })}
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8rem', color: overrides.length > 0 ? '#38bdf8' : 'var(--text-muted)' }}>
                          {overrides.length > 0 ? `${overrides.length} specific override(s)` : 'None (Role default)'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                            onClick={() => {
                              setUserForPasswordReset(u);
                              setAdminResetNewPassword('');
                              setResetMessage(null);
                            }}
                            title="Reset this user's password"
                          >
                            <Lock size={12} /> Reset Password
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.74rem', padding: '4px 10px' }}
                            onClick={() => setSelectedUserForOverride(u)}
                          >
                            Overrides
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        title="Add Team Member"
        maxWidth="520px"
      >
        <form onSubmit={handleCreateUser}>
          <div className="modal-body">
            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="e.g. jordan_ml"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Initial Password</label>
              <input
                type="password"
                className="form-input"
                required
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Global Role</label>
              <select
                className="form-select"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
              >
                <option value="editor">Editor (Author & Propose PRs)</option>
                <option value="viewer">Viewer (Read-Only)</option>
                <option value="admin">Admin (Full Control)</option>
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsAddUserOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={submitting || !newUsername || !newPassword}
            >
              {submitting ? 'Creating...' : 'Create Member'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Granular Prompt Access Overrides Modal */}
      <Modal
        isOpen={!!selectedUserForOverride}
        onClose={() => setSelectedUserForOverride(null)}
        title={`Prompt Access Overrides for ${selectedUserForOverride?.username}`}
        maxWidth="620px"
      >
        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Granular overrides supersede global role defaults for specific prompt identifiers.
          </p>

          {/* Current Overrides List */}
          <div>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '10px' }}>Active Overrides</h4>
            {(selectedUserForOverride?.promptAccessOverrides || []).length === 0 ? (
              <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
                No prompt-specific overrides set. User inherits standard '{selectedUserForOverride?.role}' permissions.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedUserForOverride.promptAccessOverrides.map(ov => (
                  <div key={ov.prompt_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{ov.prompt_name}</span>
                      <span style={{ marginLeft: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#a5b4fc' }}>({ov.prompt_slug})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', fontWeight: 700 }}>
                        {ov.access_level}
                      </span>
                      <button 
                        className="btn btn-danger btn-sm"
                        style={{ padding: '3px 7px', fontSize: '0.72rem' }}
                        onClick={() => handleRemoveOverride(ov.prompt_id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add / Update Override */}
          <form onSubmit={handleSavePromptOverride} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '12px' }}>Grant Prompt Override</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
              <div className="form-group">
                <label className="form-label">Prompt Target</label>
                <select
                  className="form-select"
                  value={overridePromptId}
                  onChange={(e) => setOverridePromptId(e.target.value)}
                >
                  {prompts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Access Level</label>
                <select
                  className="form-select"
                  value={overrideLevel}
                  onChange={(e) => setOverrideLevel(e.target.value)}
                >
                  <option value="read">Read Only</option>
                  <option value="write">Read & Write</option>
                  <option value="admin">Full Prompt Admin</option>
                </select>
              </div>

              <div>
                <button 
                  type="submit" 
                  className="btn btn-primary btn-sm" 
                  disabled={overrideSubmitting || !overridePromptId}
                  style={{ height: '40px' }}
                >
                  Set Override
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedUserForOverride(null)}>
            Close
          </button>
        </div>
      </Modal>

      {/* Admin Password Reset Modal */}
      <Modal
        isOpen={!!userForPasswordReset}
        onClose={() => setUserForPasswordReset(null)}
        title={`Reset Password for ${userForPasswordReset?.username}`}
        maxWidth="460px"
      >
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!userForPasswordReset || !adminResetNewPassword) return;
          setResetSubmitting(true);
          try {
            await api.adminResetPassword(userForPasswordReset.id, adminResetNewPassword);
            setResetMessage(`Password successfully changed for ${userForPasswordReset.username}!`);
            setTimeout(() => {
              setUserForPasswordReset(null);
              setResetMessage(null);
            }, 2000);
          } catch (err) {
            alert(err.message || 'Failed to reset password');
          } finally {
            setResetSubmitting(false);
          }
        }}>
          <div className="modal-body">
            {resetMessage ? (
              <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.85rem', textAlign: 'center' }}>
                <Check size={16} style={{ display: 'inline', marginRight: '6px' }} />
                {resetMessage}
              </div>
            ) : (
              <>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  As an Administrator, you can assign a new password for <strong>{userForPasswordReset?.username}</strong> without requiring their prior password.
                </p>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    required
                    minLength={6}
                    placeholder="Enter new password (min 6 chars)"
                    value={adminResetNewPassword}
                    onChange={(e) => setAdminResetNewPassword(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={() => setUserForPasswordReset(null)}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary btn-sm"
              disabled={resetSubmitting || !adminResetNewPassword || adminResetNewPassword.length < 6}
            >
              {resetSubmitting ? 'Saving...' : 'Set New Password'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
