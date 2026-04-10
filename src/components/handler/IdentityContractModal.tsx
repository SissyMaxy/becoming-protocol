import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface IdentityContractModalProps {
  contractTitle: string;
  contractText: string;
  durationDays: number;
  conditions: string[];
  consequencesOnBreak: string;
  requiredPhrase?: string;
  onSigned: (contractId: string) => void;
  onCancel?: () => void;
}

export function IdentityContractModal({
  contractTitle,
  contractText,
  durationDays,
  conditions,
  consequencesOnBreak,
  requiredPhrase = "I, Maxy, commit to this transformation",
  onSigned,
  onCancel,
}: IdentityContractModalProps) {
  const { user } = useAuth();
  const [signature, setSignature] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSign = async () => {
    if (!user?.id) return;
    if (signature.trim() !== requiredPhrase) return;
    if (!acknowledged) return;

    setSubmitting(true);
    try {
      const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();
      const { data, error } = await supabase
        .from('identity_contracts')
        .insert({
          user_id: user.id,
          contract_title: contractTitle,
          contract_text: contractText,
          commitment_duration_days: durationDays,
          expires_at: expiresAt,
          signature_text: signature.trim(),
          signature_typed_phrase: requiredPhrase,
          conditions,
          consequences_on_break: consequencesOnBreak,
          status: 'active',
        })
        .select('id')
        .single();

      if (error) throw error;
      onSigned(data.id);
    } catch (err) {
      console.error('Contract sign failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto text-purple-400 mb-2" />
          <h2 className="text-2xl font-bold text-white">{contractTitle}</h2>
          <p className="text-sm text-gray-400 mt-2">
            {durationDays} day commitment. Once signed, this is binding.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-4">
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{contractText}</p>

          <div className="border-t border-gray-700 pt-4">
            <p className="text-sm font-semibold text-purple-300 mb-2">CONDITIONS:</p>
            <ul className="text-sm text-gray-400 space-y-1">
              {conditions.map((c, i) => (
                <li key={i}>• {c}</li>
              ))}
            </ul>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <p className="text-sm font-semibold text-red-300 mb-2">IF BROKEN:</p>
            <p className="text-sm text-red-200">{consequencesOnBreak}</p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm text-gray-300">
              I have read this contract. I understand the conditions. I understand the consequences.
              I am signing as the architect-version of myself, knowing the in-the-moment-version
              will have to live with this commitment.
            </span>
          </label>

          <div>
            <p className="text-xs text-gray-500 mb-1">Type the signature phrase exactly:</p>
            <p className="text-sm text-purple-300 italic mb-2">"{requiredPhrase}"</p>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white"
            />
          </div>

          <button
            onClick={handleSign}
            disabled={signature.trim() !== requiredPhrase || !acknowledged || submitting}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Sign and commit'}
          </button>

          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-400"
            >
              Don't sign — back out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
