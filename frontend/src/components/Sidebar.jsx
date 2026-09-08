import React from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  GitPullRequest, 
  Key, 
  Users, 
  Settings, 
  LogOut,
  Sparkles,
  PanelLeftClose
} from 'lucide-react';

export default function Sidebar({ 
  activeTab, 
  onTabChange, 
  openPRCount = 0, 
  currentUser, 
  onLogout,
  collapsed = false,
  onToggleCollapse
}) {
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'prompts', label: 'Prompt Registry', icon: Layers },
    { 
      id: 'prs', 
      label: 'Promotion PRs', 
      icon: GitPullRequest, 
      badge: openPRCount > 0 ? openPRCount : null 
    },
    ...(currentUser?.role === 'admin' ? [
      { id: 'keys', label: 'Scoped API Keys', icon: Key },
      { id: 'users', label: 'Access Control', icon: Users }
    ] : []),
    { id: 'settings', label: currentUser?.role === 'admin' ? 'Engine Settings' : 'My Account & Password', icon: Settings }
  ];

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-logo">
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(99, 102, 241, 0.5)',
          flexShrink: 0
        }}>
          <Sparkles size={18} color="#fff" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#fff' }}>
            PromptHub
          </span>
          <span style={{ fontSize: '0.62rem', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '-2px' }}>
            LLMOps Engine
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Hide sidebar"
          className="sidebar-toggle-action-btn"
          aria-label="Hide sidebar"
        >
          <PanelLeftClose size={17} />
        </button>
      </div>

      <ul className="nav-menu">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <li key={item.id}>
              <a 
                href={`#${item.id}`}
                className={`nav-link ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  onTabChange(item.id);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="nav-counter">{item.badge}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>

      {currentUser && (
        <div className="sidebar-user">
          <div className="user-avatar-pill">
            <div className="avatar">
              {currentUser.username ? currentUser.username[0] : 'U'}
            </div>
            <div className="user-info">
              <span className="user-name">{currentUser.username}</span>
              <span className="user-role-badge">{currentUser.role}</span>
            </div>
          </div>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={onLogout}
            title="Log out"
            style={{ padding: '6px', border: 'none', background: 'transparent', color: 'var(--text-muted)' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      )}
    </aside>
  );
}
