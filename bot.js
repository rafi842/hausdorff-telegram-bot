// ═══════════════════════════════════════════════════════════════════════════════
// bot.js — HAUSDORFF CRM Bot v4.0
// ניתוב חכם: הבוט מזהה מה רוצים ומנתב למודול הנכון
// ═══════════════════════════════════════════════════════════════════════════════

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const { isAllowed, removeKB } = require('./helpers');

if (!config.TELEGRAM_TOKEN) { console.error('❌ חסר TELEGRAM_BOT_TOKEN!'); process.exit(1); }

const bot = new TelegramBot(config.TELEGRAM_TOKEN, { polling: true });
const sessions = {};

// ── טעינת מודולים ─────────────────────────────────────────────────────
const startMod = require('./modules/start');
startMod.register(bot);

const contactsMod = require('./modules/contacts').register(bot, sessions);
const propertiesMod = require('./modules/properties').register(bot, sessions);
const tasksMod = require('./modules/tasks').register(bot, sessions);
const companiesMod = require('./modules/companies').register(bot, sessions);

// ── תפריט ראשי ────────────────────────────────────────────────────────
const MAIN_MENU = [[
  { text: '👤 איש קשר', callback_data: 'MENU:contact' },
  { text: '🏢 נכס', callback_data: 'MENU:property' }
],[
  { text: '📋 משימה', callback_data: 'MENU:task' },
  { text: '🏗️ חברה', callback_data: 'MENU:company' }
]];

function showMainMenu(chatId, text) {
  bot.sendMessage(chatId, text || 'מה תרצה לעשות?', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: MAIN_MENU }
  });
}

// ── טיפול בהודעות ─────────────────────────────────────────────────────
bot.on('message', async msg => {
  if (!isAllowed(msg.from.id)) return;
  const chatId = msg.chat.id;

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
    if (s.mode === 'contact') handled = contactsMod.handleText(chatId, text, s);
    else if (s.mode === 'property') handled = propertiesMod.handleText(chatId, text, s);
    else if (s.mode === 'task') handled = tasksMod.handleText(chatId, text, s);
    else if (s.mode === 'company') handled = companiesMod.handleText(chatId, text, s);
    if (handled) return;
  }

  // ── זיהוי כוונה אוטומטי ──
  // אם ההודעה מכילה מספר טלפון → כנראה איש קשר
  if (/0\d{1,2}[-\s]?\d{7,8}/.test(text)) {
    contactsMod.startFromText(chatId, text);
    return;
  }

  // אם מתחיל ב"משימה" / "תזכורת" / "לעשות"
  if (/^(משימה|תזכורת|לעשות|להתקשר|לשלוח|task)/i.test(text)) {
    tasksMod.startFromText(chatId, text);
    return;
  }

  // אם מתחיל ב"נכס" / "חנות" / "מרלוג" / "משרד"
  if (/^(נכס|חנות|מרלוג|משרד|קרקע|מבנה)/i.test(text)) {
    propertiesMod.startFromText(chatId, text);
    return;
  }

  // אם מתחיל ב"חברה" / "חב'"
  if (/^(חברה|חב')/i.test(text)) {
    companiesMod.startFromText(chatId, text);
    return;
  }

  // לא זיהה כוונה → הצג תפריט
  showMainMenu(chatId, `📝 *"${text.slice(0, 30)}${text.length > 30 ? '...' : ''}"*\n\nמה תרצה לעשות עם זה?`);
  sessions[chatId] = { pendingText: text };
});

// ── טיפול בכפתורים ────────────────────────────────────────────────────
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const action = query.data;
  const s = sessions[chatId];

  bot.answerCallbackQuery(query.id);

  // ביטול
  if (action === 'CANCEL') {
    removeKB(bot, chatId, msgId);
    delete sessions[chatId];
    bot.sendMessage(chatId, '🚫 בוטל.');
    return;
  }

  // ── תפריט ראשי ──
  if (action.startsWith('MENU:')) {
    removeKB(bot, chatId, msgId);
    const choice = action.slice(5);
    const pendingText = s?.pendingText || '';

    if (choice === 'contact') {
      if (pendingText) contactsMod.startFromText(chatId, pendingText);
      else contactsMod.startEmpty(chatId);
    } else if (choice === 'property') {
      if (pendingText) propertiesMod.startFromText(chatId, pendingText);
      else propertiesMod.startEmpty(chatId);
    } else if (choice === 'task') {
      if (pendingText) tasksMod.startFromText(chatId, pendingText);
      else tasksMod.startEmpty(chatId);
    } else if (choice === 'company') {
      if (pendingText) companiesMod.startFromText(chatId, pendingText);
      else companiesMod.startEmpty(chatId);
    }
    return;
  }

  if (!s) { removeKB(bot, chatId, msgId); return; }

  // כפתור ישן
  if (s.lastMsg && msgId !== s.lastMsg) { removeKB(bot, chatId, msgId); return; }

  // ניתוב לפי מודול
  let handled = false;
  if (s.mode === 'contact') handled = contactsMod.handleCallback(chatId, msgId, action, s);
  else if (s.mode === 'property') handled = propertiesMod.handleCallback(chatId, msgId, action, s);
  else if (s.mode === 'task') handled = tasksMod.handleCallback(chatId, msgId, action, s);
  else if (s.mode === 'company') handled = companiesMod.handleCallback(chatId, msgId, action, s);

  if (!handled) removeKB(bot, chatId, msgId);
});

// ── שגיאות ────────────────────────────────────────────────────────────
bot.on('polling_error', e => { if (!e.message?.includes('ETELEGRAM') && !e.message?.includes('409')) console.error('Poll:', e.message); });
process.on('uncaughtException', e => console.error('Err:', e));

console.log(`🤖 HAUSDORFF CRM Bot v${config.BOT_VERSION}`);
console.log(`📡 ${config.CRM_API_URL}`);
console.log(`🧠 ${config.ANTHROPIC_API_KEY ? 'Claude AI' : 'Regex'}`);
console.log(`📦 מודולים: contacts, properties, tasks, companies`);
