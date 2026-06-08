import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Server, Activity, CheckCircle, XCircle, AlertCircle, LucideIcon } from 'lucide-react';
import { getStatus } from '../api/client';

interface StatusCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

interface ServerStatus {
  state: 'running' | 'stopped' | 'failed' | 'not_started';
  source: string;
  lastError?: string;
}

interface GatewayStatus {
  gateway?: {
    uptime: number;
  };
  servers: Record<string, ServerStatus>;
}

function StatusCard({ title, value, icon: Icon, color }: StatusCardProps): JSX.Element {
  return (
    <div className="bg-dark-surface border border-dark-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-400 text-sm font-medium">{title}</h3>
        <Icon size={24} className={color} />
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  );
}

interface ServerStatusBadgeProps {
  state: string;
}

function ServerStatusBadge({ state }: ServerStatusBadgeProps): JSX.Element {
  const config: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
    running: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
    stopped: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-500/10' },
    failed: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' }
  };
  const { icon: Icon, color, bg } = config[state] || config.stopped;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color} ${bg}`}>
      <Icon size={14} />
      {state}
    </span>
  );
}

function Dashboard(): JSX.Element {
  const { data: status, isLoading, error } = useQuery<GatewayStatus, Error>({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 5000
  });

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading status...</div>;
  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <div className="text-red-500 font-medium">Failed to load status</div>
        <div className="text-red-400 text-sm mt-1">{error.message}</div>
      </div>
    );
  }

  const serverStatuses = status?.servers || {};
  const entries = Object.entries(serverStatuses);
  const runningCount = entries.filter(([_, s]) => s.state === 'running').length;
  const stoppedCount = entries.filter(([_, s]) => s.state === 'stopped' || s.state === 'not_started').length;
  const failedCount = entries.filter(([_, s]) => s.state === 'failed').length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-gray-400">Overview of your MCP Gateway</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard title="Running" value={runningCount} icon={CheckCircle} color="text-green-500" />
        <StatusCard title="Stopped" value={stoppedCount} icon={XCircle} color="text-gray-500" />
        <StatusCard title="Failed" value={failedCount} icon={AlertCircle} color="text-red-500" />
        <StatusCard title="Uptime (s)" value={Math.round(status?.gateway?.uptime || 0)} icon={Activity} color="text-blue-500" />
      </div>

      <div className="bg-dark-surface border border-dark-border rounded-lg">
        <div className="p-6 border-b border-dark-border">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Server size={24} />
            Server Status
          </h2>
        </div>

        <div className="divide-y divide-dark-border">
          {entries.length > 0 ? (
            entries.map(([name, s]) => (
              <div key={name} className="p-6 hover:bg-dark-hover transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">{name}</h3>
                    <ServerStatusBadge state={s.state} />
                  </div>
                  <div className="text-sm text-gray-400">{s.source}</div>
                </div>
                {s.lastError && (
                  <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded mt-2">{s.lastError}</div>
                )}
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-400">No servers running.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
