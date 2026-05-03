// ═══════════════════════════════════════════════════════════════════════════════
// Hausdorff CRM — Telegram Bot
// סוכן AI להזנת אנשי קשר ונכסים דרך טלגרם
// ═══════════════════════════════════════════════════════════════════════════════

const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

// ── הגדרות ─────────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CRM_API_URL = process.env.CRM_API_URL || 'https://hausdorff-crm-backend-production.up.railway.app';
const CRM_EMAIL = process.env.CRM_EMAIL || 'rafi@hausdorff.co.il';
const CRM_PASSWORD = process.env.CRM_PASSWORD || 'Rafi123';

// רשימת מזהי טלגרם מורשים (אופציונלי — אם ריק, כולם מורשים)
const ALLOWED_USERS = process.env.ALLOWED_TELEGRAM_IDS
  ? process.env.ALLOWED_TELEGRAM_IDS.split(',').map(id => parseInt(id.trim()))
  : [];

if (!TELEGRAM_TOKEN) {
  console.error('❌ חסר TELEGRAM_BOT_TOKEN! ראה הוראות ב-README.');
  process.exit(1);
}

// ── אתחול הבוט ────────────────────────────────────────────────────────────────
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
console.log('🤖 הבוט עלה בהצלחה!');

// מאגר זמני לנתונים שממתינים לאישור
const pendingData = {};

// טוקן JWT לגישה ל-CRM
let crmToken = null;
let tokenExpiry = 0;

// ── פונקציות עזר ──────────────────────────────────────────────────────────────

// בדיקת הרשאה
function isAllowed(userId) {
  if (ALLOWED_USERS.length === 0) return true;
  return ALLOWED_USERS.includes(userId);
}

