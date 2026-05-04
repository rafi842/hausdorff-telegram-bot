// ═══════════════════════════════════════════════════════════════════════
// properties.js — נכסים (v6)
// + קישור לפרויקט (project_id), קישור לבעלים (owner_id)
// ═══════════════════════════════════════════════════════════════════════

const { removeKB, fmtProperty } = require('./helpers');
const { parseProperty } = require('./parser');
const crm = require('./crm');
const Q = require('./questionnaire');
const picker = require('./picker');

const QUESTIONS = [
  { code: 'dl', dbKey: 'deal_type', check: d => !d.deal_type,
    question: '🔑 סוג עסקה?', buttons: [
    [{ text: 'השכרה', val: 'השכרה' }, { text: 'מכירה', val: 'מכירה' }]
  ]},
  { code: 'ty', dbKey: 'type', check: d => !d.type,
    question: '🏢 סוג נכס?', buttons: [
    [{ text: 'חנות', val: 'חנות' }, { text: 'מרלו"ג', val: 'מרלו"ג' }],
    [{ text: 'משרד', val: 'משרד' }, { text: 'קרקע', val: 'קרקע לבנייה' }],
    [{ text: 'מבנה תעשייה', val: 'מבנה תעשייה' }, { text: 'מרכז מסחרי', val: 'מרכז מסחרי' }]
  ]},
  { code: 'ct', dbKey: 'city', check: d => !d.city,
    question: '📍 עיר?', buttons: [
    [{ text: 'תל אביב', val: 'תל אביב' }, { text: 'ירושלים', val: 'ירושלים' }],
    [{ text: 'באר שבע', val: 'באר שבע' }, { text: 'חיפה', val: 'חיפה' }],
    [{ text: 'אחר ✏️', val: 'CUSTOM' }]
  ], customPrompt: '✏️ עיר:' },
  { code: 'ad', dbKey: 'address', check: d => !d.address,
    question: '🏠 כתובת? (רחוב ומספר)', buttons: [], freeText: true },
  { code: 'nb', dbKey: 'neighborhood', check: d => !d.neighborhood,
    question: '🏘️ שכונה/אזור?', buttons: [], freeText: true },
  { code: 'ar', dbKey: 'area', check: d => !d.area || d.area === 0,
    question: '📐 שטח (מ"ר)?', buttons: [], freeText: true, isNumber: true, unit: 'מ"ר',
    customPrompt: '✏️ שטח במ"ר:' },
  { code: 'pr', dbKey: 'price', check: d => d.deal_type === 'מכירה' && (!d.price || d.price === 0),
    question: '💰 מחיר מכירה?', buttons: [
    [{ text: 'סכום ✏️', val: 'CUSTOM' }]
  ], isNumber: true, customPrompt: '✏️ מחיר (1.5M / 500K / 3000000):' },
  { code: 'rn', dbKey: 'monthly_rent', check: d => d.deal_type === 'השכרה' && (!d.monthly_rent || d.monthly_rent === 0),
    question: '💵 שכ"ד חודשי?', buttons: [
    [{ text: 'סכום ✏️', val: 'CUSTOM' }]
  ], isNumber: true, customPrompt: '✏️ שכ"ד בש"ח (12000 / 15K):' },
  { code: 'fl', dbKey: 'floor', check: d => d.type !== 'קרקע לבנייה' && (d.floor === undefined || d.floor === null),
    question: '🏗️ קומה?', buttons: [
    [{ text: 'קרקע (0)', val: '0' }, { text: '1', val: '1' }, { text: '2', val: '2' }],
    [{ text: '3', val: '3' }, { text: 'אחר ✏️', val: 'CUSTOM' }]
  ], isNumber: true, customPrompt: '✏️ קומה:' },
  { code: 'pk', dbKey: 'parking', check: d => d.parking === undefined,
    question: '🅿️ חניות?', buttons: [
    [{ text: '0', val: '0' }, { text: '1', val: '1' }, { text: '2', val: '2' }, { text: '3+', val: 'CUSTOM' }]
  ], isNumber: true, customPrompt: '✏️ מספר חניות:' },
  { code: 'el', dbKey: 'elevator', check: d => d.type !== 'קרקע לבנייה' && d.elevator === undefined,
    question: '🛗 מעלית?', buttons: [
    [{ text: 'כן', val: '1' }, { text: 'לא', val: '0' }]
  ]},
  { code: 'st', dbKey: 'status', check: d => !d.status,
    question: '📊 סטטוס?', buttons: [
    [{ text: 'זמין', val: 'זמין' }, { text: 'תפוס', val: 'תפוס' }, { text: 'בתהליך', val: 'בתהליך' }]
  ]},
  { code: 'ex', dbKey: 'exclusivity', check: d => d.exclusivity === undefined,
    question: '🤝 בלעדיות?', buttons: [
    [{ text: 'כן', val: '1' }, { text: 'לא', val: '0' }]
  ]},
  { code: 'tn', dbKey: 'has_tenant', check: d => d.deal_type === 'מכירה' && d.has_tenant === undefined,
    question: '👤 יש שוכר קיים?', buttons: [
    [{ text: 'כן', val: '1' }, { text: 'לא', val: '0' }]
  ]},
  { code: 'rm', dbKey: 'monthly_rent', check: d => d.has_tenant === 1 && (!d.monthly_rent || d.monthly_rent === 0),
    question: '💵 שכ"ד חודשי (מהשוכר)?', buttons: [
    [{ text: 'סכום ✏️', val: 'CUSTOM' }]
  ], isNumber: true, customPrompt: '✏️ שכ"ד בש"ח:' },

  // ── חדש: קישור לפרויקט ────────────────────────────────────────────
  { code: 'pj', dbKey: 'project_id', check: d => !d.project_id,
    question: '🏗️ לחבר לפרויקט?',
    buildButtons: async () => picker.buttonsForProjects(),
    onAnswer: (data, val) => { data._project_name = picker.getLabel('projects', val); }
  },

  // ── חדש: קישור לבעלים ─────────────────────────────────────────────
  { code: 'lo', dbKey: 'owner_id', check: d => !d.owner_id,
    question: '👤 מי הבעלים?',
    buildButtons: async () => picker.buttonsForContacts(),
    onAnswer: (data, val) => { data._owner_name = picker.getLabel('contacts', val); }
  },

  { code: 'ds', dbKey: 'description', check: d => !d.description,
    question: '📝 תיאור?', buttons: [], freeText: true },
];

