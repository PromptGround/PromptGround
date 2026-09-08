import React, { useState, useEffect } from 'react';
import { getStoredAuth, clearAuth } from './utils/auth';
import { api } from './utils/api';

import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PromptsList from './pages/PromptsList';
import PromptDetail from './pages/PromptDetail';
import PullRequests from './pages/PullRequests';
import ApiKeys from './pages/ApiKeys';
import UsersAdmin from './pages/UsersAdmin';
import Settings from './pages/Settings';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const auth = getStoredAuth();
    return auth ? auth.user : null;
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPromptSlug, setSelectedPromptSlug] = useState(null);
  const [selectedPRId, setSelectedPRId] = useState(null);
  const [openPRCount, setOpenPRCount] = useState(0);

  const fetchPRCount = async () => {
    if (!currentUser) return;
    try {
      const res = await api.getPullRequests('?status=open');
      setOpenPRCount((res.pullRequests || []).length);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchPRCount();
    const interval = setInterval(fetchPRCount, 15000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    clearAuth();
    setCurrentUser(null);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedPromptSlug(null);
    setSelectedPRId(null);
  };

  const handleSelectPrompt = (slug) => {
    setSelectedPromptSlug(slug);
  };

  const handleNavigateToPR = (prId) => {
    setSelectedPRId(prId);
    setActiveTab('prs');
  };

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('ph_sidebar_collapsed') === 'true';
    } catch (e) {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ph_sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        openPRCount={openPRCount}
        currentUser={currentUser}
        onLogout={handleLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      <main className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Navbar
          activeTab={activeTab}
          onRefresh={fetchPRCount}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />

        {selectedPromptSlug ? (
          <PromptDetail
            slug={selectedPromptSlug}
            onBack={() => setSelectedPromptSlug(null)}
            onNavigateToPR={handleNavigateToPR}
            currentUser={currentUser}
          />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <Dashboard
                onNavigate={(tab, params) => {
                  if (tab === 'prs' && params?.prId) {
                    handleNavigateToPR(params.prId);
                  } else {
                    handleTabChange(tab);
                  }
                }}
              />
            )}

            {activeTab === 'prompts' && (
              <PromptsList
                onSelectPrompt={handleSelectPrompt}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'prs' && (
              <PullRequests
                initialPRId={selectedPRId}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'keys' && (
              <ApiKeys
                currentUser={currentUser}
              />
            )}

            {activeTab === 'users' && (
              <UsersAdmin
                currentUser={currentUser}
              />
            )}

            {activeTab === 'settings' && (
              <Settings
                currentUser={currentUser}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
