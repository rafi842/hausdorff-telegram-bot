// ═══════════════════════════════════════════════════════════════════════════════
// leads.js — מודול לידים חדשים v1.0
// ליד נכנס → כל הסוכנים מקבלים הודעה → הראשון שתופס מחייג →
// שאלון שיחה → המרה לאיש קשר → תזכורת / פגישה
// ═══════════════════════════════════════════════════════════════════════════════

const { removeKB } = require('./helpers');
const crm = require('./crm');

const activeLeads = new Map();
const agentChats = new Map();

function registerAgent(chatId, name) {
  agentChats.set(chatId, { name: name || `סוכן ${chatId}` });
}

function fmtLead(lead) {
  let m = `🔔 *ליד חדש נכנס!*

`;
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
  if (fullName) m += `👤 *${fullName}*
`;
  if (lead.phone)  m += `📞 ${lead.phone}
`;
  if (lead.email)  m += `📧 ${lead.email}
`;
  if (lead.source) m += `📡 מקור: ${lead.source}
`;
  if (lead.notes)  m += `📝 ${lead.notes}
`;
  if (lead.assigned_to) m += `
👔 שויך ל: *${lead.assigned_to}*`;
  return m;
}

async function handleNewLead(bot, lead) {
  if (!lead || !lead.id) { console.error('leads.js: lead missing id', lead); return; }
  const leadId = String(lead.id);
  const leadState = { lead, claimedChatId: null, claimedAgentName: null, msgIds: new Map(), status: 'new' };
  activeLeads.set(leadId, leadState);
  if (agentChats.size === 0) { console.warn('leads.js: אין סוכנים רשומים עדיין!'); return; }
  const msg = fmtLead(lead) + `

⚡ _לחץ ראשון לתפוס ולהתקשר!_`;
  const kb = { inline_keyboard: [[{ text: '📞 אני מחייג! (תפוס)', callback_data: `LEAD_CLAIM:${leadId}` }]]};
  for (const [chatId] of agentChats) {
    try { const sent = await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: kb }); leadState.msgIds.set(chatId, sent.message_id); }
    catch (e) { console.error(`leads: broadcast to ${chatId}:`, e.message); }
  }
}

async function handleClaim(bot, chatId, leadId, sessions) {
  const leadState = activeLeads.get(leadId);
  if (!leadState) { bot.sendMessage(chatId, '⚠️ הליד כבר לא פעיל.').catch(() => {}); return; }
  const agentName = agentChats.get(chatId)?.name || `סוכן ${chatId}`;
  if (leadState.claimedChatId && leadState.claimedChatId !== chatId) {
    bot.sendMessage(chatId, `⚠️ הליד כבר נתפס ע"י *${leadState.claimedAgentName}* 📞`, { parse_mode: 'Markdown' }).catch(() => {});
    return;
  }
  leadState.claimedChatId = chatId; leadState.claimedAgentName = agentName; leadState.status = 'calling';
  const myMsgId = leadState.msgIds.get(chatId);
  if (myMsgId) {
    bot.editMessageText(fmtLead(leadState.lead) + `

✅ *אתה מחייג...*
לחץ כשתסיים`,
      { chat_id: chatId, message_id: myMsgId, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '✅ סיימתי שיחה', callback_data: `LEAD_DONE:${leadId}` }, { text: '📵 לא ענה', callback_data: `LEAD_NOANSWER:${leadId}` }]]}}
    ).catch(() => {});
  }
  for (const [cid, msgId] of leadState.msgIds) {
    if (cid === chatId) continue;
    bot.editMessageText(fmtLead(leadState.lead) + `

📞 *${agentName} תפס ומחייג...*`,
      { chat_id: cid, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] } }).catch(() => {});
  }
}

