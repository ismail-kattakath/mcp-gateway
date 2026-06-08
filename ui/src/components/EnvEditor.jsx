import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Plus, Trash2, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { getEnvVars, updateEnvVars } from '../api/client';

function EnvVarRow({ name, value, onUpdate, onDelete, isSecret }) {
  const [isEditing, setIsEditing] = useState(false);
  const [showValue, setShowValue] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    onUpdate(name, editValue);
    setIsEditing(false);
  };

  const displayValue = isSecret && !showValue ? '••••••••••••' : value;

  return (
    <div className="flex items-center gap-3 p-3 bg-dark-hover rounded-lg">
      <div className="flex-1 grid grid-cols-2 gap-3">
        <div className="font-mono text-sm text-white">{name}</div>
        {isEditing ? (
          <input
            type={isSecret && !showValue ? 'password' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-white text-sm font-mono focus:outline-none focus:border-primary"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setIsEditing(false);
            }}
          />
        ) : (
          <div className="font-mono text-sm text-gray-400 flex items-center gap-2">
            {displayValue}
            {isSecret && (
              <button
                onClick={() => setShowValue(!showValue)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <button
              onClick={handleSave}
              className="px-2 py-1 bg-green-500/10 text-green-500 rounded hover:bg-green-500/20 transition-colors text-sm"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-2 py-1 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition-colors text-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="px-2 py-1 bg-blue-500/10 text-blue-500 rounded hover:bg-blue-500/20 transition-colors text-sm"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(name)}
              className="px-2 py-1 bg-red-500/10 text-red-500 rounded hover:bg-red-500/20 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EnvEditor() {
  const [newVarName, setNewVarName] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const queryClient = useQueryClient();

  const { data: envVars, isLoading, error } = useQuery({
    queryKey: ['env-vars'],
    queryFn: getEnvVars,
  });

  const updateMutation = useMutation({
    mutationFn: updateEnvVars,
    onSuccess: () => {
      queryClient.invalidateQueries(['env-vars']);
    },
  });

  const handleAddVar = () => {
    if (!newVarName.trim()) return;

    const updatedVars = {
      ...envVars,
      [newVarName]: newVarValue,
    };

    updateMutation.mutate(updatedVars);
    setNewVarName('');
    setNewVarValue('');
  };

  const handleUpdateVar = (name, value) => {
    const updatedVars = {
      ...envVars,
      [name]: value,
    };
    updateMutation.mutate(updatedVars);
  };

  const handleDeleteVar = (name) => {
    if (!confirm(`Delete environment variable "${name}"?`)) return;

    const updatedVars = { ...envVars };
    delete updatedVars[name];
    updateMutation.mutate(updatedVars);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading environment variables...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <div className="text-red-500 font-medium">Failed to load environment variables</div>
        <div className="text-red-400 text-sm mt-1">{error.message}</div>
      </div>
    );
  }

  const secretKeywords = ['TOKEN', 'SECRET', 'PASSWORD', 'KEY', 'API'];
  const isSecretVar = (name) =>
    secretKeywords.some((keyword) => name.toUpperCase().includes(keyword));

  const envEntries = Object.entries(envVars || {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Environment Variables</h1>
        <p className="text-gray-400">Manage environment variables for backend configuration</p>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-400">
            <div className="font-medium mb-1">Security Warning</div>
            <div>
              These variables are stored in the .env file on the gateway server.
              Never commit the .env file to version control. Secret values are masked by default.
            </div>
          </div>
        </div>
      </div>

      {/* Add new variable */}
      <div className="bg-dark-surface border border-dark-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Plus size={20} />
          Add New Variable
        </h2>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <input
            type="text"
            placeholder="Variable name (e.g., API_KEY)"
            value={newVarName}
            onChange={(e) => setNewVarName(e.target.value.toUpperCase().replace(/\s/g, '_'))}
            className="bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-primary"
          />
          <input
            type={isSecretVar(newVarName) ? 'password' : 'text'}
            placeholder="Variable value"
            value={newVarValue}
            onChange={(e) => setNewVarValue(e.target.value)}
            className="bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddVar();
            }}
          />
        </div>

        <button
          onClick={handleAddVar}
          disabled={!newVarName.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={16} />
          Add Variable
        </button>
      </div>

      {/* Variable list */}
      <div className="bg-dark-surface border border-dark-border rounded-lg">
        <div className="p-6 border-b border-dark-border">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings size={24} />
            Current Variables
          </h2>
        </div>

        <div className="p-6">
          {envEntries.length > 0 ? (
            <div className="space-y-2">
              {envEntries.map(([name, value]) => (
                <EnvVarRow
                  key={name}
                  name={name}
                  value={value}
                  onUpdate={handleUpdateVar}
                  onDelete={handleDeleteVar}
                  isSecret={isSecretVar(name)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              No environment variables configured yet
            </div>
          )}
        </div>
      </div>

      {/* Variable syntax help */}
      <div className="bg-dark-surface border border-dark-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Variable Syntax</h2>
        <div className="space-y-3 text-sm text-gray-400">
          <div>
            In your backend configuration, reference environment variables using{' '}
            <code className="px-2 py-1 bg-dark-bg text-primary font-mono rounded">
              ${'{'}VARIABLE_NAME{'}'}
            </code>
          </div>
          <div className="bg-dark-bg p-4 rounded-lg font-mono text-xs text-gray-300">
            <div className="text-gray-500">// Example backend config:</div>
            <div className="mt-2">
              "runtime": {'{'}"env": {'{'}"GITHUB_TOKEN": "${'{'} GITHUB_ACCESS_TOKEN{'}'}"
              {'}'}
              {'}'}
            </div>
          </div>
          <div className="mt-4">
            <div className="font-medium text-white mb-2">Special variables:</div>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <code className="text-primary">${'{'} HOME{'}'}</code> - User home directory
              </li>
              <li>
                <code className="text-primary">${'{'} REPO_DIR{'}'}</code> - Backend's git repo
                directory (for git-* types)
              </li>
              <li>
                <code className="text-primary">${'{'} GATEWAY_DIR{'}'}</code> - Gateway
                installation directory
              </li>
              <li>
                <code className="text-primary">${'{'} GITHUB_ACCESS_TOKEN{'}'}</code> -
                Auto-managed by OAuth flow
              </li>
              <li>
                <code className="text-primary">${'{'} SMITHERY_ACCESS_TOKEN{'}'}</code> -
                Auto-managed by OAuth flow
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnvEditor;
