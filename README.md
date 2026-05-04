// ═══════════════════════════════════════════════════════════════════════════════
// Hausdorff CRM — Telegram Bot v3.1
// תיקון: callback parsing, צירוף אנשי קשר, דלג
// ═══════════════════════════════════════════════════════════════════════════════

const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CRM_API_URL = process.env.CRM_API_URL || 'https://hausdorff-crm-backend-production.up.railway.app';
const CRM_EMAIL = process.env.CRM_EMAIL || 'rafi@hausdorff.co.il';
const CRM_PASSWORD = process.env.CRM_PASSWORD || 'Rafi123';
const ALLOWED_USERS = process.env.ALLOWED_TELEGRAM_IDS
  ? process.env.ALLOWED_TELEGRAM_IDS.split(',').map(id => parseInt(id.trim())) : [];

if (!TELEGRAM_TOKEN) { console.error('❌ חסר TELEGRAM_BOT_TOKEN!'); process.exit(1); }

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const sessions = {};
let crmToken = null;
let tokenExpiry = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// שאלון — קודים קצרים בלי קו תחתון
// ═══════════════════════════════════════════════════════════════════════════════
// כל שאלה מזוהה ב-code קצר (tp, pp, pa, bg, em, co, nt)
// callback_data = CODE:VALUE — מפוצל לפי נקודתיים, לא קו תחתון

const QUESTIONS = [
  {
    code: 'tp', dbKey: 'type',
    check: d => !d.type,
    question: '👤 מה סוג איש הקשר?',
    buttons: [
      [{ text: 'משקיע', val: 'משקיע' }, { text: 'יזם', val: 'יזם' }],
      [{ text: 'שוכר', val: 'שוכר פוטנציאלי' }, { text: 'רוכש', val: 'רוכש פוטנציאלי' }],
      [{ text: 'בעל נכס', val: 'בעל נכס' }, { text: 'מתווך', val: 'שותף מתווך' }]
    ]
  },
  {
    code: 'pp', dbKey: 'preferred_property_types',
    check: d => !d.preferred_property_types || d.preferred_property_types.length === 0,
    question: '🏢 מה מחפש?',
    buttons: [
      [{ text: 'חנות', val: 'חנות' }, { text: 'מרלו"ג', val: 'מרלוג' }],
      [{ text: 'משרד', val: 'משרד' }, { text: 'קרקע', val: 'קרקע' }],
      [{ text: 'מבנה תעשייה', val: 'מבנה תעשייה' }]
    ],
    isArray: true
  },
  {
    code: 'pa', dbKey: 'preferred_areas',
    check: d => !d.preferred_areas || d.preferred_areas.length === 0,
    question: '📍 באיזה אזור?',
    buttons: [
      [{ text: 'תל אביב', val: 'תל אביב' }, { text: 'ירושלים', val: 'ירושלים' }],
      [{ text: 'באר שבע', val: 'באר שבע' }, { text: 'חיפה', val: 'חיפה' }],
      [{ text: 'מרכז', val: 'מרכז' }, { text: 'דרום', val: 'דרום' }],
      [{ text: 'אחר ✏️', val: 'CUSTOM' }]
    ],
    isArray: true,
    customPrompt: '✏️ כתוב אזור/עיר:'
  },
  {
    code: 'bg', dbKey: 'budget_max',
    check: d => !d.budget_max || d.budget_max === 0,
    question: '💰 תקציב?',
    buttons: [
      [{ text: 'עד 5K/חודש', val: '5000' }, { text: 'עד 10K/חודש', val: '10000' }],
      [{ text: 'עד 20K/חודש', val: '20000' }, { text: 'עד 50K/חודש', val: '50000' }],
      [{ text: 'סכום אחר ✏️', val: 'CUSTOM' }, { text: 'רכישה', val: 'SALE' }]
    ],
    customPrompt: '✏️ כתוב סכום (למשל: 15000, 80K, 5M):'
  },
  {
    code: 'em', dbKey: 'email',
    check: d => !d.email,
    question: '📧 אימייל? כתוב או דלג',
    buttons: [],
    freeText: true,
    validate: text => { const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/); return m ? m[0] : null; },
    errorMsg: '🤔 לא נראה כאימייל. נסה שוב או הקלד "דלג"'
  },
  {
    code: 'co', dbKey: 'company',
    check: d => !d.company,
    question: '🏗️ חברה? כתוב או דלג',
    buttons: [],
    freeText: true
  },
  {
    code: 'nt', dbKey: 'notes',
    check: d => !d._notesAsked,
    question: '📝 הערות? כתוב או דלג',
    buttons: [],
    freeText: true
  }
];