async function handleCallDone(bot, chatId, leadId, sessions, noAnswer) {
  const leadState = activeLeads.get(leadId);
  if (!leadState) return;
  leadState.status = 'debrief';
  if (noAnswer) {
    sessions[chatId] = { mode: 'lead', step: 'followup_noanswer', data: { lead: leadState.lead, outcome: '📵 לא ענה', convertToContact: false }, leadId, freeText: false };
    _notifyOthers(bot, leadState, chatId, `📵 *${leadState.claimedAgentName}* ניסה להתקשר — לא ענה.`);
    const sent = await bot.sendMessage(chatId, `📵 *לא ענה.*

מתי לחזור להתקשר?`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: 'עוד שעה', callback_data: 'LEAD_FU:HOUR' }, { text: 'עוד שעתיים', callback_data: 'LEAD_FU:2HOURS' }],
        [{ text: 'מחר בבוקר', callback_data: 'LEAD_FU:TOMORROW' }, { text: 'עוד שבוע', callback_data: 'LEAD_FU:WEEK' }],
        [{ text: 'תאריך אחר ✏️', callback_data: 'LEAD_FU:CUSTOM' }]
      ]}
    });
    sessions[chatId].lastMsg = sent.message_id; return;
  }
  sessions[chatId] = { mode: 'lead', step: 'outcome', data: { lead: leadState.lead }, leadId, freeText: false };
  const sent = await bot.sendMessage(chatId, `📞 *סיכום שיחה עם ${leadState.lead.first_name || ''}*

מה היה בשיחה?`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [{ text: '✅ עניין גבוה', callback_data: 'LEAD_OUTCOME:interested' }, { text: '🤔 מעוניין / ממתין', callback_data: 'LEAD_OUTCOME:maybe' }],
      [{ text: '❌ לא מעוניין', callback_data: 'LEAD_OUTCOME:not_interested' }, { text: '🔄 להתקשר שוב', callback_data: 'LEAD_OUTCOME:callback' }],
      [{ text: '✏️ הקלד בחופשי', callback_data: 'LEAD_OUTCOME:custom' }]
    ]}
  });
  sessions[chatId].lastMsg = sent.message_id;
}

const OUTCOME_LABELS = { interested: '✅ עניין גבוה', maybe: '🤔 מעוניין / ממתין', not_interested: '❌ לא מעוניין', callback: '🔄 לחזור להתקשר' };

async function handleOutcome(bot, chatId, outcome, sessions) {
  const s = sessions[chatId];
  if (!s || s.mode !== 'lead') return false;
  if (outcome === 'custom') { s.step = 'outcome_text'; s.freeText = true; if (s.lastMsg) removeKB(bot, chatId, s.lastMsg); bot.sendMessage(chatId, '✏️ כתוב מה היה בשיחה:'); return true; }
  s.data.outcome = OUTCOME_LABELS[outcome] || outcome;
  if (s.lastMsg) removeKB(bot, chatId, s.lastMsg);
  await _askConvertToContact(bot, chatId, s); return true;
}

async function _askConvertToContact(bot, chatId, s) {
  s.step = 'convert';
  const sent = await bot.sendMessage(chatId, `📋 *תוצאה:* ${s.data.outcome}

להמיר לאיש קשר ב-CRM?`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '✅ כן, צור איש קשר', callback_data: 'LEAD_CONVERT:yes' }], [{ text: '❌ לא בשלב זה', callback_data: 'LEAD_CONVERT:no' }]]}
  });
  s.lastMsg = sent.message_id;
}

async function handleConvert(bot, chatId, decision, sessions) {
  const s = sessions[chatId];
  if (!s || s.mode !== 'lead') return false;
  removeKB(bot, chatId, s.lastMsg);
  s.data.convertToContact = (decision === 'yes'); s.step = 'notes'; s.freeText = true;
  const sent = await bot.sendMessage(chatId, `📝 הוסף הערות לשיחה (אפשר לדלג):`, { reply_markup: { inline_keyboard: [[{ text: 'דלג ⏭️', callback_data: 'LEAD_NOTES:skip' }]]}});
  s.lastMsg = sent.message_id; return true;
}

async function _askFollowup(bot, chatId, s) {
  s.step = 'next_action'; s.freeText = false;
  const sent = await bot.sendMessage(chatId, `📅 *מה הצעד הבא?*`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '⏰ תזכורת להתקשר', callback_data: 'LEAD_NEXT:reminder' }, { text: '🤝 קביעת פגישה', callback_data: 'LEAD_NEXT:meeting' }],
      [{ text: '✅ סגור ליד (ללא פעולה נוספת)', callback_data: 'LEAD_NEXT:close' }]
    ]}
  });
  s.lastMsg = sent.message_id;
}