const Q_INDEX = Q.buildIndex(QUESTIONS);

function register(bot, sessions) {

  async function showSummary(chatId, session) {
    session.waitingFor = null; session.freeText = false;
    const sent = await bot.sendMessage(chatId, fmtProperty(session.data) + '\n✅ *לשמור?*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '✅ שמור', callback_data: 'SAVE_P' }, { text: '❌ ביטול', callback_data: 'CANCEL' }]] }
    });
    session.lastMsg = sent.message_id;
  }

  async function saveProperty(chatId, session) {
    const d = session.data;
    try {
      const result = await crm.createProperty({
        address: d.address||'', city: d.city||'', neighborhood: d.neighborhood||'',
        type: d.type||'חנות', deal_type: d.deal_type||'השכרה', status: d.status||'זמין',
        price: d.price||0, area: d.area||0, floor: d.floor||0, total_floors: d.total_floors||0,
        parking: d.parking||0, elevator: d.elevator||0, storage: d.storage||0,
        description: d.description||'', exclusivity: d.exclusivity ? 1 : 0,
        has_tenant: d.has_tenant ? 1 : 0, monthly_rent: d.monthly_rent||0,
        annual_yield: d.annual_yield||0,
        owner_id: d.owner_id || null,
        project_id: d.project_id || null
      });
      if (result.id) {
        let msg = `✅ נכס נוסף! ${d.type} ב${d.city||''}`;
        if (d._project_name) msg += `\n🏗️ פרויקט: ${d._project_name}`;
        if (d._owner_name) msg += `\n👤 בעלים: ${d._owner_name}`;
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
      }
      else throw new Error(result.error||'שגיאה');
    } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
    delete sessions[chatId];
  }

  async function startFromText(chatId, text) {
    delete sessions[chatId];
    bot.sendMessage(chatId, '⏳ מעבד...');
    try {
      const parsed = await parseProperty(text);
      sessions[chatId] = { mode: 'property', data: parsed, skipped: [] };
      const hasMissing = !!Q.getNextQ(QUESTIONS, parsed, []);
      if (hasMissing) {
        const sent = await bot.sendMessage(chatId, fmtProperty(parsed) + '\n*אישור + השלמה?*', {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '✅ אישור + השלמה', callback_data: 'ASK_P' }, { text: '✅ שמור', callback_data: 'SAVE_P' }], [{ text: '❌ ביטול', callback_data: 'CANCEL' }]] }
        });
        sessions[chatId].lastMsg = sent.message_id;
      } else { showSummary(chatId, sessions[chatId]); }
    } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
  }

  async function startEmpty(chatId, prefilled) {
    delete sessions[chatId];
    sessions[chatId] = { mode: 'property', data: prefilled || {}, skipped: [] };
    Q.askNext(bot, chatId, sessions[chatId], QUESTIONS, showSummary);
  }

  // נקודת כניסה: יצירת נכס עם בעלים מוגדר מראש (משמש מ-contacts.js)
  async function startWithOwner(chatId, ownerId, ownerName, dealType) {
    delete sessions[chatId];
    sessions[chatId] = {
      mode: 'property',
      data: {
        owner_id: ownerId,
        _owner_name: ownerName,
        deal_type: dealType || ''
      },
      skipped: []
    };
    bot.sendMessage(chatId, `🏢 *רישום נכס של ${ownerName}*\n${dealType ? '🔑 ' + dealType : ''}`, { parse_mode: 'Markdown' });
    Q.askNext(bot, chatId, sessions[chatId], QUESTIONS, showSummary);
  }

  function handleCallback(chatId, msgId, action, s) {
    removeKB(bot, chatId, msgId);
    if (action === 'ASK_P') { Q.askNext(bot, chatId, s, QUESTIONS, showSummary); return true; }
    if (action === 'SAVE_P') { saveProperty(chatId, s); return true; }
    if (action.includes(':')) {
      const [code, value] = [action.slice(0, action.indexOf(':')), action.slice(action.indexOf(':') + 1)];
      return Q.handleAnswer(bot, chatId, s, QUESTIONS, Q_INDEX, code, value, showSummary);
    }
    return false;
  }

  function handleText(chatId, text, s) {
    return Q.handleText(bot, chatId, text, s, QUESTIONS, Q_INDEX, showSummary);
  }

  return { startFromText, startEmpty, startWithOwner, handleCallback, handleText };
}

module.exports = { register };
