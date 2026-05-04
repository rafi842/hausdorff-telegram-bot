// ═══════════════════════════════════════════════════════════════════════
// modules/contacts.js — אנשי קשר (מותאם מלא ל-CRM)
// שדות: שם, טלפון, סוג, מקור, חברה, תקציב, אזורים, סוגי נכסים,
//        שטח, תשואה, סוג עסקה, מטרה, אימייל, הערות
// ═══════════════════════════════════════════════════════════════════════

const { isAllowed, removeKB, formatPhone, fmtContact } = require('./helpers');
const { parseContact } = require('./parser');
const crm = require('./crm');
const Q = require('./questionnaire');

const QUESTIONS = [
  {
    code: 'tp', dbKey: 'type', check: d => !d.type,
    question: '👤 סוג איש קשר?',
    buttons: [
      [{ text: 'משקיע', val: 'משקיע' }, { text: 'יזם', val: 'יזם' }],
      [{ text: 'שוכר', val: 'שוכר פוטנציאלי' }, { text: 'רוכש', val: 'רוכש פוטנציאלי' }],
      [{ text: 'בעל נכס', val: 'בעל נכס' }, { text: 'מתווך', val: 'שותף מתווך' }]
    ]
  },
  {
    code: 'sr', dbKey: 'source', check: d => !d.source,
    question: '📡 מאיפה הגיע?',
    buttons: [
      [{ text: 'פנייה ישירה', val: 'פנייה ישירה' }, { text: 'פייסבוק', val: 'פרסום ממומן פייסבוק' }],
      [{ text: 'גוגל', val: 'פרסום ממומן גוגל' }, { text: 'שלט', val: 'שלט על נכס' }],
      [{ text: 'המלצה', val: 'פה לאוזן / המלצה' }, { text: 'יד2/מדלן', val: 'מודעת נכס (יד2 / מדלן)' }]
    ]
  },
  {
    code: 'pp', dbKey: 'preferred_property_types',
    check: d => !d.preferred_property_types || d.preferred_property_types.length === 0,
    question: '🏢 מה מחפש?',
    buttons: [
      [{ text: 'חנות', val: 'חנות' }, { text: 'מרלו"ג', val: 'מרלוג' }],
      [{ text: 'משרד', val: 'משרד' }, { text: 'קרקע', val: 'קרקע לבנייה' }],
      [{ text: 'מבנה תעשייה', val: 'מבנה תעשייה' }, { text: 'מרכז מסחרי', val: 'מרכז מסחרי' }]
    ],
    isArray: true
  },
  {
    code: 'dt', dbKey: 'preferred_deal_type', check: d => !d.preferred_deal_type,
    question: '🔑 שכירות או רכישה?',
    buttons: [
      [{ text: 'שכירות', val: 'שכירות' }, { text: 'רכישה', val: 'רכישה' }, { text: 'שניהם', val: 'שניהם' }]
    ]
  },
  {
    code: 'pa', dbKey: 'preferred_areas',
    check: d => !d.preferred_areas || d.preferred_areas.length === 0,
    question: '📍 אזור?',
    buttons: [
      [{ text: 'תל אביב', val: 'תל אביב' }, { text: 'ירושלים', val: 'ירושלים' }],
      [{ text: 'באר שבע', val: 'באר שבע' }, { text: 'חיפה', val: 'חיפה' }],
      [{ text: 'מרכז', val: 'מרכז' }, { text: 'דרום', val: 'דרום' }],
      [{ text: 'אחר ✏️', val: 'CUSTOM' }]
    ],
    isArray: true, customPrompt: '✏️ כתוב אזור/עיר:'
  },
  {
    code: 'bg', dbKey: 'budget_max', check: d => !d.budget_max || d.budget_max === 0,
    question: '💰 תקציב?',
    buttons: [
      [{ text: 'עד 5K/חודש', val: '5000' }, { text: 'עד 10K/חודש', val: '10000' }],
      [{ text: 'עד 20K/חודש', val: '20000' }, { text: 'עד 50K/חודש', val: '50000' }],
      [{ text: 'סכום אחר ✏️', val: 'CUSTOM' }, { text: 'רכישה', val: 'SALE' }]
    ],
    isNumber: true, customPrompt: '✏️ סכום (15000 / 80K / 5M / 50 מיליון):'
  },
  {
    code: 'yl', dbKey: 'desired_yield', check: d => d.type === 'משקיע' && (!d.desired_yield || d.desired_yield === 0),
    question: '📊 תשואה מינימלית?',
    buttons: [
      [{ text: '5%', val: '5' }, { text: '6%', val: '6' }, { text: '7%', val: '7' }],
      [{ text: '8%+', val: '8' }, { text: 'אחר ✏️', val: 'CUSTOM' }]
    ],
    isNumber: true, unit: '%', customPrompt: '✏️ אחוז תשואה (למשל: 6.5):'
  },
  {
    code: 'em', dbKey: 'email', check: d => !d.email,
    question: '📧 אימייל?',
    buttons: [], freeText: true,
    validate: text => { const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/); return m ? m[0] : null; },
    errorMsg: '🤔 לא אימייל. נסה שוב או "דלג"'
  },
  {
    code: 'co', dbKey: 'company', check: d => !d.company,
    question: '🏗️ חברה?',
    buttons: [], freeText: true
  },
  {
    code: 'rl', dbKey: 'readiness_level', check: d => !d.readiness_level,
    question: '⏱️ מוכנות?',
    buttons: [
      [{ text: 'מחפש פעיל', val: 'מחפש פעיל' }, { text: 'בודק שוק', val: 'בודק שוק' }],
      [{ text: 'עתידי (3+ חודשים)', val: 'עתידי' }]
    ]
  },
  {
    code: 'nt', dbKey: 'notes', check: d => !d._notesAsked,
    question: '📝 הערות?',
    buttons: [], freeText: true
  }
];

