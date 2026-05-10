// Vite-side client for Sniffies integration: list contacts, list
// imports, kick off an import, soft-delete a contact (cascades messages
// via FK).

import { supabase } from '../supabase';
import { SniffiesContact, SniffiesImport, SniffiesSourceKind } from './types';

export async function listContacts(userId: string): Promise<SniffiesContact[]> {
  const { data, error } = await supabase
    .from('sniffies_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false, nullsFirst: false });
  if (error) {
    console.warn('[sniffies] listContacts failed:', error);
    return [];
  }
  return (data ?? []) as SniffiesContact[];
}

export async function listImports(
  userId: string,
  limit = 25,
): Promise<SniffiesImport[]> {
  const { data, error } = await supabase
    .from('sniffies_chat_imports')
    .select('*')
    .eq('user_id', userId)
    .order('imported_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[sniffies] listImports failed:', error);
    return [];
  }
  return (data ?? []) as SniffiesImport[];
}

export async function deleteContact(contactId: string): Promise<{ ok: boolean; error?: string }> {
  // RLS gates this to the contact's owner. Messages cascade-delete via
  // ON DELETE SET NULL on contact_id (messages stay; contact pointer
  // clears) — that matches the spec's "Operator can manually delete any
  // contact + all associated messages" intent only when the user also
  // clears the messages. We provide a single helper that does both:
  // delete messages first, then the contact.
  const { error: msgErr } = await supabase
    .from('sniffies_chat_messages')
    .delete()
    .eq('contact_id', contactId);
  if (msgErr) return { ok: false, error: msgErr.message };
  const { error } = await supabase
    .from('sniffies_contacts')
    .delete()
    .eq('id', contactId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setContactExcluded(
  contactId: string,
  excluded: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('sniffies_contacts')
    .update({ excluded_from_persona: excluded })
    .eq('id', contactId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function renameContact(
  contactId: string,
  displayName: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = displayName.trim();
  if (!trimmed) return { ok: false, error: 'display_name_empty' };
  const { error } = await supabase
    .from('sniffies_contacts')
    .update({ display_name: trimmed.slice(0, 80) })
    .eq('id', contactId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface CreateImportParams {
  userId: string;
  sourceKind: SniffiesSourceKind;
  file?: File;
  pastedText?: string;
}

export interface CreateImportResult {
  ok: boolean;
  importId?: string;
  error?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export async function createImport(params: CreateImportParams): Promise<CreateImportResult> {
  const { userId, sourceKind, file, pastedText } = params;

  if (sourceKind === 'text_paste') {
    if (!pastedText || pastedText.trim().length < 20) {
      return { ok: false, error: 'paste_too_short' };
    }
  } else {
    if (!file) return { ok: false, error: 'file_required' };
  }

  let blobPath: string | null = null;
  if (file) {
    const ext = file.name.split('.').pop() || 'bin';
    blobPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('sniffies-imports')
      .upload(blobPath, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
  }

  const { data: ins, error: insErr } = await supabase
    .from('sniffies_chat_imports')
    .insert({
      user_id: userId,
      source_kind: sourceKind,
      source_blob_path: blobPath,
      extraction_status: 'pending',
      extraction_summary: pastedText
        ? { raw_text_preview: pastedText.slice(0, 500) }
        : {},
    })
    .select('id')
    .single();
  if (insErr || !ins) return { ok: false, error: insErr?.message ?? 'insert_failed' };

  // Fire the extraction edge function. Non-blocking — the UI polls the
  // import row to learn when extraction lands.
  void fetch(`${SUPABASE_URL}/functions/v1/sniffies-extract-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      import_id: (ins as { id: string }).id,
      raw_text: sourceKind === 'text_paste' ? pastedText : undefined,
    }),
  }).catch((e) => console.warn('[sniffies] extract kickoff failed:', e));

  return { ok: true, importId: (ins as { id: string }).id };
}
