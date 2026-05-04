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

// ── עזרי תאריך/שעה ─────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().split('T')[0]; }
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function dateReadable(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const today = todayISO();
  const tomorrow = addDaysISO(1);
  if (iso.startsWith(today)) return 'היום';
  if (iso.startsWith(tomorrow)) return 'מחר';
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function joinDateTime(date, time) {
  if (!date) return '';
  if (!time) return date;
  return `${date}T${time}:00`;
}
function endDateTime(date, time, durationMin) {
  if (!date || !time) return '';
  const d = new Date(`${date}T${time}:00`);
  d.setMinutes(d.getMinutes() + (durationMin || 60));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mn = String(d.getMinutes()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mn}:00`;
}

// ── פורמט הודעות ───────────────────────────────────────────────────
function fmtContact(d) {
  let m = `👤 *${d.first_name||''} ${d.last_name||''}*\n`;
  if (d.phone) m += `📞 ${d.phone}\n`;
  if (d.email) m += `📧 ${d.email}\n`;
  if (d.type) m += `🏷️ ${d.type}\n`;
  if (d.source) m += `📡 מקור: ${d.source}\n`;
  if (d.company) m += `🏗️ ${d.company}\n`;
  if (d.budget_max > 0) m += `💰 תקציב: עד ${fmt(d.budget_max)} ₪\n`;
  if (d.preferred_deal_type) m += `🔑 ${d.preferred_deal_type}\n`;
  if (d.preferred_areas?.length) m += `📍 ${d.preferred_areas.join(', ')}\n`;
  if (d.preferred_property_types?.length) m += `🏢 ${d.preferred_property_types.join(', ')}\n`;
  if (d.desired_yield > 0) m += `📊 תשואה: ${d.desired_yield}%\n`;
  if (d.readiness_level) m += `⏱️ ${d.readiness_level}\n`;
  if (d.notes) m += `📝 ${d.notes}\n`;
  return m;
}

function fmtProperty(d) {
  let m = `🏢 *נכס ${d.type||''}*\n`;
  if (d.city) m += `📍 ${d.city}${d.address ? ' — ' + d.address : ''}\n`;
  if (d.deal_type) m += `🔑 ${d.deal_type}\n`;
  if (d.area > 0) m += `📐 ${d.area} מ"ר\n`;
  if (d.price > 0) m += `💰 ${fmt(d.price)} ₪\n`;
  if (d.monthly_rent > 0) m += `💵 שכ"ד: ${fmt(d.monthly_rent)} ₪/חודש\n`;
  if (d.floor !== undefined && d.floor !== null) m += `🏗️ קומה ${d.floor}\n`;
  if (d.parking > 0) m += `🅿️ ${d.parking} חניות\n`;
  if (d.exclusivity) m += `🤝 בלעדי\n`;
  if (d.has_tenant) m += `👤 יש שוכר\n`;
  if (d._project_name) m += `🏗️ פרויקט: ${d._project_name}\n`;
  if (d._owner_name) m += `👤 בעלים: ${d._owner_name}\n`;
  if (d.description) m += `📝 ${d.description}\n`;
  return m;
}

function fmtTask(d) {
  let m = `📋 *${d.title||''}*\n`;
  if (d.type) m += `📂 ${d.type}\n`;
  if (d.priority) m += `🔴 ${d.priority}\n`;
  if (d.due_date) m += `📅 ${dateReadable(d.due_date)}`;
  if (d.task_time) m += ` ⏰ ${d.task_time}`;
  if (d.due_date || d.task_time) m += '\n';
  if (d._contact_name) m += `👤 ${d._contact_name}\n`;
  else if (d.contact_name) m += `👤 ${d.contact_name}\n`;
  if (d._property_label) m += `🏢 ${d._property_label}\n`;
  if (d._company_name) m += `🏗️ ${d._company_name}\n`;
  if (d.description) m += `📝 ${d.description}\n`;
  return m;
}

function fmtMeeting(d) {
  let m = `📅 *${d.title||'פגישה'}*\n`;
  if (d.due_date) m += `🗓️ ${dateReadable(d.due_date)}`;
  if (d.start_time) m += ` ⏰ ${d.start_time}`;
  if (d.duration_min) m += ` (${d.duration_min} דק׳)`;
  if (d.due_date || d.start_time) m += '\n';
  if (d.location) m += `📍 ${d.location}\n`;
  if (d._contact_name) m += `👤 ${d._contact_name}\n`;
  if (d._property_label) m += `🏢 ${d._property_label}\n`;
  if (d.description) m += `📝 ${d.description}\n`;
  return m;
}

module.exports = {
  isAllowed, fmt, removeKB, formatPhone, isGreeting,
  fmtContact, fmtProperty, fmtTask, fmtMeeting,
  todayISO, nowHHMM, addDaysISO, dateReadable, joinDateTime, endDateTime
};
