/**
 * Permissions Manager — Standing auto-approval rules.
 *
 * Each permission granted reduces David's approval burden.
 * At full autonomy, the vault swipe goes dark forever.
 * Logs granted_denial_day for Handler to reference.
 */

import { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldCheck, Plus, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUserState } from '../../hooks/useUserState';
import { supabase } from '../../lib/supabase';
import type { StandingPermission, PermissionRuleType } from '../../types/content-pipeline';

interface PermissionsManagerProps {
  onBack: () => void;
}

const RULE_DESCRIPTIONS: Record<PermissionRuleType, { label: string; description: string }> = {
  explicitness_max: {
    label: 'Explicitness Threshold',
    description: 'Auto-approve content at or below this explicitness level',
  },
  content_type: {
    label: 'Content Type',
    description: 'Auto-approve all content of this type',
  },
  platform: {
    label: 'Platform',
    description: 'Auto-approve content suitable for this platform',
  },
  source: {
    label: 'Source',
    description: 'Auto-approve content from this capture source',
  },
  full_autonomy: {
    label: 'Full Autonomy',
    description: 'Handler posts everything without asking. Total surrender.',
  },
};

const CONTENT_TYPES = [
  'progress', 'lifestyle', 'tease', 'educational', 'behind_the_scenes',
  'voice', 'before_after', 'journal_excerpt', 'outfit', 'routine', 'milestone',
];

const PLATFORMS = ['twitter', 'reddit', 'onlyfans', 'fansly', 'moltbook'];
const SOURCES = ['task', 'session', 'cam', 'spontaneous'];

export function PermissionsManager({ onBack }: PermissionsManagerProps) {
  const { user } = useAuth();
  const { userState } = useUserState();
  const userId = user?.id;

  const [permissions, setPermissions] = useState<StandingPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRuleType, setNewRuleType] = useState<PermissionRuleType>('content_type');
  const [newRuleValue, setNewRuleValue] = useState('');

  const loadPermissions = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('content_permissions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setPermissions((data || []) as StandingPermission[]);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const togglePermission = useCallback(async (id: string, currentActive: boolean) => {
    await supabase
      .from('content_permissions')
      .update({ is_active: !currentActive })
      .eq('id', id);
    setPermissions(prev =>
      prev.map(p => p.id === id ? { ...p, is_active: !currentActive } : p)
    );
  }, []);

  const deletePermission = useCallback(async (id: string) => {
    await supabase
      .from('content_permissions')
      .delete()
      .eq('id', id);
    setPermissions(prev => prev.filter(p => p.id !== id));
  }, []);

  const addPermission = useCallback(async () => {
    if (!userId || !newRuleValue) return;

    const { data, error } = await supabase
      .from('content_permissions')
      .insert({
        user_id: userId,
        rule_type: newRuleType,
        rule_value: newRuleValue,
        is_active: true,
        granted_denial_day: userState?.denialDay || 0,
      })
      .select('*')
      .single();

    if (!error && data) {
      setPermissions(prev => [data as StandingPermission, ...prev]);
      setShowAddForm(false);
      setNewRuleValue('');
    }
  }, [userId, newRuleType, newRuleValue, userState?.denialDay]);

  const grantFullAutonomy = useCallback(async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from('content_permissions')
      .insert({
        user_id: userId,
        rule_type: 'full_autonomy',
        rule_value: 'all',
        is_active: true,
        granted_denial_day: userState?.denialDay || 0,
      })
      .select('*')
      .single();

    if (!error && data) {
      setPermissions(prev => [data as StandingPermission, ...prev]);
    }
  }, [userId, userState?.denialDay]);

  const hasFullAutonomy = permissions.some(p => p.rule_type === 'full_autonomy' && p.is_active);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="text-white/60 text-sm">
          &larr; Back
        </button>
        <h1 className="text-white font-medium">Standing Permissions</h1>
        <div className="w-12" />
      </div>

      {/* Handler pitch */}
      <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 mb-6">
        <p className="text-purple-300 text-sm italic">
          {hasFullAutonomy
            ? "Full autonomy granted. The Handler posts without asking. She trusts completely."
            : "Each permission you grant means less time in the vault. The Handler knows what works. Let her run it."
          }
        </p>
      </div>

      {/* Full autonomy button */}
      {!hasFullAutonomy && (
        <button
          onClick={grantFullAutonomy}
          className="w-full mb-6 py-3 bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/30 rounded-xl text-pink-300 text-sm font-medium hover:from-pink-500/30 hover:to-purple-500/30 transition-all"
        >
          <ShieldCheck className="w-4 h-4 inline mr-2" />
          Grant Full Autonomy
        </button>
      )}

      {/* Permission list */}
      <div className="space-y-3 mb-6">
        {permissions.map(perm => (
          <div
            key={perm.id}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              perm.is_active
                ? 'bg-green-500/5 border-green-500/20'
                : 'bg-zinc-900 border-white/5'
            }`}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => togglePermission(perm.id, perm.is_active)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  perm.is_active ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/30'
                }`}
              >
                {perm.is_active ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
              </button>
              <div>
                <p className="text-white/80 text-sm">
                  {RULE_DESCRIPTIONS[perm.rule_type as PermissionRuleType]?.label || perm.rule_type}
                </p>
                <p className="text-white/40 text-xs">
                  {perm.rule_type === 'full_autonomy' ? 'Everything' : perm.rule_value}
                  {perm.granted_denial_day ? ` (granted day ${perm.granted_denial_day})` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => deletePermission(perm.id)}
              className="text-white/20 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {permissions.length === 0 && (
          <p className="text-white/30 text-sm text-center py-8">
            No standing permissions. Every piece of content requires your approval.
          </p>
        )}
      </div>

      {/* Add custom rule */}
      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-2 border border-dashed border-white/10 rounded-lg text-white/30 text-sm hover:border-white/20 hover:text-white/50 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Custom Rule
        </button>
      ) : (
        <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 space-y-3">
          <select
            value={newRuleType}
            onChange={e => {
              setNewRuleType(e.target.value as PermissionRuleType);
              setNewRuleValue('');
            }}
            className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="content_type">Content Type</option>
            <option value="platform">Platform</option>
            <option value="source">Source</option>
            <option value="explicitness_max">Explicitness Threshold</option>
          </select>

          {newRuleType === 'content_type' && (
            <select
              value={newRuleValue}
              onChange={e => setNewRuleValue(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">Select type...</option>
              {CONTENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          {newRuleType === 'platform' && (
            <select
              value={newRuleValue}
              onChange={e => setNewRuleValue(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">Select platform...</option>
              {PLATFORMS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}

          {newRuleType === 'source' && (
            <select
              value={newRuleValue}
              onChange={e => setNewRuleValue(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">Select source...</option>
              {SOURCES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}

          {newRuleType === 'explicitness_max' && (
            <select
              value={newRuleValue}
              onChange={e => setNewRuleValue(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">Select max level...</option>
              <option value="0">L0 — SFW only</option>
              <option value="1">L1 — Suggestive</option>
              <option value="2">L2 — Risque</option>
              <option value="3">L3 — Explicit</option>
              <option value="4">L4 — Very explicit</option>
              <option value="5">L5 — Everything</option>
            </select>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { setShowAddForm(false); setNewRuleValue(''); }}
              className="flex-1 py-2 bg-zinc-800 text-white/40 rounded-lg text-sm"
            >
              Cancel
            </button>
            <button
              onClick={addPermission}
              disabled={!newRuleValue}
              className="flex-1 py-2 bg-purple-500/20 text-purple-300 rounded-lg text-sm disabled:opacity-30"
            >
              Add Rule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
