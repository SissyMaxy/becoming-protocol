// FoundationLayer.tsx
// Layer 1: Basic identity, relationship context, starting point

import { useState, useEffect } from 'react';
import { User, Heart, Calendar, MapPin } from 'lucide-react';
import { useProfile } from '../../../hooks/useProfile';
import { LayerNav } from '../IntakeFlow';

interface FoundationLayerProps {
  onComplete: () => void;
  onBack: () => void;
}

export function FoundationLayer({ onComplete, onBack }: FoundationLayerProps) {
  const { profile, updateFoundation } = useProfile();
  const foundation = profile?.foundation;

  // Local state for form
  const [feminineName, setFeminineName] = useState(foundation?.feminineName || '');
  const [birthYear, setBirthYear] = useState(foundation?.birthYear?.toString() || '');
  const [location, setLocation] = useState(foundation?.location || '');
  const [relationshipStatus, setRelationshipStatus] = useState(foundation?.relationshipStatus || '');
  const [partnerName, setPartnerName] = useState(foundation?.partnerName || '');
  const [partnerAwareness, setPartnerAwareness] = useState(foundation?.partnerAwareness || '');
  const [livingArrangement, setLivingArrangement] = useState(foundation?.livingArrangement || '');
  const [privacyLevel, setPrivacyLevel] = useState(foundation?.privacyLevel || '');
  const [primaryGoal, setPrimaryGoal] = useState(foundation?.primaryGoal || '');
  const [discoverySource, setDiscoverySource] = useState(foundation?.discoverySource || '');

  // Sync with loaded data
  useEffect(() => {
    if (foundation) {
      setFeminineName(foundation.feminineName || '');
      setBirthYear(foundation.birthYear?.toString() || '');
      setLocation(foundation.location || '');
      setRelationshipStatus(foundation.relationshipStatus || '');
      setPartnerName(foundation.partnerName || '');
      setPartnerAwareness(foundation.partnerAwareness || '');
      setLivingArrangement(foundation.livingArrangement || '');
      setPrivacyLevel(foundation.privacyLevel || '');
      setPrimaryGoal(foundation.primaryGoal || '');
      setDiscoverySource(foundation.discoverySource || '');
    }
  }, [foundation]);

  const handleSave = async () => {
    await updateFoundation({
      feminineName: feminineName || undefined,
      birthYear: birthYear ? parseInt(birthYear) : undefined,
      location: location || undefined,
      relationshipStatus: relationshipStatus || undefined,
      partnerName: partnerName || undefined,
      partnerAwareness: partnerAwareness || undefined,
      livingArrangement: livingArrangement || undefined,
      privacyLevel: privacyLevel || undefined,
      primaryGoal: primaryGoal || undefined,
      discoverySource: discoverySource || undefined,
    });
    onComplete();
  };

  const isValid = feminineName.trim().length > 0;

  return (
    <div className="px-4 max-w-md mx-auto">
      {/* Section: Identity */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-pink-400" />
          <h3 className="text-sm font-medium text-protocol-text">Your Feminine Identity</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Your feminine name <span className="text-pink-400">*</span>
            </label>
            <input
              type="text"
              value={feminineName}
              onChange={(e) => setFeminineName(e.target.value)}
              placeholder="What should I call you?"
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-pink-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-protocol-text-muted mb-1">
                Birth year
              </label>
              <input
                type="number"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder="1990"
                min="1940"
                max="2010"
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs text-protocol-text-muted mb-1">
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City/Region"
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section: Relationship */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-pink-400" />
          <h3 className="text-sm font-medium text-protocol-text">Relationship Context</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-2">
              Relationship status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['Single', 'Dating', 'Married', 'Other'].map((status) => (
                <button
                  key={status}
                  onClick={() => setRelationshipStatus(status.toLowerCase())}
                  className={`py-2 px-3 rounded-lg text-sm transition-all ${
                    relationshipStatus === status.toLowerCase()
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-pink-500/50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {relationshipStatus && relationshipStatus !== 'single' && (
            <>
              <div>
                <label className="block text-xs text-protocol-text-muted mb-1">
                  Partner's name
                </label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Their name"
                  className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-xs text-protocol-text-muted mb-2">
                  Partner's awareness of your feminine side
                </label>
                <div className="space-y-2">
                  {[
                    { value: 'unaware', label: 'Completely unaware' },
                    { value: 'suspects', label: 'May suspect something' },
                    { value: 'knows_some', label: 'Knows some things' },
                    { value: 'fully_aware', label: 'Fully aware' },
                    { value: 'participates', label: 'Actively participates' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setPartnerAwareness(option.value)}
                      className={`w-full py-2 px-3 rounded-lg text-sm text-left transition-all ${
                        partnerAwareness === option.value
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-pink-500/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Section: Living Situation */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-pink-400" />
          <h3 className="text-sm font-medium text-protocol-text">Living Situation</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-2">
              Living arrangement
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'alone', label: 'Live alone' },
                { value: 'partner', label: 'With partner' },
                { value: 'roommates', label: 'Roommates' },
                { value: 'family', label: 'With family' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setLivingArrangement(option.value)}
                  className={`py-2 px-3 rounded-lg text-sm transition-all ${
                    livingArrangement === option.value
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-pink-500/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-2">
              Privacy level available
            </label>
            <div className="space-y-2">
              {[
                { value: 'high', label: 'High - lots of private time' },
                { value: 'medium', label: 'Medium - some private time' },
                { value: 'low', label: 'Low - rarely alone' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPrivacyLevel(option.value)}
                  className={`w-full py-2 px-3 rounded-lg text-sm text-left transition-all ${
                    privacyLevel === option.value
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-pink-500/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Section: Goals */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-pink-400" />
          <h3 className="text-sm font-medium text-protocol-text">Your Goals</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              What brought you here? What do you hope to achieve?
            </label>
            <textarea
              value={primaryGoal}
              onChange={(e) => setPrimaryGoal(e.target.value)}
              placeholder="Tell me about your goals..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-pink-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              How did you discover feminization/sissification?
            </label>
            <textarea
              value={discoverySource}
              onChange={(e) => setDiscoverySource(e.target.value)}
              placeholder="Where did it start?"
              rows={2}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-pink-500 resize-none"
            />
          </div>
        </div>
      </div>

      <LayerNav
        onNext={handleSave}
        onBack={onBack}
        nextLabel="Save & Continue"
        nextDisabled={!isValid}
        showBack={false}
      />
    </div>
  );
}
