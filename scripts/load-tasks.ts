/**
 * Task Bank Loader
 *
 * Reads a CSV file of tasks and upserts them into the Supabase task_bank table.
 * Supports both CSV schemas:
 *   - v1: category,domain,intensity,instruction,subtext,completion_type,...,affirmation,is_core,trigger_condition,time_window
 *   - v2: task_id,category,domain,intensity,handler_instruction,handler_subtext,...,handler_response_success,...,prerequisites,unlocks,pnr_associated
 *
 * Usage:
 *   npx tsx scripts/load-tasks.ts                          # loads tasks_v2_full.csv
 *   npx tsx scripts/load-tasks.ts path/to/custom.csv       # loads a specific file
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// 1. Load environment from .env (no dotenv dependency — simple manual parse)
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '..', '.env');
  if (!existsSync(envPath)) {
    console.error('ERROR: .env file not found at', envPath);
    process.exit(1);
  }
  const vars: Record<string, string> = {};
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  let currentKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      currentKey = null;
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1 && /^[A-Z_][A-Z0-9_]*$/.test(trimmed.slice(0, eqIdx).trim())) {
      // New key=value line
      currentKey = trimmed.slice(0, eqIdx).trim();
      vars[currentKey] = trimmed.slice(eqIdx + 1).trim();
    } else if (currentKey) {
      // Continuation line (value split across multiple lines)
      vars[currentKey] += trimmed;
    }
  }
  return vars;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
// Prefer service role key (bypasses RLS) — required since task_bank has no INSERT policy
const SUPABASE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) must be set in .env');
  process.exit(1);
}

const isServiceRole = !!(env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// 2. CSV Parser (handles quoted fields, escaped quotes, newlines inside quotes)
// ---------------------------------------------------------------------------
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++; // skip escaped double-quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      fields.push(field);
      field = '';
      if (fields.some((f) => f.length > 0)) {
        rows.push([...fields]);
      }
      fields.length = 0;
    } else {
      field += ch;
    }
  }

  // Handle final row (no trailing newline)
  if (field || fields.length > 0) {
    fields.push(field);
    if (fields.some((f) => f.length > 0)) {
      rows.push([...fields]);
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 3. Schema detection & column mapping
// ---------------------------------------------------------------------------

/** The row shape we insert into task_bank */
interface TaskRow {
  category: string;
  domain: string;
  intensity: number;
  instruction: string;
  subtext: string | null;
  requires: Record<string, unknown>;
  completion_type: string;
  duration_minutes: number | null;
  target_count: number | null;
  points: number;
  affirmation: string;
  is_core: boolean;
  created_by: string;
  active: boolean;
}

function toInt(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null;
  const n = parseInt(val.trim(), 10);
  return isNaN(n) ? null : n;
}

function toIntensity(val: string | undefined): number {
  const n = toInt(val);
  if (n === null) return 1;
  return Math.max(1, Math.min(5, n));
}

