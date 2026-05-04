// ═══════════════════════════════════════════════════════════════════════
// reminders.js — מנוע תזכורות
// בודק כל דקה אם יש משימות שהגיע זמנן ושולח התראה בטלגרם
// ═══════════════════════════════════════════════════════════════════════

const config = require('./config');
const crm = require('./crm');

// מאגר chatIds של משתמשים מורשים (נשמר כשהם שולחים הודעה)
const knownChats = new Set();

function registerChat(chatId) {
  knownChats.add(chatId);
}

// בדיקת משימות שהגיע זמנן
async function checkReminders(bot) {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMin = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMin}`;

    const tasks = await crm.getTasks();
    if (!Array.isArray(tasks)) return;

    const dueTasks = tasks.filter(t => {
      if (t.completed) return false;
      if (t.due_date !== today) return false;
      if (!t.task_time) return false;
      // בדוק אם הזמן הנוכחי תואם (בדיוק של דקה)
      return t.task_time === currentTime;
    });

    for (const task of dueTasks) {
      const msg = `⏰ *תזכורת!*\n\n` +
        `📋 *${task.title}*\n` +
        (task.type ? `📂 ${task.type}\n` : '') +
        (task.priority ? `🔴 ${task.priority}\n` : '') +
        (task.contact_name ? `👤 ${task.contact_name}\n` : '') +
        (task.description ? `📝 ${task.description}\n` : '') +
        `\n⏰ ${task.task_time} | 📅 ${task.due_date}`;

      // שלח לכל המשתמשים הידועים
      for (const chatId of knownChats) {
        try {
          bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        } catch (e) { /* ignore */ }
      }
    }

    // גם בדוק משימות שעברו ולא הושלמו (תזכורת בוקרית ב-9:00)
    if (currentTime === '09:00') {
      const overdue = tasks.filter(t => !t.completed && t.due_date && t.due_date < today);
      if (overdue.length > 0) {
        const msg = `🔔 *משימות באיחור!*\n\n` +
          overdue.slice(0, 5).map(t =>
            `• *${t.title}* (${t.due_date})${t.priority === 'גבוה' ? ' 🔴' : ''}`
          ).join('\n') +
          (overdue.length > 5 ? `\n\n...ועוד ${overdue.length - 5} משימות` : '');

        for (const chatId of knownChats) {
          try { bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' }); } catch (e) { /* ignore */ }
        }
      }
    }
  } catch (e) {
    // שגיאת CRM — לא קריטי, פשוט מדלגים
  }
}

function start(bot) {
  console.log('⏰ מנוע תזכורות פעיל (בדיקה כל דקה)');
  setInterval(() => checkReminders(bot), config.REMINDER_CHECK_INTERVAL);
}

module.exports = { start, registerChat };
