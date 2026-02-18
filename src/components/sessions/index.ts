// Session Components Index

// New Edge Session Flow Components
export { EdgeSessionEntryFlow, type EdgeSessionConfig } from './EdgeSessionEntryFlow';
export { EdgeSessionCore, QuickPatternsBar } from './EdgeSessionCore';
export {
  AuctionModal,
  BidCard,
  AUCTION_BID_TEMPLATES,
  generateAuctionBid,
} from './AuctionModal';
export { SessionCompletionFlow } from './SessionCompletionFlow';

// Legacy Components
export { EdgeSession } from './EdgeSession';
export { GooningSession } from './GooningSession';
export { SessionLauncher } from './SessionLauncher';

// Handler v2 Integration
export { SessionWithHandler } from './SessionWithHandler';
export { PostSessionMoodCapture } from './PostSessionMoodCapture';
export { TimeCapsulePrompt } from './TimeCapsulePrompt';
export { DenialTracker } from './DenialTracker';
