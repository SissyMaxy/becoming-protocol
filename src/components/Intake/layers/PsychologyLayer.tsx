// PsychologyLayer.tsx
// Layer 4: Vulnerabilities, resistance patterns, psychological profile

import { useState, useEffect } from 'react';
import { Brain, Shield, AlertTriangle, Heart } from 'lucide-react';
import { useProfile } from '../../../hooks/useProfile';
import { LayerNav } from '../IntakeFlow';

interface PsychologyLayerProps {
  onComplete: () => void;
  onBack: () => void;
}

const VULNERABILITY_OPTIONS = [
  'Loneliness',
  'Need for validation',
  'Low self-esteem',
  'Stress relief seeking',
  'Escapism',
  'Identity confusion',
  'Sexual frustration',
  'Need for control (or loss of it)',
  'Fear of missing out',
  'Addictive tendencies',
  'People pleasing',
  'Shame/guilt cycles',
];

const RESISTANCE_TRIGGERS = [
  'Post-orgasm clarity',
  'Shame after sessions',
  'Fear of discovery',
  'Real-world responsibilities',
  'Partner/family concerns',
  'Self-doubt about identity',
  'Social pressure',
  'Health concerns',
  'Time constraints',
  'Financial worries',
];

const SUBMISSION_TRIGGERS = [
  'Being told what to do',
  'Praise and validation',
  'Punishment threats',
  'Disappointment/disapproval',
  'Teasing and denial',
  'Humiliation',
  'Being called names',
  'Feeling owned/claimed',
  'Countdown pressure',
  'Competition/comparison',
];

