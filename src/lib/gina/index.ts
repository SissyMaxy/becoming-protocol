/**
 * Gina Pipeline System
 *
 * Phase F: Ladder engine, seed manager, and measurement engine.
 * The structural backbone for all 242 Gina tasks.
 */

// Ladder Engine
export {
  type GinaChannel,
  type GinaLadderState,
  type AdvancementCriteria,
  type AdvancementResult,
  type ChannelGateCheck,
  GINA_CHANNELS,
  getAllChannelStates,
  getChannelState,
  initializeLadder,
  isInCooldown,
  getCooldownRemaining,
  setCooldown,
  clearCooldown,
  checkAdvancement,
  advanceRung,
  checkChannelGate,
  getAllChannelGates,
  evaluateGinaTrigger,
  getPipelineComposite,
} from './ladder-engine';

// Seed Manager
export {
  type SeedResponse,
  type RecoveryType,
  type SeedEntry,
  type LogSeedInput,
  type SeedLogResult,
  logSeed,
  getSeedHistory,
  getSeedsByRung,
  getRecentSeeds,
  getSeedStats,
  logDiscoveryRupture,
  getChannelsInRecovery,
} from './seed-manager';

// Measurement Engine
export {
  type MeasurementType,
  type MeasurementData,
  type BedroomWeeklyData,
  type PronounWeeklyData,
  type FinancialMonthlyData,
  type TouchBiweeklyData,
  type ShopperMonthlyData,
  type SocialMapData,
  type OccasionDebriefData,
  type MasterCompositeData,
  type MeasurementDue,
  saveMeasurement,
  getMeasurementHistory,
  getLatestMeasurement,
  getChannelMeasurementScore,
  generateMasterComposite,
  getDueMeasurements,
} from './measurement-engine';