// מיפוי code → שאלה
const Q_BY_CODE = {};
QUESTIONS.forEach(q => { Q_BY_CODE[q.code] = q; });

// ═══════════════════════════════════════════════════════════════════════════════
// CRM
// ═══════════════════════════════════════════════════════════════════════════════
function isAllowed(id) { return ALLOWED_USERS.length === 0 || ALLOWED_USERS.includes(id); }

async function getCrmToken() {
  if (crmToken && Date.now() < tokenExpiry) return crmToken;
  try {
    const r = await fetch(`${CRM_API_URL}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CRM_EMAIL, password: CRM_PASSWORD })
    });
    const d = await r.json();
    if (d.token) { crmToken = d.token; tokenExpiry = Date.now() + 6e8; return crmToken; }
  } catch (e) { console.error('CRM login:', e.message); }
  return null;
}

async function crmRequest(method, endpoint, body) {
  const t = await getCrmToken();
  if (!t) throw new Error('לא ניתן להתחבר ל-CRM');
  const o = { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` } };
  if (body) o.body = JSON.stringify(body);
  return (await fetch(`${CRM_API_URL}${endpoint}`, o)).json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// פרסור הודעה חופשית
// ═══════════════════════════════════════════════════════════════════════════════
async function parseContact(text) {
  if (ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
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
    } catch (e) { console.error('AI:', e.message); }
  }
  // fallback regex
  const phone = text.match(/0\d{1,2}[-\s]?\d{7,8}/)?.[0]?.replace(/\s/g, '') || '';
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || '';
  let type = '';
  if (/משקיע/.test(text)) type = 'משקיע'; else if (/שוכר/.test(text)) type = 'שוכר פוטנציאלי';
  else if (/בעל.?נכס|בעלים/.test(text)) type = 'בעל נכס'; else if (/יזם/.test(text)) type = 'יזם';
  else if (/רוכש/.test(text)) type = 'רוכש פוטנציאלי';
  const areas = [], pts = [];
  ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'נתניה', 'אשדוד', 'הרצליה', 'נתיבות', 'אופקים', 'בית שמש', 'דרום', 'מרכז'].forEach(a => { if (text.includes(a)) areas.push(a); });
  if (/חנו[תיות]/.test(text)) pts.push('חנות'); if (/מרלו"?ג/.test(text)) pts.push('מרלו"ג');
  if (/משרד/.test(text)) pts.push('משרד'); if (/קרקע/.test(text)) pts.push('קרקע');
  const clean = text.replace(/0\d{1,2}[-\s]?\d{7,8}/, '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/, '')
    .replace(/תקציב[^\n]*/i, '').replace(/משקיע|שוכר|רוכש|בעל נכס|מתווך|יזם/g, '').replace(/מחפש[^\n]*/i, '').trim();
  const np = clean.split(/\s+/).filter(w => w.length > 1).slice(0, 2);
  let budget_max = 0;
  const bm = text.match(/תקציב[^\d]*(\d+(?:\.\d+)?)\s*(M|מיליון|K|אלף)?/i);
  if (bm) { budget_max = parseFloat(bm[1]); if (/M|מיליון/i.test(bm[2])) budget_max *= 1e6; else if (/K|אלף/i.test(bm[2])) budget_max *= 1e3; }
  return { first_name: np[0] || '', last_name: np[1] || '', phone, email, type, company: '', budget_min: 0, budget_max, preferred_areas: areas, preferred_property_types: pts, source: 'פנייה ישירה', notes: '' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// פורמט
// ═══════════════════════════════════════════════════════════════════════════════
function fmt(n) { return n.toLocaleString('he-IL'); }
function fmtContact(d) {
  let m = `👤 *שם:* ${d.first_name} ${d.last_name}\n`;
  if (d.phone) m += `*טלפון:* ${d.phone}\n`;
  if (d.email) m += `*אימייל:* ${d.email}\n`;
  if (d.type) m += `*סוג:* ${d.type}\n`;
  if (d.company) m += `*חברה:* ${d.company}\n`;
  if (d.budget_max > 0) m += `*תקציב:* עד ${fmt(d.budget_max)} ₪\n`;
  if (d.preferred_areas?.length) m += `*אזורים:* ${d.preferred_areas.join(', ')}\n`;
  if (d.preferred_property_types?.length) m += `*סוגי נכסים:* ${d.preferred_property_types.join(', ')}\n`;
  if (d.notes) m += `*הערות:* ${d.notes}\n`;
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════════
// מנוע שאלון
// ═══════════════════════════════════════════════════════════════════════════════

function removeKB(chatId, msgId) {
  if (!msgId) return;
  bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }).catch(() => {});
}

function getNextQ(data, skipped) {
  for (const q of QUESTIONS) {
    if (q.check(data) && !(skipped || []).includes(q.code)) return q;
  }
  return null;
}

async function askNext(chatId, s) {
  const q = getNextQ(s.data, s.skipped);
  if (!q) {
    // סיום — סיכום
    s.waitingFor = null;
    s.freeText = false;
    const sent = await bot.sendMessage(chatId, fmtContact(s.data) + '\n✅ *לשמור ב-CRM?*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '✅ שמור', callback_data: 'SAVE' }, { text: '❌ ביטול', callback_data: 'CANCEL' }]] }
    });
    s.lastMsg = sent.message_id;
    return;
  }

  s.waitingFor = q.code;
  s.freeText = q.freeText || false;

  // בניית כפתורים: CODE:VALUE
  const kb = q.buttons.map(row =>
    row.map(b => ({ text: b.text, callback_data: `${q.code}:${b.val}` }))
  );
  // כפתור דלג תמיד
  kb.push([{ text: 'דלג ⏭️', callback_data: `${q.code}:SKIP` }]);

  const sent = await bot.sendMessage(chatId, q.question, { reply_markup: { inline_keyboard: kb } });
  s.lastMsg = sent.message_id;
}

function doSkip(chatId, s) {
  if (!s.skipped) s.skipped = [];
  if (s.waitingFor && !s.skipped.includes(s.waitingFor)) s.skipped.push(s.waitingFor);
  s.waitingFor = null;
  s.freeText = false;
  askNext(chatId, s);
}

async function saveToCRM(chatId, s) {
  const d = s.data;
  try {
    const result = await crmRequest('POST', '/api/contacts', {
      first_name: d.first_name || '', last_name: d.last_name || '', phone: d.phone || '', email: d.email || '',
      type: d.type || 'רוכש פוטנציאלי', contact_category: 'contact', lead_status: 'new',
      source: d.source || 'פנייה ישירה', company: d.company || '', role: '',
      budget_min: 0, budget_max: d.budget_max > 0 ? d.budget_max : 0,
      preferred_areas: JSON.stringify(d.preferred_areas || []),
      preferred_property_types: JSON.stringify(d.preferred_property_types || []),
      desired_yield: 0, notes: d.notes || '', status: 'פעיל'
    });
    if (result.id) bot.sendMessage(chatId, `✅ *${d.first_name} ${d.last_name}* נוסף ל-CRM!`, { parse_mode: 'Markdown' });
    else throw new Error(result.error || 'שגיאה');
  } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
  delete sessions[chatId];
}

function newContact(fn, ln, ph) {
  return {
    first_name: fn || '', last_name: ln || '', phone: ph || '',
    email: '', type: '', company: '', budget_min: 0, budget_max: 0,
    preferred_areas: [], preferred_property_types: [],
    source: 'פנייה ישירה', notes: ''
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// פקודות
// ═══════════════════════════════════════════════════════════════════════════════
bot.onText(/\/start/, msg => {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(msg.chat.id,
    `🏠 *HAUSDORFF CRM Bot v3.1*\n\n` +
    `📱 *צרף איש קשר* מהטלפון (📎 → איש קשר)\n` +
    `💬 *הודעה חופשית:* _"יוסי 054-1234567 משקיע"_\n` +
    `🏢 *נכס:* _"/נכס חנות 85 מר גני אביב 12K"_`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, msg => {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(msg.chat.id,
    `📖 *עזרה*\n\n📱 צירוף: 📎 → איש קשר\n💬 הודעה: שם + טלפון\n🏢 נכס: /נכס + פרטים\n\nתמיד אפשר ללחוץ או להקליד "דלג"`,
    { parse_mode: 'Markdown' });
});

bot.onText(/\/id/, msg => {
  bot.sendMessage(msg.chat.id, `🆔 מזהה: \`${msg.from.id}\``, { parse_mode: 'Markdown' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// הודעות — כולל אנשי קשר מצורפים
// ═══════════════════════════════════════════════════════════════════════════════
bot.on('message', async msg => {
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;

  // ── פקודות — כבר מטופלות למעלה ──
  if (msg.text && msg.text.startsWith('/')) return;

  // ══════════════════════════════════
  // צירוף איש קשר מהטלפון
  // ══════════════════════════════════
  if (msg.contact) {
    // ניקוי session ישנה
    delete sessions[chatId];

    const c = msg.contact;
    let phone = c.phone_number || '';
    if (phone.startsWith('+972')) phone = '0' + phone.slice(4);
    else if (phone.startsWith('972')) phone = '0' + phone.slice(3);

    const data = newContact(c.first_name, c.last_name, phone);
    sessions[chatId] = { mode: 'contact', data, skipped: [], waitingFor: null, freeText: false };

    await bot.sendMessage(chatId,
      `📱 *התקבל:* ${c.first_name || ''} ${c.last_name || ''}\n*טלפון:* ${phone}\n\nבוא נשלים:`,
      { parse_mode: 'Markdown' }
    );

    askNext(chatId, sessions[chatId]);
    return;
  }

  // ══════════════════════════════════
  // הודעת טקסט
  // ══════════════════════════════════
  if (!msg.text) return;
  const text = msg.text.trim();
  if (text.length < 2) return;

  const s = sessions[chatId];

  // ── תשובה לשאלה פעילה ──
  if (s && s.waitingFor) {

    // דלג בטקסט
    if (/^דלג$/i.test(text)) {
      if (s.lastMsg) removeKB(chatId, s.lastMsg);
      doSkip(chatId, s);
      return;
    }

    const q = Q_BY_CODE[s.waitingFor];
    if (!q) { doSkip(chatId, s); return; }

    // אימייל עם validation
    if (q.validate) {
      const val = q.validate(text);
      if (val) {
        s.data[q.dbKey] = val;
        if (s.lastMsg) removeKB(chatId, s.lastMsg);
        s.waitingFor = null; s.freeText = false;
        askNext(chatId, s);
      } else {
        bot.sendMessage(chatId, q.errorMsg || '🤔 נסה שוב או הקלד "דלג"');
      }
      return;
    }

    // תקציב מותאם
    if (q.code === 'bg' && s.freeText) {
      const num = text.replace(/[,₪\s]/g, '');
      let amount = parseFloat(num) || 0;
      if (/M|מיליון/i.test(text)) amount *= 1e6;
      else if (/K|אלף/i.test(text)) amount *= 1e3;
      if (amount > 0) {
        s.data.budget_max = amount;
        bot.sendMessage(chatId, `💰 ${fmt(amount)} ₪`);
        if (s.lastMsg) removeKB(chatId, s.lastMsg);
        s.waitingFor = null; s.freeText = false;
        askNext(chatId, s);
      } else {
        bot.sendMessage(chatId, '🤔 כתוב מספר: 15000 / 80K / 5M');
      }
      return;
    }

    // טקסט חופשי כללי (חברה, הערות, אזור)
    if (s.freeText) {
      if (q.code === 'nt') {
        s.data.notes = text;
        s.data._notesAsked = true;
      } else if (q.isArray) {
        s.data[q.dbKey] = [text];
      } else {
        s.data[q.dbKey] = text;
      }
      if (s.lastMsg) removeKB(chatId, s.lastMsg);
      s.waitingFor = null; s.freeText = false;
      askNext(chatId, s);
      return;
    }
  }

  // ── הודעה חדשה ──
  delete sessions[chatId];
  bot.sendMessage(chatId, '⏳ מעבד...');

  try {
    const parsed = await parseContact(text);
    if (!parsed.first_name && !parsed.last_name) {
      bot.sendMessage(chatId, '🤔 לא זיהיתי שם.\n_"יוסי כהן 054-1234567 משקיע"_\nאו צרף איש קשר 📎', { parse_mode: 'Markdown' });
      return;
    }

    sessions[chatId] = { mode: 'contact', data: parsed, skipped: [], waitingFor: null, freeText: false };

    const hasMissing = !!getNextQ(parsed, []);
    const buttons = hasMissing
      ? [[{ text: '✅ אישור + השלמה', callback_data: 'ASK' }, { text: '✅ שמור ישר', callback_data: 'SAVE' }],
         [{ text: '❌ ביטול', callback_data: 'CANCEL' }]]
      : [[{ text: '✅ שמור', callback_data: 'SAVE' }, { text: '❌ ביטול', callback_data: 'CANCEL' }]];

    const sent = await bot.sendMessage(chatId, fmtContact(parsed) + '\n*נכון?*', {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons }
    });
    sessions[chatId].lastMsg = sent.message_id;
  } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// כפתורים
// ═══════════════════════════════════════════════════════════════════════════════
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const action = query.data;
  const s = sessions[chatId];

  bot.answerCallbackQuery(query.id);

  // ביטול
  if (action === 'CANCEL') {
    removeKB(chatId, msgId);
    delete sessions[chatId];
    bot.sendMessage(chatId, '🚫 בוטל.');
    return;
  }

  if (!s) {
    removeKB(chatId, msgId);
    return;
  }

  // התעלם מכפתור ישן
  if (s.lastMsg && msgId !== s.lastMsg) {
    removeKB(chatId, msgId);
    return;
  }

  // שמירה
  if (action === 'SAVE') {
    removeKB(chatId, msgId);
    saveToCRM(chatId, s);
    return;
  }

  // אישור + שאלות
  if (action === 'ASK') {
    removeKB(chatId, msgId);
    askNext(chatId, s);
    return;
  }

  // ── תשובות שאלון — פורמט: CODE:VALUE ──
  if (action.includes(':')) {
    removeKB(chatId, msgId);
    const colonIdx = action.indexOf(':');
    const code = action.slice(0, colonIdx);
    const value = action.slice(colonIdx + 1);
    const q = Q_BY_CODE[code];

    if (!q) return;

    // דילוג
    if (value === 'SKIP') {
      doSkip(chatId, s);
      return;
    }

    // קלט מותאם
    if (value === 'CUSTOM') {
      s.freeText = true;
      if (q.customPrompt) bot.sendMessage(chatId, q.customPrompt);
      return;
    }

    // רכישה
    if (value === 'SALE') {
      s.data.budget_max = -1;
      s.data.notes = (s.data.notes || '') + (s.data.notes ? ' | ' : '') + 'רכישה';
      s.waitingFor = null;
      askNext(chatId, s);
      return;
    }

    // ערך רגיל
    if (q.isArray) {
      if (!s.data[q.dbKey]) s.data[q.dbKey] = [];
      s.data[q.dbKey].push(value);
    } else if (q.dbKey === 'budget_max') {
      s.data[q.dbKey] = parseInt(value);
    } else {
      s.data[q.dbKey] = value;
    }
    s.waitingFor = null;
    askNext(chatId, s);
    return;
  }
});

bot.on('polling_error', e => { if (!e.message?.includes('ETELEGRAM') && !e.message?.includes('409')) console.error('Poll:', e.message); });
process.on('uncaughtException', e => console.error('Err:', e));
console.log('🤖 HAUSDORFF CRM Bot v3.1');
console.log(`📡 ${CRM_API_URL}`);
console.log(`🧠 ${ANTHROPIC_API_KEY ? 'Claude AI' : 'Regex'}`);