async function handleNextAction(bot, chatId, action, sessions) {
  const s = sessions[chatId];
  if (!s || s.mode !== 'lead') return false;
  removeKB(bot, chatId, s.lastMsg);
  if (action === 'close') { await _finalizeLead(bot, chatId, s, sessions); return true; }
  if (action === 'reminder') { await _askReminderDate(bot, chatId, s); return true; }
  if (action === 'meeting') { await _askMeetingDate(bot, chatId, s); return true; }
  return false;
}

async function _askReminderDate(bot, chatId, s) {
  s.step = 'reminder_date';
  const sent = await bot.sendMessage(chatId, `⏰ *מתי תזכורת?*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'היום', callback_data: 'LEAD_RD:TODAY' }, { text: 'מחר', callback_data: 'LEAD_RD:TOMORROW' }], [{ text: 'עוד שבוע', callback_data: 'LEAD_RD:WEEK' }, { text: 'תאריך ✏️', callback_data: 'LEAD_RD:CUSTOM' }]]}});
  s.lastMsg = sent.message_id;
}

async function _askReminderTime(bot, chatId, s) {
  s.step = 'reminder_time';
  const sent = await bot.sendMessage(chatId, `⏰ *שעת תזכורת?*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '08:00', callback_data: 'LEAD_RT:0800' }, { text: '10:00', callback_data: 'LEAD_RT:1000' }, { text: '12:00', callback_data: 'LEAD_RT:1200' }], [{ text: '14:00', callback_data: 'LEAD_RT:1400' }, { text: '16:00', callback_data: 'LEAD_RT:1600' }, { text: 'שעה ✏️', callback_data: 'LEAD_RT:CUSTOM' }]]}});
  s.lastMsg = sent.message_id;
}

async function _askMeetingDate(bot, chatId, s) {
  s.step = 'meeting_date';
  const sent = await bot.sendMessage(chatId, `🤝 *מועד הפגישה?*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: 'מחר', callback_data: 'LEAD_MD:TOMORROW' }, { text: 'עוד שבוע', callback_data: 'LEAD_MD:WEEK' }], [{ text: 'תאריך ✏️', callback_data: 'LEAD_MD:CUSTOM' }]]}});
  s.lastMsg = sent.message_id;
}

async function _askMeetingTime(bot, chatId, s) {
  s.step = 'meeting_time';
  const sent = await bot.sendMessage(chatId, `🤝 *שעת הפגישה?*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '09:00', callback_data: 'LEAD_MT:0900' }, { text: '10:00', callback_data: 'LEAD_MT:1000' }, { text: '11:00', callback_data: 'LEAD_MT:1100' }], [{ text: '14:00', callback_data: 'LEAD_MT:1400' }, { text: '16:00', callback_data: 'LEAD_MT:1600' }, { text: 'שעה ✏️', callback_data: 'LEAD_MT:CUSTOM' }]]}});
  s.lastMsg = sent.message_id;
}

