let authErrorCallback: (() => void) | null = null;

export function setAuthErrorCallback(callback: () => void): void {
  authErrorCallback = callback;
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const urlObj = new URL(url, window.location.origin);
  const token = urlObj.searchParams.get('access_token') || localStorage.getItem('gateway_api_key');

  if (token && !options.headers) {
    options.headers = {
      Authorization: `Bearer ${token}`,
    };
  } else if (token && options.headers) {
    const headers = new Headers(options.headers);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    options.headers = headers;
  }

  const response = await fetch(url, options);

  if (response.status === 401 || response.status === 403) {
    if (authErrorCallback) {
      authErrorCallback();
    }
  }

  return response;
}

export default { fetchWithAuth, setAuthErrorCallback };
