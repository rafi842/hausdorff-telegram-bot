// ═══════════════════════════════════════════════════════════════════════════════
// Hausdorff CRM — Telegram Bot v3.0
// כתיבה מחדש: דלג עובד, צירוף אנשי קשר, ניקוי כפתורים
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
// שאלון מובנה — כל שאלה עם key, בדיקה, וכפתורים
// ═══════════════════════════════════════════════════════════════════════════════
const QUESTIONS = [
  {
    key: 'type',
    check: d => !d.type,
    question: '👤 מה סוג איש הקשר?',
    buttons: [
      [{ text: 'משקיע', data: 'משקיע' }, { text: 'יזם', data: 'יזם' }],
      [{ text: 'שוכר', data: 'שוכר פוטנציאלי' }, { text: 'רוכש', data: 'רוכש פוטנציאלי' }],
      [{ text: 'בעל נכס', data: 'בעל נכס' }, { text: 'מתווך', data: 'שותף מתווך' }]
    ]
  },
  {
    key: 'preferred_property_types',
    check: d => !d.preferred_property_types || d.preferred_property_types.length === 0,
    question: '🏢 מה מחפש?',
    buttons: [
      [{ text: 'חנות', data: 'חנות' }, { text: 'מרלו"ג', data: 'מרלוג' }],
      [{ text: 'משרד', data: 'משרד' }, { text: 'קרקע', data: 'קרקע' }],
      [{ text: 'מבנה תעשייה', data: 'מבנה תעשייה' }]
    ],
    isArray: true
  },
  {
    key: 'preferred_areas',
    check: d => !d.preferred_areas || d.preferred_areas.length === 0,
    question: '📍 באיזה אזור?',
    buttons: [
      [{ text: 'תל אביב', data: 'תל אביב' }, { text: 'ירושלים', data: 'ירושלים' }],
      [{ text: 'באר שבע', data: 'באר שבע' }, { text: 'חיפה', data: 'חיפה' }],
      [{ text: 'מרכז', data: 'מרכז' }, { text: 'דרום', data: 'דרום' }],
      [{ text: 'אחר ✏️', data: '_custom' }]
    ],
    isArray: true,
    customPrompt: '✏️ כתוב אזור/עיר:'
  },
  {
    key: 'budget_max',
    check: d => !d.budget_max || d.budget_max === 0,
    question: '💰 תקציב?',
    buttons: [
      [{ text: 'עד 5K/חודש', data: '5000' }, { text: 'עד 10K/חודש', data: '10000' }],
      [{ text: 'עד 20K/חודש', data: '20000' }, { text: 'עד 50K/חודש', data: '50000' }],
      [{ text: 'סכום אחר ✏️', data: '_custom' }, { text: 'רכישה', data: '_sale' }]
    ],
    customPrompt: '✏️ כתוב סכום (למשל: 15000, 80K, 5M, 50 מיליון):'
  },
  {
    key: 'email',
    check: d => !d.email,
    question: '📧 יש אימייל? כתוב או לחץ דלג',
    buttons: [],
    freeText: true,
    validate: text => {
      const em = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      return em ? { value: em[0] } : null;
    },
    errorMsg: '🤔 לא נראה כאימייל. נסה שוב או הקלד "דלג"'
  },
  {
    key: 'company',
    check: d => !d.company,
    question: '🏗️ שם חברה? כתוב או לחץ דלג',
    buttons: [],
    freeText: true
  },
  {
    key: 'notes',
    check: d => !d._notesAsked,
    question: '📝 הערות? כתוב או לחץ דלג',
    buttons: [],
    freeText: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// CRM API
// ═══════════════════════════════════════════════════════════════════════════════
function isAllowed(id) { return ALLOWED_USERS.length === 0 || ALLOWED_USERS.includes(id); }

async function getCrmToken() {
  if (crmToken && Date.now() < tokenExpiry) return crmToken;
  try {
    const r = await fetch(`${CRM_API_URL}/api/auth/login`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email:CRM_EMAIL, password:CRM_PASSWORD })
    });
    const d = await r.json();
    if (d.token) { crmToken=d.token; tokenExpiry=Date.now()+6e8; return crmToken; }
    throw new Error(d.error||'login failed');
  } catch(e) { console.error('CRM:',e.message); return null; }
}

