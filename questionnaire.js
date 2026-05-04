// ═══════════════════════════════════════════════════════════════════════
// questionnaire.js — מנוע שאלון כללי v2
// ═══════════════════════════════════════════════════════════════════════

const { removeKB, fmt } = require('./helpers');

function getNextQ(questions, data, skipped) {
  for (const q of questions) {
    if (q.check(data) && !(skipped || []).includes(q.code)) return q;
  }
  return null;
}

async function askNext(bot, chatId, session, questions, onComplete) {
  const q = getNextQ(questions, session.data, session.skipped);
  if (!q) { onComplete(chatId, session); return; }

  session.waitingFor = q.code;
  session.freeText = q.freeText || false;

  const kb = q.buttons.map(row =>
    row.map(b => ({ text: b.text, callback_data: `${q.code}:${b.val}` }))
  );
  kb.push([{ text: 'דלג ⏭️', callback_data: `${q.code}:SKIP` }]);

  const sent = await bot.sendMessage(chatId, q.question, { reply_markup: { inline_keyboard: kb } });
  session.lastMsg = sent.message_id;
}

function doSkip(bot, chatId, session, questions, onComplete) {
  if (!session.skipped) session.skipped = [];
  if (session.waitingFor && !session.skipped.includes(session.waitingFor)) session.skipped.push(session.waitingFor);
  session.waitingFor = null; session.freeText = false;
  askNext(bot, chatId, session, questions, onComplete);
}

function handleAnswer(bot, chatId, session, questions, qIndex, code, value, onComplete) {
  const q = qIndex[code];
  if (!q) return false;

  if (value === 'SKIP') { doSkip(bot, chatId, session, questions, onComplete); return true; }
  if (value === 'CUSTOM') { session.freeText = true; if (q.customPrompt) bot.sendMessage(chatId, q.customPrompt); return true; }
  if (value === 'SALE') {
    session.data.budget_max = -1;
    session.data.notes = (session.data.notes || '') + (session.data.notes ? ' | ' : '') + 'רכישה';
    session.waitingFor = null; askNext(bot, chatId, session, questions, onComplete); return true;
  }

  if (q.isArray) {
    if (!session.data[q.dbKey]) session.data[q.dbKey] = [];
    session.data[q.dbKey].push(value);
  } else if (q.dbKey === 'budget_max' || q.dbKey === 'price' || q.dbKey === 'area' || q.dbKey === 'floor' ||
             q.dbKey === 'parking' || q.dbKey === 'monthly_rent' || q.dbKey === 'budget_min') {
    session.data[q.dbKey] = parseInt(value);
  } else {
    session.data[q.dbKey] = value;
  }
  session.waitingFor = null;
  askNext(bot, chatId, session, questions, onComplete);
  return true;
}

function handleText(bot, chatId, text, session, questions, qIndex, onComplete) {
  if (!session.waitingFor) return false;

  if (/^דלג$/i.test(text)) {
    if (session.lastMsg) removeKB(bot, chatId, session.lastMsg);
    doSkip(bot, chatId, session, questions, onComplete);
    return true;
  }

  const q = qIndex[session.waitingFor];
  if (!q) return false;

  // validation
  if (q.validate) {
    const val = q.validate(text);
    if (val !== null && val !== undefined) {
      session.data[q.dbKey] = val;
      if (session.lastMsg) removeKB(bot, chatId, session.lastMsg);
      session.waitingFor = null; session.freeText = false;
      askNext(bot, chatId, session, questions, onComplete);
    } else {
      bot.sendMessage(chatId, q.errorMsg || '🤔 נסה שוב או הקלד "דלג"');
    }
    return true;
  }

  // number parsing (budget, price, area)
  if (q.isNumber && session.freeText) {
    const num = text.replace(/[,₪\s]/g, '');
    let amount = parseFloat(num) || 0;
    if (/M|מיליון/i.test(text)) amount *= 1e6;
    else if (/K|אלף/i.test(text)) amount *= 1e3;
    if (amount > 0) {
      session.data[q.dbKey] = amount;
      bot.sendMessage(chatId, `💰 ${fmt(amount)} ${q.unit || '₪'}`);
      if (session.lastMsg) removeKB(bot, chatId, session.lastMsg);
      session.waitingFor = null; session.freeText = false;
      askNext(bot, chatId, session, questions, onComplete);
    } else {
      bot.sendMessage(chatId, '🤔 כתוב מספר: 15000 / 80K / 5M');
    }
    return true;
  }

  // free text
  if (session.freeText) {
    if (q.isArray) session.data[q.dbKey] = [text];
    else session.data[q.dbKey] = text;
    if (q.code === 'nt') session.data._notesAsked = true;
    if (session.lastMsg) removeKB(bot, chatId, session.lastMsg);
    session.waitingFor = null; session.freeText = false;
    askNext(bot, chatId, session, questions, onComplete);
    return true;
  }

  return false;
}

function buildIndex(questions) {
  const map = {};
  questions.forEach(q => { map[q.code] = q; });
  return map;
}

module.exports = { getNextQ, askNext, doSkip, handleAnswer, handleText, buildIndex };
