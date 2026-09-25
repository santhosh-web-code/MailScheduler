export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:5000';

console.log('[API Client] Backend Base URL configured:', API_BASE_URL);

export interface ApiError extends Error {
  status?: number;
  statusText?: string;
  data?: any;
  isNetworkError?: boolean;
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  const token = localStorage.getItem('token');
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      credentials: 'include', // Ensure httpOnly cookies are dispatched with requests
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        errorData.message ||
        errorData.error ||
        (response.status === 401
          ? 'Authentication required (401 Unauthorized)'
          : response.status === 403
          ? 'Access forbidden (403)'
          : response.status === 404
          ? `Resource not found (404): ${endpoint}`
          : response.status >= 500
          ? `Backend server error (${response.status}): ${response.statusText}`
          : `API error ${response.status}: ${response.statusText}`);

      const err: ApiError = new Error(message);
      err.status = response.status;
      err.statusText = response.statusText;
      err.data = errorData;
      throw err;
    }

    return response.json();
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message?.toLowerCase().includes('fetch')) {
      const networkErr: ApiError = new Error(
        `Network error connecting to backend at ${API_BASE_URL} (${err.message}). Is the backend server running and CORS configured for ${window.location.origin}?`
      );
      networkErr.isNetworkError = true;
      console.error('[API Network Error]', {
        endpoint,
        targetUrl: `${API_BASE_URL}${endpoint}`,
        originalError: err,
      });
      throw networkErr;
    }
    throw err;
  }
}
