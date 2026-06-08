import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Status endpoints
export const getStatus = async () => {
  const response = await api.get('/status');
  return response.data;
};

// Config endpoints
export const getRegistry = async () => {
  const response = await api.get('/config');
  return response.data;
};

export const updateBackend = async (id, config) => {
  const response = await api.post('/config', { id, config });
  return response.data;
};

export const deleteBackend = async (id) => {
  const response = await api.delete(`/config/${id}`);
  return response.data;
};

// Backend control endpoints
export const startBackend = async (id) => {
  const response = await api.post(`/backends/${id}/start`);
  return response.data;
};

export const stopBackend = async (id) => {
  const response = await api.post(`/backends/${id}/stop`);
  return response.data;
};

export const testBackend = async (id) => {
  const response = await api.post(`/backends/${id}/test`);
  return response.data;
};

// Logs endpoint
export const getLogs = async (backendId = null, limit = 100) => {
  const params = { limit };
  if (backendId) params.backendId = backendId;
  const response = await api.get('/logs', { params });
  return response.data;
};

// SSE log streaming
export const streamLogs = (onMessage, onError) => {
  const eventSource = new EventSource('/api/logs/stream');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      console.error('Failed to parse log event:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    if (onError) onError(error);
    eventSource.close();
  };

  return () => eventSource.close();
};

// OAuth endpoints
export const startOAuth = async (provider) => {
  const response = await api.post(`/oauth/${provider}/start`);
  return response.data;
};

export const disconnectOAuth = async (provider) => {
  const response = await api.post(`/oauth/${provider}/disconnect`);
  return response.data;
};

export const getOAuthStatus = async () => {
  const response = await api.get('/oauth/status');
  return response.data;
};

// Environment variables
export const getEnvVars = async () => {
  const response = await api.get('/env');
  return response.data;
};

export const updateEnvVars = async (vars) => {
  const response = await api.post('/env', { vars });
  return response.data;
};

export default api;
