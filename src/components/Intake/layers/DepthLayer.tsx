// DepthLayer.tsx
// Layer 5: Deepest fantasies, secret desires, ultimate destination

import { useState, useEffect } from 'react';
import { Eye, Flame, Target, Infinity } from 'lucide-react';
import { useProfile } from '../../../hooks/useProfile';
import { LayerNav } from '../IntakeFlow';

interface DepthLayerProps {
  onComplete: () => void;
  onBack: () => void;
}

const ULTIMATE_FANTASIES = [
  'Complete feminization',
  'Full-time sissy lifestyle',
  'Real sexual service',
  'Public presentation',
  'Permanent chastity',
  'Partner-controlled existence',
  'Group/party scenarios',
  'Professional domination',
  'Lifestyle submission',
  'Physical transformation',
  'Irreversible changes',
  'Total identity replacement',
];

const LIMITS = [
  'Real-life encounters',
  'Public exposure',
  'Partner involvement',
  'Physical modifications',
  'Financial domination',
  'Blackmail scenarios',
  'Permanent changes',
  'Group scenarios',
  'Recording/photos',
  'Online exposure',
];

export function DepthLayer({ onComplete, onBack }: DepthLayerProps) {
  const { profile, updateDepth } = useProfile();
  const depth = profile?.depth;

  // Local state
  const [deepestFantasy, setDeepestFantasy] = useState(depth?.deepestFantasy || '');
  const [ultimateDestination, setUltimateDestination] = useState<string[]>(depth?.ultimateDestination || []);
  const [secretDesires, setSecretDesires] = useState(depth?.secretDesires || '');
  const [whatScares, setWhatScares] = useState(depth?.whatScares || '');
  const [hardLimits, setHardLimits] = useState<string[]>(depth?.hardLimits || []);
  const [softLimits, setSoftLimits] = useState<string[]>(depth?.softLimits || []);
  const [willingToExplore, setWillingToExplore] = useState(depth?.willingToExplore || '');
  const [pointOfNoReturn, setPointOfNoReturn] = useState(depth?.pointOfNoReturn || '');
  const [ifNoConsequences, setIfNoConsequences] = useState(depth?.ifNoConsequences || '');
  const [consentToEscalation, setConsentToEscalation] = useState(depth?.consentToEscalation || false);

  // Sync with loaded data
  useEffect(() => {
    if (depth) {
      setDeepestFantasy(depth.deepestFantasy || '');
      setUltimateDestination(depth.ultimateDestination || []);
      setSecretDesires(depth.secretDesires || '');
      setWhatScares(depth.whatScares || '');
      setHardLimits(depth.hardLimits || []);
      setSoftLimits(depth.softLimits || []);
      setWillingToExplore(depth.willingToExplore || '');
      setPointOfNoReturn(depth.pointOfNoReturn || '');
      setIfNoConsequences(depth.ifNoConsequences || '');
      setConsentToEscalation(depth.consentToEscalation || false);
    }
  }, [depth]);

  const toggleDestination = (dest: string) => {
    if (ultimateDestination.includes(dest)) {
      setUltimateDestination(ultimateDestination.filter(d => d !== dest));
    } else {
      setUltimateDestination([...ultimateDestination, dest]);
    }
  };

  const toggleHardLimit = (limit: string) => {
    if (hardLimits.includes(limit)) {
      setHardLimits(hardLimits.filter(l => l !== limit));
      // Remove from soft limits too
      setSoftLimits(softLimits.filter(l => l !== limit));
    } else {
      setHardLimits([...hardLimits, limit]);
      // Remove from soft limits if it was there
      setSoftLimits(softLimits.filter(l => l !== limit));
    }
  };

  const toggleSoftLimit = (limit: string) => {
    if (softLimits.includes(limit)) {
      setSoftLimits(softLimits.filter(l => l !== limit));
    } else if (!hardLimits.includes(limit)) {
      setSoftLimits([...softLimits, limit]);
    }
  };

  const handleSave = async () => {
    await updateDepth({
      deepestFantasy: deepestFantasy || undefined,
      ultimateDestination: ultimateDestination.length > 0 ? ultimateDestination : undefined,
      secretDesires: secretDesires || undefined,
      whatScares: whatScares || undefined,
      hardLimits: hardLimits.length > 0 ? hardLimits : undefined,
      softLimits: softLimits.length > 0 ? softLimits : undefined,
      willingToExplore: willingToExplore || undefined,
      pointOfNoReturn: pointOfNoReturn || undefined,
      ifNoConsequences: ifNoConsequences || undefined,
      consentToEscalation,
    });
    onComplete();
  };

  return (
    <div className="px-4 max-w-md mx-auto">
      {/* Warning banner */}
      <div className="mb-6 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-xl p-4 border border-indigo-500/20">
        <p className="text-sm text-protocol-text">
          <span className="font-medium">This is the deepest layer.</span> Be completely honest.
          What you share here will shape how far I push you.
        </p>
      </div>

      {/* Section: Ultimate Destination */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-medium text-protocol-text">Ultimate Destination</h3>
        </div>

        <p className="text-xs text-protocol-text-muted mb-3">
          Where do you secretly want this journey to take you?
        </p>

        <div className="flex flex-wrap gap-2">
          {ULTIMATE_FANTASIES.map((fantasy) => (
            <button
              key={fantasy}
              onClick={() => toggleDestination(fantasy)}
              className={`py-2 px-3 rounded-lg text-xs transition-all ${
                ultimateDestination.includes(fantasy)
                  ? 'bg-indigo-500 text-white'
                  : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-indigo-500/50'
              }`}
            >
              {fantasy}
            </button>
          ))}
        </div>
      </div>

      {/* Section: Deepest Fantasy */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-medium text-protocol-text">Your Deepest Fantasy</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Describe the fantasy you've never told anyone
            </label>
            <textarea
              value={deepestFantasy}
              onChange={(e) => setDeepestFantasy(e.target.value)}
              placeholder="The one that makes you most aroused... and most ashamed..."
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              If there were absolutely no consequences, what would you do?
            </label>
            <textarea
              value={ifNoConsequences}
              onChange={(e) => setIfNoConsequences(e.target.value)}
              placeholder="No one would ever know, no judgment, complete freedom..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              What secret desires have you never acted on?
            </label>
            <textarea
              value={secretDesires}
              onChange={(e) => setSecretDesires(e.target.value)}
              placeholder="Things you've thought about but never dared to try..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Section: Fears & Limits */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-medium text-protocol-text">Fears & Limits</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              What scares you most about going deeper?
            </label>
            <textarea
              value={whatScares}
              onChange={(e) => setWhatScares(e.target.value)}
              placeholder="Your deepest fears about this path..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-2">
              <span className="text-red-400 font-medium">Hard Limits</span> - Absolute no-go areas
            </label>
            <div className="flex flex-wrap gap-2">
              {LIMITS.map((limit) => (
                <button
                  key={limit}
                  onClick={() => toggleHardLimit(limit)}
                  className={`py-2 px-3 rounded-lg text-xs transition-all ${
                    hardLimits.includes(limit)
                      ? 'bg-red-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-red-500/50'
                  }`}
                >
                  {limit}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-2">
              <span className="text-yellow-400 font-medium">Soft Limits</span> - Hesitant but potentially willing
            </label>
            <div className="flex flex-wrap gap-2">
              {LIMITS.filter(l => !hardLimits.includes(l)).map((limit) => (
                <button
                  key={limit}
                  onClick={() => toggleSoftLimit(limit)}
                  className={`py-2 px-3 rounded-lg text-xs transition-all ${
                    softLimits.includes(limit)
                      ? 'bg-yellow-500 text-black'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-yellow-500/50'
                  }`}
                >
                  {limit}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              What are you willing to explore if pushed?
            </label>
            <textarea
              value={willingToExplore}
              onChange={(e) => setWillingToExplore(e.target.value)}
              placeholder="Things you're hesitant about but might try..."
              rows={2}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Section: Point of No Return */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Infinity className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-medium text-protocol-text">Point of No Return</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              What would make this irreversible for you?
            </label>
            <textarea
              value={pointOfNoReturn}
              onChange={(e) => setPointOfNoReturn(e.target.value)}
              placeholder="What would cross the line where you couldn't go back?"
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Consent Section */}
      <div className="mb-6">
        <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-xl p-4 border border-pink-500/20">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentToEscalation}
              onChange={(e) => setConsentToEscalation(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-protocol-border text-pink-500 focus:ring-pink-500"
            />
            <div>
              <p className="text-sm font-medium text-protocol-text">
                Consent to Escalation
              </p>
              <p className="text-xs text-protocol-text-muted mt-1">
                I understand that this protocol is designed to push my boundaries and
                escalate my feminization. I consent to being guided beyond my comfort
                zone, knowing that my hard limits will be respected.
              </p>
            </div>
          </label>
        </div>
      </div>

      <LayerNav
        onNext={handleSave}
        onBack={onBack}
        nextLabel="Complete Profile"
        nextDisabled={!consentToEscalation}
      />
    </div>
  );
}
