import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Server,
  Plus,
  Play,
  Square,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Save,
  X
} from 'lucide-react';
import { getRegistry, updateBackend, deleteBackend, startBackend, stopBackend } from '../api/client';

function StatusBadge({ status }) {
  const config = {
    running: { icon: CheckCircle, color: 'text-green-500' },
    stopped: { icon: XCircle, color: 'text-gray-500' },
    error: { icon: AlertCircle, color: 'text-red-500' },
  };

  const { icon: Icon, color } = config[status] || config.stopped;

  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <Icon size={16} />
      <span className="text-sm font-medium capitalize">{status}</span>
    </div>
  );
}

function BackendCard({ backend, onEdit, onDelete, onStart, onStop }) {
  const isRunning = backend.status === 'running';

  return (
    <div className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-white">{backend.name}</h3>
            <StatusBadge status={backend.status} />
          </div>
          <p className="text-sm text-gray-400 mb-2">{backend.description}</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="bg-dark-hover px-2 py-1 rounded">{backend.type}</span>
            {backend.lifecycle && (
              <span className="bg-dark-hover px-2 py-1 rounded">{backend.lifecycle}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={backend.enabled}
              onChange={() => onEdit(backend.id, { ...backend, enabled: !backend.enabled })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>
      </div>

      {backend.error && (
        <div className="mb-4 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">
          {backend.error}
        </div>
      )}

      <div className="flex items-center gap-2">
        {isRunning ? (
          <button
            onClick={() => onStop(backend.id)}
            className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <Square size={16} />
            Stop
          </button>
        ) : (
          <button
            onClick={() => onStart(backend.id)}
            disabled={!backend.enabled}
            className="flex items-center gap-2 px-3 py-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={16} />
            Start
          </button>
        )}

        <button
          onClick={() => onEdit(backend.id, backend)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500/20 transition-colors"
        >
          <Edit size={16} />
          Edit
        </button>

        <button
          onClick={() => onDelete(backend.id)}
          className="flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
        >
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </div>
  );
}

function EditModal({ backend, onSave, onClose }) {
  const [config, setConfig] = useState(JSON.stringify(backend, null, 2));
  const [error, setError] = useState(null);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(config);
      onSave(backend.id, parsed);
      onClose();
    } catch (err) {
      setError('Invalid JSON: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-surface border border-dark-border rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="p-6 border-b border-dark-border flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Edit Backend: {backend.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <textarea
            value={config}
            onChange={(e) => {
              setConfig(e.target.value);
              setError(null);
            }}
            className="w-full h-96 bg-dark-bg border border-dark-border rounded-lg p-4 text-white font-mono text-sm focus:outline-none focus:border-primary"
            spellCheck={false}
          />

          {error && (
            <div className="mt-4 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-dark-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            <Save size={16} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function BackendConfig() {
  const [editingBackend, setEditingBackend] = useState(null);
  const queryClient = useQueryClient();

  const { data: registry, isLoading, error } = useQuery({
    queryKey: ['registry'],
    queryFn: getRegistry,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, config }) => updateBackend(id, config),
    onSuccess: () => {
      queryClient.invalidateQueries(['registry']);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBackend,
    onSuccess: () => {
      queryClient.invalidateQueries(['registry']);
    },
  });

  const startMutation = useMutation({
    mutationFn: startBackend,
    onSuccess: () => {
      queryClient.invalidateQueries(['registry']);
    },
  });

  const stopMutation = useMutation({
    mutationFn: stopBackend,
    onSuccess: () => {
      queryClient.invalidateQueries(['registry']);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading backends...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <div className="text-red-500 font-medium">Failed to load backends</div>
        <div className="text-red-400 text-sm mt-1">{error.message}</div>
      </div>
    );
  }

  const backends = Object.entries(registry?.backends || {}).map(([id, config]) => ({
    id,
    ...config,
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Backend Configuration</h1>
          <p className="text-gray-400">Manage your MCP backend servers</p>
        </div>

        <button
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          onClick={() => alert('Add Backend wizard coming soon!')}
        >
          <Plus size={20} />
          Add Backend
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {backends.length > 0 ? (
          backends.map((backend) => (
            <BackendCard
              key={backend.id}
              backend={backend}
              onEdit={(id, config) => setEditingBackend(config)}
              onDelete={(id) => {
                if (confirm(`Delete backend "${backend.name}"?`)) {
                  deleteMutation.mutate(id);
                }
              }}
              onStart={(id) => startMutation.mutate(id)}
              onStop={(id) => stopMutation.mutate(id)}
            />
          ))
        ) : (
          <div className="col-span-2 bg-dark-surface border border-dark-border rounded-lg p-12 text-center">
            <Server size={48} className="text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No backends configured</h3>
            <p className="text-gray-400 mb-6">Get started by adding your first MCP backend</p>
            <button
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors mx-auto"
              onClick={() => alert('Add Backend wizard coming soon!')}
            >
              <Plus size={20} />
              Add Backend
            </button>
          </div>
        )}
      </div>

      {editingBackend && (
        <EditModal
          backend={editingBackend}
          onSave={(id, config) => updateMutation.mutate({ id, config })}
          onClose={() => setEditingBackend(null)}
        />
      )}
    </div>
  );
}

export default BackendConfig;
