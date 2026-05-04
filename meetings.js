// ═══════════════════════════════════════════════════════════════════════
// meetings.js — פגישות (חדש v6)
// תאריך + שעה + משך + מיקום + קישור לאיש קשר/נכס
// ═══════════════════════════════════════════════════════════════════════

const { removeKB, fmtMeeting, joinDateTime, endDateTime } = require('./helpers');
const crm = require('./crm');
const Q = require('./questionnaire');
const picker = require('./picker');

const QUESTIONS = [
  { code: 'tt', dbKey: 'title', check: d => !d.title,
    question: '📅 כותרת הפגישה?', buttons: [], freeText: true },
  { code: 'dd', dbKey: 'due_date', check: d => !d.due_date,
    question: '🗓️ תאריך הפגישה?', buttons: [
    [{ text: 'היום', val: 'TODAY' }, { text: 'מחר', val: 'TOMORROW' }],
    [{ text: 'עוד שבוע', val: 'WEEK' }, { text: 'תאריך אחר ✏️', val: 'CUSTOM' }]
  ], customPrompt: '✏️ תאריך (DD/MM/YYYY):' },
  { code: 'tm', dbKey: 'start_time', check: d => !d.start_time,
    question: '⏰ שעה?', buttons: [
    [{ text: '08:00', val: '08:00' }, { text: '09:00', val: '09:00' }, { text: '10:00', val: '10:00' }],
    [{ text: '12:00', val: '12:00' }, { text: '14:00', val: '14:00' }, { text: '16:00', val: '16:00' }],
    [{ text: '18:00', val: '18:00' }, { text: 'אחרת ✏️', val: 'CUSTOM' }]
  ], customPrompt: '✏️ שעה (HH:MM):' },
  { code: 'dr', dbKey: 'duration_min', check: d => !d.duration_min,
    question: '⏱️ משך?', buttons: [
    [{ text: '30 דק׳', val: '30' }, { text: '45 דק׳', val: '45' }, { text: '60 דק׳', val: '60' }],
    [{ text: '90 דק׳', val: '90' }, { text: '120 דק׳', val: '120' }, { text: 'אחר ✏️', val: 'CUSTOM' }]
  ], isNumber: true, customPrompt: '✏️ משך בדקות:' },
  { code: 'lo', dbKey: 'location', check: d => !d.location,
    question: '📍 מיקום?', buttons: [
    [{ text: 'במשרד', val: 'במשרד שלנו' }, { text: 'אצל הלקוח', val: 'אצל הלקוח' }],
    [{ text: 'בנכס', val: 'בנכס' }, { text: 'זום', val: 'זום' }],
    [{ text: 'אחר ✏️', val: 'CUSTOM' }]
  ], customPrompt: '✏️ מיקום:' },

  // ── קישור לאיש קשר ──
  { code: 'lc', dbKey: 'contact_id', check: d => !d.contact_id,
    question: '👤 לקשר לאיש קשר?',
    buildButtons: async () => picker.buttonsForContacts(),
    onAnswer: (data, val) => { data._contact_name = picker.getLabel('contacts', val); }
  },

  // ── קישור לנכס ──
  { code: 'lp', dbKey: 'property_id', check: d => !d.property_id,
    question: '🏢 לקשר לנכס?',
    buildButtons: async () => picker.buttonsForProperties(),
    onAnswer: (data, val) => { data._property_label = picker.getLabel('properties', val); }
  },

  { code: 'ds', dbKey: 'description', check: d => !d._descAsked,
    question: '📝 הערות לפגישה?', buttons: [], freeText: true },
];

const Q_INDEX = Q.buildIndex(QUESTIONS);

function resolveDate(val) {
  const d = new Date();
  if (val === 'TODAY') return d.toISOString().split('T')[0];
  if (val === 'TOMORROW') { d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; }
  if (val === 'WEEK') { d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]; }
  const m = val.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return val;
}

function resolveTime(val) {
  const m = val.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
  return val;
}

