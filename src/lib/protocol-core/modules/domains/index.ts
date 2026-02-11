/**
 * Domain Modules Index
 *
 * Exports all 7 domain practice modules.
 */

export { VoiceDomainModule } from './voice-domain';
export { MovementDomainModule } from './movement-domain';
export { SkincareDomainModule } from './skincare-domain';
export { StyleDomainModule } from './style-domain';
export { SocialDomainModule } from './social-domain';
export { MindsetDomainModule } from './mindset-domain';
export { BodyDomainModule } from './body-domain';

// Re-export base class and types
export {
  BaseDomainModule,
  type DomainModuleConfig,
  type DomainModuleState,
} from '../domain-module-base';