// התחברות ל-CRM וקבלת טוקן
async function getCrmToken() {
  if (crmToken && Date.now() < tokenExpiry) return crmToken;
  
  try {
    const res = await fetch(`${CRM_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CRM_EMAIL, password: CRM_PASSWORD })
    });
    const data = await res.json();
    if (data.token) {
      crmToken = data.token;
      tokenExpiry = Date.now() + 6 * 24 * 60 * 60 * 1000; // 6 ימים
      return crmToken;
    }
    throw new Error(data.error || 'שגיאת התחברות');
  } catch (err) {
    console.error('❌ שגיאת CRM login:', err.message);
    return null;
  }
}

// שליחת בקשה ל-CRM API
async function crmRequest(method, endpoint, body = null) {
  const token = await getCrmToken();
  if (!token) throw new Error('לא ניתן להתחבר ל-CRM');

  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${CRM_API_URL}${endpoint}`, opts);
  return res.json();
}

// ── פרסור טקסט חופשי עם AI ──────────────────────────────────────────────────

async function parseWithAI(text, mode) {
  // אם אין מפתח Anthropic, נשתמש בפרסור בסיסי
  if (!ANTHROPIC_API_KEY) {
    return parseBasic(text, mode);
  }

  const systemPrompt = mode === 'contact' 
    ? `אתה מערכת שמפרקת טקסט חופשי בעברית לנתוני איש קשר מובנים.
החזר JSON בלבד (בלי backticks, בלי הסברים) עם השדות הבאים:
{
  "first_name": "שם פרטי",
  "last_name": "שם משפחה",
  "phone": "מספר טלפון (פורמט: 05X-XXXXXXX)",
  "email": "אימייל (אם יש)",
  "type": "אחד מ: משקיע / רוכש פוטנציאלי / שוכר פוטנציאלי / בעל נכס / שותף מתווך / יזם",
  "budget_min": 0,
  "budget_max": 0,
  "preferred_areas": ["רשימת ערים/אזורים"],
  "preferred_property_types": ["רשימת סוגי נכסים: חנות / מרלו\"ג / משרד / קרקע / מבנה תעשייה / מרכז מסחרי"],
  "desired_yield": 0,
  "source": "אחד מ: פנייה ישירה / פרסום ממומן פייסבוק / פרסום ממומן גוגל / שלט על נכס / פה לאוזן / המלצה / מודעת נכס (יד2 / מדלן) / אחר",
  "notes": "כל מידע נוסף שלא נכנס לשדות"
}
אם חסר מידע, השאר ריק או 0. תקציב עם M = מיליון, K = אלף.`
    : `אתה מערכת שמפרקת טקסט חופשי בעברית לנתוני נכס מובנים.
החזר JSON בלבד (בלי backticks, בלי הסברים) עם השדות הבאים:
{
  "address": "כתובת",
  "city": "עיר",
  "neighborhood": "שכונה",
  "type": "אחד מ: חנות / מרלו\"ג / משרד / קרקע לבנייה / מבנה תעשייה / מרכז מסחרי",
  "deal_type": "השכרה או מכירה",
  "price": 0,
  "area": 0,
  "floor": 0,
  "total_floors": 0,
  "parking": 0,
  "has_tenant": false,
  "monthly_rent": 0,
  "annual_yield": 0,
  "description": "תיאור כללי",
  "status": "זמין"
}
אם חסר מידע, השאר ריק או 0. מחיר עם M = מיליון, K = אלף.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          { role: 'user', content: text }
        ],
        system: systemPrompt
      })
    });

    const data = await res.json();
    const content = data.content?.[0]?.text || '';
    
    // ניקוי JSON
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('❌ שגיאת AI parsing:', err.message);
    return parseBasic(text, mode);
  }
}

// ── פרסור בסיסי (ללא AI) ────────────────────────────────────────────────────

function parseBasic(text, mode) {
  if (mode === 'contact') {
    const phone = text.match(/0\d{1,2}[-\s]?\d{7,8}/)?.[0]?.replace(/\s/g, '') || '';
    const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || '';
    
    // סוג איש קשר
    let type = 'רוכש פוטנציאלי';
    if (/משקיע/i.test(text)) type = 'משקיע';
    else if (/שוכר/i.test(text)) type = 'שוכר פוטנציאלי';
    else if (/בעל\s*נכס|בעלים/i.test(text)) type = 'בעל נכס';
    else if (/מתווך|שותף/i.test(text)) type = 'שותף מתווך';
    else if (/יזם/i.test(text)) type = 'יזם';

    // תקציב
    let budget_max = 0;
    const budgetMatch = text.match(/תקציב[^\d]*(\d+(?:\.\d+)?)\s*(M|מיליון|K|אלף)?/i);
    if (budgetMatch) {
      budget_max = parseFloat(budgetMatch[1]);
      if (/M|מיליון/i.test(budgetMatch[2])) budget_max *= 1000000;
      else if (/K|אלף/i.test(budgetMatch[2])) budget_max *= 1000;
    }

    // שם — ננסה לחלץ מתחילת ההודעה
    const nameClean = text
      .replace(/0\d{1,2}[-\s]?\d{7,8}/, '')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/, '')
      .replace(/תקציב[^\n]*/i, '')
      .replace(/משקיע|שוכר|רוכש|בעל נכס|מתווך|יזם/g, '')
      .trim();
    const nameParts = nameClean.split(/\s+/).filter(w => w.length > 1).slice(0, 2);
    
    return {
      first_name: nameParts[0] || '',
      last_name: nameParts[1] || '',
      phone,
      email,
      type,
      budget_min: 0,
      budget_max: budget_max,
      preferred_areas: [],
      preferred_property_types: [],
      desired_yield: 0,
      source: 'פנייה ישירה',
      notes: text
    };
  }

  // פרסור בסיסי לנכס
  return {
    address: '',
    city: '',
    neighborhood: '',
    type: 'חנות',
    deal_type: 'השכרה',
    price: 0,
    area: 0,
    description: text,
    status: 'זמין'
  };
}

// ── פורמט נתונים להצגה ────────────────────────────────────────────────────────

function formatContact(data) {
  let msg = `👤 *איש קשר חדש*\n\n`;
  msg += `*שם:* ${data.first_name} ${data.last_name}\n`;
  if (data.phone) msg += `*טלפון:* ${data.phone}\n`;
  if (data.email) msg += `*אימייל:* ${data.email}\n`;
  msg += `*סוג:* ${data.type}\n`;
  if (data.budget_max > 0) msg += `*תקציב:* עד ${formatNumber(data.budget_max)} ₪\n`;
  if (data.desired_yield > 0) msg += `*תשואה רצויה:* ${data.desired_yield}%\n`;
  if (data.preferred_areas?.length > 0) msg += `*אזורים:* ${data.preferred_areas.join(', ')}\n`;
  if (data.preferred_property_types?.length > 0) msg += `*סוגי נכסים:* ${data.preferred_property_types.join(', ')}\n`;
  if (data.source && data.source !== 'פנייה ישירה') msg += `*מקור:* ${data.source}\n`;
  if (data.notes) msg += `\n📝 ${data.notes}\n`;
  return msg;
}

function formatProperty(data) {
  let msg = `🏢 *נכס חדש*\n\n`;
  if (data.address) msg += `*כתובת:* ${data.address}\n`;
  if (data.city) msg += `*עיר:* ${data.city}\n`;
  msg += `*סוג:* ${data.type}\n`;
  msg += `*עסקה:* ${data.deal_type}\n`;
  if (data.price > 0) msg += `*מחיר:* ${formatNumber(data.price)} ₪\n`;
  if (data.area > 0) msg += `*שטח:* ${data.area} מ"ר\n`;
  if (data.monthly_rent > 0) msg += `*שכ"ד:* ${formatNumber(data.monthly_rent)} ₪/חודש\n`;
  if (data.description) msg += `\n📝 ${data.description}\n`;
  return msg;
}

function formatNumber(n) {
  return n.toLocaleString('he-IL');
}

// ── הודעת פתיחה (/start) ─────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  
  bot.sendMessage(msg.chat.id, 
    `🏠 *ברוך הבא ל-HAUSDORFF CRM Bot!*\n\n` +
    `אני יכול להוסיף אנשי קשר ונכסים למערכת ה-CRM שלך.\n\n` +
    `*איך משתמשים?*\n` +
    `פשוט שלח לי הודעה חופשית ואני אפרק אותה לנתונים.\n\n` +
    `*דוגמאות:*\n` +
    `👤 _"יוסי כהן 054-1234567 משקיע תקציב 5M חנויות באר שבע"_\n` +
    `🏢 _"/נכס חנות 85 מר גני אביב באר שבע 12000 שח לחודש מעטפת"_\n\n` +
    `*פקודות:*\n` +
    `/start — הודעת פתיחה\n` +
    `/help — עזרה\n` +
    `/id — הצג את מזהה הטלגרם שלך`,
    { parse_mode: 'Markdown' }
  );
});