async function _finalizeLead(bot, chatId, s, sessions) {
  const { lead, outcome, convertToContact, notes, reminderDate, reminderTime, meetingDate, meetingTime } = s.data;
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
  let contactId = null;
  try {
    if (convertToContact) { const contact = await crm.createContact({ first_name: lead.first_name||'', last_name: lead.last_name||'', phone: lead.phone||'', email: lead.email||'', source: lead.source||'ישיר', type: 'רוכש פוטנציאלי', contact_category: 'lead', lead_status: outcome?.includes('עניין גבוה') ? 'qualified' : 'contacted', notes: [outcome,notes].filter(Boolean).join(' | ') }); if (contact?.id) contactId = contact.id; }
    if (reminderDate) await crm.createTask({ title: `📞 התקשר ל-${fullName}`, type: 'שיחה', priority: 'גבוה', due_date: reminderDate, task_time: reminderTime||'09:00', description: [outcome,notes].filter(Boolean).join(' | '), contact_id: contactId });
    if (meetingDate)  await crm.createTask({ title: `🤝 פגישה עם ${fullName}`, type: 'פגישה', priority: 'גבוה', due_date: meetingDate, task_time: meetingTime||'10:00', description: [outcome,notes].filter(Boolean).join(' | '), contact_id: contactId });
  } catch (e) { console.error('leads finalize:', e.message); }
  let sum = `✅ *ליד טופל!*

👤 ${fullName}
`;
  if (outcome) sum += `📞 תוצאה: ${outcome}
`;
  if (notes)   sum += `📝 ${notes}
`;
  if (convertToContact && contactId) sum += `
✅ *איש קשר נוצר ב-CRM*
`;
  if (reminderDate) sum += `
⏰ תזכורת: ${reminderDate} ${reminderTime||''}
`;
  if (meetingDate)  sum += `🤝 פגישה: ${meetingDate} ${meetingTime||''}
`;
  bot.sendMessage(chatId, sum, { parse_mode: 'Markdown' }).catch(() => {});
  const ls = activeLeads.get(String(s.leadId));
  if (ls) { _notifyOthers(bot, ls, chatId, `✅ *ליד טופל* ע"י ${ls.claimedAgentName||'סוכן'}
👤 ${fullName}
📞 ${outcome||'—'}`); activeLeads.delete(String(s.leadId)); }
  delete sessions[chatId];
}

function _notifyOthers(bot, ls, excl, msg) { for (const [cid] of agentChats) { if (cid===excl) continue; bot.sendMessage(cid, msg, { parse_mode:'Markdown' }).catch(()=>{}); } }
function _resolveDate(val) { const d=new Date(); if(val==='TODAY') return d.toISOString().split('T')[0]; if(val==='TOMORROW'){d.setDate(d.getDate()+1);return d.toISOString().split('T')[0];} if(val==='WEEK'){d.setDate(d.getDate()+7);return d.toISOString().split('T')[0];} const m=val.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; return val; }
function _encodeTime(raw) { if(!raw||raw==='CUSTOM') return null; if(raw.includes(':')) return raw; return `${raw.slice(0,2)}:${raw.slice(2)}`; }

async function handleCallback(bot, chatId, msgId, action, sessions) {
  if (action.startsWith('LEAD_CLAIM:'))    { await handleClaim(bot, chatId, action.slice(11), sessions); return true; }
  if (action.startsWith('LEAD_DONE:'))     { removeKB(bot, chatId, msgId); await handleCallDone(bot, chatId, action.slice(10), sessions, false); return true; }
  if (action.startsWith('LEAD_NOANSWER:')) { removeKB(bot, chatId, msgId); await handleCallDone(bot, chatId, action.slice(14), sessions, true); return true; }
  const s = sessions[chatId];
  if (!s || s.mode !== 'lead') return false;
  if (action.startsWith('LEAD_OUTCOME:')) { removeKB(bot,chatId,msgId); return handleOutcome(bot,chatId,action.slice(13),sessions); }
  if (action.startsWith('LEAD_CONVERT:')) { return handleConvert(bot,chatId,action.slice(13),sessions); }
  if (action==='LEAD_NOTES:skip') { removeKB(bot,chatId,msgId); s.freeText=false; await _askFollowup(bot,chatId,s); return true; }
  if (action.startsWith('LEAD_NEXT:')) { return handleNextAction(bot,chatId,action.slice(10),sessions); }
  if (action.startsWith('LEAD_RD:')) { const v=action.slice(8); removeKB(bot,chatId,msgId); if(v==='CUSTOM'){s.step='reminder_date_custom';s.freeText=true;bot.sendMessage(chatId,'✏️ הכנס תאריך (DD/MM/YYYY):');}else{s.data.reminderDate=_resolveDate(v);await _askReminderTime(bot,chatId,s);} return true; }
  if (action.startsWith('LEAD_RT:')) { const v=action.slice(8); removeKB(bot,chatId,msgId); if(v==='CUSTOM'){s.step='reminder_time_custom';s.freeText=true;bot.sendMessage(chatId,'✏️ הכנס שעה (HH:MM):');}else{s.data.reminderTime=_encodeTime(v);await _finalizeLead(bot,chatId,s,sessions);} return true; }
  if (action.startsWith('LEAD_MD:')) { const v=action.slice(8); removeKB(bot,chatId,msgId); if(v==='CUSTOM'){s.step='meeting_date_custom';s.freeText=true;bot.sendMessage(chatId,'✏️ תאריך פגישה (DD/MM/YYYY):');}else{s.data.meetingDate=_resolveDate(v);await _askMeetingTime(bot,chatId,s);} return true; }
  if (action.startsWith('LEAD_MT:')) { const v=action.slice(8); removeKB(bot,chatId,msgId); if(v==='CUSTOM'){s.step='meeting_time_custom';s.freeText=true;bot.sendMessage(chatId,'✏️ שעת פגישה (HH:MM):');}else{s.data.meetingTime=_encodeTime(v);await _finalizeLead(bot,chatId,s,sessions);} return true; }
  if (action.startsWith('LEAD_FU:')) { const v=action.slice(8); removeKB(bot,chatId,msgId); if(v==='CUSTOM'){s.step='followup_noanswer_custom';s.freeText=true;bot.sendMessage(chatId,'✏️ הכנס תאריך (DD/MM/YYYY):');}else if(v==='HOUR'||v==='2HOURS'){const d=new Date();d.setHours(d.getHours()+(v==='HOUR'?1:2));s.data.reminderDate=d.toISOString().split('T')[0];s.data.reminderTime=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;await _finalizeLead(bot,chatId,s,sessions);}else{s.data.reminderDate=_resolveDate(v);s.data.reminderTime='09:00';await _finalizeLead(bot,chatId,s,sessions);} return true; }
  return false;
}

