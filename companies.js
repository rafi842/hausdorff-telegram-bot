// ═══════════════════════════════════════════════════════════════════════
// modules/companies.js — חברות
// ═══════════════════════════════════════════════════════════════════════

const { removeKB } = require('./helpers');
const crm = require('./crm');
const Q = require('./questionnaire');

const QUESTIONS = [
  { code: 'nm', dbKey: 'name', check: d => !d.name, question: '🏗️ שם החברה?', buttons: [], freeText: true },
  { code: 'tp', dbKey: 'type', check: d => !d.type, question: '📂 סוג חברה?', buttons: [
    [{ text: 'יזם', val: 'יזם' }, { text: 'קבלן', val: 'קבלן' }],
    [{ text: 'משקיע', val: 'משקיע' }, { text: 'לקוח', val: 'לקוח' }]
  ]},
  { code: 'ph', dbKey: 'phone', check: d => !d.phone, question: '📞 טלפון?', buttons: [], freeText: true },
  { code: 'em', dbKey: 'email', check: d => !d.email, question: '📧 אימייל?', buttons: [], freeText: true,
    validate: text => { const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/); return m ? m[0] : null; },
    errorMsg: '🤔 לא אימייל. נסה שוב או "דלג"' },
  { code: 'ad', dbKey: 'address', check: d => !d.address, question: '📍 כתובת?', buttons: [], freeText: true },
  { code: 'nt', dbKey: 'notes', check: d => !d._notesAsked, question: '📝 הערות?', buttons: [], freeText: true },
];

const Q_INDEX = Q.buildIndex(QUESTIONS);

function register(bot, sessions) {

  async function showSummary(chatId, session) {
    session.waitingFor = null; session.freeText = false;
    const d = session.data;
    let m = `🏗️ *חברה חדשה*\n*${d.name||''}*\n`;
    if (d.type) m += `סוג: ${d.type}\n`;
    if (d.phone) m += `טלפון: ${d.phone}\n`;
    if (d.email) m += `אימייל: ${d.email}\n`;
    if (d.address) m += `כתובת: ${d.address}\n`;
    if (d.notes) m += `📝 ${d.notes}\n`;
    const sent = await bot.sendMessage(chatId, m + '\n✅ *לשמור?*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '✅ שמור', callback_data: 'SAVE_C' }, { text: '❌ ביטול', callback_data: 'CANCEL' }]] }
    });
    session.lastMsg = sent.message_id;
  }

  async function saveCompany(chatId, session) {
    const d = session.data;
    try {
      const result = await crm.request('POST', '/api/companies', {
        name: d.name||'', type: d.type||'לקוח', phone: d.phone||'',
        email: d.email||'', address: d.address||'', notes: d.notes||''
      });
      if (result.id) bot.sendMessage(chatId, `✅ חברת *${d.name}* נוספה!`, { parse_mode: 'Markdown' });
      else throw new Error(result.error||'שגיאה');
    } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
    delete sessions[chatId];
  }

  async function startFromText(chatId, text) {
    delete sessions[chatId];
    const name = text.replace(/^(חברה|חב')\s*/i, '').trim();
    sessions[chatId] = { mode: 'company', data: { name: name || '' }, skipped: [] };
    Q.askNext(bot, chatId, sessions[chatId], QUESTIONS, showSummary);
  }

  async function startEmpty(chatId) {
    delete sessions[chatId];
    sessions[chatId] = { mode: 'company', data: {}, skipped: [] };
    Q.askNext(bot, chatId, sessions[chatId], QUESTIONS, showSummary);
  }

  function handleCallback(chatId, msgId, action, s) {
    removeKB(bot, chatId, msgId);
    if (action === 'SAVE_C') { saveCompany(chatId, s); return true; }
    if (action.includes(':')) {
      const [code, value] = [action.slice(0, action.indexOf(':')), action.slice(action.indexOf(':') + 1)];
      return Q.handleAnswer(bot, chatId, s, QUESTIONS, Q_INDEX, code, value, showSummary);
    }
    return false;
  }

  function handleText(chatId, text, s) {
    return Q.handleText(bot, chatId, text, s, QUESTIONS, Q_INDEX, showSummary);
  }

  return { startFromText, startEmpty, handleCallback, handleText };
}

module.exports = { register };
