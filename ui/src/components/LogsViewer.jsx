import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Search, Download, Trash2, Filter } from 'lucide-react';
import { getLogs, streamLogs, getRegistry } from '../api/client';

function LogLevel({ level }) {
  const colors = {
    error: 'text-red-500 bg-red-500/10',
    warn: 'text-yellow-500 bg-yellow-500/10',
    info: 'text-blue-500 bg-blue-500/10',
    debug: 'text-gray-500 bg-gray-500/10',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[level] || colors.debug}`}>
      {level.toUpperCase()}
    </span>
  );
}

function LogEntry({ log }) {
  return (
    <div className="flex gap-3 py-2 px-3 hover:bg-dark-hover transition-colors border-b border-dark-border/50">
      <div className="text-xs text-gray-500 font-mono w-24 shrink-0">
        {new Date(log.timestamp).toLocaleTimeString()}
      </div>
      <div className="w-20 shrink-0">
        <LogLevel level={log.level} />
      </div>
      {log.backendId && (
        <div className="text-xs text-gray-400 font-mono w-32 shrink-0 truncate">
          {log.backendId}
        </div>
      )}
      <div className="flex-1 text-sm text-gray-300 font-mono break-all">
        {log.message}
      </div>
    </div>
  );
}

function LogsViewer() {
  const [logs, setLogs] = useState([]);
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterBackend, setFilterBackend] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef(null);
  const logsContainerRef = useRef(null);

  const { data: registry } = useQuery({
    queryKey: ['registry'],
    queryFn: getRegistry,
  });

  // Initial logs fetch
  const { data: initialLogs } = useQuery({
    queryKey: ['logs'],
    queryFn: () => getLogs(null, 100),
  });

  useEffect(() => {
    if (initialLogs) {
      setLogs(initialLogs);
    }
  }, [initialLogs]);

  // SSE streaming
  useEffect(() => {
    const cleanup = streamLogs(
      (log) => {
        setLogs((prev) => [...prev, log].slice(-500)); // Keep last 500 logs
      },
      (error) => {
        console.error('Log stream error:', error);
      }
    );

    return cleanup;
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Handle manual scroll
  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const isAtBottom =
        container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
      setAutoScroll(isAtBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const backends = registry?.backends
    ? Object.keys(registry.backends)
    : [];

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (filterBackend !== 'all' && log.backendId !== filterBackend) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  const exportLogs = () => {
    const text = filteredLogs
      .map(
        (log) =>
          `${new Date(log.timestamp).toISOString()} [${log.level.toUpperCase()}] ${log.backendId || 'gateway'}: ${log.message}`
      )
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-gateway-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Logs Viewer</h1>
          <p className="text-gray-400">Live log streaming from MCP Gateway</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLogs([])}
            className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={16} />
            Clear
          </button>
          <button
            onClick={exportLogs}
            className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-dark-surface border border-dark-border rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search size={18} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-400" />
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All Levels</option>
              <option value="error">Error</option>
              <option value="warn">Warn</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterBackend}
              onChange={(e) => setFilterBackend(e.target.value)}
              className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All Backends</option>
              {backends.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Logs display */}
      <div className="bg-dark-surface border border-dark-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Activity size={20} />
            Live Logs
          </div>
          <div className="text-sm text-gray-400">
            {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
          </div>
        </div>

        <div
          ref={logsContainerRef}
          className="h-[600px] overflow-y-auto bg-dark-bg font-mono text-sm"
        >
          {filteredLogs.length > 0 ? (
            <>
              {filteredLogs.map((log, idx) => (
                <LogEntry key={`${log.timestamp}-${idx}`} log={log} />
              ))}
              <div ref={logsEndRef} />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              {logs.length === 0 ? 'No logs yet' : 'No logs match your filters'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LogsViewer;
