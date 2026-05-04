// ═══════════════════════════════════════════════════════════════════════
// picker.js — בניית כפתורי בחירה לישויות קיימות
// משמש את properties/tasks/meetings לקישור לאיש קשר/נכס/פרויקט/חברה
// ═══════════════════════════════════════════════════════════════════════

const crm = require('./crm');

const MAX_RECENT = 6; // 6 פריטים אחרונים

function shorten(s, max) {
  if (!s) return '';
  s = String(s);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ── מאגר labels — לתצוגה אחרי בחירה ─────────────────────────────────
// מיפוי: id → label, נשמר כדי שכשהמשתמש יבחר, נדע איך להציג בסיכום
const labels = {
  contacts: new Map(),
  properties: new Map(),
  projects: new Map(),
  companies: new Map()
};

function rememberLabel(kind, id, label) {
  labels[kind]?.set(id, label);
}
function getLabel(kind, id) {
  return labels[kind]?.get(id) || '';
}

// ── אנשי קשר ─────────────────────────────────────────────────────────
async function buttonsForContacts() {
  const list = await crm.getContacts();
  if (!list || list.length === 0) return [];
  // ממיין לפי created_at יורד (אם קיים), ולוקח 6 ראשונים
  const sorted = list.slice().sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));
  const top = sorted.slice(0, MAX_RECENT);
  const rows = top.map(c => {
    const name = `${c.first_name||''} ${c.last_name||''}`.trim() || 'ללא שם';
    rememberLabel('contacts', c.id, name);
    return [{ text: `👤 ${shorten(name, 30)}${c.phone ? ' — ' + c.phone : ''}`, val: c.id }];
  });
  return rows;
}

// ── נכסים ───────────────────────────────────────────────────────────
async function buttonsForProperties() {
  const list = await crm.getProperties();
  if (!list || list.length === 0) return [];
  const sorted = list.slice().sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));
  const top = sorted.slice(0, MAX_RECENT);
  const rows = top.map(p => {
    const lbl = `${p.type||'נכס'} ${p.city||''}${p.address ? ' — ' + p.address : ''}`.trim();
    rememberLabel('properties', p.id, lbl);
    return [{ text: `🏢 ${shorten(lbl, 38)}`, val: p.id }];
  });
  return rows;
}

// ── פרויקטים ────────────────────────────────────────────────────────
async function buttonsForProjects() {
  const list = await crm.getProjects();
  if (!list || list.length === 0) return [];
  const top = list.slice(0, MAX_RECENT);
  const rows = top.map(p => {
    const lbl = `${p.name||''}${p.city ? ' — ' + p.city : ''}`.trim();
    rememberLabel('projects', p.id, lbl);
    return [{ text: `🏗️ ${shorten(lbl, 38)}`, val: p.id }];
  });
  return rows;
}

// ── חברות ───────────────────────────────────────────────────────────
async function buttonsForCompanies() {
  const list = await crm.getCompanies();
  if (!list || list.length === 0) return [];
  const top = list.slice(0, MAX_RECENT);
  const rows = top.map(c => {
    const lbl = c.name || 'חברה';
    rememberLabel('companies', c.id, lbl);
    return [{ text: `🏗️ ${shorten(lbl, 38)}`, val: c.id }];
  });
  return rows;
}

module.exports = {
  buttonsForContacts,
  buttonsForProperties,
  buttonsForProjects,
  buttonsForCompanies,
  rememberLabel,
  getLabel
};
