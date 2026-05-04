// ═══════════════════════════════════════════════════════════════════════════════
// Hausdorff CRM — Telegram Bot v2.1
// סוכן AI להזנת אנשי קשר ונכסים דרך טלגרם
// גרסה מתוקנת: תיקון באג כפתור דלג + שיפורים
// ═══════════════════════════════════════════════════════════════════════════════

const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// ── הגדרות ─────────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CRM_API_URL = process.env.CRM_API_URL || 'https://hausdorff-crm-backend-production.up.railway.app';
const CRM_EMAIL = process.env.CRM_EMAIL || 'rafi@hausdorff.co.il';
const CRM_PASSWORD = process.env.CRM_PASSWORD || 'Rafi123';

const ALLOWED_USERS = process.env.ALLOWED_TELEGRAM_IDS
  ? process.env.ALLOWED_TELEGRAM_IDS.split(',').map(id => parseInt(id.trim()))
  : [];

if (!TELEGRAM_TOKEN) {
  console.error('❌ חסר TELEGRAM_BOT_TOKEN!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
console.log('🤖 הבוט עלה בהצלחה! (v2.1)');

const sessions = {};
let crmToken = null;
let tokenExpiry = 0;

// ── שדות קריטיים ─────────────────────────────────────────────────────────────
const CRITICAL_FIELDS = [
  {
    key: 'preferred_property_types',
    check: (d) => !d.preferred_property_types || d.preferred_property_types.length === 0,
    question: '🏢 מה מחפש?',
    options: [
      [{ text: 'חנות', callback_data: 'f_pt_חנות' }, { text: 'מרלו"ג', callback_data: 'f_pt_מרלוג' }],
      [{ text: 'משרד', callback_data: 'f_pt_משרד' }, { text: 'קרקע', callback_data: 'f_pt_קרקע' }],
      [{ text: 'מבנה תעשייה', callback_data: 'f_pt_מבנה תעשייה' }, { text: 'דלג ⏭️', callback_data: 'f_skip' }]
    ]
  },
  {
    key: 'preferred_areas',
    check: (d) => !d.preferred_areas || d.preferred_areas.length === 0,
    question: '📍 באיזה אזור?',
    options: [
      [{ text: 'תל אביב', callback_data: 'f_ar_תל אביב' }, { text: 'ירושלים', callback_data: 'f_ar_ירושלים' }],
      [{ text: 'באר שבע', callback_data: 'f_ar_באר שבע' }, { text: 'חיפה', callback_data: 'f_ar_חיפה' }],
      [{ text: 'מרכז', callback_data: 'f_ar_מרכז' }, { text: 'דרום', callback_data: 'f_ar_דרום' }],
      [{ text: 'אחר ✏️', callback_data: 'f_ar_custom' }, { text: 'דלג ⏭️', callback_data: 'f_skip' }]
    ]
  },
  {
    key: 'budget_max',
    check: (d) => !d.budget_max || d.budget_max === 0,
    question: '💰 תקציב?',
    options: [
      [{ text: 'עד 5K/חודש', callback_data: 'f_bg_5000' }, { text: 'עד 10K/חודש', callback_data: 'f_bg_10000' }],
      [{ text: 'עד 20K/חודש', callback_data: 'f_bg_20000' }, { text: 'עד 50K/חודש', callback_data: 'f_bg_50000' }],
      [{ text: 'מעל 50K', callback_data: 'f_bg_100000' }, { text: 'רכישה', callback_data: 'f_bg_sale' }],
      [{ text: 'דלג ⏭️', callback_data: 'f_skip' }]
    ]
  },
  {
    key: 'email',
    check: (d) => !d.email,
    question: '📧 יש אימייל? כתוב או לחץ דלג',
    options: [[{ text: 'דלג ⏭️', callback_data: 'f_skip' }]],
    freeText: true
  }
];

// ── עזר ───────────────────────────────────────────────────────────────────────

function isAllowed(userId) {
  return ALLOWED_USERS.length === 0 || ALLOWED_USERS.includes(userId);
}

async function getCrmToken() {
  if (crmToken && Date.now() < tokenExpiry) return crmToken;
  try {
    const res = await fetch(`${CRM_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CRM_EMAIL, password: CRM_PASSWORD })
    });
    const data = await res.json();
    if (data.token) { crmToken = data.token; tokenExpiry = Date.now() + 6e8; return crmToken; }
    throw new Error(data.error || 'login failed');
  } catch (err) { console.error('CRM login error:', err.message); return null; }
}

async function crmRequest(method, endpoint, body) {
  const token = await getCrmToken();
  if (!token) throw new Error('לא ניתן להתחבר ל-CRM');
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  return (await fetch(`${CRM_API_URL}${endpoint}`, opts)).json();
}

function formatNumber(n) { return n.toLocaleString('he-IL'); }

// ── פרסור ─────────────────────────────────────────────────────────────────────

async function parseWithAI(text, mode) {
  if (!ANTHROPIC_API_KEY) return parseBasic(text, mode);
  const sys = mode === 'contact'
    ? `אתה מפרק טקסט חופשי בעברית לנתוני איש קשר. החזר JSON בלבד (בלי backticks):
{"first_name":"","last_name":"","phone":"05X-XXXXXXX","email":"","type":"משקיע/רוכש פוטנציאלי/שוכר פוטנציאלי/בעל נכס/שותף מתווך/יזם","company":"","role":"","budget_min":0,"budget_max":0,"preferred_areas":[],"preferred_property_types":[],"desired_yield":0,"source":"פנייה ישירה","notes":""}
תקציב: M=מיליון, K=אלף. אם חסר=ריק/0.`
    : `אתה מפרק טקסט חופשי בעברית לנתוני נכס. החזר JSON בלבד (בלי backticks):
{"address":"","city":"","neighborhood":"","type":"חנות/מרלוג/משרד/קרקע","deal_type":"השכרה/מכירה","price":0,"area":0,"floor":0,"total_floors":0,"parking":0,"has_tenant":false,"monthly_rent":0,"annual_yield":0,"description":"","status":"זמין"}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: sys, messages: [{ role: 'user', content: text }] })
    });
    const data = await res.json();
    return JSON.parse((data.content?.[0]?.text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
  } catch (err) { console.error('AI error:', err.message); return parseBasic(text, mode); }
}

function parseBasic(text, mode) {
  if (mode !== 'contact') return { address:'',city:'',neighborhood:'',type:'חנות',deal_type:'השכרה',price:0,area:0,description:text,status:'זמין' };
  const phone = text.match(/0\d{1,2}[-\s]?\d{7,8}/)?.[0]?.replace(/\s/g,'') || '';
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || '';
  let type = 'רוכש פוטנציאלי';
  if (/משקיע/.test(text)) type='משקיע'; else if (/שוכר/.test(text)) type='שוכר פוטנציאלי';
  else if (/בעל.?נכס|בעלים/.test(text)) type='בעל נכס'; else if (/מתווך/.test(text)) type='שותף מתווך';
  else if (/יזם/.test(text)) type='יזם';
  let budget_max = 0;
  const bm = text.match(/תקציב[^\d]*(\d+(?:\.\d+)?)\s*(M|מיליון|K|אלף)?/i);
  if (bm) { budget_max = parseFloat(bm[1]); if (/M|מיליון/i.test(bm[2])) budget_max*=1e6; else if (/K|אלף/i.test(bm[2])) budget_max*=1e3; }
  const areas = [];
  ['תל אביב','ירושלים','חיפה','באר שבע','נתניה','אשדוד','פתח תקווה','ראשון לציון','הרצליה','רמת גן',
   'אשקלון','רחובות','נתיבות','אופקים','בית שמש','מודיעין','דרום','מרכז','צפון'].forEach(a => { if (text.includes(a)) areas.push(a); });
  const propTypes = [];
  if (/חנו[תיות]/.test(text)) propTypes.push('חנות');
  if (/מרלו"?ג/.test(text)) propTypes.push('מרלו"ג');
  if (/משרד/.test(text)) propTypes.push('משרד');
  if (/קרקע/.test(text)) propTypes.push('קרקע');
  const companyMatch = text.match(/חברת\s+(\S+)/);
  const nameClean = text.replace(/0\d{1,2}[-\s]?\d{7,8}/,'').replace(/[\w.+-]+@[\w-]+\.[\w.]+/,'')
    .replace(/תקציב[^\n]*/i,'').replace(/משקיע|שוכר|רוכש|בעל נכס|מתווך|יזם/g,'').replace(/מחפש[^\n]*/i,'').replace(/חברת\s+\S+/g,'').trim();
  const np = nameClean.split(/\s+/).filter(w=>w.length>1).slice(0,2);
  return { first_name:np[0]||'', last_name:np[1]||'', phone, email, type, company:companyMatch?companyMatch[1]:'', role:'',
    budget_min:0, budget_max, preferred_areas:areas, preferred_property_types:propTypes, desired_yield:0, source:'פנייה ישירה', notes:text };
}

// ── פורמט ─────────────────────────────────────────────────────────────────────

function formatContact(d) {
  let m = `👤 *איש קשר חדש*\n\n*שם:* ${d.first_name} ${d.last_name}\n`;
  if (d.phone) m += `*טלפון:* ${d.phone}\n`;
  if (d.email) m += `*אימייל:* ${d.email}\n`;
  m += `*סוג:* ${d.type}\n`;
  if (d.company) m += `*חברה:* ${d.company}\n`;
  if (d.role) m += `*תפקיד:* ${d.role}\n`;
  if (d.budget_max > 0) m += `*תקציב:* עד ${formatNumber(d.budget_max)} ₪\n`;
  if (d.preferred_areas?.length) m += `*אזורים:* ${d.preferred_areas.join(', ')}\n`;
  if (d.preferred_property_types?.length) m += `*סוגי נכסים:* ${d.preferred_property_types.join(', ')}\n`;
  return m;
}

function formatProperty(d) {
  let m = `🏢 *נכס חדש*\n\n`;
  if (d.address) m += `*כתובת:* ${d.address}\n`;
  if (d.city) m += `*עיר:* ${d.city}\n`;
  m += `*סוג:* ${d.type}\n*עסקה:* ${d.deal_type}\n`;
  if (d.price > 0) m += `*מחיר:* ${formatNumber(d.price)} ₪\n`;
  if (d.area > 0) m += `*שטח:* ${d.area} מ"ר\n`;
  return m;
}

// ── שאלות חכמות (עם תמיכה בדילוג) ───────────────────────────────────────────

function getNextMissing(data, skipped) {
  const skippedKeys = skipped || [];
  for (const f of CRITICAL_FIELDS) {
    if (f.check(data) && !skippedKeys.includes(f.key)) return f;
  }
  return null;
}

function askNext(chatId, session) {
  const missing = getNextMissing(session.data, session.skipped);
  if (!missing) { saveToCRM(chatId, session); return; }
  session.waitingFor = missing.key;
  session.freeText = missing.freeText || false;
  bot.sendMessage(chatId, missing.question, { reply_markup: { inline_keyboard: missing.options } });
}

async function saveToCRM(chatId, session) {
  try {
    const d = session.data;
    if (session.mode === 'contact') {
      const result = await crmRequest('POST', '/api/contacts', {
        first_name: d.first_name||'', last_name: d.last_name||'', phone: d.phone||'', email: d.email||'',
        type: d.type||'רוכש פוטנציאלי', contact_category:'contact', lead_status:'new',
        source: d.source||'פנייה ישירה', company: d.company||'', role: d.role||'',
        budget_min: d.budget_min||0, budget_max: d.budget_max > 0 ? d.budget_max : 0,
        preferred_areas: JSON.stringify(d.preferred_areas||[]),
        preferred_property_types: JSON.stringify(d.preferred_property_types||[]),
        desired_yield: d.desired_yield||0, notes: d.notes||'', status:'פעיל'
      });
      if (result.id) {
        bot.sendMessage(chatId, `✅ *${d.first_name} ${d.last_name}* נוסף ל-CRM!\n\n` + formatContact(d), { parse_mode:'Markdown' });
      } else throw new Error(result.error||'שגיאה');
    } else {
      const result = await crmRequest('POST', '/api/properties', {
        address:d.address||'', city:d.city||'', neighborhood:d.neighborhood||'',
        type:d.type||'חנות', deal_type:d.deal_type||'השכרה', status:'זמין',
        price:d.price||0, area:d.area||0, floor:d.floor||0, total_floors:d.total_floors||0,
        parking:d.parking||0, has_tenant:d.has_tenant||false,
        monthly_rent:d.monthly_rent||0, annual_yield:d.annual_yield||0, description:d.description||''
      });
      if (result.id) bot.sendMessage(chatId, `✅ נכס חדש נוסף ל-CRM!`, { parse_mode:'Markdown' });
      else throw new Error(result.error||'שגיאה');
    }
  } catch (err) { bot.sendMessage(chatId, `❌ שגיאה: ${err.message}`); }
  delete sessions[chatId];
}

// ── פקודות ────────────────────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(msg.chat.id,
    `🏠 *HAUSDORFF CRM Bot v2.1*\n\n` +
    `שלח הודעה חופשית ואני אוסיף ל-CRM.\n\n` +
    `*דוגמאות:*\n` +
    `_"יוסי כהן 054-1234567 משקיע תקציב 5M חנויות באר שבע"_\n` +
    `_"דני 052-9876543 שוכר"_ → אשאל מה חסר\n` +
    `_"/נכס חנות 85 מר גני אביב 12K"_\n\n` +
    `ככל שתכתוב יותר → פחות שאלות 😊`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(msg.chat.id,
    `📖 *עזרה*\n\n` +
    `*מינימום:* _"שם + טלפון + סוג"_ → הבוט ישאל השאר\n` +
    `*מקסימום:* _"שם טלפון סוג חברה תקציב אזור סוג-נכס אימייל"_ → שמירה ישרה\n\n` +
    `*נכס:* התחל עם /נכס\n` +
    `*דלג:* תמיד אפשר לדלג על שאלה`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `🆔 מזהה: \`${msg.from.id}\``, { parse_mode:'Markdown' });
});

