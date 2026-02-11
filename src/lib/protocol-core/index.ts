/**
 * Protocol Core
 *
 * Event-driven, module-based architecture for the Becoming Protocol.
 *
 * This is the skeleton that modules plug into:
 * - EventBus: Central nervous system for event-driven communication
 * - ProtocolModule: Interface that all domain modules implement
 * - AILayer: Priority-based AI integration with budget management
 * - Handler: Orchestrator that composes modules and AI
 */

// Event Bus
export {
  EventBus,
  getEventBus,
  createEventBus,
  getEventCategory,
  type ProtocolEvent,
  type EventCategory,
} from './event-bus';

// Module Interface
export {
  BaseModule,
  ModuleRegistry,
  type ProtocolModule,
  type ContextTier,
  type PriorityAction,
  type ModuleRequest,
  type ModuleResponse,
} from './module-interface';

// AI Layer (Comprehensive)
export {
  AILayer,
  getAILayer,
  createAILayer,
  ContextComposer,
  SYSTEM_PROMPTS,
  PREFILL_PATTERNS,
  FALLBACK_TEMPLATES,
  getPrefill,
  getFallbackTemplate,
  getSystemPrompt,
  type OperationType,
  type AICallConfig,
  type AIResponse,
  type BudgetConfig,
  type ModelTier,
  type Priority,
} from './ai';

// Legacy AI Layer exports (for backwards compatibility)
export {
  PriorityBudget,
  composeSystemPrompt,
  type AIPriority,
  type BudgetStatus,
} from './ai-layer';

// Handler (Orchestrator)
export {
  Handler,
  createHandler,
  type Prescription,
  type HandlerState,
  type HandlerConfig,
} from './handler';

// System Modules
export {
  // Vault
  VaultModule,
  type VaultItem,
  type VaultThreat,
  type VaultItemType,

  // Coercion
  CoercionModule,
  type CoercionState,
  type CoercionEpisode,
  type ResistanceType,

  // Switch
  SwitchModule,
  type SwitchState,
  type SwitchRecord,

  // Identity
  IdentityModule,
  type IdentityState,
  type BrainwashingStage,
  type AnchorType,
  type SurfacingIndicator,
  type PlaybackContext,

  // Partner
  PartnerModule,
  type Partner,
  type Meetup,
  type PartnerState,
  type MeetupStatus,
  type MeetupInitiator,
  type PartnerModuleState,

  // Findom
  FindomModule,
  type CashPig,
  type RevenueEntry,
  type ExpenseEntry,
  type RevenueSource,
  type ExpenseCategory,
  type CashPigStatus,
  type FindomModuleState,

  // Gina
  GinaModule,
  type EmergenceStage,
  type EmergenceStageInfo,
  type GinaInteraction,
  type GinaState,
  type GinaModuleState,

  // Dynamic Task Generator
  DynamicTaskGenerator,
  type DynamicTaskRequest,
  type GeneratorState,

  // Domain Modules
  VoiceDomainModule,
  MovementDomainModule,
  SkincareDomainModule,
  StyleDomainModule,
  SocialDomainModule,
  MindsetDomainModule,
  BodyDomainModule,
  BaseDomainModule,
  type DomainModuleConfig,
  type DomainModuleState,
} from './modules';

// Task Types
export {
  type Task,
  type DynamicTask,
  type DynamicTaskType,
  type TaskSelectionState,
  type DomainState,
  type TaskCompletionResult,
  type TaskDomain,
  type TaskCategory,
  type TaskTimeWindow,
  type TaskCompletionType,
  parseTaskFromCSV,
  isDynamicTask,
  createDynamicTask,
} from './types/task';
