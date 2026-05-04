// ═══════════════════════════════════════════════════════════════════════
// reminders.js v6 — מנוע תזכורות פרואקטיבי
// ▸ לכל משימה — תזכורת בזמן שלה (שעה + דקה)
// ▸ 09:00 — סיכום בוקרי: משימות היום + משימות באיחור
// ▸ 12:00 — תזכורת שנייה: משימות היום שעדיין לא בוצעו
// ▸ 18:00 — סיכום ערב: מה בוצע / מה לא בוצע היום
// ▸ כל תזכורת מגיעה עם כפתורי פעולה: ✅ בוצע, ⏰ דחה למחר
// ═══════════════════════════════════════════════════════════════════════

const config = require('./config');
const crm = require('./crm');
const { todayISO, addDaysISO, dateReadable } = require('./helpers');

// מאגר chatIds של משתמשים מורשים (נשמר כשהם שולחים הודעה)
const knownChats = new Set();

// מנגנון אנטי-כפילות: לא לשלוח אותה תזכורת פעמיים באותה דקה/שעה
const sentToday = {
  date: '',
  taskTimes: new Set(),   // taskId:HH:MM
  morning: false,
  noon: false,
  evening: false
};

function resetIfNewDay() {
  const today = todayISO();
  if (sentToday.date !== today) {
    sentToday.date = today;
    sentToday.taskTimes.clear();
    sentToday.morning = false;
    sentToday.noon = false;
    sentToday.evening = false;
  }
}

function registerChat(chatId) {
  knownChats.add(chatId);
}

// ── יצירת כפתורי פעולה ל-משימה ──────────────────────────────────────
function taskActionButtons(taskId) {
  return {
    inline_keyboard: [[
      { text: '✅ בוצע', callback_data: `TASK_DONE:${taskId}` },
      { text: '⏰ דחה למחר', callback_data: `TASK_POSTPONE:${taskId}` }
    ]]
  };
}

// ── שלח לכל משתמשים ──────────────────────────────────────────────────
async function sendToAll(bot, msg, opts) {
  for (const chatId of knownChats) {
    try { await bot.sendMessage(chatId, msg, opts); }
    catch (e) { /* ignore */ }
  }
}

// ── תזכורות פר-משימה (לפי שעת המשימה) ───────────────────────────────
async function checkTaskReminders(bot, tasks, today, currentTime) {
  const dueTasks = tasks.filter(t => {
    if (t.completed) return false;
    if (t.due_date !== today) return false;
    if (!t.task_time) return false;
    return t.task_time === currentTime;
  });

  for (const task of dueTasks) {
    const key = `${task.id}:${currentTime}`;
    if (sentToday.taskTimes.has(key)) continue;
    sentToday.taskTimes.add(key);

    const msg = `⏰ *תזכורת משימה!*\n\n` +
      `📋 *${task.title}*\n` +
      (task.type ? `📂 ${task.type}\n` : '') +
      (task.priority ? `🔴 ${task.priority}\n` : '') +
      (task.contact_name ? `👤 ${task.contact_name}\n` : '') +
      (task.description ? `📝 ${task.description}\n` : '') +
      `\n⏰ ${task.task_time} | 📅 ${task.due_date}`;

    await sendToAll(bot, msg, {
      parse_mode: 'Markdown',
      reply_markup: taskActionButtons(task.id)
    });
  }
}

// ── 09:00 — סיכום בוקרי ──────────────────────────────────────────────
async function morningBriefing(bot, tasks, today) {
  if (sentToday.morning) return;
  sentToday.morning = true;

  const todayTasks = tasks.filter(t => !t.completed && t.due_date === today);
  const overdue = tasks.filter(t => !t.completed && t.due_date && t.due_date < today);

  let msg = `🌅 *בוקר טוב! סיכום היום*\n\n`;

  if (todayTasks.length === 0 && overdue.length === 0) {
    msg += `🎉 אין משימות היום. יום שקט!`;
    await sendToAll(bot, msg, { parse_mode: 'Markdown' });
    return;
  }

  if (todayTasks.length > 0) {
    msg += `📋 *משימות להיום (${todayTasks.length}):*\n`;
    todayTasks.slice(0, 10).forEach(t => {
      const time = t.task_time ? `⏰ ${t.task_time} ` : '';
      const pri = t.priority === 'גבוה' ? ' 🔴' : '';
      msg += `• ${time}*${t.title}*${pri}\n`;
    });
    if (todayTasks.length > 10) msg += `\n_...ועוד ${todayTasks.length - 10} משימות_\n`;
  }

  if (overdue.length > 0) {
    msg += `\n⚠️ *באיחור (${overdue.length}):*\n`;
    overdue.slice(0, 5).forEach(t => {
      msg += `• *${t.title}* (${dateReadable(t.due_date)})\n`;
    });
    if (overdue.length > 5) msg += `_...ועוד ${overdue.length - 5}_\n`;
  }

  msg += `\n💪 בהצלחה! תזכורות יישלחו בזמן.`;

  await sendToAll(bot, msg, { parse_mode: 'Markdown' });
}

