// ═══════════════════════════════════════════════════════════════════════
// start.js — פקודות (/start, /help, /id, /today, /pending, /summary)
// ═══════════════════════════════════════════════════════════════════════

const { isAllowed } = require('./helpers');
const config = require('./config');
const reminders = require('./reminders');

function register(bot) {
  bot.onText(/\/start/, msg => {
    if (!isAllowed(msg.from.id)) return;
    bot.sendMessage(msg.chat.id,
      `🏠 *HAUSDORFF CRM Bot v${config.BOT_VERSION}*\n\n` +
      `*כתוב לי כל דבר ואני אדע מה לעשות:*\n\n` +
      `📱 צרף איש קשר מהטלפון\n` +
      `💬 _"יוסי 054-1234567 משקיע"_\n` +
      `🏢 _"חנות 85 מר באר שבע"_\n` +
      `📋 _"משימה להתקשר ליוסי מחר 10:00"_\n` +
      `📅 _"פגישה עם דוד מחר 14:00"_\n` +
      `🏗️ _"חברה ABC"_\n\n` +
      `*פקודות מועילות:*\n` +
      `/today — משימות היום\n` +
      `/pending — כל המשימות הפתוחות (עם סימון בוצע)\n` +
      `/summary — סיכום היום\n\n` +
      `או פשוט כתוב *שלום* ותקבל תפריט 😊`,
      { parse_mode: 'Markdown' });
  });

  bot.onText(/\/help/, msg => {
    if (!isAllowed(msg.from.id)) return;
    bot.sendMessage(msg.chat.id,
      `📖 *עזרה — גרסה ${config.BOT_VERSION}*\n\n` +
      `*זיהוי אוטומטי:*\n` +
      `📱 צירוף 📎 → איש קשר מהטלפון\n` +
      `💬 הודעה עם טלפון → איש קשר\n` +
      `📅 _"פגישה ..."_ → פגישה\n` +
      `📋 _"משימה/תזכורת ..."_ → משימה\n` +
      `🏢 _"חנות/מרלוג/משרד ..."_ → נכס\n` +
      `🏗️ _"חברה ..."_ → חברה\n` +
      `👋 _"שלום"_ → תפריט ראשי\n\n` +
      `*פקודות:*\n` +
      `/today — משימות היום\n` +
      `/pending — משימות פתוחות + סימון בוצע\n` +
      `/summary — סיכום יומי\n` +
      `/id — מזהה הצ'אט שלך\n\n` +
      `*תזכורות אוטומטיות:*\n` +
      `🌅 09:00 — סיכום משימות היום\n` +
      `☀️ 12:00 — תזכורת על משימות פתוחות\n` +
      `🌆 18:00 — סיכום ערב (בוצע / לא בוצע)\n` +
      `⏰ בכל שעת משימה — תזכורת ייעודית\n\n` +
      `*קישוריות:*\n` +
      `🏢 נכס → אפשר לקשר לפרויקט ולבעלים\n` +
      `📋 משימה / 📅 פגישה → אפשר לקשר לאיש קשר ולנכס\n` +
      `👤 בעל נכס → הצעה אוטומטית לפתוח רישום נכס\n\n` +
      `דלג = כפתור או הקלד "דלג"`,
      { parse_mode: 'Markdown' });
  });

  bot.onText(/\/id/, msg => {
    bot.sendMessage(msg.chat.id, `🆔 מזהה: \`${msg.from.id}\``, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/today/, msg => {
    if (!isAllowed(msg.from.id)) return;
    reminders.registerChat(msg.chat.id);
    reminders.showTodayTasks(bot, msg.chat.id);
  });

  bot.onText(/\/pending/, msg => {
    if (!isAllowed(msg.from.id)) return;
    reminders.registerChat(msg.chat.id);
    reminders.showPendingTasks(bot, msg.chat.id);
  });

  bot.onText(/\/summary/, msg => {
    if (!isAllowed(msg.from.id)) return;
    reminders.registerChat(msg.chat.id);
    reminders.showDailySummary(bot, msg.chat.id);
  });
}

module.exports = { register };
