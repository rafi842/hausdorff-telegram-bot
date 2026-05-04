// ═══════════════════════════════════════════════════════════════════════
// crm.js — חיבור למערכת CRM
// כל הבקשות ל-API עוברות דרך כאן
// ═══════════════════════════════════════════════════════════════════════

const fetch = require('node-fetch');
const config = require('./config');

let token = null;
let tokenExpiry = 0;

async function login() {
  if (token && Date.now() < tokenExpiry) return token;
  try {
    const res = await fetch(`${config.CRM_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.CRM_EMAIL, password: config.CRM_PASSWORD })
    });
    const data = await res.json();
    if (data.token) {
      token = data.token;
      tokenExpiry = Date.now() + 6e8;
      return token;
    }
    throw new Error(data.error || 'login failed');
  } catch (e) {
    console.error('CRM login:', e.message);
    return null;
  }
}

async function request(method, endpoint, body) {
  const t = await login();
  if (!t) throw new Error('לא ניתן להתחבר ל-CRM');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` }
  };
  if (body) opts.body = JSON.stringify(body);
  return (await fetch(`${config.CRM_API_URL}${endpoint}`, opts)).json();
}

// פונקציות נוחות
async function createContact(data) { return request('POST', '/api/contacts', data); }
async function createProperty(data) { return request('POST', '/api/properties', data); }
async function getContacts() { return request('GET', '/api/contacts'); }
async function getProperties() { return request('GET', '/api/properties'); }

module.exports = { request, createContact, createProperty, getContacts, getProperties };
