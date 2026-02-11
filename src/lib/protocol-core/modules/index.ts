/**
 * Protocol Core Modules
 *
 * System modules that plug into the event bus infrastructure:
 * - VaultModule: Content capture and coercion leverage
 * - CoercionModule: Resistance handling state machine
 * - SwitchModule: Dead Man's Switch countdown
 * - IdentityModule: Brainwashing engine (Feature 43 Section 15)
 * - PartnerModule: Hookup coordination & relationship management
 * - FindomModule: Financial domination & revenue tracking
 * - GinaModule: Gina emergence ladder and visibility tracking
 * - DynamicTaskGenerator: Runtime task generation
 * - Domain Modules: 7 practice domains (voice, movement, skincare, etc.)
 */

// Vault Module
export {
  VaultModule,
  type VaultItem,
  type VaultThreat,
  type VaultItemType,
} from './vault-module';

// Coercion Module
export {
  CoercionModule,
  type CoercionState,
  type CoercionEpisode,
  type ResistanceType,
} from './coercion-module';

// Switch Module
export {
  SwitchModule,
  type SwitchState,
  type SwitchRecord,
} from './switch-module';

// Identity Module (Brainwashing Engine)
export {
  IdentityModule,
  type IdentityState,
  type BrainwashingStage,
  type AnchorType,
  type SurfacingIndicator,
  type PlaybackContext,
} from './identity-module';

// Partner Module (Hookup Coordination)
export {
  PartnerModule,
  type Partner,
  type Meetup,
  type PartnerState,
  type MeetupStatus,
  type MeetupInitiator,
  type PartnerModuleState,
} from './partner-module';

// Findom Module (Financial Domination)
export {
  FindomModule,
  type CashPig,
  type RevenueEntry,
  type ExpenseEntry,
  type RevenueSource,
  type ExpenseCategory,
  type CashPigStatus,
  type FindomModuleState,
} from './findom-module';

// Gina Module (Emergence Ladder)
export {
  GinaModule,
  type EmergenceStage,
  type EmergenceStageInfo,
  type GinaInteraction,
  type GinaState,
  type GinaModuleState,
} from './gina-module';

// Dynamic Task Generator
export {
  DynamicTaskGenerator,
  type DynamicTaskRequest,
  type GeneratorState,
} from './dynamic-task-generator';

// Domain Modules
export {
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
} from './domains';
