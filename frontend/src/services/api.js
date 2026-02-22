// Fixed to use Vite's import.meta.env instead of process.env
const BASE = import.meta.env.VITE_APP_API_URL || 'http://localhost:5000/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const analyzeJob  = (body)     => request('POST', '/analyze', body);
export const checkHealth = ()         => request('GET',  '/health');
export const createJob   = (body)     => request('POST', '/jobs', body);
export const getJobs     = (params)   => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request('GET', `/jobs${qs}`);
};
export const updateJob   = (id, body) => request('PATCH', `/jobs/${id}`, body);
export const deleteJob   = (id)       => request('DELETE', `/jobs/${id}`);
export const getAnalytics = ()        => request('GET', '/analytics');

export const scanEmails   = (body)    => request('POST', '/email/scan', body);

export const searchJobs   = (body)    => request('POST', '/search/jobs', body);
export const parseResume  = (text)    => request('POST', '/search/resume', { resumeText: text });