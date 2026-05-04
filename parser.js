// ═══════════════════════════════════════════════════════════════════════
// parser.js — פרסור טקסט חופשי (AI + regex)
// ═══════════════════════════════════════════════════════════════════════

const fetch = require('node-fetch');
const config = require('./config');

async function parseContact(text) {
  if (config.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          system: `אתה מפרק טקסט בעברית לנתוני איש קשר. החזר JSON בלבד (בלי backticks):
{"first_name":"","last_name":"","phone":"","email":"","type":"","company":"","budget_max":0,"preferred_areas":[],"preferred_property_types":[],"source":"פנייה ישירה","notes":""}
סוגים: משקיע/רוכש פוטנציאלי/שוכר פוטנציאלי/בעל נכס/שותף מתווך/יזם. M=מיליון, K=אלף. חסר=ריק/0.`,
          messages: [{ role: 'user', content: text }]
        })
      });
      const d = await r.json();
      return JSON.parse((d.content?.[0]?.text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
    } catch (e) { console.error('AI parse:', e.message); }
  }
  return parseContactBasic(text);
}

function parseContactBasic(text) {
  const phone = text.match(/0\d{1,2}[-\s]?\d{7,8}/)?.[0]?.replace(/\s/g, '') || '';
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || '';
  let type = '';
  if (/משקיע/.test(text)) type = 'משקיע'; else if (/שוכר/.test(text)) type = 'שוכר פוטנציאלי';
  else if (/בעל.?נכס|בעלים/.test(text)) type = 'בעל נכס'; else if (/יזם/.test(text)) type = 'יזם';
  else if (/רוכש/.test(text)) type = 'רוכש פוטנציאלי';
  let budget_max = 0;
  const bm = text.match(/תקציב[^\d]*(\d+(?:\.\d+)?)\s*(M|מיליון|K|אלף)?/i);
  if (bm) { budget_max = parseFloat(bm[1]); if (/M|מיליון/i.test(bm[2])) budget_max *= 1e6; else if (/K|אלף/i.test(bm[2])) budget_max *= 1e3; }
  const areas = [], pts = [];
  ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'נתניה', 'אשדוד', 'הרצליה', 'נתיבות', 'אופקים', 'בית שמש', 'דרום', 'מרכז'].forEach(a => { if (text.includes(a)) areas.push(a); });
  if (/חנו[תיות]/.test(text)) pts.push('חנות'); if (/מרלו"?ג/.test(text)) pts.push('מרלו"ג');
  if (/משרד/.test(text)) pts.push('משרד'); if (/קרקע/.test(text)) pts.push('קרקע');
  const clean = text.replace(/0\d{1,2}[-\s]?\d{7,8}/, '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/, '')
    .replace(/תקציב[^\n]*/i, '').replace(/משקיע|שוכר|רוכש|בעל נכס|מתווך|יזם/g, '').replace(/מחפש[^\n]*/i, '').trim();
  const np = clean.split(/\s+/).filter(w => w.length > 1).slice(0, 2);
  return { first_name: np[0] || '', last_name: np[1] || '', phone, email, type, company: '',
    budget_min: 0, budget_max, preferred_areas: areas, preferred_property_types: pts, source: 'פנייה ישירה', notes: '' };
}

async function parseProperty(text) {
  if (config.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          system: `אתה מפרק טקסט בעברית לנתוני נכס. החזר JSON בלבד:
{"address":"","city":"","neighborhood":"","type":"חנות/מרלוג/משרד/קרקע","deal_type":"השכרה/מכירה","price":0,"area":0,"floor":0,"total_floors":0,"monthly_rent":0,"description":"","status":"זמין"}`,
          messages: [{ role: 'user', content: text }]
        })
      });
      const d = await r.json();
      return JSON.parse((d.content?.[0]?.text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
    } catch (e) { console.error('AI parse:', e.message); }
  }
  return { address: '', city: '', type: 'חנות', deal_type: 'השכרה', price: 0, area: 0, description: text, status: 'זמין' };
}

module.exports = { parseContact, parseProperty };
