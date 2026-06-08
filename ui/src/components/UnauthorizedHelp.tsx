import { AlertCircle, Key, Terminal, RotateCcw } from 'lucide-react';

function UnauthorizedHelp(): JSX.Element {
  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-6">
      <div className="max-w-3xl w-full">
        <div className="bg-dark-surface border border-dark-border rounded-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-yellow-500/10 rounded-lg">
              <AlertCircle className="text-yellow-500" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Authentication Required</h1>
              <p className="text-gray-400 mt-1">You need an API key to access the MCP Gateway dashboard</p>
            </div>
          </div>

          <div className="space-y-6 mt-8">
            {/* Get API Key */}
            <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
              <div className="flex items-center gap-2 mb-3">
                <Key className="text-primary" size={20} />
                <h2 className="text-lg font-semibold text-white">Get Your API Key</h2>
              </div>
              <p className="text-gray-400 mb-4">
                The gateway auto-generates a secure API key on first run. Retrieve it with:
              </p>
              <div className="bg-dark-surface rounded border border-dark-border p-4 font-mono text-sm text-gray-300 overflow-x-auto">
                <div className="flex items-start gap-2">
                  <Terminal className="text-gray-500 flex-shrink-0 mt-0.5" size={16} />
                  <code>
                    docker run --rm \<br />
                    {'  '}-v $HOME/.mcp:/root/.mcp \<br />
                    {'  '}-e PRINT_API_KEY=true \<br />
                    {'  '}ghcr.io/ismail-kattakath/mcp-gateway:latest
                  </code>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                💡 The key is stored in <code className="bg-dark-bg px-1.5 py-0.5 rounded">~/.mcp/gateway-api-key</code> and persists across restarts
              </p>
            </div>

            {/* Use the Key */}
            <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
              <div className="flex items-center gap-2 mb-3">
                <Key className="text-primary" size={20} />
                <h2 className="text-lg font-semibold text-white">Use the Key</h2>
              </div>
              <p className="text-gray-400 mb-4">
                Once you have your key, add it as a Bearer token:
              </p>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-400 mb-2">For HTTP requests (curl, API clients):</p>
                  <div className="bg-dark-surface rounded border border-dark-border p-3 font-mono text-xs text-gray-300 overflow-x-auto">
                    Authorization: Bearer YOUR_API_KEY
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-2">For browsers (query parameter):</p>
                  <div className="bg-dark-surface rounded border border-dark-border p-3 font-mono text-xs text-gray-300 overflow-x-auto">
                    http://localhost:3000?access_token=YOUR_API_KEY
                  </div>
                </div>
              </div>
            </div>

            {/* Rotate Key */}
            <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw className="text-primary" size={20} />
                <h2 className="text-lg font-semibold text-white">Rotate Your Key</h2>
              </div>
              <p className="text-gray-400 mb-4">
                To generate a new key (e.g., after a leak):
              </p>
              <div className="bg-dark-surface rounded border border-dark-border p-4 font-mono text-sm text-gray-300 overflow-x-auto">
                <div className="flex items-start gap-2">
                  <Terminal className="text-gray-500 flex-shrink-0 mt-0.5" size={16} />
                  <code>
                    docker run --rm \<br />
                    {'  '}-v $HOME/.mcp:/root/.mcp \<br />
                    {'  '}-e ROTATE_API_KEY=true \<br />
                    {'  '}ghcr.io/ismail-kattakath/mcp-gateway:latest
                  </code>
                </div>
              </div>
              <p className="text-xs text-yellow-500 mt-3">
                ⚠️ After rotation, update the key in all client configurations
              </p>
            </div>

            {/* Disable Auth */}
            <div className="bg-dark-bg rounded-lg p-6 border border-dark-border">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="text-orange-500" size={20} />
                <h2 className="text-lg font-semibold text-white">Disable Auth (Not Recommended)</h2>
              </div>
              <p className="text-gray-400 mb-4">
                For local-only development, you can disable authentication:
              </p>

              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-400 mb-2">Via environment variable:</p>
                  <div className="bg-dark-surface rounded border border-dark-border p-3 font-mono text-xs text-gray-300">
                    GATEWAY_ENABLE_AUTH=false
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-2">Or in registry.json:</p>
                  <div className="bg-dark-surface rounded border border-dark-border p-3 font-mono text-xs text-gray-300">
                    {'"gateway": { ..., "enableAuth": false }'}
                  </div>
                </div>
              </div>

              <p className="text-xs text-orange-500 mt-3">
                ⚠️ Only disable auth when the gateway binds to 127.0.0.1 (loopback only)
              </p>
            </div>
          </div>

          {/* Docs Link */}
          <div className="mt-8 pt-6 border-t border-dark-border">
            <p className="text-sm text-gray-400 text-center">
              For more details, see{' '}
              <a
                href="https://github.com/ismail-kattakath/mcp-gateway"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                CLAUDE.md
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UnauthorizedHelp;