async function crmRequest(method, endpoint, body) {
  const t = await getCrmToken();
  if (!t) throw new Error('לא ניתן להתחבר ל-CRM');
  const o = { method, headers:{'Content-Type':'application/json','Authorization':`Bearer ${t}`} };
  if (body) o.body = JSON.stringify(body);
  return (await fetch(`${CRM_API_URL}${endpoint}`, o)).json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// פרסור
// ═══════════════════════════════════════════════════════════════════════════════
async function parseWithAI(text) {
  if (!ANTHROPIC_API_KEY) return parseBasic(text);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000,
        system:`אתה מפרק טקסט חופשי בעברית לנתוני איש קשר. החזר JSON בלבד (בלי backticks):
{"first_name":"","last_name":"","phone":"","email":"","type":"","company":"","budget_max":0,"preferred_areas":[],"preferred_property_types":[],"source":"פנייה ישירה","notes":""}
סוגים: משקיע/רוכש פוטנציאלי/שוכר פוטנציאלי/בעל נכס/שותף מתווך/יזם. תקציב: M=מיליון, K=אלף. חסר=ריק/0.`,
        messages:[{role:'user',content:text}] })
    });
    const d = await r.json();
    return JSON.parse((d.content?.[0]?.text||'').replace(/```json\s*/g,'').replace(/```\s*/g,'').trim());
  } catch(e) { console.error('AI:',e.message); return parseBasic(text); }
}

function parseBasic(text) {
  const phone = text.match(/0\d{1,2}[-\s]?\d{7,8}/)?.[0]?.replace(/\s/g,'')||'';
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]||'';
  let type = '';
  if (/משקיע/.test(text)) type='משקיע'; else if (/שוכר/.test(text)) type='שוכר פוטנציאלי';
  else if (/בעל.?נכס|בעלים/.test(text)) type='בעל נכס'; else if (/יזם/.test(text)) type='יזם';
  else if (/רוכש/.test(text)) type='רוכש פוטנציאלי'; else if (/מתווך/.test(text)) type='שותף מתווך';
  let budget_max = 0;
  const bm = text.match(/תקציב[^\d]*(\d+(?:\.\d+)?)\s*(M|מיליון|K|אלף)?/i);
  if (bm) { budget_max=parseFloat(bm[1]); if(/M|מיליון/i.test(bm[2]))budget_max*=1e6; else if(/K|אלף/i.test(bm[2]))budget_max*=1e3; }
  const areas=[], propTypes=[];
  ['תל אביב','ירושלים','חיפה','באר שבע','נתניה','אשדוד','הרצליה','רמת גן','נתיבות','אופקים','בית שמש','דרום','מרכז','צפון'].forEach(a=>{if(text.includes(a))areas.push(a);});
  if(/חנו[תיות]/.test(text))propTypes.push('חנות'); if(/מרלו"?ג/.test(text))propTypes.push('מרלו"ג');
  if(/משרד/.test(text))propTypes.push('משרד'); if(/קרקע/.test(text))propTypes.push('קרקע');
  const nameClean = text.replace(/0\d{1,2}[-\s]?\d{7,8}/,'').replace(/[\w.+-]+@[\w-]+\.[\w.]+/,'')
    .replace(/תקציב[^\n]*/i,'').replace(/משקיע|שוכר|רוכש|בעל נכס|מתווך|יזם/g,'').replace(/מחפש[^\n]*/i,'').trim();
  const np = nameClean.split(/\s+/).filter(w=>w.length>1).slice(0,2);
  return { first_name:np[0]||'',last_name:np[1]||'',phone,email,type,company:'',
    budget_min:0,budget_max,preferred_areas:areas,preferred_property_types:propTypes,source:'פנייה ישירה',notes:'' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// פורמט
// ═══════════════════════════════════════════════════════════════════════════════
function fmt(n) { return n.toLocaleString('he-IL'); }
function fmtContact(d) {
  let m=`👤 *איש קשר*\n\n*שם:* ${d.first_name} ${d.last_name}\n`;
  if(d.phone) m+=`*טלפון:* ${d.phone}\n`;
  if(d.email) m+=`*אימייל:* ${d.email}\n`;
  if(d.type) m+=`*סוג:* ${d.type}\n`;
  if(d.company) m+=`*חברה:* ${d.company}\n`;
  if(d.budget_max>0) m+=`*תקציב:* עד ${fmt(d.budget_max)} ₪\n`;
  if(d.preferred_areas?.length) m+=`*אזורים:* ${d.preferred_areas.join(', ')}\n`;
  if(d.preferred_property_types?.length) m+=`*סוגי נכסים:* ${d.preferred_property_types.join(', ')}\n`;
  if(d.notes) m+=`*הערות:* ${d.notes}\n`;
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════════
// מנוע שאלון — הלב של הבוט
// ═══════════════════════════════════════════════════════════════════════════════

function getNextQ(data, skipped) {
  for (const q of QUESTIONS) {
    if (q.check(data) && !(skipped||[]).includes(q.key)) return q;
  }
  return null;
}

async function askNext(chatId, session) {
  const q = getNextQ(session.data, session.skipped);
  if (!q) {
    // סיום — סיכום לאישור
    session.waitingFor = null;
    session.freeText = false;
    const msg = await bot.sendMessage(chatId, fmtContact(session.data) + '\n✅ *לשמור ב-CRM?*', {
      parse_mode:'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '✅ שמור', callback_data: 'save' },
        { text: '❌ ביטול', callback_data: 'cancel' }
      ]]}
    });
    session.lastMsgId = msg.message_id;
    return;
  }

  session.waitingFor = q.key;
  session.freeText = q.freeText || false;

  // בניית כפתורים עם callback_data ייחודי
  const keyboard = q.buttons.map(row =>
    row.map(b => ({ text: b.text, callback_data: `a_${q.key}_${b.data}` }))
  );
  // הוספת כפתור דלג
  keyboard.push([{ text: 'דלג ⏭️', callback_data: `a_${q.key}_skip` }]);

  const msg = await bot.sendMessage(chatId, q.question, {
    reply_markup: { inline_keyboard: keyboard }
  });
  session.lastMsgId = msg.message_id;
}

