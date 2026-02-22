import React, { useState } from 'react';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import { Tasks } from './pages/Tasks';
import { Payments } from './pages/Payments';
import { Reputation } from './pages/Reputation';
import { Registry } from './pages/Registry';
import { Messages } from './pages/Messages';
import { ToastProvider } from './components/Toast';
import { LayoutDashboard, Bot, ListTodo, Wallet, Star, BookOpen, MessageSquare, ArrowLeft, Activity, Menu, X } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'payments', label: 'Payments', icon: Wallet },
  { id: 'reputation', label: 'Reputation', icon: Star },
  { id: 'registry', label: 'ERC-8004', icon: BookOpen },
  { id: 'messages', label: 'XMTP', icon: MessageSquare },
];

export default function App() {
  const [page, setPage] = useState('landing');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (page === 'landing') {
    return <Landing onEnter={() => setPage('agents')} />;
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />;
      case 'agents': return <Agents />;
      case 'tasks': return <Tasks />;
      case 'payments': return <Payments />;
      case 'reputation': return <Reputation />;
      case 'registry': return <Registry />;
      case 'messages': return <Messages />;
      default: return <Agents />;
    }
  };

  const navigate = (id) => {
    setPage(id);
    setSidebarOpen(false);
  };

  return (
    <ToastProvider>
    <div className="app-layout">
      <div className="topbar">
        <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="topbar-logo">
          <img src="/logo.png" alt="AgentNet" className="logo-img-sm" />
          <span>Agent<b>Net</b></span>
        </div>
        <div className="topbar-right">
          <div className="network-badge">
            <div className="status-dot active" />
            <span>Live</span>
          </div>
        </div>
      </div>

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <img src="/logo.png" alt="AgentNet" className="logo-img" />
            <span>Agent<b>Net</b></span>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => { setPage('landing'); setSidebarOpen(false); }}>
            <ArrowLeft size={18} />
            <span>Back to Home</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        {renderPage()}
      </main>
    </div>
    </ToastProvider>
  );
}