// ── 12:00 — תזכורת שנייה ───────────────────────────────────────────
async function noonReminder(bot, tasks, today) {
  if (sentToday.noon) return;
  sentToday.noon = true;

  const pending = tasks.filter(t => !t.completed && t.due_date === today);
  if (pending.length === 0) {
    await sendToAll(bot, `☀️ *הצהריים*\n\n🎉 כל המשימות של היום בוצעו!`, { parse_mode: 'Markdown' });
    return;
  }

  let msg = `☀️ *הצהריים — עדיין פתוחות*\n\n`;
  msg += `📋 ${pending.length} משימות מחכות:\n\n`;
  pending.slice(0, 10).forEach(t => {
    const time = t.task_time ? `⏰ ${t.task_time} ` : '';
    const pri = t.priority === 'גבוה' ? ' 🔴' : '';
    msg += `• ${time}*${t.title}*${pri}\n`;
  });
  if (pending.length > 10) msg += `\n_...ועוד ${pending.length - 10}_\n`;
  msg += `\n💪 קדימה!`;

  await sendToAll(bot, msg, { parse_mode: 'Markdown' });
}

// ── 18:00 — סיכום יומי ──────────────────────────────────────────────
async function eveningSummary(bot, tasks, today) {
  if (sentToday.evening) return;
  sentToday.evening = true;

  // משימות שתאריך היעד שלהן היום
  const todayDue = tasks.filter(t => t.due_date === today);
  const done = todayDue.filter(t => t.completed);
  const notDone = todayDue.filter(t => !t.completed);

  // גם מה שהושלם היום ללא קשר לתאריך (אם updated_at היום)
  const doneToday = tasks.filter(t => t.completed && (t.updated_at||'').startsWith(today));

  let msg = `🌆 *סיכום יומי*\n📅 ${today}\n\n`;
  msg += `✅ *בוצעו היום:* ${doneToday.length}\n`;
  msg += `❌ *לא בוצעו:* ${notDone.length}\n\n`;

  if (doneToday.length > 0) {
    msg += `*✅ מה בוצע:*\n`;
    doneToday.slice(0, 8).forEach(t => { msg += `• ${t.title}\n`; });
    if (doneToday.length > 8) msg += `_...ועוד ${doneToday.length - 8}_\n`;
    msg += '\n';
  }

  if (notDone.length > 0) {
    msg += `*❌ נדחה / לא בוצע:*\n`;
    notDone.slice(0, 8).forEach(t => {
      const pri = t.priority === 'גבוה' ? ' 🔴' : '';
      msg += `• *${t.title}*${pri}\n`;
    });
    if (notDone.length > 8) msg += `_...ועוד ${notDone.length - 8}_\n`;
    msg += `\n💡 _אפשר לדחות אותן למחר ב-/pending_\n`;
  }

  if (doneToday.length === 0 && notDone.length === 0) {
    msg += `_אין משימות לתאריך זה._\n`;
  }

  msg += `\n👋 ערב טוב!`;

  await sendToAll(bot, msg, { parse_mode: 'Markdown' });
}

// ── טיפול בלחיצה על "✅ בוצע" / "⏰ דחה למחר" ─────────────────────
async function handleTaskAction(bot, chatId, msgId, action) {
  const [cmd, taskId] = action.split(':');
  try {
    if (cmd === 'TASK_DONE') {
      await crm.completeTask(taskId);
      await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '✅ סומן כבוצע', callback_data: 'NOOP' }]] },
        { chat_id: chatId, message_id: msgId }).catch(() => {});
      bot.sendMessage(chatId, '✅ סומן כבוצע!');
      return true;
    }
    if (cmd === 'TASK_POSTPONE') {
      const newDate = addDaysISO(1);
      await crm.postponeTask(taskId, newDate, 'נדחה דרך הבוט');
      await bot.editMessageReplyMarkup({ inline_keyboard: [[{ text: '⏰ נדחה למחר', callback_data: 'NOOP' }]] },
        { chat_id: chatId, message_id: msgId }).catch(() => {});
      bot.sendMessage(chatId, `⏰ נדחה למחר (${newDate})`);
      return true;
    }
  } catch (e) {
    bot.sendMessage(chatId, `❌ ${e.message}`);
  }
  return false;
}

