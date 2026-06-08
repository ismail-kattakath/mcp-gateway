import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  Home,
  Server,
  FileText,
  Key,
  Settings,
  Activity
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import BackendConfig from './components/BackendConfig';
import LogsViewer from './components/LogsViewer';
import OAuthPanel from './components/OAuthPanel';
import EnvEditor from './components/EnvEditor';

function App() {
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', path: '/', icon: Home },
    { name: 'Backends', path: '/backends', icon: Server },
    { name: 'OAuth', path: '/oauth', icon: Key },
    { name: 'Environment', path: '/env', icon: Settings },
    { name: 'Logs', path: '/logs', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-dark-bg flex">
      {/* Sidebar */}
      <div className="w-64 bg-dark-surface border-r border-dark-border flex flex-col">
        <div className="p-6 border-b border-dark-border">
          <h1 className="text-2xl font-bold text-white">MCP Gateway</h1>
          <p className="text-sm text-gray-400 mt-1">Universal MCP Manager</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                  ${isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-300 hover:bg-dark-hover hover:text-white'
                  }
                `}
              >
                <Icon size={20} />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-dark-border">
          <div className="text-xs text-gray-500">
            Version 1.0.0
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/backends" element={<BackendConfig />} />
            <Route path="/oauth" element={<OAuthPanel />} />
            <Route path="/env" element={<EnvEditor />} />
            <Route path="/logs" element={<LogsViewer />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;
