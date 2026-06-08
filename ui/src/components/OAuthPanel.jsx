import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, CheckCircle, XCircle, RefreshCw, LogOut, Github } from 'lucide-react';
import { getOAuthStatus, startOAuth, disconnectOAuth } from '../api/client';

function OAuthProviderCard({ provider, status, onConnect, onDisconnect, onRefresh }) {
  const isConnected = status?.connected;
  const expiresIn = status?.expiresIn;

  const providerConfig = {
    github: {
      name: 'GitHub',
      icon: Github,
      color: 'text-gray-300',
      bgColor: 'bg-gray-700',
    },
    smithery: {
      name: 'Smithery',
      icon: Key,
      color: 'text-purple-400',
      bgColor: 'bg-purple-900/30',
    },
  };

  const config = providerConfig[provider] || providerConfig.smithery;
  const Icon = config.icon;

  const formatExpiresIn = (seconds) => {
    if (!seconds) return null;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return 'Less than an hour';
  };

  return (
    <div className="bg-dark-surface border border-dark-border rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${config.bgColor}`}>
            <Icon size={24} className={config.color} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{config.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              {isConnected ? (
                <>
                  <CheckCircle size={16} className="text-green-500" />
                  <span className="text-sm text-green-500">Connected</span>
                </>
              ) : (
                <>
                  <XCircle size={16} className="text-gray-500" />
                  <span className="text-sm text-gray-500">Not connected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {isConnected && expiresIn && (
        <div className="mb-4 text-sm text-gray-400">
          Token expires in: <span className="text-white">{formatExpiresIn(expiresIn)}</span>
        </div>
      )}

      {status?.scopes && status.scopes.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2">Scopes:</div>
          <div className="flex flex-wrap gap-2">
            {status.scopes.map((scope) => (
              <span
                key={scope}
                className="px-2 py-1 bg-dark-hover text-gray-300 text-xs rounded"
              >
                {scope}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <button
              onClick={() => onRefresh(provider)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500/20 transition-colors"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              onClick={() => onDisconnect(provider)}
              className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              <LogOut size={16} />
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={() => onConnect(provider)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            <Icon size={16} />
            Connect {config.name}
          </button>
        )}
      </div>
    </div>
  );
}

function OAuthPanel() {
  const queryClient = useQueryClient();

  const { data: oauthStatus, isLoading, error } = useQuery({
    queryKey: ['oauth-status'],
    queryFn: getOAuthStatus,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const connectMutation = useMutation({
    mutationFn: startOAuth,
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectOAuth,
    onSuccess: () => {
      queryClient.invalidateQueries(['oauth-status']);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading OAuth status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <div className="text-red-500 font-medium">Failed to load OAuth status</div>
        <div className="text-red-400 text-sm mt-1">{error.message}</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">OAuth Integration</h1>
        <p className="text-gray-400">Connect external services for MCP backends</p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500 rounded-lg p-4">
        <div className="flex gap-3">
          <Key size={20} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-400">
            <div className="font-medium mb-1">OAuth Token Management</div>
            <div>
              Connect your accounts to enable MCP backends that require authentication.
              Tokens are stored securely and automatically refreshed before expiration.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OAuthProviderCard
          provider="github"
          status={oauthStatus?.github}
          onConnect={(provider) => connectMutation.mutate(provider)}
          onDisconnect={(provider) => {
            if (confirm('Disconnect GitHub? This will affect backends using GitHub authentication.')) {
              disconnectMutation.mutate(provider);
            }
          }}
          onRefresh={(provider) => connectMutation.mutate(provider)}
        />

        <OAuthProviderCard
          provider="smithery"
          status={oauthStatus?.smithery}
          onConnect={(provider) => connectMutation.mutate(provider)}
          onDisconnect={(provider) => {
            if (confirm('Disconnect Smithery? This will affect backends using Smithery authentication.')) {
              disconnectMutation.mutate(provider);
            }
          }}
          onRefresh={(provider) => connectMutation.mutate(provider)}
        />
      </div>

      <div className="bg-dark-surface border border-dark-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">How OAuth Works</h2>
        <div className="space-y-3 text-sm text-gray-400">
          <div className="flex gap-3">
            <div className="text-primary font-bold">1.</div>
            <div>Click "Connect" to authorize MCP Gateway with the provider</div>
          </div>
          <div className="flex gap-3">
            <div className="text-primary font-bold">2.</div>
            <div>You'll be redirected to the provider's authorization page</div>
          </div>
          <div className="flex gap-3">
            <div className="text-primary font-bold">3.</div>
            <div>After authorization, you'll be redirected back to the gateway</div>
          </div>
          <div className="flex gap-3">
            <div className="text-primary font-bold">4.</div>
            <div>The gateway stores the access token securely and uses it for backend requests</div>
          </div>
          <div className="flex gap-3">
            <div className="text-primary font-bold">5.</div>
            <div>Tokens are automatically refreshed before expiration</div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
        <div className="flex gap-3">
          <div className="text-yellow-500 text-lg">⚠️</div>
          <div className="text-sm text-yellow-400">
            <div className="font-medium mb-1">Security Note</div>
            <div>
              OAuth tokens are stored encrypted in your gateway's data directory.
              Never share your tokens or expose your gateway without proper authentication.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OAuthPanel;