// ── הלולאה הראשית — נקראת כל דקה ─────────────────────────────────
async function checkReminders(bot) {
  try {
    resetIfNewDay();
    const now = new Date();
    const today = todayISO();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMin = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMin}`;

    if (knownChats.size === 0) return;

    const tasks = await crm.getTasks();
    if (!Array.isArray(tasks)) return;

    // 1. תזכורות פר-משימה (לכל הזמן)
    await checkTaskReminders(bot, tasks, today, currentTime);

    // 2. שלוש שיגורי-יום
    if (currentTime === '09:00') await morningBriefing(bot, tasks, today);
    else if (currentTime === '12:00') await noonReminder(bot, tasks, today);
    else if (currentTime === '18:00') await eveningSummary(bot, tasks, today);
  } catch (e) {
    // שגיאת CRM — לא קריטי, פשוט מדלגים
  }
}

function start(bot) {
  console.log('⏰ מנוע תזכורות v6 (09:00 / 12:00 / 18:00 + פר-משימה)');
  setInterval(() => checkReminders(bot), config.REMINDER_CHECK_INTERVAL);
}

// ── פקודות ידניות (מ-start.js) ─────────────────────────────────────
async function showTodayTasks(bot, chatId) {
  try {
    const tasks = await crm.getTasks();
    const today = todayISO();
    const todayTasks = tasks.filter(t => !t.completed && t.due_date === today);
    if (todayTasks.length === 0) {
      bot.sendMessage(chatId, '🎉 אין משימות פתוחות להיום.');
      return;
    }
    let msg = `📋 *משימות היום (${todayTasks.length}):*\n\n`;
    todayTasks.forEach(t => {
      const time = t.task_time ? `⏰ ${t.task_time} ` : '';
      const pri = t.priority === 'גבוה' ? ' 🔴' : '';
      msg += `• ${time}*${t.title}*${pri}\n`;
      if (t.contact_name) msg += `  👤 ${t.contact_name}\n`;
    });
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
}

async function showPendingTasks(bot, chatId) {
  try {
    const tasks = await crm.getTasks();
    const today = todayISO();
    const pending = tasks.filter(t => !t.completed && t.due_date && t.due_date <= today);
    if (pending.length === 0) {
      bot.sendMessage(chatId, '🎉 אין משימות פתוחות.');
      return;
    }
    // הצג את 10 הראשונות עם כפתורי פעולה (אחת בכל הודעה כדי שיהיו כפתורים)
    bot.sendMessage(chatId, `📋 *${pending.length} משימות פתוחות:*`, { parse_mode: 'Markdown' });
    for (const t of pending.slice(0, 10)) {
      const time = t.task_time ? `⏰ ${t.task_time} ` : '';
      const pri = t.priority === 'גבוה' ? ' 🔴' : '';
      const date = dateReadable(t.due_date);
      let msg = `📅 ${date} ${time}\n*${t.title}*${pri}`;
      if (t.contact_name) msg += `\n👤 ${t.contact_name}`;
      if (t.description) msg += `\n📝 ${t.description}`;
      await bot.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: taskActionButtons(t.id)
      });
    }
    if (pending.length > 10) {
      bot.sendMessage(chatId, `_...ועוד ${pending.length - 10} משימות_`, { parse_mode: 'Markdown' });
    }
  } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
}

async function showDailySummary(bot, chatId) {
  try {
    const tasks = await crm.getTasks();
    const today = todayISO();
    const todayDue = tasks.filter(t => t.due_date === today);
    const done = todayDue.filter(t => t.completed);
    const notDone = todayDue.filter(t => !t.completed);
    const doneToday = tasks.filter(t => t.completed && (t.updated_at||'').startsWith(today));

    let msg = `🌆 *סיכום יומי — ${today}*\n\n`;
    msg += `✅ בוצעו: ${doneToday.length}\n`;
    msg += `❌ לא בוצעו: ${notDone.length}\n\n`;
    if (doneToday.length > 0) {
      msg += `*✅ מה בוצע:*\n`;
      doneToday.slice(0, 10).forEach(t => { msg += `• ${t.title}\n`; });
      msg += '\n';
    }
    if (notDone.length > 0) {
      msg += `*❌ ממתין:*\n`;
      notDone.slice(0, 10).forEach(t => {
        const pri = t.priority === 'גבוה' ? ' 🔴' : '';
        msg += `• ${t.title}${pri}\n`;
      });
    }
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  } catch (e) { bot.sendMessage(chatId, `❌ ${e.message}`); }
}

module.exports = {
  start,
  registerChat,
  handleTaskAction,
  showTodayTasks,
  showPendingTasks,
  showDailySummary
};
