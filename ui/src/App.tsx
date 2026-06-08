import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, Server, Activity, LucideIcon } from 'lucide-react';
import Dashboard from './components/Dashboard';
import ServerConfig from './components/BackendConfig';
import LogsViewer from './components/LogsViewer';
import UnauthorizedHelp from './components/UnauthorizedHelp';
import { setAuthErrorCallback } from './utils/authInterceptor';

interface NavigationItem {
  name: string;
  path: string;
  icon: LucideIcon;
}

function App(): JSX.Element {
  const location = useLocation();
  const [showUnauthorized, setShowUnauthorized] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('access_token');
    if (token) {
      localStorage.setItem('gateway_api_key', token);
    }

    setAuthErrorCallback(() => {
      setShowUnauthorized(true);
    });
  }, []);

  if (showUnauthorized) {
    return <UnauthorizedHelp />;
  }

  const navigation: NavigationItem[] = [
    { name: 'Dashboard', path: '/', icon: Home },
    { name: 'Servers', path: '/servers', icon: Server },
    { name: 'Logs', path: '/logs', icon: Activity }
  ];

  return (
    <div className="min-h-screen bg-dark-bg flex">
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
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-primary text-white' : 'text-gray-300 hover:bg-dark-hover hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-dark-border">
          <div className="text-xs text-gray-500">Version 2.0</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/servers" element={<ServerConfig />} />
            <Route path="/logs" element={<LogsViewer />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;