function doSkip(chatId, session) {
  if (!session.skipped) session.skipped = [];
  if (session.waitingFor) session.skipped.push(session.waitingFor);
  session.waitingFor = null;
  session.freeText = false;
  askNext(chatId, session);
}

// מחיקת כפתורים מהודעה ישנה
function removeKeyboard(chatId, msgId) {
  try {
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId });
  } catch(e) { /* ignore */ }
}

async function saveToCRM(chatId, session) {
  const d = session.data;
  try {
    const result = await crmRequest('POST', '/api/contacts', {
      first_name:d.first_name||'', last_name:d.last_name||'', phone:d.phone||'', email:d.email||'',
      type:d.type||'רוכש פוטנציאלי', contact_category:'contact', lead_status:'new',
      source:d.source||'פנייה ישירה', company:d.company||'', role:d.role||'',
      budget_min:d.budget_min||0, budget_max:d.budget_max>0?d.budget_max:0,
      preferred_areas:JSON.stringify(d.preferred_areas||[]),
      preferred_property_types:JSON.stringify(d.preferred_property_types||[]),
      desired_yield:d.desired_yield||0, notes:d.notes||'', status:'פעיל'
    });
    if (result.id) {
      bot.sendMessage(chatId, `✅ *${d.first_name} ${d.last_name}* נוסף ל-CRM!`, {parse_mode:'Markdown'});
    } else throw new Error(result.error||'שגיאה');
  } catch(e) { bot.sendMessage(chatId, `❌ שגיאה: ${e.message}`); }
  delete sessions[chatId];
}