function handleText(bot, chatId, text, s, sessions) {
  if (!s.freeText) return false;
  const dr = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/;
  const tr = /(\d{1,2})[:.](\d{2})/;
  if (s.step==='outcome_text') { s.data.outcome=text; s.freeText=false; _askConvertToContact(bot,chatId,s); return true; }
  if (s.step==='notes') { s.data.notes=text; s.freeText=false; if(s.lastMsg) removeKB(bot,chatId,s.lastMsg); _askFollowup(bot,chatId,s); return true; }
  if (s.step==='reminder_date_custom') { const m=text.match(dr); if(!m){bot.sendMessage(chatId,'🤔 פורמט לא תקין. נסה DD/MM/YYYY');return true;} s.data.reminderDate=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; s.freeText=false; _askReminderTime(bot,chatId,s); return true; }
  if (s.step==='reminder_time_custom') { const m=text.match(tr); if(!m){bot.sendMessage(chatId,'🤔 פורמט לא תקין. נסה HH:MM');return true;} s.data.reminderTime=`${m[1].padStart(2,'0')}:${m[2]}`; s.freeText=false; _finalizeLead(bot,chatId,s,sessions); return true; }
  if (s.step==='meeting_date_custom') { const m=text.match(dr); if(!m){bot.sendMessage(chatId,'🤔 פורמט לא תקין. נסה DD/MM/YYYY');return true;} s.data.meetingDate=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; s.freeText=false; _askMeetingTime(bot,chatId,s); return true; }
  if (s.step==='meeting_time_custom') { const m=text.match(tr); if(!m){bot.sendMessage(chatId,'🤔 פורמט לא תקין. נסה HH:MM');return true;} s.data.meetingTime=`${m[1].padStart(2,'0')}:${m[2]}`; s.freeText=false; _finalizeLead(bot,chatId,s,sessions); return true; }
  if (s.step==='followup_noanswer_custom') { const m=text.match(dr); if(!m){bot.sendMessage(chatId,'🤔 פורמט לא תקין. נסה DD/MM/YYYY');return true;} s.data.reminderDate=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; s.data.reminderTime='09:00'; s.freeText=false; _finalizeLead(bot,chatId,s,sessions); return true; }
  return false;
}

module.exports = { registerAgent, handleNewLead, handleCallback, handleText };
