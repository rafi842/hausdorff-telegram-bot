// ═══════════════════════════════════════════════════════════════════════
// modules/tasks.js — משימות (מותאם ל-CRM)
// ═══════════════════════════════════════════════════════════════════════

const { removeKB } = require('../helpers');
const crm = require('../crm');
const Q = require('../questionnaire');

const QUESTIONS = [
  { code: 'tt', dbKey: 'title', check: d => !d.title,
    question: '📋 מה המשימה? (כתוב בחופשיות)', buttons: [], freeText: true },
  { code: 'tp', dbKey: 'type', check: d => !d.type, question: '📂 סוג?', buttons: [
    [{ text: 'שיחה', val: 'שיחה' }, { text: 'פגישה', val: 'פגישה' }, { text: 'אימייל', val: 'אימייל' }],
    [{ text: 'מסמך', val: 'מסמך' }, { text: 'בדיקה', val: 'בדיקה' }, { text: 'משימה', val: 'משימה' }]
  ]},
  { code: 'pr', dbKey: 'priority', check: d => !d.priority, question: '🔴 עדיפות?', buttons: [
    [{ text: 'גבוה 🔴', val: 'גבוה' }, { text: 'בינוני 🟡', val: 'בינוני' }, { text: 'נמוך 🟢', val: 'נמוך' }]
  ]},
  { code: 'dd', dbKey: 'due_date', check: d => !d.due_date, question: '📅 מתי?', buttons: [
    [{ text: 'היום', val: 'TODAY' }, { text: 'מחר', val: 'TOMORROW' }],
    [{ text: 'עוד שבוע', val: 'WEEK' }, { text: 'אחר ✏️', val: 'CUSTOM' }]
  ], customPrompt: '✏️ תאריך (DD/MM/YYYY):' },
  { code: 'ds', dbKey: 'description', check: d => !d.description,
    question: '📝 פירוט? (או דלג)', buttons: [], freeText: true },
];

const Q_INDEX = Q.buildIndex(QUESTIONS);

function register(bot, sessions) {

  function fmtTask(d) {
    let m = `📋 *משימה*\n*${d.title || ''}*\n`;
    if (d.type) m += `סוג: ${d.type}\n`;
    if (d.priority) m += `עדיפות: ${d.priority}\n`;
    if (d.due_date) m += `תאריך: ${d.due_date}\n`;
    if (d.description) m += `📝 ${d.description}\n`;
    return m;
  }

  async function showSummary(chatId, session) {
    session.waitingFor = null; session.freeText = false;
    const sent = await bot.sendMessage(chatId, fmtTask(session.data) + '\n✅ *לשמור?*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '✅ שמור', callback_data: 'SAVE_T' }, { text: '❌ ביטול', callback_data: 'CANCEL' }]] }
    });
    session.lastMsg = sent.message_id;
  }

  async function saveTask(chatId, session) {
    const d = session.data;
    try {
      const result = await crm.request('POST', '/api/tasks', {
        title: d.title||'', description: d.description||'',
        due_date: d.due_date||null, task_time: d.task_time||'',
        priority: d.priority||'בינוני', type: d.type||'משימה'
      });
      if (result.id) bot.sendMessage(chatId, `✅ משימה נוספה: *${d.title}*`, { parse_mode: 'Markdown' });
      else throw new Error(result.error||'שגיאה');
    } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
    delete sessions[chatId];
  }

  function resolveDate(val) {
    const d = new Date();
    if (val === 'TODAY') return d.toISOString().split('T')[0];
    if (val === 'TOMORROW') { d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
    if (val === 'WEEK') { d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; }
    // DD/MM/YYYY → YYYY-MM-DD
    const m = val.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return val;
  }

  async function startFromText(chatId, text) {
    delete sessions[chatId];
    const clean = text.replace(/^(משימה|תזכורת|לעשות|להתקשר|לשלוח)\s*/i, '').trim();
    sessions[chatId] = { mode: 'task', data: { title: clean || '' }, skipped: [] };
    Q.askNext(bot, chatId, sessions[chatId], QUESTIONS, showSummary);
  }

  async function startEmpty(chatId) {
    delete sessions[chatId];
    sessions[chatId] = { mode: 'task', data: {}, skipped: [] };
    Q.askNext(bot, chatId, sessions[chatId], QUESTIONS, showSummary);
  }

  function handleCallback(chatId, msgId, action, s) {
    removeKB(bot, chatId, msgId);
    if (action === 'SAVE_T') { saveTask(chatId, s); return true; }
    if (action.includes(':')) {
      const [code, value] = [action.slice(0, action.indexOf(':')), action.slice(action.indexOf(':') + 1)];
      // resolve dates
      if (code === 'dd' && !['SKIP','CUSTOM'].includes(value)) {
        s.data.due_date = resolveDate(value);
        s.waitingFor = null;
        Q.askNext(bot, chatId, s, QUESTIONS, showSummary);
        return true;
      }
      return Q.handleAnswer(bot, chatId, s, QUESTIONS, Q_INDEX, code, value, showSummary);
    }
    return false;
  }

  function handleText(chatId, text, s) {
    // date parsing for free text
    if (s.waitingFor === 'dd' && s.freeText) {
      s.data.due_date = resolveDate(text);
      s.waitingFor = null; s.freeText = false;
      Q.askNext(bot, chatId, s, QUESTIONS, showSummary);
      return true;
    }
    return Q.handleText(bot, chatId, text, s, QUESTIONS, Q_INDEX, showSummary);
  }

  return { startFromText, startEmpty, handleCallback, handleText };
}

module.exports = { register };
