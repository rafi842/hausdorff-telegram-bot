// ═══════════════════════════════════════════════════════════════════════════════
// bot.js — HAUSDORFF CRM Bot v5.1
// ניתוב חכם + ברכות + תזכורות + לידים + ווב-הוקים
// ═══════════════════════════════════════════════════════════════════════════════

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const { isAllowed, removeKB, isGreeting } = require('./helpers');
const reminders = require('./reminders');
const leadsMod   = require('./leads');
const webhook    = require('./webhook');

if (!config.TELEGRAM_TOKEN) { console.error('❌ חסר TELEGRAM_BOT_TOKEN!'); process.exit(1); }

const bot = new TelegramBot(config.TELEGRAM_TOKEN, { polling: true });
const sessions = {};

// ── מודולים ───────────────────────────────────────────────────────────
const startMod      = require('./start'); startMod.register(bot);
const contactsMod   = require('./contacts').register(bot, sessions);
const propertiesMod = require('./properties').register(bot, sessions);
const tasksMod      = require('./tasks').register(bot, sessions);
const companiesMod  = require('./companies').register(bot, sessions);

// ── תזכורות ───────────────────────────────────────────────────────────
reminders.start(bot);

// ── ווב-הוק לקבלת לידים מה-CRM ────────────────────────────────────────
webhook.start(bot, leadsMod);

// ── תפריט ראשי ────────────────────────────────────────────────────────
const MAIN_MENU = [[
  { text: '👤 איש קשר', callback_data: 'MENU:contact' },
  { text: '🏢 נכס',     callback_data: 'MENU:property' }
],[
  { text: '📋 משימה',   callback_data: 'MENU:task' },
  { text: '🏗️ חברה',   callback_data: 'MENU:company' }
]];

async function showMainMenu(chatId, text) {
  const sent = await bot.sendMessage(chatId, text || '👋 מה תרצה לעשות?', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: MAIN_MENU }
  });
  sessions[chatId] = { lastMsg: sent.message_id };
}

// ── הודעות ────────────────────────────────────────────────────────────
bot.on('message', async msg => {
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;

  // רישום הסוכן לצורך קבלת הודעות ליד
  const agentName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ')
    || msg.from.username || `סוכן ${chatId}`;
  leadsMod.registerAgent(chatId, agentName);

  // רישום לתזכורות
  reminders.registerChat(chatId);

  // פקודות
  if (msg.text && msg.text.startsWith('/')) return;

  // ── צירוף איש קשר מהטלפון ──
  if (msg.contact) {
    contactsMod.startFromPhone(chatId, msg.contact);
    return;
  }

  if (!msg.text) return;
  const text = msg.text.trim();
  if (text.length < 2) return;

  const s = sessions[chatId];

  // ── תשובה לשאלה פעילה ──
  if (s && s.waitingFor) {
    let handled = false;
    if      (s.mode === 'contact')  handled = contactsMod.handleText(chatId, text, s);
    else if (s.mode === 'property') handled = propertiesMod.handleText(chatId, text, s);
    else if (s.mode === 'task')     handled = tasksMod.handleText(chatId, text, s);
    else if (s.mode === 'company')  handled = companiesMod.handleText(chatId, text, s);
    if (handled) return;
  }

  // ── תשובה לשאלון ליד (freeText ללא waitingFor) ──
  if (s && s.mode === 'lead' && s.freeText) {
    const handled = leadsMod.handleText(bot, chatId, text, s, sessions);
    if (handled) return;
  }

  // ── ברכות ──
  if (isGreeting(text)) {
    showMainMenu(chatId, '👋 שלום! מה תרצה לעשות?');
    return;
  }

  // ── זיהוי כוונה אוטומטי ──

  // טלפון → איש קשר
  if (/0\d{1,2}[-\s]?\d{7,8}/.test(text)) {
    contactsMod.startFromText(chatId, text);
    return;
  }

  // משימה / תזכורת
  if (/^(משימה|תזכורת|לעשות|להתקשר|לשלוח|task|todo)/i.test(text)) {
    tasksMod.startFromText(chatId, text);
    return;
  }

  // נכס
  if (/^(נכס|חנות|מרלוג|מרלו"ג|משרד|קרקע|מבנה|מרכז מסחרי)/i.test(text)) {
    propertiesMod.startFromText(chatId, text);
    return;
  }

  // חברה
  if (/^(חברה|חברת|חב')/i.test(text)) {
    companiesMod.startFromText(chatId, text);
    return;
  }

  // לא זיהה → תפריט
  showMainMenu(chatId, `📝 *"${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"*

מה תרצה לעשות?`);
  if (sessions[chatId]) sessions[chatId].pendingText = text;
  else sessions[chatId] = { pendingText: text };
});

// ── כפתורים ───────────────────────────────────────────────────────────
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;
  const action = query.data;
  const s      = sessions[chatId];

  bot.answerCallbackQuery(query.id);

  // ── ביטול ──
  if (action === 'CANCEL') {
    removeKB(bot, chatId, msgId);
    delete sessions[chatId];
    bot.sendMessage(chatId, '🚫 בוטל.');
    return;
  }

  // ── לידים (לפני בדיקת session כי LEAD_CLAIM נשלח ללא session) ──
  if (action.startsWith('LEAD_')) {
    const handled = await leadsMod.handleCallback(bot, chatId, msgId, action, sessions);
    if (handled) return;
  }

  // ── תפריט ראשי ──
  if (action.startsWith('MENU:')) {
    removeKB(bot, chatId, msgId);
    const choice  = action.slice(5);
    const pending = s?.pendingText || '';

    if      (choice === 'contact')  pending ? contactsMod.startFromText(chatId, pending)   : contactsMod.startEmpty(chatId);
    else if (choice === 'property') pending ? propertiesMod.startFromText(chatId, pending) : propertiesMod.startEmpty(chatId);
    else if (choice === 'task')     pending ? tasksMod.startFromText(chatId, pending)      : tasksMod.startEmpty(chatId);
    else if (choice === 'company')  pending ? companiesMod.startFromText(chatId, pending)  : companiesMod.startEmpty(chatId);
    return;
  }

  if (!s) { removeKB(bot, chatId, msgId); return; }
  if (s.lastMsg && msgId !== s.lastMsg) { removeKB(bot, chatId, msgId); return; }

  // ── ניתוב לפי מודול ──
  let handled = false;
  if      (s.mode === 'contact')  handled = contactsMod.handleCallback(chatId, msgId, action, s);
  else if (s.mode === 'property') handled = propertiesMod.handleCallback(chatId, msgId, action, s);
  else if (s.mode === 'task')     handled = tasksMod.handleCallback(chatId, msgId, action, s);
  else if (s.mode === 'company')  handled = companiesMod.handleCallback(chatId, msgId, action, s);

  if (!handled) removeKB(bot, chatId, msgId);
});

// ── שגיאות ────────────────────────────────────────────────────────────
bot.on('polling_error', e => {
  if (!e.message?.includes('ETELEGRAM') && !e.message?.includes('409'))
    console.error('Poll:', e.message);
});
process.on('uncaughtException', e => console.error('Err:', e));

console.log(`🤖 HAUSDORFF CRM Bot v${config.BOT_VERSION}`);
console.log(`📡 ${config.CRM_API_URL}`);
console.log(`🧠 ${config.ANTHROPIC_API_KEY ? 'Claude AI' : 'Regex'}`);
console.log(`📦 מודולים: contacts, properties, tasks, companies, leads`);
console.log(`⏰ תזכורות: פעיל`);
console.log(`🔔 לידים: פעיל`);
