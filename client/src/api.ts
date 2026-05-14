import type { AdminStats, AuditEntry, RegisterPayload, User } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export type ApiSession = { token: string; user: User };

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any).message || 'Request failed');
  return data as T;
}

export const api = {
  register: (payload: RegisterPayload) =>
    request<{ message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  login: (email: string, password: string) =>
    request<ApiSession>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: (token: string) =>
    request<{ user: User }>('/me', {}, token),

  updateMe: (token: string, payload: Partial<User>) =>
    request<{ user: User }>('/me', { method: 'PATCH', body: JSON.stringify(payload) }, token),

  uploadAvatar: (token: string, file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return request<{ avatarUrl: string }>('/me/avatar', { method: 'POST', body: form }, token);
  },

  profiles: (token: string) =>
    request<{ profiles: User[] }>('/profiles', {}, token),

  swipe: (token: string, swipedId: number, action: 'like' | 'pass') =>
    request<{ matched: boolean }>('/swipes', { method: 'POST', body: JSON.stringify({ swipedId, action }) }, token),

  matches: (token: string) =>
    request<{ matches: User[] }>('/matches', {}, token),

  pending: (token: string) =>
    request<{ pending: User[] }>('/admin/pending', {}, token),

  users: (token: string) =>
    request<{ users: User[] }>('/admin/users', {}, token),

  stats: (token: string) =>
    request<AdminStats>('/admin/stats', {}, token),

  auditLog: (token: string, limit = 50) =>
    request<{ log: AuditEntry[] }>(`/admin/audit?limit=${limit}`, {}, token),

  decision: (token: string, id: number, decision: 'approve' | 'reject', note: string) =>
    request<{ user: User }>(`/admin/users/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) }, token),

  deleteUser: (token: string, id: number) =>
    request<{ success: boolean }>(`/admin/users/${id}`, { method: 'DELETE' }, token),

  changeRole: (token: string, id: number, role: 'admin' | 'student') =>
    request<{ user: User }>(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }, token),
};
