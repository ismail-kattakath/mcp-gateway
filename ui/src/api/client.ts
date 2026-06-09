import axios, { AxiosInstance } from 'axios';

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export const getStatus = async (): Promise<any> => (await api.get('/status')).data;
export const getRegistry = async (): Promise<any> => (await api.get('/config')).data;
export const getVersion = async (): Promise<any> => (await api.get('/version')).data;

export const startServer = async (name: string): Promise<any> =>
  (await api.post(`/servers/${name}/start`)).data;
export const stopServer = async (name: string): Promise<any> =>
  (await api.post(`/servers/${name}/stop`)).data;

export const getLogs = async (
  serverName: string | null = null,
  limit: number = 100
): Promise<any> => {
  const url = serverName ? `/logs/${serverName}` : '/logs';
  const response = await api.get(url, { params: { limit } });
  return response.data;
};

export default api;
