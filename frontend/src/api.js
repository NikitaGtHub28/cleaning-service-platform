const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const TOKEN_KEY = 'chisto-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

const convertKeys = (value, fn) => {
  if (Array.isArray(value)) return value.map((v) => convertKeys(v, fn));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [fn(k), convertKeys(v, fn)]));
  }
  return value;
};
const camelize = (v) => convertKeys(v, (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()));
const snakeize = (v) => convertKeys(v, (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`));

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(snakeize(body)) : undefined,
    });
  } catch {
    throw new Error('Не удалось связаться с сервером. Проверьте, что бэкенд запущен.');
  }

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }

  if (!res.ok) {
    if (res.status === 401 && auth && token) {
      setToken(null);
      onUnauthorized?.();
    }
    let message = 'Ошибка сервера';
    if (typeof data?.detail === 'string') message = data.detail;
    else if (Array.isArray(data?.detail)) message = data.detail.map((d) => d.msg).join('; ');
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return camelize(data);
}

const post = (path, body) => request(path, { method: 'POST', body });

export const api = {
  // auth
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (data) => request('/api/auth/register', { method: 'POST', body: data, auth: false }),
  me: () => request('/api/auth/me'),

  // каталог (публичный)
  catalog: ({ type, minRate, maxRate, sort, q } = {}) => {
    const p = new URLSearchParams();
    if (type && type !== 'all') p.set('type', type);
    if (minRate !== '' && minRate != null) p.set('min_rate', minRate);
    if (maxRate !== '' && maxRate != null) p.set('max_rate', maxRate);
    if (sort) p.set('sort', sort);
    if (q && q.trim()) p.set('q', q.trim());
    const qs = p.toString();
    return request(`/api/catalog/services${qs ? `?${qs}` : ''}`);
  },
  service: (id) => request(`/api/services/${id}`),
  company: (id) => request(`/api/companies/${id}`),

  // клиент
  createOrder: (data) => post('/api/orders', data),
  myOrders: () => request('/api/orders/my'),
  cancelOrder: (id) => post(`/api/orders/${id}/cancel`),
  leaveReview: (id, data) => post(`/api/orders/${id}/review`, data),

  // компания
  partnerProfile: () => request('/api/partner/profile'),
  updateProfile: (data) => request('/api/partner/profile', { method: 'PUT', body: data }),
  partnerServices: () => request('/api/partner/services'),
  createService: (data) => post('/api/partner/services', data),
  updateService: (id, data) => request(`/api/partner/services/${id}`, { method: 'PUT', body: data }),
  deleteService: (id) => request(`/api/partner/services/${id}`, { method: 'DELETE' }),
  partnerOrders: () => request('/api/partner/orders'),
  acceptOrder: (id) => post(`/api/partner/orders/${id}/accept`),
  rejectOrder: (id, reason) => post(`/api/partner/orders/${id}/reject`, { reason }),
  completeOrder: (id) => post(`/api/partner/orders/${id}/complete`),

  // админ
  adminCompanies: () => request('/api/admin/companies'),
  toggleCompany: (id) => post(`/api/admin/companies/${id}/toggle`),
  adminServices: () => request('/api/admin/services'),
  adminDeleteService: (id) => request(`/api/admin/services/${id}`, { method: 'DELETE' }),
  adminReviews: () => request('/api/admin/reviews'),
  adminDeleteReview: (id) => request(`/api/admin/reviews/${id}`, { method: 'DELETE' }),
};