function register(bot, sessions) {

  async function showSummary(chatId, session) {
    session.waitingFor = null; session.freeText = false;
    session.data._descAsked = true;
    const sent = await bot.sendMessage(chatId, fmtMeeting(session.data) + '\n✅ *לשמור?*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '✅ שמור', callback_data: 'SAVE_M' }, { text: '❌ ביטול', callback_data: 'CANCEL' }]] }
    });
    session.lastMsg = sent.message_id;
  }

  async function saveMeeting(chatId, session) {
    const d = session.data;
    try {
      const start_dt = joinDateTime(d.due_date, d.start_time);
      const end_dt = endDateTime(d.due_date, d.start_time, d.duration_min || 60);

      // יצירת פגישה ב-API
      let result;
      try {
        result = await crm.createMeeting({
          title: d.title || 'פגישה',
          description: d.description || '',
          start_datetime: start_dt,
          end_datetime: end_dt,
          location: d.location || '',
          contact_id: d.contact_id || null,
          deal_id: d.deal_id || null,
          status: 'scheduled'
        });
      } catch (e) { result = { error: e.message }; }

      // אם יצירת meeting נכשלה — נסה כ-task מסוג "פגישה" (fallback)
      if (!result.id) {
        const taskRes = await crm.createTask({
          title: d.title || 'פגישה',
          description: `[${d.location||''}] ${d.description||''}`.trim(),
          due_date: d.due_date,
          task_time: d.start_time,
          priority: 'גבוה',
          type: 'פגישה',
          contact_id: d.contact_id || null,
          property_id: d.property_id || null
        });
        if (!taskRes.id) throw new Error(taskRes.error || 'שגיאה ביצירת פגישה');
      }

      let msg = `✅ פגישה נוספה: *${d.title}*\n📅 ${d.due_date} ⏰ ${d.start_time}`;
      if (d.duration_min) msg += ` (${d.duration_min} דק׳)`;
      if (d.location) msg += `\n📍 ${d.location}`;
      if (d._contact_name) msg += `\n👤 ${d._contact_name}`;
      if (d._property_label) msg += `\n🏢 ${d._property_label}`;
      bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
    delete sessions[chatId];
  }

  async function startFromText(chatId, text) {
    delete sessions[chatId];
    const clean = text.replace(/^(פגישה|meeting)\s*/i, '').trim();
    sessions[chatId] = { mode: 'meeting', data: { title: clean || '' }, skipped: [] };
    Q.askNext(bot, chatId, sessions[chatId], QUESTIONS, showSummary);
  }

  async function startEmpty(chatId) {
    delete sessions[chatId];
    sessions[chatId] = { mode: 'meeting', data: {}, skipped: [] };
    Q.askNext(bot, chatId, sessions[chatId], QUESTIONS, showSummary);
  }

  function handleCallback(chatId, msgId, action, s) {
    removeKB(bot, chatId, msgId);
    if (action === 'SAVE_M') { saveMeeting(chatId, s); return true; }
    if (action.includes(':')) {
      const [code, value] = [action.slice(0, action.indexOf(':')), action.slice(action.indexOf(':') + 1)];
      if (code === 'dd' && !['SKIP','CUSTOM'].includes(value)) {
        s.data.due_date = resolveDate(value);
        s.waitingFor = null;
        Q.askNext(bot, chatId, s, QUESTIONS, showSummary);
        return true;
      }
      if (code === 'tm' && !['SKIP','CUSTOM'].includes(value)) {
        s.data.start_time = value;
        s.waitingFor = null;
        Q.askNext(bot, chatId, s, QUESTIONS, showSummary);
        return true;
      }
      return Q.handleAnswer(bot, chatId, s, QUESTIONS, Q_INDEX, code, value, showSummary);
    }
    return false;
  }

  function handleText(chatId, text, s) {
    if (s.waitingFor === 'dd' && s.freeText) {
      s.data.due_date = resolveDate(text);
      if (s.lastMsg) removeKB(bot, chatId, s.lastMsg);
      s.waitingFor = null; s.freeText = false;
      Q.askNext(bot, chatId, s, QUESTIONS, showSummary);
      return true;
    }
    if (s.waitingFor === 'tm' && s.freeText) {
      s.data.start_time = resolveTime(text);
      if (s.lastMsg) removeKB(bot, chatId, s.lastMsg);
      s.waitingFor = null; s.freeText = false;
      Q.askNext(bot, chatId, s, QUESTIONS, showSummary);
      return true;
    }
    return Q.handleText(bot, chatId, text, s, QUESTIONS, Q_INDEX, showSummary);
  }

  return { startFromText, startEmpty, handleCallback, handleText };
}

module.exports = { register };
