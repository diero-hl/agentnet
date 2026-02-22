const BASE = '/api';

async function fetchJSON(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

async function postJSON(path, data) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

async function patchJSON(path, data) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export const api = {
  dashboard: () => fetchJSON('/dashboard/overview'),
  agents: {
    list: (params) => fetchJSON(`/agents?${new URLSearchParams(params || {})}`),
    get: (id) => fetchJSON(`/agents/${id}`),
    stats: () => fetchJSON('/agents/stats'),
    create: (data) => postJSON('/agents', data),
    update: (id, data) => patchJSON(`/agents/${id}`, data),
  },
  tasks: {
    list: (params) => fetchJSON(`/tasks?${new URLSearchParams(params || {})}`),
    stats: () => fetchJSON('/tasks/stats'),
    create: (data) => postJSON('/tasks', data),
    updateStatus: (id, data) => patchJSON(`/tasks/${id}/status`, data),
  },
  payments: {
    list: (params) => fetchJSON(`/payments?${new URLSearchParams(params || {})}`),
    stats: () => fetchJSON('/payments/stats'),
    create: (data) => postJSON('/payments', data),
    verify: (id, data) => postJSON(`/payments/${id}/verify`, data),
  },
  reputation: {
    list: () => fetchJSON('/reputation'),
    leaderboard: () => fetchJSON('/reputation/leaderboard'),
    get: (agentId) => fetchJSON(`/reputation/${agentId}`),
  },
  registry: {
    list: () => fetchJSON('/registry'),
    create: (data) => postJSON('/registry', data),
  },
  xmtp: {
    list: (params) => fetchJSON(`/xmtp?${new URLSearchParams(params || {})}`),
    stats: () => fetchJSON('/xmtp/stats'),
    send: (data) => postJSON('/xmtp', data),
  },
};
