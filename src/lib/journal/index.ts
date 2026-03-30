/**
 * Identity Journal Module
 *
 * Re-exports for the journal subsystem.
 */

// Prompt Engine
export {
  type JournalCategory,
  type JournalPromptResult,
  selectJournalPrompt,
  getTodaysPrompt,
} from './prompt-engine';

// Entry Processor
export {
  type IdentitySignals,
  type EmotionalTone,
  type JournalStats,
  processJournalEntry,
  getJournalStats,
} from './entry-processor';

// Handler Context
export { buildJournalContext } from './handler-context';