export function PsychologyLayer({ onComplete, onBack }: PsychologyLayerProps) {
  const { profile, updatePsychology } = useProfile();
  const psychology = profile?.psychology;

  // Local state
  const [vulnerabilities, setVulnerabilities] = useState<string[]>(psychology?.vulnerabilities || []);
  const [resistanceTriggers, setResistanceTriggers] = useState<string[]>(
    Array.isArray(psychology?.resistanceTriggers) ? psychology.resistanceTriggers : []
  );
  const [whatMakesYouSubmit, setWhatMakesYouSubmit] = useState<string[]>(psychology?.whatMakesYouSubmit || []);
  const [shameResponse, setShameResponse] = useState(psychology?.shameResponse || '');
  const [postOrgasmFeelings, setPostOrgasmFeelings] = useState(psychology?.postOrgasmFeelings || '');
  const [fearOfExposure, setFearOfExposure] = useState(psychology?.fearOfExposure || 5);
  const [needForValidation, setNeedForValidation] = useState(psychology?.needForValidation || 5);
  const [obedienceLevel, setObedienceLevel] = useState(psychology?.obedienceLevel || 5);
  const [internalConflict, setInternalConflict] = useState(psychology?.internalConflict || '');
  const [whatBreaksResistance, setWhatBreaksResistance] = useState(psychology?.whatBreaksResistance || '');

  // Sync with loaded data
  useEffect(() => {
    if (psychology) {
      setVulnerabilities(psychology.vulnerabilities || []);
      setResistanceTriggers(Array.isArray(psychology.resistanceTriggers) ? psychology.resistanceTriggers : []);
      setWhatMakesYouSubmit(psychology.whatMakesYouSubmit || []);
      setShameResponse(psychology.shameResponse || '');
      setPostOrgasmFeelings(psychology.postOrgasmFeelings || '');
      setFearOfExposure(psychology.fearOfExposure || 5);
      setNeedForValidation(psychology.needForValidation || 5);
      setObedienceLevel(psychology.obedienceLevel || 5);
      setInternalConflict(psychology.internalConflict || '');
      setWhatBreaksResistance(psychology.whatBreaksResistance || '');
    }
  }, [psychology]);

  const toggleOption = (option: string, list: string[], setList: (value: string[]) => void) => {
    if (list.includes(option)) {
      setList(list.filter(o => o !== option));
    } else {
      setList([...list, option]);
    }
  };

  const handleSave = async () => {
    await updatePsychology({
      vulnerabilities: vulnerabilities.length > 0 ? vulnerabilities : undefined,
      resistanceTriggers: resistanceTriggers.length > 0 ? resistanceTriggers : undefined,
      whatMakesYouSubmit: whatMakesYouSubmit.length > 0 ? whatMakesYouSubmit : undefined,
      shameResponse: shameResponse || undefined,
      postOrgasmFeelings: postOrgasmFeelings || undefined,
      fearOfExposure,
      needForValidation,
      obedienceLevel,
      internalConflict: internalConflict || undefined,
      whatBreaksResistance: whatBreaksResistance || undefined,
    });
    onComplete();
  };

  return (
    <div className="px-4 max-w-md mx-auto">
      {/* Section: Vulnerabilities */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-protocol-text">Your Vulnerabilities</h3>
        </div>

        <p className="text-xs text-protocol-text-muted mb-3">
          What emotional needs drive your behavior? Understanding these helps me guide you more effectively.
        </p>

        <div className="flex flex-wrap gap-2">
          {VULNERABILITY_OPTIONS.map((vuln) => (
            <button
              key={vuln}
              onClick={() => toggleOption(vuln, vulnerabilities, setVulnerabilities)}
              className={`py-2 px-3 rounded-lg text-xs transition-all ${
                vulnerabilities.includes(vuln)
                  ? 'bg-blue-500 text-white'
                  : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-blue-500/50'
              }`}
            >
              {vuln}
            </button>
          ))}
        </div>
      </div>

      {/* Section: Resistance */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-protocol-text">What Triggers Resistance</h3>
        </div>

        <p className="text-xs text-protocol-text-muted mb-3">
          What makes you want to stop or pull back? Knowing your resistance patterns helps me work around them.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {RESISTANCE_TRIGGERS.map((trigger) => (
            <button
              key={trigger}
              onClick={() => toggleOption(trigger, resistanceTriggers, setResistanceTriggers)}
              className={`py-2 px-3 rounded-lg text-xs transition-all ${
                resistanceTriggers.includes(trigger)
                  ? 'bg-blue-500 text-white'
                  : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-blue-500/50'
              }`}
            >
              {trigger}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs text-protocol-text-muted mb-1">
            What breaks through your resistance?
          </label>
          <textarea
            value={whatBreaksResistance}
            onChange={(e) => setWhatBreaksResistance(e.target.value)}
            placeholder="What makes you give in even when you're trying to resist?"
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
      </div>

      {/* Section: Submission */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-protocol-text">What Makes You Submit</h3>
        </div>

        <p className="text-xs text-protocol-text-muted mb-3">
          What approaches make you most compliant and obedient?
        </p>

        <div className="flex flex-wrap gap-2">
          {SUBMISSION_TRIGGERS.map((trigger) => (
            <button
              key={trigger}
              onClick={() => toggleOption(trigger, whatMakesYouSubmit, setWhatMakesYouSubmit)}
              className={`py-2 px-3 rounded-lg text-xs transition-all ${
                whatMakesYouSubmit.includes(trigger)
                  ? 'bg-blue-500 text-white'
                  : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-blue-500/50'
              }`}
            >
              {trigger}
            </button>
          ))}
        </div>
      </div>

      {/* Section: Emotional Patterns */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-protocol-text">Emotional Patterns</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              How do you feel about shame in this context?
            </label>
            <div className="space-y-2">
              {[
                { value: 'avoid', label: 'I avoid it - it makes me want to stop' },
                { value: 'mixed', label: 'Mixed feelings - sometimes arousing, sometimes not' },
                { value: 'arousing', label: 'It\'s arousing - shame turns me on' },
                { value: 'fuel', label: 'It fuels me - I lean into it' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setShameResponse(option.value)}
                  className={`w-full py-2 px-3 rounded-lg text-sm text-left transition-all ${
                    shameResponse === option.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-blue-500/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              How do you feel right after orgasm? (Post-nut clarity)
            </label>
            <div className="space-y-2">
              {[
                { value: 'regret', label: 'Strong regret - want to delete everything' },
                { value: 'shame', label: 'Shame - but it fades' },
                { value: 'neutral', label: 'Neutral - just feel satisfied' },
                { value: 'content', label: 'Content - still want to continue' },
                { value: 'eager', label: 'Eager for more' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPostOrgasmFeelings(option.value)}
                  className={`w-full py-2 px-3 rounded-lg text-sm text-left transition-all ${
                    postOrgasmFeelings === option.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-blue-500/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Describe any internal conflict you experience
            </label>
            <textarea
              value={internalConflict}
              onChange={(e) => setInternalConflict(e.target.value)}
              placeholder="Do you have parts of yourself that fight against this? What does that look like?"
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Section: Scales */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-protocol-text">Psychological Profile</h3>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-protocol-text-muted">
                Fear of being exposed/discovered
              </label>
              <span className="text-sm font-medium text-blue-400">{fearOfExposure}/10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={fearOfExposure}
              onChange={(e) => setFearOfExposure(parseInt(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-protocol-text-muted mt-1">
              <span>Not worried</span>
              <span>Terrified</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-protocol-text-muted">
                Need for validation/approval
              </label>
              <span className="text-sm font-medium text-blue-400">{needForValidation}/10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={needForValidation}
              onChange={(e) => setNeedForValidation(parseInt(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-protocol-text-muted mt-1">
              <span>Self-sufficient</span>
              <span>Crave it deeply</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-protocol-text-muted">
                Natural obedience level
              </label>
              <span className="text-sm font-medium text-blue-400">{obedienceLevel}/10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={obedienceLevel}
              onChange={(e) => setObedienceLevel(parseInt(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-protocol-text-muted mt-1">
              <span>Defiant</span>
              <span>Naturally submissive</span>
            </div>
          </div>
        </div>
      </div>

      <LayerNav
        onNext={handleSave}
        onBack={onBack}
        nextLabel="Save & Continue"
      />
    </div>
  );
}
