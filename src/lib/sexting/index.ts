// Sexting & GFE — barrel exports
export { getOrCreateConversation, getActiveConversations, updateConversationStats, escalateConversation, closeConversation, getConversationCounts } from './conversations';
export { handleInboundMessage, getConversationHistory, sendMessage, rejectMessage, getEscalatedMessages, getAutoSendStats } from './messaging';
export { getTemplates, renderTemplate, recordTemplateUsage, createTemplate, seedDefaultTemplates } from './templates';
export { createGfeSubscription, getActiveGfeSubscriptions, generateScheduledMessage, processGfeSchedule, cancelGfeSubscription, getGfeRevenueSummary } from './gfe';
