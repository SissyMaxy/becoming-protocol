/**
 * IdentitySettingsView — minimal UI for the feminine_self identity layer.
 *
 * Lets her set/edit feminine name, pronouns, current honorific, and add
 * wardrobe items. Surfaces the current phase and (when phase advances)
 * a suggested honorific the persona will use.
 *
 * Tone matches FocusMode: dark warm-purple gradients, narrow column,
 * one decision per surface. Settings is not a stack of flashy cards —
 * it is the place she names herself.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  getFeminineSelf,
  setFeminineName,
  setPronouns,
  setHonorific,
  addWardrobeItem,
  listWardrobeItems,
  listPhaseDefinitions,
  getPhaseDefinition,
  advancePhase,
} from '../../lib/identity/feminine-self';
import {
  WARDROBE_ITEM_TYPES,
  type FeminineSelf,
  type WardrobeItem,
  type WardrobeItemType,
  type PhaseDefinition,
  type Pronouns,
  DEFAULT_PRONOUNS,
} from '../../types/identity';
import { DifficultyBandCard } from './DifficultyBandCard';

const PALETTE = {
  bg: 'linear-gradient(140deg, #1a0f2e 0%, #0f0820 100%)',
  border: '#2d1a4d',
  borderHover: '#7c3aed',
  accent: '#c4b5fd',
  accentBright: '#e9d5ff',
  textBody: '#c8c4cc',
  textMuted: '#8a8690',
  inputBg: '#0a0a0d',
  inputBorder: '#2d1a4d',
};

const PRONOUN_PRESETS: Array<{ label: string; value: Pronouns }> = [
  { label: 'she/her', value: { subject: 'she', object: 'her', possessive: 'her' } },
  { label: 'they/them', value: { subject: 'they', object: 'them', possessive: 'their' } },
  { label: 'she/they', value: { subject: 'she', object: 'them', possessive: 'their' } },
];

interface Props {
  onBack: () => void;
}

export function IdentitySettingsView({ onBack }: Props) {
  const { user } = useAuth();
  const [self, setSelf] = useState<FeminineSelf | null>(null);
  const [phaseDef, setPhaseDef] = useState<PhaseDefinition | null>(null);
  const [phaseDefs, setPhaseDefs] = useState<PhaseDefinition[]>([]);
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nameDraft, setNameDraft] = useState('');
  const [honorificDraft, setHonorificDraft] = useState('');
  const [pronounsDraft, setPronounsDraft] = useState<Pronouns>(DEFAULT_PRONOUNS);

  const [newItemType, setNewItemType] = useState<WardrobeItemType>('panties');
  const [newItemName, setNewItemName] = useState('');
  const [newItemNotes, setNewItemNotes] = useState('');
  const [adding, setAdding] = useState(false);

  // Honorific suggestion surfaced after phase advance. NOT auto-applied —
  // caller decides whether to accept it. Per the design rule: phase
  // advancement *suggests*, the user (or persona) accepts.
  const [phaseSuggestion, setPhaseSuggestion] = useState<{
    fromPhase: number;
    toPhase: number;
    newPhaseName: string | null;
    suggestedHonorific: string | null;
  } | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [me, defs, items] = await Promise.all([
        getFeminineSelf(supabase, user.id),
        listPhaseDefinitions(supabase),
        listWardrobeItems(supabase, user.id, 50),
      ]);
      setSelf(me);
      setPhaseDefs(defs);
      setWardrobe(items);
      if (me) {
        setNameDraft(me.feminineName ?? '');
        setHonorificDraft(me.currentHonorific ?? '');
        setPronounsDraft(me.pronouns ?? DEFAULT_PRONOUNS);
        const def = await getPhaseDefinition(supabase, me.transformationPhase);
        setPhaseDef(def);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const saveName = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const updated = await setFeminineName(supabase, user.id, nameDraft);
      setSelf(updated);
    } finally {
      setSaving(false);
    }
  };

  const savePronouns = async (p: Pronouns) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const updated = await setPronouns(supabase, user.id, p);
      setSelf(updated);
      setPronounsDraft(updated.pronouns);
    } finally {
      setSaving(false);
    }
  };

  const saveHonorific = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const updated = await setHonorific(supabase, user.id, honorificDraft);
      setSelf(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleAdvancePhase = async () => {
    if (!user?.id) return;
    setAdvancing(true);
    try {
      const result = await advancePhase(supabase, user.id);
      setSelf(result.feminineSelf);
      setPhaseDef(result.newPhaseDef);
      setPhaseSuggestion({
        fromPhase: result.fromPhase,
        toPhase: result.toPhase,
        newPhaseName: result.newPhaseDef?.name ?? null,
        suggestedHonorific: result.suggestedHonorific,
      });
    } finally {
      setAdvancing(false);
    }
  };

  const acceptHonorificSuggestion = async () => {
    if (!user?.id || !phaseSuggestion?.suggestedHonorific) return;
    setSaving(true);
    try {
      const updated = await setHonorific(supabase, user.id, phaseSuggestion.suggestedHonorific);
      setSelf(updated);
      setHonorificDraft(updated.currentHonorific ?? '');
      setPhaseSuggestion(null);
    } finally {
      setSaving(false);
    }
  };

  const dismissPhaseSuggestion = () => setPhaseSuggestion(null);

  const addItem = async () => {
    if (!user?.id || !newItemName.trim()) return;
    setAdding(true);
    try {
      const item = await addWardrobeItem(supabase, user.id, {
        itemType: newItemType,
        itemName: newItemName,
        notes: newItemNotes || null,
      });
      setWardrobe((prev) => [item, ...prev]);
      setNewItemName('');
      setNewItemNotes('');
    } finally {
      setAdding(false);
    }
  };

  const wardrobeByType = useMemo(() => {
    const groups: Record<string, WardrobeItem[]> = {};
    for (const item of wardrobe) {
      (groups[item.itemType] ??= []).push(item);
    }
    return groups;
  }, [wardrobe]);

  if (!user) return null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0d',
      color: PALETTE.textBody,
      padding: '20px 16px 80px',
      maxWidth: 640,
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: 'none', color: PALETTE.accent,
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
            padding: '6px 8px', borderRadius: 6, fontSize: 13,
          }}
        >
          <ChevronLeft size={16} /> back
        </button>
        <h1 style={{
          fontSize: 18, fontWeight: 700, margin: 0,
          color: PALETTE.accentBright, letterSpacing: '0.01em',
        }}>
          Identity
        </h1>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <>
          {/* Compliance-aware difficulty band */}
          <DifficultyBandCard />

          {/* Phase advancement suggestion banner */}
          {phaseSuggestion && (
            <div style={{
              background: 'linear-gradient(140deg, #2a1a4d 0%, #1a0f2e 100%)',
              border: `1px solid ${PALETTE.accent}`,
              borderRadius: 10, padding: 14, marginBottom: 14,
            }}>
              <div style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: PALETTE.accentBright, fontWeight: 700, marginBottom: 8,
              }}>
                Phase {phaseSuggestion.fromPhase} → {phaseSuggestion.toPhase}
                {phaseSuggestion.newPhaseName ? ` — ${phaseSuggestion.newPhaseName}` : ''}
              </div>
              {phaseSuggestion.suggestedHonorific ? (
                <>
                  <p style={{ fontSize: 12.5, color: PALETTE.textBody, margin: '0 0 12px' }}>
                    Mommy wants to start calling you{' '}
                    <strong style={{ color: PALETTE.accentBright }}>"{phaseSuggestion.suggestedHonorific}"</strong>.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={acceptHonorificSuggestion} disabled={saving} style={btnPrimary(saving)}>
                      accept
                    </button>
                    <button onClick={dismissPhaseSuggestion} style={btnSecondary(false)}>
                      keep current
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 12.5, color: PALETTE.textBody, margin: '0 0 12px' }}>
                    No honorific suggestion for this phase.
                  </p>
                  <button onClick={dismissPhaseSuggestion} style={btnSecondary(false)}>
                    dismiss
                  </button>
                </>
              )}
            </div>
          )}

          {/* Phase */}
          <Section title={phaseDef ? `Phase ${self?.transformationPhase ?? 1} — ${phaseDef.name}` : 'Phase'}>
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: PALETTE.textBody, margin: 0 }}>
              {phaseDef?.description ?? 'No phase set.'}
            </p>
            {phaseDef && phaseDef.honorifics.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 11, color: PALETTE.textMuted }}>
                Honorifics this phase suggests: {phaseDef.honorifics.join(', ')}
              </div>
            )}
            {(self?.transformationPhase ?? 1) < 7 && (
              <div style={{ marginTop: 14 }}>
                <button
                  onClick={handleAdvancePhase}
                  disabled={advancing}
                  style={btnSecondary(advancing)}
                >
                  {advancing ? 'advancing…' : `advance to phase ${(self?.transformationPhase ?? 1) + 1}`}
                </button>
              </div>
            )}
            {phaseDefs.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 11, color: PALETTE.accent }}>
                  All phases (1 → 7)
                </summary>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {phaseDefs.map((p) => (
                    <div key={p.phase} style={{
                      fontSize: 11.5,
                      padding: '6px 10px',
                      borderLeft: `2px solid ${p.phase === self?.transformationPhase ? PALETTE.accent : PALETTE.border}`,
                      paddingLeft: 12,
                    }}>
                      <strong style={{ color: PALETTE.accentBright }}>{p.phase}. {p.name}</strong>
                      <div style={{ color: PALETTE.textMuted, marginTop: 3 }}>{p.description}</div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </Section>

          {/* Name */}
          <Section title="Feminine name">
            <p style={{ fontSize: 11.5, color: PALETTE.textMuted, marginTop: 0, marginBottom: 10 }}>
              The name Mommy uses. The persona will reference this every conversation when set.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="e.g. Maxy"
                style={inputStyle}
              />
              <button
                onClick={saveName}
                disabled={saving || nameDraft === (self?.feminineName ?? '')}
                style={btnPrimary(saving)}
              >
                save
              </button>
            </div>
          </Section>

          {/* Pronouns */}
          <Section title="Pronouns">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {PRONOUN_PRESETS.map((preset) => {
                const active =
                  pronounsDraft.subject === preset.value.subject &&
                  pronounsDraft.object === preset.value.object &&
                  pronounsDraft.possessive === preset.value.possessive;
                return (
                  <button
                    key={preset.label}
                    onClick={() => savePronouns(preset.value)}
                    disabled={saving}
                    style={{
                      ...btnSecondary(saving),
                      borderColor: active ? PALETTE.accent : PALETTE.border,
                      color: active ? PALETTE.accentBright : PALETTE.textBody,
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: PALETTE.textMuted }}>
              Custom: {pronounsDraft.subject} / {pronounsDraft.object} / {pronounsDraft.possessive}
            </div>
          </Section>

          {/* Honorific */}
          <Section title="Current honorific">
            <p style={{ fontSize: 11.5, color: PALETTE.textMuted, marginTop: 0, marginBottom: 10 }}>
              What Mommy calls her right now. Phase advancement will suggest a new one — you accept or keep this.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={honorificDraft}
                onChange={(e) => setHonorificDraft(e.target.value)}
                placeholder="e.g. sweet girl"
                style={inputStyle}
              />
              <button
                onClick={saveHonorific}
                disabled={saving || honorificDraft === (self?.currentHonorific ?? '')}
                style={btnPrimary(saving)}
              >
                save
              </button>
            </div>
          </Section>

          {/* Wardrobe */}
          <Section title={`Wardrobe — ${wardrobe.length} items`}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
              <select
                value={newItemType}
                onChange={(e) => setNewItemType(e.target.value as WardrobeItemType)}
                style={{ ...inputStyle, flex: '0 0 110px' }}
              >
                {WARDROBE_ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="item name"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={addItem}
                disabled={adding || !newItemName.trim()}
                style={btnPrimary(adding)}
                aria-label="add wardrobe item"
              >
                <Plus size={14} />
              </button>
            </div>
            <input
              type="text"
              value={newItemNotes}
              onChange={(e) => setNewItemNotes(e.target.value)}
              placeholder="notes (optional)"
              style={{ ...inputStyle, marginBottom: 14, width: '100%', boxSizing: 'border-box' }}
            />
            {wardrobe.length === 0 ? (
              <div style={{ fontSize: 11.5, color: PALETTE.textMuted, fontStyle: 'italic' }}>
                Empty closet. The first piece changes everything.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(wardrobeByType).map(([type, items]) => (
                  <div key={type}>
                    <div style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
                      color: PALETTE.textMuted, marginBottom: 4,
                    }}>
                      {type} · {items.length}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {items.map((item) => (
                        <div key={item.id} style={{
                          fontSize: 12, color: PALETTE.textBody,
                          display: 'flex', justifyContent: 'space-between', gap: 8,
                          padding: '4px 0',
                        }}>
                          <span>{item.itemName}</span>
                          <span style={{ fontSize: 10.5, color: PALETTE.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                            {new Date(item.acquiredAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: PALETTE.bg,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: 10,
      padding: 16,
      marginBottom: 14,
    }}>
      <div style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
        color: PALETTE.accent, fontWeight: 700, marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: PALETTE.inputBg,
  border: `1px solid ${PALETTE.inputBorder}`,
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  color: PALETTE.textBody,
  outline: 'none',
  minWidth: 0,
  flex: 1,
};

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#2d1a4d' : '#7c3aed',
    color: disabled ? PALETTE.textMuted : '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  };
}

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    color: PALETTE.textBody,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