// ═══════════════════════════════════════════════════════════════════════════════
// נתוני ברירת מחדל לאיש קשר חדש
// ═══════════════════════════════════════════════════════════════════════════════
function emptyContact(firstName, lastName, phone) {
  return {
    first_name: firstName||'', last_name: lastName||'', phone: phone||'',
    email:'', type:'', company:'', role:'',
    budget_min:0, budget_max:0,
    preferred_areas:[], preferred_property_types:[],
    desired_yield:0, source:'פנייה ישירה', notes:''
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// פקודות
// ═══════════════════════════════════════════════════════════════════════════════
bot.onText(/\/start/, msg => {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(msg.chat.id,
    `🏠 *HAUSDORFF CRM Bot v3.0*\n\n` +
    `*3 דרכים להוסיף איש קשר:*\n\n` +
    `📱 *צרף איש קשר* מהטלפון (📎 → איש קשר)\n` +
    `💬 *הודעה חופשית:* _"יוסי 054-1234567 משקיע 5M חנויות באר שבע"_\n` +
    `🏢 *נכס:* _"/נכס חנות 85 מר גני אביב 12K"_\n\n` +
    `ככל שתכתוב יותר → פחות שאלות 😊`,
    { parse_mode:'Markdown' });
});

bot.onText(/\/help/, msg => {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(msg.chat.id,
    `📖 *עזרה*\n\n📱 *צירוף:* לחץ 📎 → איש קשר → בחר מהטלפון\n💬 *הודעה:* שם + טלפון (+ מה שיודעים)\n🏢 *נכס:* /נכס + פרטים\n\nתמיד אפשר ללחוץ "דלג" או להקליד דלג`,
    { parse_mode:'Markdown' });
});

bot.onText(/\/id/, msg => {
  bot.sendMessage(msg.chat.id, `🆔 \`${msg.from.id}\``, {parse_mode:'Markdown'});
});

// ═══════════════════════════════════════════════════════════════════════════════
// צירוף איש קשר מהטלפון
// ═══════════════════════════════════════════════════════════════════════════════
bot.on('contact', msg => {
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;
  const c = msg.contact;

  // ניקוי session ישנה
  delete sessions[chatId];

  let phone = c.phone_number || '';
  if (phone.startsWith('+972')) phone = '0' + phone.slice(4);
  else if (phone.startsWith('972')) phone = '0' + phone.slice(3);

  const data = emptyContact(c.first_name, c.last_name, phone);

  sessions[chatId] = { mode:'contact', data, skipped:[], waitingFor:null, freeText:false };

  bot.sendMessage(chatId,
    `📱 *התקבל:* ${c.first_name||''} ${c.last_name||''}\n*טלפון:* ${phone}\n\nבוא נשלים פרטים:`,
    { parse_mode:'Markdown' }
  ).then(() => {
    askNext(chatId, sessions[chatId]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// נכס
// ═══════════════════════════════════════════════════════════════════════════════
bot.onText(/^\/נכס\s+(.+)/s, async (msg, match) => {
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;
  delete sessions[chatId];
  bot.sendMessage(chatId, '⏳ מעבד...');
  try {
    const sys = `אתה מפרק טקסט בעברית לנתוני נכס. החזר JSON בלבד:
{"address":"","city":"","neighborhood":"","type":"חנות/מרלוג/משרד/קרקע","deal_type":"השכרה/מכירה","price":0,"area":0,"floor":0,"total_floors":0,"monthly_rent":0,"description":"","status":"זמין"}`;
    let parsed;
    if (ANTHROPIC_API_KEY) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:sys,messages:[{role:'user',content:match[1]}]})
      });
      const d = await r.json();
      parsed = JSON.parse((d.content?.[0]?.text||'').replace(/```json\s*/g,'').replace(/```\s*/g,'').trim());
    } else {
      parsed = {address:'',city:'',type:'חנות',deal_type:'השכרה',price:0,area:0,description:match[1],status:'זמין'};
    }
    const m = `🏢 *נכס חדש*\n${parsed.type||''} ${parsed.city||''}\n${parsed.area?parsed.area+' מ"ר':''} ${parsed.price?fmt(parsed.price)+' ₪':''}`;
    const sent = await bot.sendMessage(chatId, m+'\n\n*לשמור?*', {
      parse_mode:'Markdown',
      reply_markup:{inline_keyboard:[[{text:'✅ שמור',callback_data:'save_prop'},{text:'❌ ביטול',callback_data:'cancel'}]]}
    });
    sessions[chatId] = { mode:'property', data:parsed, lastMsgId:sent.message_id };
  } catch(e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// הודעה חופשית — איש קשר
// ═══════════════════════════════════════════════════════════════════════════════
bot.on('message', async msg => {
  if (!msg.text || msg.text.startsWith('/') || msg.contact) return;
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  if (text.length < 2) return;

  const session = sessions[chatId];

  // ── תשובה לשאלה פעילה ──
  if (session && session.waitingFor) {

    // "דלג" = דילוג
    if (/^דלג$/i.test(text)) {
      if (session.lastMsgId) removeKeyboard(chatId, session.lastMsgId);
      doSkip(chatId, session);
      return;
    }

    const q = QUESTIONS.find(q => q.key === session.waitingFor);

    // אימייל עם validation
    if (q && q.validate) {
      const result = q.validate(text);
      if (result) {
        session.data[q.key] = result.value;
        if (session.lastMsgId) removeKeyboard(chatId, session.lastMsgId);
        session.waitingFor = null; session.freeText = false;
        askNext(chatId, session);
      } else {
        bot.sendMessage(chatId, q.errorMsg || '🤔 נסה שוב או הקלד "דלג"');
      }
      return;
    }

    // תקציב מותאם
    if (session.waitingFor === 'budget_max' && session.freeText) {
      const num = text.replace(/[,₪\s]/g,'');
      let amount = parseFloat(num)||0;
      if (/M|מיליון/i.test(text)) amount*=1e6;
      else if (/K|אלף/i.test(text)) amount*=1e3;
      if (amount > 0) {
        session.data.budget_max = amount;
        bot.sendMessage(chatId, `💰 ${fmt(amount)} ₪`);
        if (session.lastMsgId) removeKeyboard(chatId, session.lastMsgId);
        session.waitingFor=null; session.freeText=false;
        askNext(chatId, session);
      } else {
        bot.sendMessage(chatId, '🤔 כתוב מספר: 15000, 80K, 5M');
      }
      return;
    }

    // טקסט חופשי כללי (חברה, הערות, אזור)
    if (session.freeText) {
      if (session.waitingFor === 'notes') {
        session.data.notes = text;
        session.data._notesAsked = true;
      } else {
        const qDef = QUESTIONS.find(q => q.key === session.waitingFor);
        if (qDef?.isArray) {
          session.data[session.waitingFor] = [text];
        } else {
          session.data[session.waitingFor] = text;
        }
      }
      if (session.lastMsgId) removeKeyboard(chatId, session.lastMsgId);
      session.waitingFor=null; session.freeText=false;
      askNext(chatId, session);
      return;
    }
  }

  // ── הודעה חדשה ──
  delete sessions[chatId];
  bot.sendMessage(chatId, '⏳ מעבד...');

  try {
    const parsed = await parseWithAI(text);
    if (!parsed.first_name && !parsed.last_name) {
      bot.sendMessage(chatId, '🤔 לא זיהיתי שם.\nנסה: _"יוסי כהן 054-1234567 משקיע"_\nאו צרף איש קשר 📎', {parse_mode:'Markdown'});
      return;
    }

    sessions[chatId] = { mode:'contact', data:parsed, skipped:[], waitingFor:null, freeText:false };

    const hasMissing = !!getNextQ(parsed, []);
    const buttons = hasMissing
      ? [[{text:'✅ אישור + השלמת פרטים', callback_data:'confirm_ask'},
          {text:'✅ שמור ישר', callback_data:'save'}],
         [{text:'❌ ביטול', callback_data:'cancel'}]]
      : [[{text:'✅ שמור', callback_data:'save'},
          {text:'❌ ביטול', callback_data:'cancel'}]];

    const sent = await bot.sendMessage(chatId, fmtContact(parsed)+'\n*הנתונים נכונים?*', {
      parse_mode:'Markdown', reply_markup:{inline_keyboard:buttons}
    });
    sessions[chatId].lastMsgId = sent.message_id;
  } catch(e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// כפתורים — handler אחד מסודר
// ═══════════════════════════════════════════════════════════════════════════════
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const action = query.data;
  const session = sessions[chatId];

  bot.answerCallbackQuery(query.id);

  // ביטול
  if (action === 'cancel') {
    removeKeyboard(chatId, msgId);
    delete sessions[chatId];
    bot.sendMessage(chatId, '🚫 בוטל.');
    return;
  }

  if (!session) {
    removeKeyboard(chatId, msgId);
    bot.sendMessage(chatId, '⚠️ שלח הודעה חדשה או צרף איש קשר.');
    return;
  }

  // בדיקה שהכפתור מההודעה הנוכחית (לא מהודעה ישנה)
  if (session.lastMsgId && msgId !== session.lastMsgId) {
    removeKeyboard(chatId, msgId);
    return; // התעלם מכפתור ישן
  }

  // אישור + שאלות
  if (action === 'confirm_ask') {
    removeKeyboard(chatId, msgId);
    askNext(chatId, session);
    return;
  }

  // שמירה
  if (action === 'save') {
    removeKeyboard(chatId, msgId);
    saveToCRM(chatId, session);
    return;
  }

  // שמירת נכס
  if (action === 'save_prop') {
    removeKeyboard(chatId, msgId);
    try {
      const d = session.data;
      const result = await crmRequest('POST','/api/properties', {
        address:d.address||'',city:d.city||'',neighborhood:d.neighborhood||'',
        type:d.type||'חנות',deal_type:d.deal_type||'השכרה',status:'זמין',
        price:d.price||0,area:d.area||0,floor:d.floor||0,total_floors:d.total_floors||0,
        parking:d.parking||0,has_tenant:d.has_tenant||false,
        monthly_rent:d.monthly_rent||0,annual_yield:d.annual_yield||0,description:d.description||''
      });
      if(result.id) bot.sendMessage(chatId,'✅ נכס נוסף!',{parse_mode:'Markdown'});
      else throw new Error(result.error||'שגיאה');
    } catch(e) { bot.sendMessage(chatId,`❌ ${e.message}`); }
    delete sessions[chatId];
    return;
  }

  // ── תשובות לשאלון ──
  // כל callback_data מהשאלון מתחיל ב-a_KEY_VALUE
  if (action.startsWith('a_')) {
    removeKeyboard(chatId, msgId);
    const parts = action.slice(2);
    const keyEnd = parts.indexOf('_');
    const key = parts.slice(0, keyEnd);
    const value = parts.slice(keyEnd + 1);

    // דילוג
    if (value === 'skip') {
      doSkip(chatId, session);
      return;
    }

    // custom — בקשת קלט חופשי
    if (value === '_custom') {
      const q = QUESTIONS.find(q => q.key === key);
      session.freeText = true;
      if (q?.customPrompt) bot.sendMessage(chatId, q.customPrompt);
      return;
    }

    // רכישה
    if (value === '_sale') {
      session.data.budget_max = -1;
      session.data.notes = (session.data.notes||'') + (session.data.notes?' | ':'') + 'רכישה';
      session.waitingFor = null;
      askNext(chatId, session);
      return;
    }

    // ערך רגיל
    const q = QUESTIONS.find(q => q.key === key);
    if (q?.isArray) {
      if (!session.data[key]) session.data[key] = [];
      session.data[key].push(value);
    } else if (key === 'budget_max') {
      session.data[key] = parseInt(value);
    } else {
      session.data[key] = value;
    }

    session.waitingFor = null;
    askNext(chatId, session);
    return;
  }
});

bot.on('polling_error', e => { if(!e.message?.includes('ETELEGRAM')&&!e.message?.includes('409'))console.error('Poll:',e.message); });
process.on('uncaughtException', e => console.error('Err:',e));
console.log('🤖 HAUSDORFF CRM Bot v3.0');
console.log(`📡 ${CRM_API_URL}`);
console.log(`🧠 ${ANTHROPIC_API_KEY?'Claude AI':'Regex'}`);
