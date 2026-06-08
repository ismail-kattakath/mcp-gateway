import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Server, Activity, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { getStatus } from '../api/client';

function StatusCard({ title, value, icon: Icon, color }) {
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

function BackendStatusBadge({ status }) {
  const config = {
    running: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
    stopped: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-500/10' },
    error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  };

  const { icon: Icon, color, bg } = config[status] || config.stopped;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color} ${bg}`}>
      <Icon size={14} />
      {status}
    </span>
  );
}

function Dashboard() {
  const { data: status, isLoading, error } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <div className="text-red-500 font-medium">Failed to load status</div>
        <div className="text-red-400 text-sm mt-1">{error.message}</div>
      </div>
    );
  }

  const runningCount = status?.backends?.filter(b => b.status === 'running').length || 0;
  const stoppedCount = status?.backends?.filter(b => b.status === 'stopped').length || 0;
  const errorCount = status?.backends?.filter(b => b.status === 'error').length || 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-gray-400">Overview of your MCP Gateway</p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard
          title="Running Backends"
          value={runningCount}
          icon={CheckCircle}
          color="text-green-500"
        />
        <StatusCard
          title="Stopped Backends"
          value={stoppedCount}
          icon={XCircle}
          color="text-gray-500"
        />
        <StatusCard
          title="Errors"
          value={errorCount}
          icon={AlertCircle}
          color="text-red-500"
        />
        <StatusCard
          title="Active Connections"
          value={status?.activeConnections || 0}
          icon={Activity}
          color="text-blue-500"
        />
      </div>

      {/* Backend list */}
      <div className="bg-dark-surface border border-dark-border rounded-lg">
        <div className="p-6 border-b border-dark-border">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Server size={24} />
            Backend Status
          </h2>
        </div>

        <div className="divide-y divide-dark-border">
          {status?.backends && status.backends.length > 0 ? (
            status.backends.map((backend) => (
              <div key={backend.id} className="p-6 hover:bg-dark-hover transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">{backend.name}</h3>
                    <BackendStatusBadge status={backend.status} />
                  </div>
                  <div className="text-sm text-gray-400">{backend.type}</div>
                </div>
                {backend.description && (
                  <p className="text-sm text-gray-400 mb-2">{backend.description}</p>
                )}
                {backend.error && (
                  <div className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded mt-2">
                    {backend.error}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-400">
              No backends configured. Go to Backends page to add one.
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-dark-surface border border-dark-border rounded-lg">
        <div className="p-6 border-b border-dark-border">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity size={24} />
            Recent Activity
          </h2>
        </div>

        <div className="p-6">
          <div className="space-y-3">
            {status?.recentActivity && status.recentActivity.length > 0 ? (
              status.recentActivity.slice(0, 5).map((activity, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm">
                  <div className="text-gray-500">{new Date(activity.timestamp).toLocaleTimeString()}</div>
                  <div className="text-gray-300">{activity.message}</div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-400">No recent activity</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