function toBool(val: string | undefined): boolean {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function buildRequires(
  trigger?: string,
  timeWindow?: string,
  prerequisites?: string,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  if (trigger?.trim()) obj.trigger = trigger.trim();
  if (timeWindow?.trim()) obj.time_window = timeWindow.trim();
  if (prerequisites?.trim()) obj.prerequisites = prerequisites.trim();
  return obj;
}

type SchemaType = 'v1' | 'v2' | 'v3';

function detectSchema(headers: string[]): SchemaType {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  // v3: has 'steps' and 'requires_privacy' columns (tasks_v2_full.csv)
  if (normalized.includes('steps') && normalized.includes('requires_privacy')) return 'v3';
  // v2: has 'handler_instruction' (becoming_protocol_tasks_v2.csv)
  if (normalized.includes('handler_instruction')) return 'v2';
  if (normalized.includes('task_id') && normalized.includes('handler_response_success')) return 'v2';
  // v1: basic columns (becoming_protocol_tasks_complete.csv)
  return 'v1';
}

function mapV1Row(headers: string[], row: string[]): TaskRow | null {
  const get = (name: string): string => {
    const idx = headers.indexOf(name);
    return idx >= 0 && idx < row.length ? row[idx] : '';
  };

  const instruction = get('instruction');
  if (!instruction.trim()) return null;

  return {
    category: get('category') || 'unknown',
    domain: get('domain') || 'unknown',
    intensity: toIntensity(get('intensity')),
    instruction: instruction.trim(),
    subtext: get('subtext')?.trim() || null,
    requires: buildRequires(get('trigger_condition'), get('time_window')),
    completion_type: get('completion_type') || 'binary',
    duration_minutes: toInt(get('duration_minutes')),
    target_count: toInt(get('target_count')),
    points: toInt(get('points')) ?? 10,
    affirmation: get('affirmation')?.trim() || 'Good girl.',
    is_core: toBool(get('is_core')),
    created_by: 'seed',
    active: true,
  };
}

function mapV2Row(headers: string[], row: string[]): TaskRow | null {
  const get = (name: string): string => {
    const idx = headers.indexOf(name);
    return idx >= 0 && idx < row.length ? row[idx] : '';
  };

  const instruction = get('handler_instruction');
  if (!instruction.trim()) return null;

  return {
    category: get('category') || 'unknown',
    domain: get('domain') || 'unknown',
    intensity: toIntensity(get('intensity')),
    instruction: instruction.trim(),
    subtext: get('handler_subtext')?.trim() || null,
    requires: buildRequires(get('trigger_condition'), get('time_window'), get('prerequisites')),
    completion_type: get('completion_type') || 'binary',
    duration_minutes: toInt(get('duration_minutes')),
    target_count: toInt(get('target_count')),
    points: toInt(get('points')) ?? 10,
    affirmation: get('handler_response_success')?.trim() || 'Good girl.',
    is_core: toBool(get('is_core')),
    created_by: 'seed',
    active: true,
  };
}

function mapV3Row(headers: string[], row: string[]): TaskRow | null {
  const get = (name: string): string => {
    const idx = headers.indexOf(name);
    return idx >= 0 && idx < row.length ? row[idx] : '';
  };

  const instruction = get('instruction');
  if (!instruction.trim()) return null;

  // Build requires JSONB with v3-specific fields
  const req: Record<string, unknown> = {};
  const trigger = get('trigger_condition');
  const timeWindow = get('time_window');
  const level = get('level');
  const requiresPrivacy = get('requires_privacy');
  const resourceUrl = get('resource_url');
  const consequenceIfDeclined = get('consequence_if_declined');
  const pivotIfUnable = get('pivot_if_unable');
  const steps = get('steps');

  if (trigger?.trim()) req.trigger = trigger.trim();
  if (timeWindow?.trim()) req.time_window = timeWindow.trim();
  if (level?.trim()) req.level = parseInt(level.trim(), 10) || level.trim();
  if (requiresPrivacy?.trim().toLowerCase() === 'true') req.requires_privacy = true;
  if (resourceUrl?.trim()) req.resource_url = resourceUrl.trim();
  if (consequenceIfDeclined?.trim()) req.consequence_if_declined = consequenceIfDeclined.trim();
  if (pivotIfUnable?.trim()) req.pivot_if_unable = pivotIfUnable.trim();
  if (steps?.trim()) req.steps = steps.trim().split('|').map((s) => s.trim());

  // Build exclude_if JSONB — privacy-sensitive tasks excluded when Gina is home
  const PRIVACY_DOMAINS = ['arousal', 'intimate', 'conditioning'];
  const PRIVACY_CATEGORIES = ['edge', 'goon', 'deepen', 'worship', 'bambi', 'corrupt', 'fantasy', 'session'];
  const domain = get('domain')?.trim() || 'unknown';
  const cat = get('category')?.trim() || 'unknown';
  const privacyFromCSV = requiresPrivacy?.trim().toLowerCase() === 'true';
  const privacyFromDomain = PRIVACY_DOMAINS.includes(domain) || PRIVACY_CATEGORIES.includes(cat);
  const excludeIf: Record<string, unknown> = {};
  if (privacyFromCSV || privacyFromDomain) {
    excludeIf.ginaHome = true;
  }

  return {
    category: cat,
    domain,
    intensity: toIntensity(get('intensity')),
    instruction: instruction.trim(),
    subtext: get('subtext')?.trim() || null,
    requires: req,
    exclude_if: excludeIf,
    completion_type: get('completion_type') || 'binary',
    duration_minutes: toInt(get('duration_minutes')),
    target_count: toInt(get('target_count')),
    points: toInt(get('points')) ?? 10,
    affirmation: get('affirmation')?.trim() || 'Good girl.',
    is_core: toBool(get('is_core')),
    created_by: 'seed',
    active: true,
  };
}

// ---------------------------------------------------------------------------
// 4. Batch insert with client-side dedup
// ---------------------------------------------------------------------------
const BATCH_SIZE = 50;

/** Fetch all existing instruction texts from task_bank for dedup */
async function fetchExistingInstructions(): Promise<Set<string>> {
  const existing = new Set<string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('task_bank')
      .select('instruction')
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.warn('  WARN: Could not fetch existing tasks for dedup:', error.message);
      return existing;
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      existing.add((row.instruction as string).trim());
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return existing;
}

async function insertBatch(
  batch: TaskRow[],
  batchNum: number,
  insertedSoFar: number,
  totalToInsert: number,
): Promise<number> {
  const { error } = await supabase.from('task_bank').insert(batch);

  const end = insertedSoFar + batch.length;

  if (error) {
    console.error(`  ERROR batch ${batchNum} (rows ${insertedSoFar + 1}-${end}): ${error.message}`);
    return 0;
  }

  console.log(`  Inserted ${end}/${totalToInsert}...`);
  return batch.length;
}

// ---------------------------------------------------------------------------
// 6. Main
// ---------------------------------------------------------------------------
async function main() {
  // Resolve CSV path
  const csvArg = process.argv[2];
  const csvPath = csvArg
    ? resolve(csvArg)
    : resolve(__dirname, '..', 'tasks_v2_full.csv');

  console.log(`\nTask Bank Loader`);
  console.log(`================`);
  console.log(`CSV:      ${basename(csvPath)}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Auth:     ${isServiceRole ? 'service_role (bypasses RLS)' : 'anon key (subject to RLS)'}`);

  if (!isServiceRole) {
    console.warn(`\nWARN: Using anon key. task_bank has no INSERT RLS policy.`);
    console.warn(`  Add SUPABASE_SERVICE_ROLE_KEY=<your-key> to .env to bypass RLS.`);
    console.warn(`  Find it at: Supabase Dashboard > Settings > API > service_role key\n`);
  }

  if (!existsSync(csvPath)) {
    // If the default doesn't exist, try the two known CSVs
    const fallbacks = [
      resolve(__dirname, '..', 'becoming_protocol_tasks_complete.csv'),
      resolve(__dirname, '..', 'becoming_protocol_tasks_v2.csv'),
    ];
    const available = fallbacks.filter(existsSync);

    if (available.length === 0) {
      console.error(`\nERROR: CSV not found at ${csvPath}`);
      console.error('  Place tasks_v2_full.csv in the project root, or pass a path as argument.');
      process.exit(1);
    }

    console.log(`\nWARN: ${basename(csvPath)} not found. Loading ${available.length} fallback CSV(s):`);
    let totalInserted = 0;
    for (const fb of available) {
      console.log(`\n--- Loading ${basename(fb)} ---`);
      totalInserted += await loadCSV(fb);
    }
    console.log(`\nDone. Total inserted: ${totalInserted} tasks`);
    return;
  }

  const inserted = await loadCSV(csvPath);
  console.log(`\nDone. Total inserted: ${inserted} tasks`);
}

async function loadCSV(csvPath: string): Promise<number> {
  const raw = readFileSync(csvPath, 'utf-8');
  const allRows = parseCSV(raw);

  if (allRows.length < 2) {
    console.error('ERROR: CSV has no data rows');
    return 0;
  }

  const headers = allRows[0].map((h) => h.trim().toLowerCase());
  const schema = detectSchema(headers);
  const dataRows = allRows.slice(1);

  console.log(`Schema:   ${schema}`);
  console.log(`Headers:  ${headers.join(', ')}`);
  console.log(`Rows:     ${dataRows.length}`);

  // Map rows
  const mapFn = schema === 'v3' ? mapV3Row : schema === 'v2' ? mapV2Row : mapV1Row;
  const tasks: TaskRow[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const mapped = mapFn(headers, row);
    if (mapped) {
      tasks.push(mapped);
    } else {
      skipped++;
    }
  }

  console.log(`Mapped:   ${tasks.length} tasks (${skipped} empty rows skipped)`);

  if (tasks.length === 0) {
    console.error('ERROR: No tasks to insert');
    return 0;
  }

  // Client-side dedup: fetch existing instructions, skip duplicates
  console.log(`\nFetching existing tasks for dedup...`);
  const existing = await fetchExistingInstructions();
  console.log(`  ${existing.size} tasks already in task_bank`);

  const newTasks = tasks.filter((t) => !existing.has(t.instruction));
  const dupCount = tasks.length - newTasks.length;
  console.log(`  ${newTasks.length} new tasks to insert (${dupCount} duplicates skipped)`);

  if (newTasks.length === 0) {
    console.log('  All tasks already exist. Nothing to do.');
    return 0;
  }

  // Batch insert
  console.log(`\nInserting in batches of ${BATCH_SIZE}...`);
  let totalInserted = 0;
  const totalBatches = Math.ceil(newTasks.length / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const batch = newTasks.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    totalInserted += await insertBatch(batch, i + 1, totalInserted, newTasks.length);
  }

  return totalInserted;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
