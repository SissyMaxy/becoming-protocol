// Passive Voice — barrel exports
export { createPassiveAnalyzer } from './analyzer';
export type { PassiveAnalyzer, PassiveSample } from './analyzer';
export { saveSample, aggregateDay, getDailyAggregate, getWeeklyTrend, getMonthlyStats } from './aggregation';
export { checkInterventionRules, recordIntervention, getRecentInterventions, acknowledgeIntervention } from './interventions';
