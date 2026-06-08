/**
 * HTTP Auth Interceptor
 *
 * Detects 401/403 responses and triggers the unauthorized help page.
 */

let authErrorCallback = null;

export function setAuthErrorCallback(callback) {
  authErrorCallback = callback;
}

export async function fetchWithAuth(url, options = {}) {
  // Automatically add Bearer token from query params or localStorage if available
  const urlObj = new URL(url, window.location.origin);
  const token = urlObj.searchParams.get('access_token') || localStorage.getItem('gateway_api_key');

  if (token && !options.headers?.Authorization) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`
    };
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
