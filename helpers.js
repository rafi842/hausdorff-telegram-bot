// ═══════════════════════════════════════════════════════════════════════
// helpers.js — פונקציות עזר משותפות
// כל מודול יכול להשתמש בהן
// ═══════════════════════════════════════════════════════════════════════

const config = require('./config');

// בדיקת הרשאה
function isAllowed(userId) {
  return config.ALLOWED_USERS.length === 0 || config.ALLOWED_USERS.includes(userId);
}

// פורמט מספר עם פסיקים
function fmt(n) {
  return n.toLocaleString('he-IL');
}

// מחיקת כפתורים מהודעה ישנה
function removeKB(bot, chatId, msgId) {
  if (!msgId) return;
  bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }).catch(() => {});
}

// פורמט טלפון ישראלי
function formatPhone(phone) {
  if (!phone) return '';
  if (phone.startsWith('+972')) return '0' + phone.slice(4);
  if (phone.startsWith('972')) return '0' + phone.slice(3);
  return phone;
}

// פורמט איש קשר להצגה
function fmtContact(d) {
  let m = `👤 *שם:* ${d.first_name} ${d.last_name}\n`;
  if (d.phone) m += `*טלפון:* ${d.phone}\n`;
  if (d.email) m += `*אימייל:* ${d.email}\n`;
  if (d.type) m += `*סוג:* ${d.type}\n`;
  if (d.company) m += `*חברה:* ${d.company}\n`;
  if (d.budget_max > 0) m += `*תקציב:* עד ${fmt(d.budget_max)} ₪\n`;
  if (d.preferred_areas?.length) m += `*אזורים:* ${d.preferred_areas.join(', ')}\n`;
  if (d.preferred_property_types?.length) m += `*סוגי נכסים:* ${d.preferred_property_types.join(', ')}\n`;
  if (d.notes) m += `*הערות:* ${d.notes}\n`;
  return m;
}

// פורמט נכס להצגה
function fmtProperty(d) {
  let m = `🏢 *נכס*\n`;
  if (d.address) m += `*כתובת:* ${d.address}\n`;
  if (d.city) m += `*עיר:* ${d.city}\n`;
  if (d.type) m += `*סוג:* ${d.type}\n`;
  if (d.deal_type) m += `*עסקה:* ${d.deal_type}\n`;
  if (d.price > 0) m += `*מחיר:* ${fmt(d.price)} ₪\n`;
  if (d.area > 0) m += `*שטח:* ${d.area} מ"ר\n`;
  if (d.monthly_rent > 0) m += `*שכ"ד:* ${fmt(d.monthly_rent)} ₪/חודש\n`;
  return m;
}

module.exports = { isAllowed, fmt, removeKB, formatPhone, fmtContact, fmtProperty };
