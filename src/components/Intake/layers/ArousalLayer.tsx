// ArousalLayer.tsx
// Layer 3: Arousal triggers, fantasies, what excites them

import { useState, useEffect } from 'react';
import { Flame, Heart, Zap, Lock } from 'lucide-react';
import { useProfile } from '../../../hooks/useProfile';
import { LayerNav } from '../IntakeFlow';

interface ArousalLayerProps {
  onComplete: () => void;
  onBack: () => void;
}

const TRIGGER_OPTIONS = [
  'Feminization/sissification',
  'Chastity/denial',
  'Hypnosis/mind control',
  'Humiliation',
  'Submission/servitude',
  'Crossdressing',
  'Forced feminization',
  'Cock worship',
  'Cuckolding',
  'Public exposure',
  'Bondage',
  'Degradation',
  'Praise/affirmation',
  'Transformation',
];

const CONTENT_TYPES = [
  'Sissy hypno videos',
  'Caption images',
  'Erotic fiction',
  'Audio files',
  'JOI/CEI content',
  'Training guides',
  'Roleplay scenarios',
  'Transformation stories',
];

export function ArousalLayer({ onComplete, onBack }: ArousalLayerProps) {
  const { profile, updateArousal } = useProfile();
  const arousal = profile?.arousal;

  // Local state
  const [primaryTriggers, setPrimaryTriggers] = useState<string[]>(arousal?.primaryTriggers || []);
  const [triggerIntensity, setTriggerIntensity] = useState<Record<string, number>>(arousal?.triggerIntensity || {});
  const [fantasies, setFantasies] = useState(arousal?.fantasies || '');
  const [edgingExperience, setEdgingExperience] = useState(arousal?.edgingExperience || '');
  const [denialDays, setDenialDays] = useState(arousal?.denialDays?.toString() || '');
  const [chastityExperience, setChastityExperience] = useState(arousal?.chastityExperience || '');
  const [hypnoResponse, setHypnoResponse] = useState(arousal?.hypnoResponse || '');
  const [preferredContent, setPreferredContent] = useState<string[]>(arousal?.preferredContent || []);
  const [peakArousalTime, setPeakArousalTime] = useState(arousal?.peakArousalTime || '');
  const [arousalToActionLink, setArousalToActionLink] = useState(arousal?.arousalToActionLink || '');

  // Sync with loaded data
  useEffect(() => {
    if (arousal) {
      setPrimaryTriggers(arousal.primaryTriggers || []);
      setTriggerIntensity(arousal.triggerIntensity || {});
      setFantasies(arousal.fantasies || '');
      setEdgingExperience(arousal.edgingExperience || '');
      setDenialDays(arousal.denialDays?.toString() || '');
      setChastityExperience(arousal.chastityExperience || '');
      setHypnoResponse(arousal.hypnoResponse || '');
      setPreferredContent(arousal.preferredContent || []);
      setPeakArousalTime(arousal.peakArousalTime || '');
      setArousalToActionLink(arousal.arousalToActionLink || '');
    }
  }, [arousal]);

  const toggleTrigger = (trigger: string) => {
    if (primaryTriggers.includes(trigger)) {
      setPrimaryTriggers(primaryTriggers.filter(t => t !== trigger));
      const newIntensity = { ...triggerIntensity };
      delete newIntensity[trigger];
      setTriggerIntensity(newIntensity);
    } else {
      setPrimaryTriggers([...primaryTriggers, trigger]);
      setTriggerIntensity({ ...triggerIntensity, [trigger]: 7 });
    }
  };

  const updateIntensity = (trigger: string, intensity: number) => {
    setTriggerIntensity({ ...triggerIntensity, [trigger]: intensity });
  };

  const toggleContent = (content: string) => {
    if (preferredContent.includes(content)) {
      setPreferredContent(preferredContent.filter(c => c !== content));
    } else {
      setPreferredContent([...preferredContent, content]);
    }
  };

  const handleSave = async () => {
    await updateArousal({
      primaryTriggers: primaryTriggers.length > 0 ? primaryTriggers : undefined,
      triggerIntensity: Object.keys(triggerIntensity).length > 0 ? triggerIntensity : undefined,
      fantasies: fantasies || undefined,
      edgingExperience: edgingExperience || undefined,
      denialDays: denialDays ? parseInt(denialDays) : undefined,
      chastityExperience: chastityExperience || undefined,
      hypnoResponse: hypnoResponse || undefined,
      preferredContent: preferredContent.length > 0 ? preferredContent : undefined,
      peakArousalTime: peakArousalTime || undefined,
      arousalToActionLink: arousalToActionLink || undefined,
    });
    onComplete();
  };

  return (
    <div className="px-4 max-w-md mx-auto">
      {/* Section: Triggers */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-medium text-protocol-text">What Turns You On</h3>
        </div>

        <p className="text-xs text-protocol-text-muted mb-3">
          Select everything that arouses you. Be honest - this helps me push the right buttons.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {TRIGGER_OPTIONS.map((trigger) => (
            <button
              key={trigger}
              onClick={() => toggleTrigger(trigger)}
              className={`py-2 px-3 rounded-lg text-xs transition-all ${
                primaryTriggers.includes(trigger)
                  ? 'bg-red-500 text-white'
                  : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-red-500/50'
              }`}
            >
              {trigger}
            </button>
          ))}
        </div>

        {/* Intensity sliders for selected triggers */}
        {primaryTriggers.length > 0 && (
          <div className="space-y-3 bg-protocol-surface rounded-lg p-3 border border-protocol-border">
            <p className="text-xs text-protocol-text-muted">Rate intensity (1-10):</p>
            {primaryTriggers.slice(0, 5).map((trigger) => (
              <div key={trigger} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-xs text-protocol-text">{trigger}</span>
                  <span className="text-xs font-medium text-red-400">
                    {triggerIntensity[trigger] || 5}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={triggerIntensity[trigger] || 5}
                  onChange={(e) => updateIntensity(trigger, parseInt(e.target.value))}
                  className="w-full accent-red-500"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section: Fantasies */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-medium text-protocol-text">Your Fantasies</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Describe your most powerful fantasies
            </label>
            <textarea
              value={fantasies}
              onChange={(e) => setFantasies(e.target.value)}
              placeholder="What scenarios play in your mind when you're most aroused?"
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              What content do you consume?
            </label>
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPES.map((content) => (
                <button
                  key={content}
                  onClick={() => toggleContent(content)}
                  className={`py-2 px-3 rounded-lg text-xs transition-all ${
                    preferredContent.includes(content)
                      ? 'bg-red-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-red-500/50'
                  }`}
                >
                  {content}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section: Denial & Chastity */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-medium text-protocol-text">Denial & Chastity</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Your experience with edging
            </label>
            <div className="space-y-2">
              {[
                { value: 'none', label: 'Never tried' },
                { value: 'occasional', label: 'Occasional edging' },
                { value: 'regular', label: 'Regular practice' },
                { value: 'advanced', label: 'Advanced - can edge for hours' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setEdgingExperience(option.value)}
                  className={`w-full py-2 px-3 rounded-lg text-sm text-left transition-all ${
                    edgingExperience === option.value
                      ? 'bg-red-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-red-500/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Longest denial period (days without orgasm)
            </label>
            <input
              type="number"
              value={denialDays}
              onChange={(e) => setDenialDays(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Chastity device experience
            </label>
            <div className="space-y-2">
              {[
                { value: 'none', label: 'Never worn one' },
                { value: 'curious', label: 'Curious but haven\'t tried' },
                { value: 'occasional', label: 'Wear occasionally' },
                { value: 'regular', label: 'Regular wear' },
                { value: 'longterm', label: 'Long-term chastity' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setChastityExperience(option.value)}
                  className={`w-full py-2 px-3 rounded-lg text-sm text-left transition-all ${
                    chastityExperience === option.value
                      ? 'bg-red-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-red-500/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section: Hypno & Conditioning */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-medium text-protocol-text">Hypno & Conditioning</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              How do you respond to hypno content?
            </label>
            <div className="space-y-2">
              {[
                { value: 'none', label: 'Never tried' },
                { value: 'curious', label: 'Curious but unsure' },
                { value: 'light', label: 'Light effects - relaxation' },
                { value: 'medium', label: 'Moderate - noticeable trance' },
                { value: 'deep', label: 'Deep - easily go under' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setHypnoResponse(option.value)}
                  className={`w-full py-2 px-3 rounded-lg text-sm text-left transition-all ${
                    hypnoResponse === option.value
                      ? 'bg-red-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-red-500/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              When are you most aroused?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['Morning', 'Afternoon', 'Evening', 'Night', 'Late night', 'Varies'].map((time) => (
                <button
                  key={time}
                  onClick={() => setPeakArousalTime(time.toLowerCase())}
                  className={`py-2 px-3 rounded-lg text-xs transition-all ${
                    peakArousalTime === time.toLowerCase()
                      ? 'bg-red-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-red-500/50'
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              What happens when you're highly aroused? Do you make decisions you later regret?
            </label>
            <textarea
              value={arousalToActionLink}
              onChange={(e) => setArousalToActionLink(e.target.value)}
              placeholder="Describe how arousal affects your decision-making..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-red-500 resize-none"
            />
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