// ── עזרה (/help) ─────────────────────────────────────────────────────────────

bot.onText(/\/help/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  
  bot.sendMessage(msg.chat.id,
    `📖 *עזרה*\n\n` +
    `*להוספת איש קשר:*\n` +
    `שלח הודעה חופשית עם הפרטים. למשל:\n` +
    `_"דני לוי 052-9876543 שוכר מחפש חנות 80 מר בנתניה תקציב 8K לחודש"_\n\n` +
    `*להוספת נכס:*\n` +
    `התחל עם /נכס ואז הפרטים. למשל:\n` +
    `_"/נכס חנות 120 מר הרצל 40 ירושלים מכירה 4.5M קומת קרקע"_\n\n` +
    `אני אפרק את ההודעה ואציג לך את הנתונים לאישור לפני השמירה.\n\n` +
    `*טיפ:* ככל שתכתוב יותר פרטים, כך האיש קשר יהיה מלא יותר במערכת.`,
    { parse_mode: 'Markdown' }
  );
});

// ── הצגת מזהה טלגרם (/id) ────────────────────────────────────────────────────

bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🆔 מזהה הטלגרם שלך: \`${msg.from.id}\`\n\n` +
    `הוסף מספר זה ל-ALLOWED_TELEGRAM_IDS בהגדרות כדי להגביל גישה.`,
    { parse_mode: 'Markdown' }
  );
});

// ── הוספת נכס (/נכס) ─────────────────────────────────────────────────────────

bot.onText(/^\/נכס\s+(.+)/s, async (msg, match) => {
  if (!isAllowed(msg.from.id)) return;
  
  const chatId = msg.chat.id;
  const text = match[1];

  bot.sendMessage(chatId, '⏳ מעבד את הנתונים...');

  try {
    const parsed = await parseWithAI(text, 'property');
    const display = formatProperty(parsed);

    pendingData[chatId] = { mode: 'property', data: parsed };

    bot.sendMessage(chatId, display + '\n\n*האם הנתונים נכונים?*', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ אישור ושמירה', callback_data: 'confirm_save' },
          { text: '❌ ביטול', callback_data: 'cancel' }
        ]]
      }
    });
  } catch (err) {
    bot.sendMessage(chatId, `❌ שגיאה בעיבוד: ${err.message}`);
  }
});

// ── הודעה חופשית (ברירת מחדל = איש קשר) ──────────────────────────────────────

