module.exports = {
  TELEGRAM_TOKEN:   process.env.TELEGRAM_BOT_TOKEN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CRM_API_URL:      process.env.CRM_API_URL || 'https://hausdorff-crm-backend-production.up.railway.app',
  CRM_EMAIL:        process.env.CRM_EMAIL    || 'rafi@hausdorff.co.il',
  CRM_PASSWORD:     process.env.CRM_PASSWORD || 'Rafi123',
  ALLOWED_USERS:    process.env.ALLOWED_TELEGRAM_IDS
    ? process.env.ALLOWED_TELEGRAM_IDS.split(',').map(id => parseInt(id.trim())) : [],
  BOT_VERSION: '5.1.0',
  REMINDER_CHECK_INTERVAL: 60000,
  WEBHOOK_PORT:   parseInt(process.env.PORT || process.env.WEBHOOK_PORT || 3001),
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || ''
};