const Q_INDEX = Q.buildIndex(QUESTIONS);

function register(bot, sessions) {

  async function showSummary(chatId, session) {
    session.waitingFor = null; session.freeText = false;
    const sent = await bot.sendMessage(chatId, fmtContact(session.data) + '\n✅ *לשמור?*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '✅ שמור', callback_data: 'SAVE' },
        { text: '❌ ביטול', callback_data: 'CANCEL' }
      ]]}
    });
    session.lastMsg = sent.message_id;
  }

  async function saveContact(chatId, session) {
    const d = session.data;
    try {
      // חיפוש/יצירת חברה אם צוינה
      let companyId = null;
      if (d.company) {
        try {
          const companies = await crm.request('GET', `/api/companies?search=${encodeURIComponent(d.company)}`);
          if (Array.isArray(companies) && companies.length > 0) {
            companyId = companies[0].id;
          } else {
            const newComp = await crm.request('POST', '/api/companies', { name: d.company, type: 'לקוח' });
            if (newComp.id) companyId = newComp.id;
          }
        } catch (e) { /* ignore */ }
      }

      const result = await crm.createContact({
        first_name: d.first_name || '', last_name: d.last_name || '',
        phone: d.phone || '', email: d.email || '',
        type: d.type || 'רוכש פוטנציאלי',
        contact_category: 'contact', lead_status: 'new',
        source: d.source || 'פנייה ישירה',
        company_id: companyId,
        budget_min: d.budget_min || 0, budget_max: d.budget_max > 0 ? d.budget_max : 0,
        preferred_areas: Array.isArray(d.preferred_areas) ? d.preferred_areas : [],
        preferred_property_types: Array.isArray(d.preferred_property_types) ? d.preferred_property_types : [],
        min_area: d.min_area || 0, max_area: d.max_area || 0,
        desired_yield: d.desired_yield || 0,
        preferred_deal_type: d.preferred_deal_type || 'שניהם',
        readiness_level: d.readiness_level || 'מחפש פעיל',
        contact_role: d.contact_role || '',
        notes: d.notes || '', status: 'פעיל'
      });
      if (result.id) bot.sendMessage(chatId, `✅ *${d.first_name} ${d.last_name}* נוסף ל-CRM!`, { parse_mode: 'Markdown' });
      else throw new Error(result.error || 'שגיאה');
    } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
    delete sessions[chatId];
  }

  function newData(fn, ln, ph) {
    return { first_name: fn||'', last_name: ln||'', phone: ph||'', email: '', type: '', source: '',
      company: '', budget_min: 0, budget_max: 0, preferred_areas: [], preferred_property_types: [],
      min_area: 0, max_area: 0, desired_yield: 0, preferred_deal_type: '', readiness_level: '',
      notes: '' };
  }

  // ── entry points ──

  async function startFromPhone(chatId, contact) {
    delete sessions[chatId];
    const phone = formatPhone(contact.phone_number);
    sessions[chatId] = { mode: 'contact', data: newData(contact.first_name, contact.last_name, phone), skipped: [] };
    await bot.sendMessage(chatId, `📱 *${contact.first_name||''} ${contact.last_name||''}*\n📞 ${phone}`, { parse_mode: 'Markdown' });
    Q.askNext(bot, chatId, sessions[chatId], QUESTIONS, showSummary);
  }

  async function startFromText(chatId, text) {
    delete sessions[chatId];
    bot.sendMessage(chatId, '⏳ מעבד...');
    try {
      const parsed = await parseContact(text);
      if (!parsed.first_name && !parsed.last_name) {
        bot.sendMessage(chatId, '🤔 לא זיהיתי שם.\n_"יוסי 054-1234567 משקיע"_\nאו צרף 📎', { parse_mode: 'Markdown' });
        return;
      }
      sessions[chatId] = { mode: 'contact', data: { ...newData(), ...parsed }, skipped: [] };
      const hasMissing = !!Q.getNextQ(QUESTIONS, sessions[chatId].data, []);
      const btns = hasMissing
        ? [[{ text: '✅ אישור + השלמה', callback_data: 'ASK' }, { text: '✅ שמור ישר', callback_data: 'SAVE' }],
           [{ text: '❌ ביטול', callback_data: 'CANCEL' }]]
        : [[{ text: '✅ שמור', callback_data: 'SAVE' }, { text: '❌ ביטול', callback_data: 'CANCEL' }]];
      const sent = await bot.sendMessage(chatId, fmtContact(sessions[chatId].data) + '\n*נכון?*', {
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: btns }
      });
      sessions[chatId].lastMsg = sent.message_id;
    } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
  }

  async function startEmpty(chatId) {
    delete sessions[chatId];
    sessions[chatId] = { mode: 'contact', data: newData(), skipped: [] };
    bot.sendMessage(chatId, '👤 *איש קשר חדש*\nכתוב שם פרטי ומשפחה:', { parse_mode: 'Markdown' });
    sessions[chatId].waitingFor = 'nm';
    sessions[chatId].freeText = true;
  }

  // ── handlers ──

  function handleCallback(chatId, msgId, action, s) {
    removeKB(bot, chatId, msgId);
    if (action === 'ASK') { Q.askNext(bot, chatId, s, QUESTIONS, showSummary); return true; }
    if (action === 'SAVE') { saveContact(chatId, s); return true; }
    if (action.includes(':')) {
      const [code, value] = [action.slice(0, action.indexOf(':')), action.slice(action.indexOf(':') + 1)];
      return Q.handleAnswer(bot, chatId, s, QUESTIONS, Q_INDEX, code, value, showSummary);
    }
    return false;
  }

  function handleText(chatId, text, s) {
    // שם (entry point ריק)
    if (s.waitingFor === 'nm') {
      const parts = text.split(/\s+/);
      s.data.first_name = parts[0] || '';
      s.data.last_name = parts.slice(1).join(' ') || '';
      s.waitingFor = null; s.freeText = false;
      bot.sendMessage(chatId, '📞 מספר טלפון:');
      s.waitingFor = 'ph'; s.freeText = true;
      return true;
    }
    if (s.waitingFor === 'ph') {
      s.data.phone = text.replace(/\s/g, '');
      s.waitingFor = null; s.freeText = false;
      Q.askNext(bot, chatId, s, QUESTIONS, showSummary);
      return true;
    }
    return Q.handleText(bot, chatId, text, s, QUESTIONS, Q_INDEX, showSummary);
  }

  return { startFromPhone, startFromText, startEmpty, handleCallback, handleText };
}

module.exports = { register };