bot.on('message', async (msg) => {
  // דלג על פקודות
  if (!msg.text || msg.text.startsWith('/')) return;
  if (!isAllowed(msg.from.id)) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text.length < 3) return;

  bot.sendMessage(chatId, '⏳ מעבד את הנתונים...');

  try {
    const parsed = await parseWithAI(text, 'contact');
    
    // בדיקה שיש לפחות שם
    if (!parsed.first_name && !parsed.last_name) {
      bot.sendMessage(chatId, 
        '🤔 לא הצלחתי לזהות שם. נסה שוב, למשל:\n' +
        '_"יוסי כהן 054-1234567 משקיע"_',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    pendingData[chatId] = { mode: 'contact', data: parsed };

    const display = formatContact(parsed);
    bot.sendMessage(chatId, display + '\n\n*האם הנתונים נכונים?*', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ אישור ושמירה', callback_data: 'confirm_save' },
          { text: '❌ ביטול', callback_data: 'cancel' }
        ]]
      }
    });
  } catch (err) {
    bot.sendMessage(chatId, `❌ שגיאה בעיבוד: ${err.message}`);
  }
});

// ── טיפול בלחיצות כפתורים ────────────────────────────────────────────────────

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;

  if (action === 'cancel') {
    delete pendingData[chatId];
    bot.answerCallbackQuery(query.id, { text: 'בוטל' });
    bot.sendMessage(chatId, '🚫 בוטל. שלח הודעה חדשה כדי לנסות שוב.');
    return;
  }

  if (action === 'confirm_save') {
    const pending = pendingData[chatId];
    if (!pending) {
      bot.answerCallbackQuery(query.id, { text: 'אין נתונים לשמירה' });
      return;
    }

    bot.answerCallbackQuery(query.id, { text: 'שומר...' });

    try {
      if (pending.mode === 'contact') {
        // הכנת הנתונים לפורמט CRM
        const contactData = {
          first_name: pending.data.first_name || '',
          last_name: pending.data.last_name || '',
          phone: pending.data.phone || '',
          email: pending.data.email || '',
          type: pending.data.type || 'רוכש פוטנציאלי',
          contact_category: 'contact',
          lead_status: 'new',
          source: pending.data.source || 'פנייה ישירה',
          budget_min: pending.data.budget_min || 0,
          budget_max: pending.data.budget_max || 0,
          preferred_areas: JSON.stringify(pending.data.preferred_areas || []),
          preferred_property_types: JSON.stringify(pending.data.preferred_property_types || []),
          desired_yield: pending.data.desired_yield || 0,
          notes: pending.data.notes || '',
          status: 'פעיל'
        };

        const result = await crmRequest('POST', '/api/contacts', contactData);
        
        if (result.id) {
          bot.sendMessage(chatId,
            `✅ *${pending.data.first_name} ${pending.data.last_name}* נוסף ל-CRM בהצלחה!`,
            { parse_mode: 'Markdown' }
          );
        } else {
          throw new Error(result.error || 'שגיאה לא ידועה');
        }
      } else if (pending.mode === 'property') {
        const propData = {
          address: pending.data.address || '',
          city: pending.data.city || '',
          neighborhood: pending.data.neighborhood || '',
          type: pending.data.type || 'חנות',
          deal_type: pending.data.deal_type || 'השכרה',
          status: pending.data.status || 'זמין',
          price: pending.data.price || 0,
          area: pending.data.area || 0,
          floor: pending.data.floor || 0,
          total_floors: pending.data.total_floors || 0,
          parking: pending.data.parking || 0,
          has_tenant: pending.data.has_tenant || false,
          monthly_rent: pending.data.monthly_rent || 0,
          annual_yield: pending.data.annual_yield || 0,
          description: pending.data.description || ''
        };

        const result = await crmRequest('POST', '/api/properties', propData);
        
        if (result.id) {
          bot.sendMessage(chatId,
            `✅ *נכס חדש* נוסף ל-CRM בהצלחה!\n${pending.data.type} ב${pending.data.city || 'כתובת לא צוינה'}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          throw new Error(result.error || 'שגיאה לא ידועה');
        }
      }
    } catch (err) {
      bot.sendMessage(chatId, `❌ שגיאה בשמירה: ${err.message}\n\nנסה שוב מאוחר יותר.`);
    }

    delete pendingData[chatId];
  }
});

// ── טיפול בשגיאות ─────────────────────────────────────────────────────────────

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

console.log('🤖 HAUSDORFF CRM Bot מוכן לפעולה!');
console.log(`📡 CRM API: ${CRM_API_URL}`);
console.log(`🔑 AI parsing: ${ANTHROPIC_API_KEY ? 'מופעל (Claude)' : 'בסיסי (regex)'}`);
