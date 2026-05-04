// ═══════════════════════════════════════════════════════════════════════
// modules/start.js — פקודות בסיס
// ═══════════════════════════════════════════════════════════════════════

const { isAllowed } = require('./helpers');
const config = require('./config');

function register(bot) {
  bot.onText(/\/start/, msg => {
    if (!isAllowed(msg.from.id)) return;
    bot.sendMessage(msg.chat.id,
      `🏠 *HAUSDORFF CRM Bot v${config.BOT_VERSION}*\n\n` +
      `*שלח לי כל דבר ואני אדע מה לעשות:*\n\n` +
      `📱 *צרף איש קשר* מהטלפון → שאלון מלא\n` +
      `💬 *"יוסי 054-1234567 משקיע"* → איש קשר\n` +
      `🏢 *"חנות 85 מר באר שבע"* → נכס\n` +
      `📋 *"משימה להתקשר ליוסי"* → משימה\n` +
      `🏗️ *"חברה ABC"* → חברה\n\n` +
      `או פשוט כתוב משהו — אני אשאל מה לעשות 😊`,
      { parse_mode: 'Markdown' });
  });

  bot.onText(/\/help/, msg => {
    if (!isAllowed(msg.from.id)) return;
    bot.sendMessage(msg.chat.id,
      `📖 *עזרה*\n\n` +
      `📱 צירוף: 📎 → איש קשר מהטלפון\n` +
      `💬 טקסט עם טלפון → איש קשר אוטומטי\n` +
      `🏢 "חנות/מרלוג/משרד..." → נכס\n` +
      `📋 "משימה/תזכורת/להתקשר..." → משימה\n` +
      `🏗️ "חברה..." → חברה\n\n` +
      `טקסט אחר → תפריט בחירה\n` +
      `דלג = כפתור או הקלדת "דלג"`,
      { parse_mode: 'Markdown' });
  });

  bot.onText(/\/id/, msg => {
    bot.sendMessage(msg.chat.id, `🆔 מזהה: \`${msg.from.id}\``, { parse_mode: 'Markdown' });
  });

  // פקודת /נכס — ניתוב למודול נכסים
  bot.onText(/^\/נכס\s+(.+)/s, (msg, match) => {
    if (!isAllowed(msg.from.id)) return;
    // יטופל על ידי message handler ב-bot.js
    // כי ההודעה מתחילה ב"נכס" אז הניתוב יתפוס
  });
}

module.exports = { register };
