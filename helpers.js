const config = require('./config');

function isAllowed(id) { return config.ALLOWED_USERS.length === 0 || config.ALLOWED_USERS.includes(id); }
function fmt(n) { return n.toLocaleString('he-IL'); }
function removeKB(bot, chatId, msgId) { if (msgId) bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: msgId }).catch(() => {}); }

function formatPhone(phone) {
  if (!phone) return '';
  if (phone.startsWith('+972')) return '0' + phone.slice(4);
  if (phone.startsWith('972')) return '0' + phone.slice(3);
  return phone;
}

function isGreeting(text) {
  return /^(שלום|היי|הי|בוקר טוב|ערב טוב|מה נשמע|מה קורה|אהלן|הלו|hello|hi|hey|צהריים טובים|לילה טוב|מה העניינים|שלומך|בוקר|ערב|בריאות|מה חדש|start)$/i.test(text.trim());
}

function fmtContact(d) {
  let m = '👤 *' + (d.first_name||'') + ' ' + (d.last_name||'') + '*\n';
  if (d.phone) m += '📞 ' + d.phone + '\n';
  if (d.email) m += '📧 ' + d.email + '\n';
  if (d.type) m += '🏷️ ' + d.type + '\n';
  if (d.source) m += '📡 מקור: ' + d.source + '\n';
  if (d.company) m += '🏗️ ' + d.company + '\n';
  if (d.budget_max > 0) m += '💰 תקציב: עד ' + fmt(d.budget_max) + ' ₪\n';
  if (d.preferred_deal_type) m += '🔑 ' + d.preferred_deal_type + '\n';
  if (d.preferred_areas && d.preferred_areas.length) m += '📍 ' + d.preferred_areas.join(', ') + '\n';
  if (d.preferred_property_types && d.preferred_property_types.length) m += '🏢 ' + d.preferred_property_types.join(', ') + '\n';
  if (d.desired_yield > 0) m += '📊 תשואה: ' + d.desired_yield + '%\n';
  if (d.readiness_level) m += '⏱️ ' + d.readiness_level + '\n';
  if (d.notes) m += '📝 ' + d.notes + '\n';
  return m;
}

function fmtProperty(d) {
  let m = '🏢 *נכס ' + (d.type||'') + '*\n';
  if (d.city) m += '📍 ' + d.city + (d.address ? ' — ' + d.address : '') + '\n';
  if (d.deal_type) m += '🔑 ' + d.deal_type + '\n';
  if (d.area > 0) m += '📐 ' + d.area + ' מ"ר\n';
  if (d.price > 0) m += '💰 ' + fmt(d.price) + ' ₪\n';
  if (d.monthly_rent > 0) m += '💵 שכ"ד: ' + fmt(d.monthly_rent) + ' ₪/חודש\n';
  if (d.floor !== undefined && d.floor !== null) m += '🏗️ קומה ' + d.floor + '\n';
  if (d.parking > 0) m += '🅿️ ' + d.parking + ' חניות\n';
  if (d.exclusivity) m += '🤝 בלעדי\n';
  if (d.has_tenant) m += '👤 יש שוכר\n';
  if (d.description) m += '📝 ' + d.description + '\n';
  return m;
}

function fmtTask(d) {
  let m = '📋 *' + (d.title||'') + '*\n';
  if (d.type) m += '📂 ' + d.type + '\n';
  if (d.priority) m += '🔴 ' + d.priority + '\n';
  if (d.due_date) m += '📅 ' + d.due_date;
  if (d.task_time) m += ' ⏰ ' + d.task_time;
  if (d.due_date || d.task_time) m += '\n';
  if (d.contact_name) m += '👤 ' + d.contact_name + '\n';
  if (d.description) m += '📝 ' + d.description + '\n';
  return m;
}

module.exports = { isAllowed, fmt, removeKB, formatPhone, isGreeting, fmtContact, fmtProperty, fmtTask };
