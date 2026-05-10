// Sniffies integration — import-driven hookup-chat ingestion.
//
// All flags default OFF. The user opts in import-by-import. No live sync,
// no auto-import. Persona only references content when the user has
// explicitly enabled `persona_use_enabled` AND the contact is not
// excluded. Stealth-mode push neutralization is enforced upstream
// (regression: src/__tests__/lib/sniffies-push-stealth.test.ts).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, EyeOff, Loader2, Lock, Trash2, Upload, UserX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import { useSniffiesSettings } from '../../hooks/useSniffiesSettings';
import {
  createImport,
  deleteContact,
  listContacts,
  listImports,
  renameContact,
  setContactExcluded,
} from '../../lib/sniffies/client';
import type {
  SniffiesContact,
  SniffiesImport,
  SniffiesSourceKind,
} from '../../lib/sniffies/types';

type SavingFlag = 'idle' | 'integration' | 'persona' | 'dares' | 'slip' | 'upload';

export function SniffiesSettings() {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const { settings, loading, update } = useSniffiesSettings();
  const [saving, setSaving] = useState<SavingFlag>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [contacts, setContacts] = useState<SniffiesContact[]>([]);
  const [imports, setImports] = useState<SniffiesImport[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [sourceKind, setSourceKind] = useState<SniffiesSourceKind>('screenshot');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const surfaceClass = useMemo(
    () =>
      isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-surface border-protocol-border',
    [isBambiMode],
  );
  const headingClass = isBambiMode ? 'text-pink-700' : 'text-gray-300';
  const mutedClass = isBambiMode ? 'text-pink-500' : 'text-gray-500';
  const valueClass = isBambiMode ? 'text-pink-800' : 'text-gray-200';

  const refresh = useCallback(async () => {
    if (!user) return;
    const [c, i] = await Promise.all([listContacts(user.id), listImports(user.id, 25)]);
    setContacts(c);
    setImports(i);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    // Polling so a freshly-uploaded import lands without a reload.
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [user, refresh]);

  async function handleToggle(
    key: 'sniffies_integration_enabled' | 'persona_use_enabled' | 'dares_use_enabled' | 'slip_use_enabled',
    flag: SavingFlag,
  ) {
    setSaving(flag);
    setFeedback(null);
    try {
      // Master switch enforcement: if the master goes off, granular
      // flags also go off so the surfaces don't accidentally fire when
      // the user re-enables only the master later.
      if (key === 'sniffies_integration_enabled' && settings.sniffies_integration_enabled) {
        await update({
          sniffies_integration_enabled: false,
          persona_use_enabled: false,
          dares_use_enabled: false,
          slip_use_enabled: false,
        });
      } else {
        await update({ [key]: !settings[key] });
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSaving('idle');
    }
  }

  async function handleUpload() {
    if (!user) return;
    setSaving('upload');
    setFeedback(null);
    try {
      const result = await createImport({
        userId: user.id,
        sourceKind,
        file: file ?? undefined,
        pastedText: sourceKind === 'text_paste' ? pastedText : undefined,
      });
      if (!result.ok) {
        setFeedback(result.error ?? 'Upload failed.');
        return;
      }
      setFeedback('Import queued. Extraction runs in the background.');
      setShowUpload(false);
      setFile(null);
      setPastedText('');
      await refresh();
    } finally {
      setSaving('idle');
    }
  }

  async function handleRename(contactId: string) {
    if (!renameValue.trim()) return;
    const r = await renameContact(contactId, renameValue);
    if (r.ok) {
      setRenamingId(null);
      setRenameValue('');
      await refresh();
    } else {
      setFeedback(r.error ?? 'Rename failed.');
    }
  }

  async function handleExclude(contactId: string, current: boolean) {
    const r = await setContactExcluded(contactId, !current);
    if (!r.ok) setFeedback(r.error ?? 'Update failed.');
    await refresh();
  }

  async function handleDelete(contactId: string) {
    if (!confirm('Delete this contact and all its messages? This cannot be undone.')) return;
    const r = await deleteContact(contactId);
    if (!r.ok) setFeedback(r.error ?? 'Delete failed.');
    await refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const integrationOn = settings.sniffies_integration_enabled;

  return (
    <div className="space-y-6">
      {/* Privacy intro */}
      <div className={`rounded-lg p-4 border ${surfaceClass}`}>
        <div className="flex items-start gap-3">
          <Lock className={`w-5 h-5 mt-0.5 ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
          <div className="text-xs leading-relaxed">
            <div className={`text-sm font-medium mb-1 ${valueClass}`}>Sniffies imports</div>
            <div className={mutedClass}>
              Import hookup chats so the persona can ground recall and dares in your real
              conversations. Owner-only, never shared. Phones, addresses, and financial info
              are stripped before storage. Push notifications under stealth never include
              this content. Hard-reset wipes everything.
            </div>
          </div>
        </div>
      </div>

      {/* Master + granular toggles */}
      <section>
        <h3 className={`text-sm font-medium mb-3 ${headingClass}`}>Permissions</h3>
        <div className="space-y-2">
          <ToggleRow
            label="Enable Sniffies integration"
            description="Master switch. Off means no Sniffies code runs at all."
            checked={settings.sniffies_integration_enabled}
            isBambiMode={isBambiMode}
            disabled={saving !== 'idle'}
            onToggle={() => handleToggle('sniffies_integration_enabled', 'integration')}
          />
          <ToggleRow
            label="Allow persona to reference Sniffies"
            description='Mama may quote what you said to a contact ("remember when you told Mark you wanted...").'
            checked={settings.persona_use_enabled}
            isBambiMode={isBambiMode}
            disabled={saving !== 'idle' || !integrationOn}
            onToggle={() => handleToggle('persona_use_enabled', 'persona')}
          />
          <ToggleRow
            label="Allow public dares to name a contact"
            description="Dares may reference a Sniffies contact you've named (e.g. wear the panties you mentioned to him)."
            checked={settings.dares_use_enabled}
            isBambiMode={isBambiMode}
            disabled={saving !== 'idle' || !integrationOn}
            onToggle={() => handleToggle('dares_use_enabled', 'dares')}
          />
          <ToggleRow
            label="Treat ghosting as a slip"
            description="When you ghost a contact you said you'd follow through with, it counts as a slip."
            checked={settings.slip_use_enabled}
            isBambiMode={isBambiMode}
            disabled={saving !== 'idle' || !integrationOn}
            onToggle={() => handleToggle('slip_use_enabled', 'slip')}
          />
        </div>
      </section>

      {/* Imports */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-medium ${headingClass}`}>Chats</h3>
          <button
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            disabled={!integrationOn || saving !== 'idle'}
            className="px-3 py-1.5 rounded-md text-xs bg-purple-500 text-white font-medium disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 inline mr-1" />
            Add chat
          </button>
        </div>

        {showUpload && (
          <div className={`rounded-lg border p-4 mb-3 space-y-3 ${surfaceClass}`}>
            <div className="flex gap-2">
              {(['screenshot', 'text_paste', 'export_file'] as SniffiesSourceKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSourceKind(k)}
                  className={`px-2 py-1 rounded text-xs border ${
                    sourceKind === k
                      ? 'bg-purple-500 text-white border-purple-500'
                      : `${surfaceClass} ${valueClass}`
                  }`}
                >
                  {k === 'screenshot' ? 'Screenshot' : k === 'text_paste' ? 'Paste text' : 'Export file'}
                </button>
              ))}
            </div>

            {sourceKind === 'text_paste' ? (
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste the chat text here..."
                rows={6}
                className={`w-full px-3 py-2 rounded-md text-sm border ${surfaceClass} ${valueClass}`}
              />
            ) : (
              <input
                type="file"
                accept={
                  sourceKind === 'screenshot'
                    ? 'image/png,image/jpeg,image/webp,image/heic'
                    : '.txt,.json,.zip,application/json,text/plain,application/zip'
                }
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={`block w-full text-xs ${valueClass}`}
              />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUpload}
                disabled={saving !== 'idle'}
                className="flex-1 py-2 rounded-md bg-purple-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving === 'upload' ? 'Uploading...' : 'Upload & extract'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUpload(false);
                  setFile(null);
                  setPastedText('');
                }}
                className={`flex-1 py-2 rounded-md text-sm font-medium border ${surfaceClass} ${valueClass}`}
              >
                Cancel
              </button>
            </div>
            <p className={`text-[11px] ${mutedClass}`}>
              Phones, addresses, emails, and financial info are stripped before storage. Imports
              with detected sensitive content land in "manual review" until you confirm.
            </p>
          </div>
        )}

        {imports.length === 0 ? (
          <p className={`text-xs ${mutedClass}`}>No imports yet.</p>
        ) : (
          <div className="space-y-2">
            {imports.map((i) => (
              <div key={i.id} className={`rounded-md border px-3 py-2 ${surfaceClass}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className={valueClass}>
                    {new Date(i.imported_at).toLocaleString()} · {i.source_kind}
                  </span>
                  <StatusBadge status={i.extraction_status} />
                </div>
                {i.redaction_flags && i.redaction_flags.length > 0 && (
                  <div className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Redacted: {i.redaction_flags.join(', ')}
                  </div>
                )}
                {i.error_text && <div className="text-[11px] text-red-400 mt-1">{i.error_text}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Contacts */}
      <section>
        <h3 className={`text-sm font-medium mb-3 ${headingClass}`}>Contacts</h3>
        {contacts.length === 0 ? (
          <p className={`text-xs ${mutedClass}`}>
            No contacts yet. Upload a chat to extract them.
          </p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className={`rounded-md border p-3 ${surfaceClass}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {renamingId === c.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          placeholder={c.display_name}
                          className={`flex-1 px-2 py-1 rounded text-sm border ${surfaceClass} ${valueClass}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleRename(c.id)}
                          className="px-2 py-1 rounded text-xs bg-purple-500 text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(null);
                            setRenameValue('');
                          }}
                          className={`px-2 py-1 rounded text-xs border ${surfaceClass} ${valueClass}`}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(c.id);
                          setRenameValue(c.display_name);
                        }}
                        className={`text-sm font-medium truncate text-left ${valueClass}`}
                      >
                        {c.display_name}
                      </button>
                    )}
                    {c.kinks_mentioned.length > 0 && (
                      <div className={`text-[11px] mt-1 ${mutedClass}`}>
                        Kinks: {c.kinks_mentioned.slice(0, 5).join(', ')}
                      </div>
                    )}
                    {c.outcomes.length > 0 && (
                      <div className={`text-[11px] mt-1 ${mutedClass}`}>
                        Outcomes: {c.outcomes.join(', ')}
                      </div>
                    )}
                    {c.excluded_from_persona && (
                      <div className="text-[11px] text-amber-400 mt-1">
                        Excluded from persona
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleExclude(c.id, c.excluded_from_persona)}
                      title={
                        c.excluded_from_persona
                          ? 'Allow persona to use'
                          : 'Exclude from persona'
                      }
                      className={`p-1.5 rounded border ${surfaceClass}`}
                    >
                      {c.excluded_from_persona ? (
                        <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <UserX className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      title="Delete contact and messages"
                      className={`p-1.5 rounded border ${surfaceClass}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {feedback && (
        <div className={`text-xs ${isBambiMode ? 'text-emerald-700' : 'text-emerald-300'}`}>
          {feedback}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    pending: 'bg-gray-500/20 text-gray-400',
    processing: 'bg-blue-500/20 text-blue-400',
    processed: 'bg-emerald-500/20 text-emerald-400',
    failed: 'bg-red-500/20 text-red-400',
    manual_review: 'bg-amber-500/20 text-amber-400',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${palette[status] ?? palette.pending}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  isBambiMode,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  isBambiMode: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`w-full p-4 rounded-lg border flex items-start gap-3 text-left transition-all ${
        isBambiMode
          ? 'bg-white border-pink-200 hover:border-pink-300'
          : 'bg-protocol-surface border-protocol-border hover:border-purple-500/30'
      } disabled:opacity-50`}
    >
      <div className="flex-1">
        <div
          className={`text-sm font-medium ${
            isBambiMode ? 'text-pink-800' : 'text-gray-200'
          }`}
        >
          {label}
        </div>
        <div
          className={`text-xs mt-0.5 ${
            isBambiMode ? 'text-pink-500' : 'text-gray-500'
          }`}
        >
          {description}
        </div>
      </div>
      <div
        className={`mt-1 w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${
          checked
            ? isBambiMode
              ? 'bg-pink-500'
              : 'bg-purple-500'
            : isBambiMode
              ? 'bg-pink-200'
              : 'bg-gray-700'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </div>
    </button>
  );
}
