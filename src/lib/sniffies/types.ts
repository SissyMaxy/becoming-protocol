// Sniffies integration — Vite-side types & defaults.
//
// All flags default OFF. The integration is opt-in import-by-import.

export type SniffiesOutcome =
  | 'met'
  | 'ghosted'
  | 'met_then_ghosted'
  | 'ongoing'
  | 'blocked'
  | 'planning';

export type SniffiesSourceKind = 'screenshot' | 'text_paste' | 'export_file';

export type SniffiesExtractionStatus =
  | 'pending'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'manual_review';

export interface SniffiesSettings {
  sniffies_integration_enabled: boolean;
  persona_use_enabled: boolean;
  dares_use_enabled: boolean;
  slip_use_enabled: boolean;
  // "Pause Mama" lever — when FALSE, the dispatcher skips even if every
  // other gate is on. Lets the user import without firing real-time
  // reactions. Defaults TRUE per migration 367.
  auto_react_enabled: boolean;
}

export const DEFAULT_SNIFFIES_SETTINGS: SniffiesSettings = {
  sniffies_integration_enabled: false,
  persona_use_enabled: false,
  dares_use_enabled: false,
  slip_use_enabled: false,
  auto_react_enabled: true,
};

export interface SniffiesContact {
  id: string;
  user_id: string;
  display_name: string;
  kinks_mentioned: string[];
  outcomes: SniffiesOutcome[];
  notes: string | null;
  excluded_from_persona: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SniffiesImport {
  id: string;
  user_id: string;
  imported_at: string;
  source_kind: SniffiesSourceKind;
  source_blob_path: string | null;
  extraction_status: SniffiesExtractionStatus;
  extraction_summary: Record<string, unknown>;
  redaction_flags: string[];
  error_text: string | null;
  processed_at: string | null;
}

export interface SniffiesMessage {
  id: string;
  user_id: string;
  import_id: string;
  contact_id: string | null;
  direction: 'inbound' | 'outbound';
  text: string;
  message_at: string | null;
  kink_tags: string[];
  excluded: boolean;
  needs_review: boolean;
  created_at: string;
}
