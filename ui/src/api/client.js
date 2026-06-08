import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

export const getStatus = async () => (await api.get('/status')).data;
export const getRegistry = async () => (await api.get('/config')).data;

export const startServer = async (name) => (await api.post(`/servers/${name}/start`)).data;
export const stopServer = async (name) => (await api.post(`/servers/${name}/stop`)).data;

export const getLogs = async (serverName = null, limit = 100) => {
  const url = serverName ? `/logs/${serverName}` : '/logs';
  const response = await api.get(url, { params: { limit } });
  return response.data;
};

export default api;
