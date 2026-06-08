/**
 * Server Configuration page.
 * (Kept filename BackendConfig.tsx for import compatibility; exports as ServerConfig.)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, Play, Square, CheckCircle, XCircle, AlertCircle, LucideIcon } from 'lucide-react';
import { getRegistry, getStatus, startServer, stopServer } from '../api/client';

interface StatusBadgeProps {
  state: string;
}

interface ServerConfig {
  source: string;
  lifecycle?: string;
  enabled?: boolean;
}

interface StatusEntry {
  state: 'running' | 'stopped' | 'not_started' | 'failed';
  lastError?: string;
}

interface ServerCardProps {
  name: string;
  server: ServerConfig;
  statusEntry?: StatusEntry;
  onStart: (name: string) => void;
  onStop: (name: string) => void;
}

interface Registry {
  servers: Record<string, ServerConfig>;
}

interface StatusResponse {
  servers: Record<string, StatusEntry>;
}

function StatusBadge({ state }: StatusBadgeProps): JSX.Element {
  const config: Record<string, { icon: LucideIcon; color: string }> = {
    running: { icon: CheckCircle, color: 'text-green-500' },
    stopped: { icon: XCircle, color: 'text-gray-500' },
    not_started: { icon: XCircle, color: 'text-gray-500' },
    failed: { icon: AlertCircle, color: 'text-red-500' },
  };
  const { icon: Icon, color } = config[state] || config.stopped;
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <Icon size={16} />
      <span className="text-sm font-medium capitalize">{state || 'stopped'}</span>
    </div>
  );
}

function ServerCard({ name, server, statusEntry, onStart, onStop }: ServerCardProps): JSX.Element {
  const state = statusEntry?.state || 'not_started';
  const isRunning = state === 'running';

  return (
    <div className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-white">{name}</h3>
            <StatusBadge state={state} />
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="bg-dark-hover px-2 py-1 rounded">source: {server.source}</span>
            <span className="bg-dark-hover px-2 py-1 rounded">
              {server.lifecycle || 'on-demand'}
            </span>
            {server.enabled === false && (
              <span className="bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded">disabled</span>
            )}
          </div>
        </div>
      </div>

      {statusEntry?.lastError && (
        <div className="mb-4 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">
          {statusEntry.lastError}
        </div>
      )}

      <div className="flex items-center gap-2">
        {isRunning ? (
          <button
            onClick={() => onStop(name)}
            className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <Square size={16} />
            Stop
          </button>
        ) : (
          <button
            onClick={() => onStart(name)}
            disabled={server.enabled === false}
            className="flex items-center gap-2 px-3 py-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={16} />
            Start
          </button>
        )}
      </div>
    </div>
  );
}

function ServerConfig(): JSX.Element {
  const queryClient = useQueryClient();

  const {
    data: registry,
    isLoading: regLoading,
    error: regError,
  } = useQuery<Registry, Error>({
    queryKey: ['registry'],
    queryFn: getRegistry,
  });
  const { data: status } = useQuery<StatusResponse, Error>({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: startServer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status'] }),
  });
  const stopMutation = useMutation({
    mutationFn: stopServer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status'] }),
  });

  if (regLoading)
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">Loading servers...</div>
    );
  if (regError) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <div className="text-red-500 font-medium">Failed to load servers</div>
        <div className="text-red-400 text-sm mt-1">{regError.message}</div>
      </div>
    );
  }

  const servers = Object.entries(registry?.servers || {});

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Servers</h1>
          <p className="text-gray-400">MCP servers in your registry</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {servers.length > 0 ? (
          servers.map(([name, server]) => (
            <ServerCard
              key={name}
              name={name}
              server={server}
              statusEntry={status?.servers?.[name]}
              onStart={(n) => startMutation.mutate(n)}
              onStop={(n) => stopMutation.mutate(n)}
            />
          ))
        ) : (
          <div className="col-span-2 bg-dark-surface border border-dark-border rounded-lg p-12 text-center">
            <Server size={48} className="text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No servers configured</h3>
            <p className="text-gray-400">Add entries to registry.json to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ServerConfig;
