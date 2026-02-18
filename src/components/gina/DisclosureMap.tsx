/**
 * Disclosure Map
 *
 * Social disclosure tracking UI — manages the people who know
 * about Gina's feminization journey, their awareness status,
 * and support levels.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  Loader2,
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Edit3,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import { supabase } from '../../lib/supabase';

interface DisclosureMapProps {
  onBack: () => void;
}

interface DisclosurePerson {
  id: string;
  personName: string;
  relationship: string;
  relationshipTo: string;
  awarenessStatus: string;
  toldDate: string | null;
  toldBy: string | null;
  initialReaction: string | null;
  currentStance: string | null;
  providesActiveSupport: boolean;
  notes: string | null;
}

const AWARENESS_CONFIG: Record<string, { label: string; color: string; icon: typeof Users }> = {
  unaware: { label: 'Unaware', color: 'text-gray-400', icon: Users },
  told: { label: 'Told', color: 'text-blue-400', icon: Users },
  supportive: { label: 'Supportive', color: 'text-green-400', icon: UserCheck },
  neutral: { label: 'Neutral', color: 'text-yellow-400', icon: Users },
  hostile: { label: 'Hostile', color: 'text-red-400', icon: UserX },
};

const RELATIONSHIP_OPTIONS = ['friend', 'family', 'colleague', 'community'];
const RELATIONSHIP_TO_OPTIONS = ['gina', 'user', 'both'];
const AWARENESS_OPTIONS = ['unaware', 'told', 'supportive', 'neutral', 'hostile'];
const TOLD_BY_OPTIONS = ['gina', 'user', 'other'];

export function DisclosureMap({ onBack }: DisclosureMapProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [people, setPeople] = useState<DisclosurePerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('gina_disclosure_map')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      setPeople((data || []).map(mapRow));
    } catch (err) {
      console.error('Failed to load disclosure map:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from('gina_disclosure_map').delete().eq('id', id).eq('user_id', user.id);
    await loadData();
  }, [user, loadData]);

  // Summary stats
  const totalAware = people.filter(p => p.awarenessStatus !== 'unaware').length;
  const totalSupportive = people.filter(p => p.awarenessStatus === 'supportive' || p.providesActiveSupport).length;
  const totalHostile = people.filter(p => p.awarenessStatus === 'hostile').length;

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
        <Loader2 className={`w-8 h-8 animate-spin ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b ${
        isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'
      }`}>
        <button onClick={onBack} className="p-1">
          <ChevronLeft className={`w-6 h-6 ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`} />
        </button>
        <Users className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
        <h1 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
          Disclosure Map
        </h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary */}
        <div className={`rounded-lg p-4 ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className={`text-xl font-bold ${isBambiMode ? 'text-pink-700' : 'text-white'}`}>{people.length}</div>
              <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>Total</div>
            </div>
            <div>
              <div className="text-xl font-bold text-blue-400">{totalAware}</div>
              <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>Aware</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-400">{totalSupportive}</div>
              <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>Supportive</div>
            </div>
            <div>
              <div className="text-xl font-bold text-red-400">{totalHostile}</div>
              <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>Hostile</div>
            </div>
          </div>
        </div>

        {/* Add Person Button */}
        <button
          onClick={() => setShowAddForm(true)}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium ${
            isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          Add Person
        </button>

        {/* Add Form */}
        {showAddForm && (
          <PersonForm
            isBambiMode={isBambiMode}
            onSave={async (data) => {
              if (!user) return;
              await supabase.from('gina_disclosure_map').insert({
                user_id: user.id,
                person_name: data.personName,
                relationship: data.relationship,
                relationship_to: data.relationshipTo,
                awareness_status: data.awarenessStatus,
                told_date: data.toldDate || null,
                told_by: data.toldBy || null,
                initial_reaction: data.initialReaction || null,
                current_stance: data.currentStance || null,
                provides_active_support: data.providesActiveSupport,
                notes: data.notes || null,
              });
              setShowAddForm(false);
              await loadData();
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* People List */}
        {people.length === 0 && !showAddForm ? (
          <p className={`text-center text-sm py-8 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
            No people tracked yet. Add someone to start mapping.
          </p>
        ) : (
          <div className="space-y-3">
            {people.map(person => {
              const awConfig = AWARENESS_CONFIG[person.awarenessStatus] || AWARENESS_CONFIG.unaware;

              if (editingId === person.id) {
                return (
                  <PersonForm
                    key={person.id}
                    initial={person}
                    isBambiMode={isBambiMode}
                    onSave={async (data) => {
                      if (!user) return;
                      await supabase.from('gina_disclosure_map').update({
                        person_name: data.personName,
                        relationship: data.relationship,
                        relationship_to: data.relationshipTo,
                        awareness_status: data.awarenessStatus,
                        told_date: data.toldDate || null,
                        told_by: data.toldBy || null,
                        initial_reaction: data.initialReaction || null,
                        current_stance: data.currentStance || null,
                        provides_active_support: data.providesActiveSupport,
                        notes: data.notes || null,
                        updated_at: new Date().toISOString(),
                      }).eq('id', person.id).eq('user_id', user.id);
                      setEditingId(null);
                      await loadData();
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                );
              }

              return (
                <div
                  key={person.id}
                  className={`rounded-lg p-3 ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
                        {person.personName}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-white/10 text-gray-400'
                      }`}>
                        {person.relationship}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingId(person.id)}
                        className={`p-1 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(person.id)}
                        className={`p-1 ${isBambiMode ? 'text-red-400' : 'text-red-500'}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className={awConfig.color}>
                      {awConfig.label}
                    </span>
                    {person.providesActiveSupport && (
                      <span className="text-green-400">Active Support</span>
                    )}
                    {person.toldDate && (
                      <span className={isBambiMode ? 'text-pink-400' : 'text-gray-500'}>
                        Told: {new Date(person.toldDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {person.currentStance && (
                    <p className={`text-xs mt-1 ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
                      Current: {person.currentStance}
                    </p>
                  )}
                  {person.notes && (
                    <p className={`text-xs mt-1 italic ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                      {person.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// PERSON FORM SUB-COMPONENT
// ============================================

interface PersonFormData {
  personName: string;
  relationship: string;
  relationshipTo: string;
  awarenessStatus: string;
  toldDate: string;
  toldBy: string;
  initialReaction: string;
  currentStance: string;
  providesActiveSupport: boolean;
  notes: string;
}

function PersonForm({ initial, isBambiMode, onSave, onCancel }: {
  initial?: DisclosurePerson;
  isBambiMode: boolean;
  onSave: (data: PersonFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PersonFormData>({
    personName: initial?.personName || '',
    relationship: initial?.relationship || 'friend',
    relationshipTo: initial?.relationshipTo || 'both',
    awarenessStatus: initial?.awarenessStatus || 'unaware',
    toldDate: initial?.toldDate || '',
    toldBy: initial?.toldBy || '',
    initialReaction: initial?.initialReaction || '',
    currentStance: initial?.currentStance || '',
    providesActiveSupport: initial?.providesActiveSupport || false,
    notes: initial?.notes || '',
  });

  const update = (field: keyof PersonFormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const inputClass = `w-full p-2 rounded text-sm ${
    isBambiMode ? 'bg-pink-50 border border-pink-100 text-pink-800' : 'bg-white/5 border border-white/10 text-white'
  }`;

  const labelClass = `block text-xs font-medium mb-1 ${isBambiMode ? 'text-pink-700' : 'text-gray-400'}`;

  return (
    <div className={`rounded-lg p-4 space-y-3 ${
      isBambiMode ? 'bg-white border border-pink-300' : 'bg-protocol-surface border border-purple-700/30'
    }`}>
      <div>
        <label className={labelClass}>Name *</label>
        <input
          type="text"
          value={form.personName}
          onChange={e => update('personName', e.target.value)}
          placeholder="Person's name"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Relationship</label>
          <select value={form.relationship} onChange={e => update('relationship', e.target.value)} className={inputClass}>
            {RELATIONSHIP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Relationship To</label>
          <select value={form.relationshipTo} onChange={e => update('relationshipTo', e.target.value)} className={inputClass}>
            {RELATIONSHIP_TO_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Awareness Status</label>
        <select value={form.awarenessStatus} onChange={e => update('awarenessStatus', e.target.value)} className={inputClass}>
          {AWARENESS_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {form.awarenessStatus !== 'unaware' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Told Date</label>
              <input type="date" value={form.toldDate} onChange={e => update('toldDate', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Told By</label>
              <select value={form.toldBy} onChange={e => update('toldBy', e.target.value)} className={inputClass}>
                <option value="">-</option>
                {TOLD_BY_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Initial Reaction</label>
            <input
              type="text"
              value={form.initialReaction}
              onChange={e => update('initialReaction', e.target.value)}
              placeholder="How did they react?"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Current Stance</label>
            <input
              type="text"
              value={form.currentStance}
              onChange={e => update('currentStance', e.target.value)}
              placeholder="How do they feel now?"
              className={inputClass}
            />
          </div>

          <label className={`flex items-center gap-2 text-sm ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
            <input
              type="checkbox"
              checked={form.providesActiveSupport}
              onChange={e => update('providesActiveSupport', e.target.checked)}
            />
            Provides active support
          </label>
        </>
      )}

      <div>
        <label className={labelClass}>Notes</label>
        <textarea
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(form)}
          disabled={!form.personName.trim()}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded font-medium ${
            form.personName.trim()
              ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
              : isBambiMode ? 'bg-pink-200 text-pink-400' : 'bg-white/10 text-gray-500'
          }`}
        >
          <Save className="w-4 h-4" />
          Save
        </button>
        <button
          onClick={onCancel}
          className={`px-4 py-2 rounded font-medium ${
            isBambiMode ? 'bg-gray-100 text-gray-600' : 'bg-white/10 text-gray-400'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

function mapRow(row: Record<string, unknown>): DisclosurePerson {
  return {
    id: row.id as string,
    personName: row.person_name as string,
    relationship: (row.relationship as string) || 'friend',
    relationshipTo: (row.relationship_to as string) || 'both',
    awarenessStatus: (row.awareness_status as string) || 'unaware',
    toldDate: row.told_date as string | null,
    toldBy: row.told_by as string | null,
    initialReaction: row.initial_reaction as string | null,
    currentStance: row.current_stance as string | null,
    providesActiveSupport: (row.provides_active_support as boolean) || false,
    notes: row.notes as string | null,
  };
}
