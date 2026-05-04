# 🤖 HAUSDORFF CRM Bot v4.0

## מבנה מודולרי — כל פיצ'ר בקובץ נפרד

```
hausdorff-telegram-bot/
├── bot.js              ← ראשי — מחבר הכל (לא לגעת בדרך כלל)
├── config.js           ← הגדרות
├── crm.js              ← חיבור ל-CRM
├── parser.js           ← פרסור טקסט (AI + regex)
├── helpers.js          ← פונקציות עזר
├── questionnaire.js    ← מנוע שאלון
├── package.json
└── modules/
    ├── start.js        ← /start, /help, /id
    ├── contacts.js     ← אנשי קשר
    └── properties.js   ← נכסים
```

## איך מוסיפים מודול חדש?

1. צור קובץ `modules/proposals.js`
2. ב-`bot.js` הוסף 2 שורות:
   ```
   const proposalsModule = require('./modules/proposals');
   const proposals = proposalsModule.register(bot, sessions);
   ```
3. זהו!

## התקנה

1. העלה את כל הקבצים ל-GitHub
2. חבר ל-Railway
3. הגדר Variables: TELEGRAM_BOT_TOKEN, CRM_API_URL, CRM_EMAIL, CRM_PASSWORD
