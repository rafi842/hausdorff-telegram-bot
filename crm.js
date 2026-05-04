const fetch = require('node-fetch');
const config = require('./config');
let token = null, tokenExpiry = 0;

async function login() {
  if (token && Date.now() < tokenExpiry) return token;
  try {
    const r = await fetch(`${config.CRM_API_URL}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.CRM_EMAIL, password: config.CRM_PASSWORD })
    });
    const d = await r.json();
    if (d.token) { token = d.token; tokenExpiry = Date.now() + 6e8; return token; }
  } catch (e) { console.error('CRM login:', e.message); }
  return null;
}

async function request(method, endpoint, body) {
  const t = await login();
  if (!t) throw new Error('לא ניתן להתחבר ל-CRM');
  const o = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` } };
  if (body) o.body = JSON.stringify(body);
  return (await fetch(`${config.CRM_API_URL}${endpoint}`, o)).json();
}

// ── ניסיון רך: אם השרת לא מחזיר מערך, החזר [] ──
async function safeList(endpoint) {
  try {
    const res = await request('GET', endpoint);
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.data)) return res.data;
    if (res && Array.isArray(res.items)) return res.items;
    return [];
  } catch (e) { return []; }
}

module.exports = {
  request,

  // create
  createContact:   (d) => request('POST', '/api/contacts', d),
  createProperty:  (d) => request('POST', '/api/properties', d),
  createTask:      (d) => request('POST', '/api/tasks', d),
  createCompany:   (d) => request('POST', '/api/companies', d),
  createMeeting:   (d) => request('POST', '/api/meetings', d),

  // update
  updateContact:   (id, d) => request('PUT', `/api/contacts/${id}`, d),
  updateProperty:  (id, d) => request('PUT', `/api/properties/${id}`, d),
  updateTask:      (id, d) => request('PUT', `/api/tasks/${id}`, d),
  completeTask:    (id, notes) => request('PUT', `/api/tasks/${id}`, { completed: 1, completion_notes: notes || '' }),
  postponeTask:    (id, newDate, reason) => request('PUT', `/api/tasks/${id}`, { due_date: newDate, postponed_reason: reason || 'נדחה דרך הבוט' }),

  // list/search
  getContacts:        () => safeList('/api/contacts'),
  getProperties:      () => safeList('/api/properties'),
  getTasks:           () => safeList('/api/tasks'),
  getProjects:        () => safeList('/api/projects'),
  getCompanies:       () => safeList('/api/companies'),
  getMeetings:        () => safeList('/api/meetings'),
  searchContacts:     (q) => safeList(`/api/contacts?search=${encodeURIComponent(q)}`),
  searchCompanies:    (q) => safeList(`/api/companies?search=${encodeURIComponent(q)}`),
  searchProperties:   (q) => safeList(`/api/properties?search=${encodeURIComponent(q)}`),
  searchProjects:     (q) => safeList(`/api/projects?search=${encodeURIComponent(q)}`),
};
