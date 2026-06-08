import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Search } from 'lucide-react';
import { getLogs, getRegistry } from '../api/client';

function LogLevel({ level }) {
  const colors = {
    error: 'text-red-500 bg-red-500/10',
    warn: 'text-yellow-500 bg-yellow-500/10',
    info: 'text-blue-500 bg-blue-500/10',
    debug: 'text-gray-500 bg-gray-500/10'
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[level] || colors.debug}`}>
      {(level || 'info').toUpperCase()}
    </span>
  );
}

function LogEntry({ log, serverName }) {
  return (
    <div className="flex gap-3 py-2 px-3 hover:bg-dark-hover transition-colors border-b border-dark-border/50">
      <div className="text-xs text-gray-500 font-mono w-24 shrink-0">
        {new Date(log.timestamp).toLocaleTimeString()}
      </div>
      <div className="w-20 shrink-0">
        <LogLevel level={log.level} />
      </div>
      {serverName && (
        <div className="text-xs text-gray-400 font-mono w-32 shrink-0 truncate">{serverName}</div>
      )}
      <div className="flex-1 text-sm text-gray-300 font-mono break-all">{log.message}</div>
    </div>
  );
}

function LogsViewer() {
  const [search, setSearch] = useState('');
  const [selectedServer, setSelectedServer] = useState('');

  const { data: registry } = useQuery({ queryKey: ['registry'], queryFn: getRegistry });
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['logs', selectedServer],
    queryFn: () => getLogs(selectedServer || null, 200),
    refetchInterval: 3000
  });

  const servers = Object.keys(registry?.servers || {});

  // Flatten logs into a single chronological list
  let entries = [];
  if (logsData?.logs) {
    entries = logsData.logs.map(log => ({ ...log, _server: logsData.serverName }));
  } else if (logsData?.servers) {
    for (const [name, logs] of Object.entries(logsData.servers)) {
      for (const log of logs) entries.push({ ...log, _server: name });
    }
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  if (search) {
    entries = entries.filter(e => (e.message || '').toLowerCase().includes(search.toLowerCase()));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Activity size={28} />
            Logs
          </h1>
          <p className="text-gray-400">Live tail across all servers</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Filter messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <select
          value={selectedServer}
          onChange={(e) => setSelectedServer(e.target.value)}
          className="px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-white text-sm focus:outline-none focus:border-primary"
        >
          <option value="">All servers</option>
          {servers.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div className="bg-dark-surface border border-dark-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading logs...</div>
        ) : entries.length > 0 ? (
          <div className="max-h-[600px] overflow-auto">
            {entries.map((log, idx) => (
              <LogEntry key={idx} log={log} serverName={log._server} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">No logs yet</div>
        )}
      </div>
    </div>
  );
}

export default LogsViewer;
