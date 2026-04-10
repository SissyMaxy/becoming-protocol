import { useState, useEffect } from 'react';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { SealedEnvelopeForm } from './SealedEnvelopeForm';

interface Envelope {
  id: string;
  title: string;
  sealed_at: string;
  release_at: string;
  released: boolean;
  released_at: string | null;
  intent: string | null;
  sealed_content: string;
}

export function SealedEnvelopesPage() {
  const { user } = useAuth();
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [, setOpenedId] = useState<string | null>(null);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('sealed_envelopes')
        .select('*')
        .eq('user_id', user.id)
        .order('sealed_at', { ascending: false });
      setEnvelopes((data as Envelope[]) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const tryRelease = async (env: Envelope) => {
    if (!user?.id) return;
    const releaseTime = new Date(env.release_at).getTime();
    if (Date.now() < releaseTime) return;

    try {
      await supabase
        .from('sealed_envelopes')
        .update({ released: true, released_at: new Date().toISOString() })
        .eq('id', env.id)
        .eq('user_id', user.id);
      setOpenedId(env.id);
      load();
    } catch (err) {
      console.error('Release failed:', err);
    }
  };

  const sealed = envelopes.filter((e) => !e.released);
  const opened = envelopes.filter((e) => e.released);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="w-6 h-6 text-purple-400" />
          <div>
            <h2 className="text-xl font-bold text-white">Sealed Envelopes</h2>
            <p className="text-xs text-gray-500">
              Letters from your past self to your future self
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm"
          >
            + Seal new
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
          <SealedEnvelopeForm
            onCreated={() => {
              setShowForm(false);
              load();
            }}
          />
          <button
            onClick={() => setShowForm(false)}
            className="text-xs text-gray-500 mt-2"
          >
            cancel
          </button>
        </div>
      )}

      {loading && <Loader2 className="w-6 h-6 animate-spin text-purple-400" />}

      {sealed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            Sealed ({sealed.length})
          </h3>
          <div className="space-y-2">
            {sealed.map((env) => {
              const releaseDate = new Date(env.release_at);
              const daysUntil = Math.ceil(
                (releaseDate.getTime() - Date.now()) / 86400000
              );
              const ready = daysUntil <= 0;
              return (
                <div
                  key={env.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-purple-400" />
                      <span className="text-white font-medium">{env.title}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {ready ? 'Ready to open' : `Opens in ${daysUntil}d`}
                      {env.intent && ` · ${env.intent}`}
                    </p>
                  </div>
                  {ready && (
                    <button
                      onClick={() => tryRelease(env)}
                      className="text-xs px-2 py-1 rounded bg-purple-600 text-white"
                    >
                      Open
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {opened.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">
            Opened ({opened.length})
          </h3>
          <div className="space-y-2">
            {opened.map((env) => (
              <div
                key={env.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="text-white font-medium">{env.title}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Sealed {new Date(env.sealed_at).toLocaleDateString()}, opened{' '}
                  {env.released_at
                    ? new Date(env.released_at).toLocaleDateString()
                    : ''}
                </p>
                <p className="text-sm text-gray-300 whitespace-pre-wrap bg-black/30 rounded p-3">
                  {env.sealed_content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {envelopes.length === 0 && !loading && (
        <p className="text-sm text-gray-500 italic">No envelopes yet.</p>
      )}
    </div>
  );
}
