import { useState, useEffect } from 'react';
import { Eye, Mail, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Witness {
  id: string;
  witness_name: string;
  witness_email: string;
  relationship: string | null;
  status: string;
  added_at: string;
  consent_confirmed: boolean;
}

export function WitnessManager() {
  const { user } = useAuth();
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRelationship, setNewRelationship] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWitnesses = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('designated_witnesses')
        .select('id, witness_name, witness_email, relationship, status, added_at, consent_confirmed')
        .eq('user_id', user.id)
        .neq('status', 'removed')
        .order('added_at', { ascending: false });
      setWitnesses(data || []);
    } catch (err) {
      console.error('Witness load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWitnesses();
  }, [user?.id]);

  const handleAdd = async () => {
    if (!user?.id) return;
    if (newName.trim().length < 2 || !newEmail.trim().includes('@')) {
      setError('Name and valid email required');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const consentToken = crypto.randomUUID();
      const { error: insertError } = await supabase.from('designated_witnesses').insert({
        user_id: user.id,
        witness_name: newName.trim(),
        witness_email: newEmail.trim(),
        relationship: newRelationship.trim() || null,
        consent_token: consentToken,
        status: 'pending',
      });
      if (insertError) throw insertError;

      // TODO: send consent email via edge function
      setNewName('');
      setNewEmail('');
      setNewRelationship('');
      setShowAddForm(false);
      await loadWitnesses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add witness');
    } finally {
      setSubmitting(false);
    }
  };

  const requestRemoval = async (witnessId: string) => {
    if (!user?.id) return;
    if (!confirm('Removing a witness requires a 7-day cooldown. Continue?')) return;

    try {
      const cooldownUntil = new Date(Date.now() + 7 * 86400000).toISOString();
      await supabase
        .from('designated_witnesses')
        .update({
          status: 'removal_pending',
          removal_requested_at: new Date().toISOString(),
          removal_cooldown_until: cooldownUntil,
        })
        .eq('id', witnessId)
        .eq('user_id', user.id);

      // Log a quit attempt as social pressure
      await supabase.from('quit_attempts').insert({
        user_id: user.id,
        attempt_type: 'feature_lockout_request',
        target_feature: 'witness_removal',
        reason_given: 'witness removal requested',
        cooldown_required_hours: 168,
      });

      await loadWitnesses();
    } catch (err) {
      console.error('Removal request failed:', err);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Eye className="w-6 h-6 text-purple-400" />
          <div>
            <h2 className="text-xl font-bold text-white">Witnesses</h2>
            <p className="text-xs text-gray-500">Real human eyes on your transformation</p>
          </div>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm"
          >
            + Add witness
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-sm text-gray-400">
            The witness will receive an email confirming their consent before any data is shared.
            Once added, removal requires a 7-day cooldown.
          </p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Witness name"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-white text-sm"
          />
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-white text-sm"
          />
          <input
            value={newRelationship}
            onChange={(e) => setNewRelationship(e.target.value)}
            placeholder="Relationship (therapist, friend, partner...)"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-white text-sm"
          />
          {error && (
            <p className="text-sm text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={submitting}
              className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 text-white text-sm font-medium"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Add witness'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setError(null); }}
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      ) : witnesses.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No witnesses yet. Add one to create real accountability.</p>
      ) : (
        <div className="space-y-2">
          {witnesses.map((w) => (
            <div key={w.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="text-white font-medium">{w.witness_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    w.status === 'active' ? 'bg-green-900/50 text-green-400' :
                    w.status === 'pending' ? 'bg-amber-900/50 text-amber-400' :
                    'bg-red-900/50 text-red-400'
                  }`}>
                    {w.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{w.witness_email}{w.relationship && ` \u00b7 ${w.relationship}`}</p>
              </div>
              {w.status !== 'removal_pending' && (
                <button
                  onClick={() => requestRemoval(w.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Request removal
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