// ── נכס ───────────────────────────────────────────────────────────────────────

bot.onText(/^\/נכס\s+(.+)/s, async (msg, match) => {
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '⏳ מעבד...');
  try {
    const parsed = await parseWithAI(match[1], 'property');
    sessions[chatId] = { mode:'property', data:parsed, skipped:[] };
    bot.sendMessage(chatId, formatProperty(parsed) + '\n*נכון?*', {
      parse_mode:'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '✅ שמור', callback_data: 'confirm_save' },
        { text: '❌ ביטול', callback_data: 'cancel' }
      ]]}
    });
  } catch (err) { bot.sendMessage(chatId, `❌ ${err.message}`); }
});

// ── הודעה חופשית ──────────────────────────────────────────────────────────────

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  if (text.length < 3) return;

  // תשובה בטקסט חופשי לשאלה (אימייל / אזור מותאם)
  const session = sessions[chatId];
  if (session && session.freeText && session.waitingFor) {
    if (session.waitingFor === 'email') {
      const em = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      session.data.email = em ? em[0] : text;
      bot.sendMessage(chatId, `📧 ${session.data.email}`);
    } else if (session.waitingFor === 'preferred_areas') {
      session.data.preferred_areas = [text];
      bot.sendMessage(chatId, `📍 ${text}`);
    }
    session.waitingFor = null; session.freeText = false;
    askNext(chatId, session);
    return;
  }

  bot.sendMessage(chatId, '⏳ מעבד...');
  try {
    const parsed = await parseWithAI(text, 'contact');
    if (!parsed.first_name && !parsed.last_name) {
      bot.sendMessage(chatId, '🤔 לא זיהיתי שם. נסה: _"יוסי כהן 054-1234567 משקיע"_', { parse_mode:'Markdown' });
      return;
    }
    sessions[chatId] = { mode:'contact', data:parsed, skipped:[] };

    const hasMissing = !!getNextMissing(parsed, []);

    const buttons = hasMissing
      ? [[{ text: '✅ אישור + השלמת פרטים', callback_data: 'confirm_ask' },
          { text: '✅ שמור ישר', callback_data: 'confirm_save' }],
         [{ text: '❌ ביטול', callback_data: 'cancel' }]]
      : [[{ text: '✅ שמור', callback_data: 'confirm_save' },
          { text: '❌ ביטול', callback_data: 'cancel' }]];

    bot.sendMessage(chatId, formatContact(parsed) + '\n*הנתונים נכונים?*', {
      parse_mode:'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (err) { bot.sendMessage(chatId, `❌ ${err.message}`); }
});

// ── כפתורים ───────────────────────────────────────────────────────────────────

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  const session = sessions[chatId];

  if (action === 'cancel') { delete sessions[chatId]; bot.answerCallbackQuery(query.id); bot.sendMessage(chatId, '🚫 בוטל.'); return; }
  if (!session) { bot.answerCallbackQuery(query.id, { text:'אין נתונים' }); return; }

  if (action === 'confirm_ask') {
    bot.answerCallbackQuery(query.id);
    const missing = getNextMissing(session.data, session.skipped);
    if (missing) {
      bot.sendMessage(chatId, '👍 עוד כמה שאלות קצרות:');
      askNext(chatId, session);
    } else {
      saveToCRM(chatId, session);
    }
    return;
  }

  if (action === 'confirm_save') { bot.answerCallbackQuery(query.id); saveToCRM(chatId, session); return; }

  // דילוג — שומר את השדה שדולגו כדי לא לשאול שוב
  if (action === 'f_skip') {
    bot.answerCallbackQuery(query.id, { text: 'דילוג ⏭️' });
    if (!session.skipped) session.skipped = [];
    if (session.waitingFor) session.skipped.push(session.waitingFor);
    session.waitingFor = null;
    session.freeText = false;
    askNext(chatId, session);
    return;
  }

  // סוג נכס
  if (action.startsWith('f_pt_')) {
    const v = action.slice(5);
    if (!session.data.preferred_property_types) session.data.preferred_property_types = [];
    session.data.preferred_property_types.push(v);
    bot.answerCallbackQuery(query.id, { text:v }); session.waitingFor=null; askNext(chatId,session); return;
  }

  // אזור
  if (action.startsWith('f_ar_')) {
    const v = action.slice(5);
    if (v === 'custom') { bot.answerCallbackQuery(query.id); session.freeText=true; bot.sendMessage(chatId, '✏️ כתוב אזור/עיר:'); return; }
    if (!session.data.preferred_areas) session.data.preferred_areas = [];
    session.data.preferred_areas.push(v);
    bot.answerCallbackQuery(query.id, { text:v }); session.waitingFor=null; askNext(chatId,session); return;
  }

  // תקציב
  if (action.startsWith('f_bg_')) {
    const v = action.slice(5);
    if (v === 'sale') { session.data.budget_max = -1; session.data.notes = (session.data.notes||'') + ' | רכישה'; }
    else session.data.budget_max = parseInt(v);
    bot.answerCallbackQuery(query.id); session.waitingFor=null; askNext(chatId,session); return;
  }
});

bot.on('polling_error', (err) => { if (!err.message?.includes('ETELEGRAM')) console.error('Poll:', err.message); });
process.on('uncaughtException', (err) => console.error('Error:', err));

console.log('🤖 HAUSDORFF CRM Bot v2.1 מוכן!');
console.log(`📡 ${CRM_API_URL}`);
console.log(`🧠 ${ANTHROPIC_API_KEY ? 'Claude AI' : 'Regex בסיסי'}`);
