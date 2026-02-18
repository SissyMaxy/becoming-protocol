/**
 * Measurement Form
 *
 * Dynamic form that renders the correct measurement input fields
 * based on the selected measurement type (8 types total).
 */

import { useState, useCallback } from 'react';
import {
  ChevronLeft,
  Save,
  Loader2,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  type MeasurementType,
  type MeasurementDue,
  type MeasurementData,
  type BedroomWeeklyData,
  type PronounWeeklyData,
  type FinancialMonthlyData,
  type TouchBiweeklyData,
  type ShopperMonthlyData,
  type SocialMapData,
  type OccasionDebriefData,
  saveMeasurement,
} from '../../lib/gina/measurement-engine';

interface MeasurementFormProps {
  onBack: () => void;
  onSaved: () => void;
  dueMeasurements: MeasurementDue[];
}

const MEASUREMENT_TYPE_CONFIG: Record<MeasurementType, { label: string; description: string }> = {
  bedroom_weekly: { label: 'Bedroom Weekly', description: 'Weekly bedroom dynamics assessment' },
  pronoun_weekly: { label: 'Pronoun Weekly', description: 'Weekly pronoun/name usage tracking' },
  financial_monthly: { label: 'Financial Monthly', description: 'Monthly feminization spending review' },
  touch_biweekly: { label: 'Touch Biweekly', description: 'Biweekly body touch comfort assessment' },
  shopper_monthly: { label: 'Shopper Monthly', description: 'Monthly joint shopping participation' },
  social_map: { label: 'Social Map', description: 'Social awareness and support mapping' },
  occasion_debrief: { label: 'Occasion Debrief', description: 'Post-event feminine presentation review' },
  master_composite: { label: 'Master Composite', description: 'Auto-generated composite score' },
};

export function MeasurementForm({ onBack, onSaved, dueMeasurements }: MeasurementFormProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [selectedType, setSelectedType] = useState<MeasurementType | null>(
    dueMeasurements.length > 0 ? dueMeasurements[0].type : null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async (data: MeasurementData) => {
    if (!user || !selectedType) return;

    setIsSaving(true);
    setError(null);

    try {
      const now = new Date();
      const periodEnd = now;
      const periodStart = new Date(now);

      // Set period start based on measurement interval
      if (selectedType.includes('weekly')) periodStart.setDate(now.getDate() - 7);
      else if (selectedType.includes('biweekly')) periodStart.setDate(now.getDate() - 14);
      else if (selectedType.includes('monthly')) periodStart.setDate(now.getDate() - 30);

      const id = await saveMeasurement(user.id, selectedType, data, periodStart, periodEnd);
      if (id) {
        setSaved(true);
      } else {
        setError('Failed to save measurement');
      }
    } catch (err) {
      console.error('Failed to save measurement:', err);
      setError('Failed to save measurement');
    } finally {
      setIsSaving(false);
    }
  }, [user, selectedType]);

  if (saved) {
    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
        <div className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b ${
          isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'
        }`}>
          <button onClick={onSaved} className="p-1">
            <ChevronLeft className={`w-6 h-6 ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`} />
          </button>
          <h1 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
            Measurement Saved
          </h1>
        </div>
        <div className="p-4">
          <div className={`rounded-lg p-6 text-center ${
            isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
          }`}>
            <CheckCircle className={`w-12 h-12 mx-auto mb-3 ${isBambiMode ? 'text-green-500' : 'text-green-400'}`} />
            <p className={`font-medium ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
              {MEASUREMENT_TYPE_CONFIG[selectedType!]?.label} saved
            </p>
          </div>
          <button
            onClick={onSaved}
            className={`w-full mt-4 py-3 rounded-lg font-medium ${
              isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
            }`}
          >
            Done
          </button>
        </div>
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
        <h1 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
          {selectedType ? MEASUREMENT_TYPE_CONFIG[selectedType].label : 'Select Measurement'}
        </h1>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className={`p-3 rounded-lg text-sm ${isBambiMode ? 'bg-red-100 text-red-700' : 'bg-red-900/30 text-red-300'}`}>
            {error}
          </div>
        )}

        {/* Type Selection */}
        {!selectedType && (
          <div className="space-y-2">
            {dueMeasurements.length > 0 && (
              <p className={`text-sm mb-3 ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
                <Clock className="w-4 h-4 inline mr-1" />
                {dueMeasurements.length} overdue
              </p>
            )}
            {Object.entries(MEASUREMENT_TYPE_CONFIG)
              .filter(([type]) => type !== 'master_composite')
              .map(([type, config]) => {
                const isDue = dueMeasurements.some(d => d.type === type);
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type as MeasurementType)}
                    className={`w-full p-3 rounded-lg text-left transition-colors ${
                      isBambiMode
                        ? `bg-white border ${isDue ? 'border-orange-300 bg-orange-50' : 'border-pink-200'} hover:bg-pink-50`
                        : `bg-white/5 border ${isDue ? 'border-orange-700/30 bg-orange-900/10' : 'border-white/10'} hover:bg-white/10`
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
                          {config.label}
                        </div>
                        <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                          {config.description}
                        </div>
                      </div>
                      {isDue && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          isBambiMode ? 'bg-orange-100 text-orange-600' : 'bg-orange-900/30 text-orange-400'
                        }`}>
                          Due
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        )}

        {/* Dynamic Form */}
        {selectedType === 'bedroom_weekly' && (
          <BedroomWeeklyForm onSave={handleSave} isSaving={isSaving} isBambiMode={isBambiMode} />
        )}
        {selectedType === 'pronoun_weekly' && (
          <PronounWeeklyForm onSave={handleSave} isSaving={isSaving} isBambiMode={isBambiMode} />
        )}
        {selectedType === 'financial_monthly' && (
          <FinancialMonthlyForm onSave={handleSave} isSaving={isSaving} isBambiMode={isBambiMode} />
        )}
        {selectedType === 'touch_biweekly' && (
          <TouchBiweeklyForm onSave={handleSave} isSaving={isSaving} isBambiMode={isBambiMode} />
        )}
        {selectedType === 'shopper_monthly' && (
          <ShopperMonthlyForm onSave={handleSave} isSaving={isSaving} isBambiMode={isBambiMode} />
        )}
        {selectedType === 'social_map' && (
          <SocialMapForm onSave={handleSave} isSaving={isSaving} isBambiMode={isBambiMode} />
        )}
        {selectedType === 'occasion_debrief' && (
          <OccasionDebriefForm onSave={handleSave} isSaving={isSaving} isBambiMode={isBambiMode} />
        )}
      </div>
    </div>
  );
}

// ============================================
// SHARED FORM HELPERS
// ============================================

interface SubFormProps {
  onSave: (data: MeasurementData) => void;
  isSaving: boolean;
  isBambiMode: boolean;
}

function NumberInput({ label, value, onChange, min, max, isBambiMode }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; isBambiMode: boolean;
}) {
  return (
    <div>
      <label className={`block text-sm font-medium mb-1 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min}
        max={max}
        className={`w-full p-2 rounded-lg text-sm ${
          isBambiMode
            ? 'bg-white border border-pink-200 text-pink-800'
            : 'bg-white/5 border border-white/10 text-white'
        }`}
      />
    </div>
  );
}

function ScoreSlider({ label, value, onChange, isBambiMode }: {
  label: string; value: number; onChange: (v: number) => void; isBambiMode: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
          {label}
        </label>
        <span className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`}>{value}/5</span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
              n <= value
                ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
                : isBambiMode ? 'bg-pink-100 text-pink-400' : 'bg-white/10 text-gray-500'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function SubmitButton({ onSubmit, disabled, isSaving, isBambiMode }: {
  onSubmit: () => void; disabled: boolean; isSaving: boolean; isBambiMode: boolean;
}) {
  return (
    <button
      onClick={onSubmit}
      disabled={disabled || isSaving}
      className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
        !disabled && !isSaving
          ? isBambiMode ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-purple-600 text-white hover:bg-purple-700'
          : isBambiMode ? 'bg-pink-200 text-pink-400 cursor-not-allowed' : 'bg-white/10 text-gray-500 cursor-not-allowed'
      }`}
    >
      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {isSaving ? 'Saving...' : 'Save Measurement'}
    </button>
  );
}

// ============================================
// BEDROOM WEEKLY
// ============================================

function BedroomWeeklyForm({ onSave, isSaving, isBambiMode }: SubFormProps) {
  const [sessions, setSessions] = useState(0);
  const [agencyScore, setAgencyScore] = useState(3);

  return (
    <div className="space-y-4">
      <NumberInput label="Sessions this week" value={sessions} onChange={setSessions} min={0} isBambiMode={isBambiMode} />
      <ScoreSlider label="Average agency score" value={agencyScore} onChange={setAgencyScore} isBambiMode={isBambiMode} />
      <SubmitButton
        onSubmit={() => onSave({
          sessionsThisWeek: sessions,
          sessions: [],
          averageAgencyScore: agencyScore,
        } as BedroomWeeklyData)}
        disabled={false}
        isSaving={isSaving}
        isBambiMode={isBambiMode}
      />
    </div>
  );
}

// ============================================
// PRONOUN WEEKLY
// ============================================

function PronounWeeklyForm({ onSave, isSaving, isBambiMode }: SubFormProps) {
  const [total, setTotal] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [selfCorrected, setSelfCorrected] = useState(0);

  const uncorrected = Math.max(0, total - correct - selfCorrected);
  const correctPercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const selfCorrectPercent = total > 0 ? Math.round((selfCorrected / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <NumberInput label="Total references" value={total} onChange={setTotal} min={0} isBambiMode={isBambiMode} />
      <NumberInput label="Correct" value={correct} onChange={setCorrect} min={0} max={total} isBambiMode={isBambiMode} />
      <NumberInput label="Self-corrected" value={selfCorrected} onChange={setSelfCorrected} min={0} max={total - correct} isBambiMode={isBambiMode} />
      <div className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
        Uncorrected: {uncorrected} | Correct: {correctPercent}% | Self-correct: {selfCorrectPercent}%
      </div>
      <SubmitButton
        onSubmit={() => onSave({
          totalReferences: total,
          correct,
          selfCorrected,
          uncorrected,
          correctPercent,
          selfCorrectPercent,
        } as PronounWeeklyData)}
        disabled={total === 0}
        isSaving={isSaving}
        isBambiMode={isBambiMode}
      />
    </div>
  );
}

// ============================================
// FINANCIAL MONTHLY
// ============================================

function FinancialMonthlyForm({ onSave, isSaving, isBambiMode }: SubFormProps) {
  const [totalSpending, setTotalSpending] = useState(0);
  const [invisible, setInvisible] = useState(0);
  const [visible, setVisible] = useState(0);
  const [discussed, setDiscussed] = useState(0);
  const [responseScore, setResponseScore] = useState(3);

  return (
    <div className="space-y-4">
      <NumberInput label="Total feminization spending ($)" value={totalSpending} onChange={setTotalSpending} min={0} isBambiMode={isBambiMode} />
      <NumberInput label="Invisible amount ($)" value={invisible} onChange={setInvisible} min={0} isBambiMode={isBambiMode} />
      <NumberInput label="Visible amount ($)" value={visible} onChange={setVisible} min={0} isBambiMode={isBambiMode} />
      <NumberInput label="Discussed amount ($)" value={discussed} onChange={setDiscussed} min={0} isBambiMode={isBambiMode} />
      <ScoreSlider label="Average response score" value={responseScore} onChange={setResponseScore} isBambiMode={isBambiMode} />
      <SubmitButton
        onSubmit={() => onSave({
          totalFeminizationSpending: totalSpending,
          invisibleAmount: invisible,
          visibleAmount: visible,
          discussedAmount: discussed,
          ginaResponsePerVisiblePurchase: [],
          averageResponseScore: responseScore,
        } as FinancialMonthlyData)}
        disabled={false}
        isSaving={isSaving}
        isBambiMode={isBambiMode}
      />
    </div>
  );
}

// ============================================
// TOUCH BIWEEKLY
// ============================================

const BODY_ZONES = ['Head', 'Face', 'Neck', 'Shoulders', 'Arms', 'Hands', 'Torso', 'Legs', 'Feet'];

function TouchBiweeklyForm({ onSave, isSaving, isBambiMode }: SubFormProps) {
  const [zones, setZones] = useState<{ zone: string; casualScore: number; intimateScore: number }[]>(
    BODY_ZONES.map(z => ({ zone: z, casualScore: 3, intimateScore: 3 }))
  );

  const updateZone = (idx: number, field: 'casualScore' | 'intimateScore', value: number) => {
    const updated = [...zones];
    updated[idx] = { ...updated[idx], [field]: value };
    setZones(updated);
  };

  const avgCasual = zones.reduce((s, z) => s + z.casualScore, 0) / zones.length;
  const avgIntimate = zones.reduce((s, z) => s + z.intimateScore, 0) / zones.length;

  return (
    <div className="space-y-4">
      {zones.map((zone, idx) => (
        <div key={zone.zone} className={`rounded-lg p-3 ${isBambiMode ? 'bg-white border border-pink-100' : 'bg-white/5 border border-white/5'}`}>
          <div className={`text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
            {zone.zone}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ScoreSlider label="Casual" value={zone.casualScore} onChange={v => updateZone(idx, 'casualScore', v)} isBambiMode={isBambiMode} />
            <ScoreSlider label="Intimate" value={zone.intimateScore} onChange={v => updateZone(idx, 'intimateScore', v)} isBambiMode={isBambiMode} />
          </div>
        </div>
      ))}
      <div className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
        Avg casual: {avgCasual.toFixed(1)} | Avg intimate: {avgIntimate.toFixed(1)}
      </div>
      <SubmitButton
        onSubmit={() => onSave({
          bodyZones: zones,
          averageCasualScore: Math.round(avgCasual * 10) / 10,
          averageIntimateScore: Math.round(avgIntimate * 10) / 10,
        } as TouchBiweeklyData)}
        disabled={false}
        isSaving={isSaving}
        isBambiMode={isBambiMode}
      />
    </div>
  );
}

// ============================================
// SHOPPER MONTHLY
// ============================================

function ShopperMonthlyForm({ onSave, isSaving, isBambiMode }: SubFormProps) {
  const [participation, setParticipation] = useState(1);
  const [trips, setTrips] = useState(0);
  const [picked, setPicked] = useState(0);
  const [vetoed, setVetoed] = useState(0);
  const [spontaneous, setSpontaneous] = useState(0);
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
            Participation Level
          </label>
          <span className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`}>{participation}/7</span>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map(n => (
            <button
              key={n}
              onClick={() => setParticipation(n)}
              className={`flex-1 py-2 rounded text-xs font-medium transition-colors ${
                n <= participation
                  ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
                  : isBambiMode ? 'bg-pink-100 text-pink-400' : 'bg-white/10 text-gray-500'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <NumberInput label="Joint shopping trips" value={trips} onChange={setTrips} min={0} isBambiMode={isBambiMode} />
      <NumberInput label="Items Gina picked" value={picked} onChange={setPicked} min={0} isBambiMode={isBambiMode} />
      <NumberInput label="Items Gina vetoed" value={vetoed} onChange={setVetoed} min={0} isBambiMode={isBambiMode} />
      <NumberInput label="Spontaneous suggestions" value={spontaneous} onChange={setSpontaneous} min={0} isBambiMode={isBambiMode} />
      <div>
        <label className={`block text-sm font-medium mb-1 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
          Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className={`w-full p-2 rounded-lg text-sm resize-none ${
            isBambiMode
              ? 'bg-white border border-pink-200 text-pink-800 placeholder-pink-300'
              : 'bg-white/5 border border-white/10 text-white placeholder-gray-500'
          }`}
        />
      </div>
      <SubmitButton
        onSubmit={() => onSave({
          participationLevel: participation,
          jointShoppingTrips: trips,
          itemsGinaPicked: picked,
          itemsGinaVetoed: vetoed,
          spontaneousSuggestions: spontaneous,
          notes,
        } as ShopperMonthlyData)}
        disabled={false}
        isSaving={isSaving}
        isBambiMode={isBambiMode}
      />
    </div>
  );
}

// ============================================
// SOCIAL MAP
// ============================================

function SocialMapForm({ onSave, isSaving, isBambiMode }: SubFormProps) {
  const [people, setPeople] = useState<{ name: string; relationship: string; awarenessStatus: string; activeSupport: boolean }[]>([]);
  const [newName, setNewName] = useState('');
  const [newRelationship, setNewRelationship] = useState('friend');
  const [newAwareness, setNewAwareness] = useState('unaware');
  const [newSupport, setNewSupport] = useState(false);

  const addPerson = () => {
    if (!newName.trim()) return;
    setPeople([...people, {
      name: newName.trim(),
      relationship: newRelationship,
      awarenessStatus: newAwareness,
      activeSupport: newSupport,
    }]);
    setNewName('');
    setNewSupport(false);
  };

  const removePerson = (idx: number) => {
    setPeople(people.filter((_, i) => i !== idx));
  };

  const totalAware = people.filter(p => p.awarenessStatus !== 'unaware').length;
  const totalSupportive = people.filter(p => p.activeSupport).length;
  const totalHostile = people.filter(p => p.awarenessStatus === 'hostile').length;

  return (
    <div className="space-y-4">
      {/* Add person */}
      <div className={`rounded-lg p-3 space-y-2 ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-white/5 border border-white/10'}`}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Person's name"
          className={`w-full p-2 rounded text-sm ${
            isBambiMode ? 'bg-pink-50 border border-pink-100 text-pink-800' : 'bg-white/5 border border-white/10 text-white'
          }`}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={newRelationship}
            onChange={e => setNewRelationship(e.target.value)}
            className={`p-2 rounded text-sm ${
              isBambiMode ? 'bg-pink-50 border border-pink-100 text-pink-800' : 'bg-white/5 border border-white/10 text-white'
            }`}
          >
            <option value="friend">Friend</option>
            <option value="family">Family</option>
            <option value="colleague">Colleague</option>
            <option value="community">Community</option>
          </select>
          <select
            value={newAwareness}
            onChange={e => setNewAwareness(e.target.value)}
            className={`p-2 rounded text-sm ${
              isBambiMode ? 'bg-pink-50 border border-pink-100 text-pink-800' : 'bg-white/5 border border-white/10 text-white'
            }`}
          >
            <option value="unaware">Unaware</option>
            <option value="told">Told</option>
            <option value="supportive">Supportive</option>
            <option value="neutral">Neutral</option>
            <option value="hostile">Hostile</option>
          </select>
        </div>
        <div className="flex items-center justify-between">
          <label className={`flex items-center gap-2 text-sm ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
            <input
              type="checkbox"
              checked={newSupport}
              onChange={e => setNewSupport(e.target.checked)}
            />
            Active support
          </label>
          <button
            onClick={addPerson}
            disabled={!newName.trim()}
            className={`px-3 py-1 rounded text-sm font-medium ${
              newName.trim()
                ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
                : isBambiMode ? 'bg-pink-200 text-pink-400' : 'bg-white/10 text-gray-500'
            }`}
          >
            Add
          </button>
        </div>
      </div>

      {/* People list */}
      {people.map((person, idx) => (
        <div key={idx} className={`rounded p-2 flex items-center justify-between ${
          isBambiMode ? 'bg-pink-50' : 'bg-white/5'
        }`}>
          <div>
            <span className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
              {person.name}
            </span>
            <span className={`text-xs ml-2 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
              {person.relationship} / {person.awarenessStatus}
            </span>
          </div>
          <button
            onClick={() => removePerson(idx)}
            className={`text-xs ${isBambiMode ? 'text-red-400' : 'text-red-500'}`}
          >
            Remove
          </button>
        </div>
      ))}

      {people.length > 0 && (
        <div className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
          Aware: {totalAware} | Supportive: {totalSupportive} | Hostile: {totalHostile}
        </div>
      )}

      <SubmitButton
        onSubmit={() => onSave({
          people,
          totalAware,
          totalSupportive,
          totalHostile,
        } as SocialMapData)}
        disabled={people.length === 0}
        isSaving={isSaving}
        isBambiMode={isBambiMode}
      />
    </div>
  );
}

// ============================================
// OCCASION DEBRIEF
// ============================================

function OccasionDebriefForm({ onSave, isSaving, isBambiMode }: SubFormProps) {
  const [occasionType, setOccasionType] = useState('');
  const [occasionDate, setOccasionDate] = useState(new Date().toISOString().split('T')[0]);
  const [elements, setElements] = useState<string[]>([]);
  const [newElement, setNewElement] = useState('');
  const [overallScore, setOverallScore] = useState(3);
  const [nextPlan, setNextPlan] = useState('');

  const addElement = () => {
    if (!newElement.trim()) return;
    setElements([...elements, newElement.trim()]);
    setNewElement('');
  };

  return (
    <div className="space-y-4">
      <div>
        <label className={`block text-sm font-medium mb-1 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
          Occasion Type
        </label>
        <input
          type="text"
          value={occasionType}
          onChange={e => setOccasionType(e.target.value)}
          placeholder="e.g. dinner party, work event, holiday gathering"
          className={`w-full p-2 rounded-lg text-sm ${
            isBambiMode ? 'bg-white border border-pink-200 text-pink-800' : 'bg-white/5 border border-white/10 text-white'
          }`}
        />
      </div>
      <div>
        <label className={`block text-sm font-medium mb-1 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
          Date
        </label>
        <input
          type="date"
          value={occasionDate}
          onChange={e => setOccasionDate(e.target.value)}
          className={`w-full p-2 rounded-lg text-sm ${
            isBambiMode ? 'bg-white border border-pink-200 text-pink-800' : 'bg-white/5 border border-white/10 text-white'
          }`}
        />
      </div>

      {/* Feminine elements */}
      <div>
        <label className={`block text-sm font-medium mb-1 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
          Feminine Elements Present
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newElement}
            onChange={e => setNewElement(e.target.value)}
            placeholder="e.g. nail polish, perfume"
            onKeyDown={e => e.key === 'Enter' && addElement()}
            className={`flex-1 p-2 rounded text-sm ${
              isBambiMode ? 'bg-white border border-pink-200 text-pink-800' : 'bg-white/5 border border-white/10 text-white'
            }`}
          />
          <button
            onClick={addElement}
            className={`px-3 rounded text-sm ${
              isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
            }`}
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {elements.map((el, idx) => (
            <span
              key={idx}
              onClick={() => setElements(elements.filter((_, i) => i !== idx))}
              className={`px-2 py-0.5 rounded-full text-xs cursor-pointer ${
                isBambiMode ? 'bg-pink-100 text-pink-700' : 'bg-white/10 text-gray-300'
              }`}
            >
              {el} x
            </span>
          ))}
        </div>
      </div>

      <ScoreSlider label="Overall Score" value={overallScore} onChange={setOverallScore} isBambiMode={isBambiMode} />

      <div>
        <label className={`block text-sm font-medium mb-1 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
          Next Occasion Plan
        </label>
        <textarea
          value={nextPlan}
          onChange={e => setNextPlan(e.target.value)}
          rows={2}
          placeholder="What to try next time..."
          className={`w-full p-2 rounded-lg text-sm resize-none ${
            isBambiMode ? 'bg-white border border-pink-200 text-pink-800' : 'bg-white/5 border border-white/10 text-white'
          }`}
        />
      </div>

      <SubmitButton
        onSubmit={() => onSave({
          occasionType,
          occasionDate,
          feminineElementsPresent: elements,
          ginaResponsePerElement: elements.map(el => ({ element: el, responseScore: overallScore })),
          overallScore,
          nextOccasionPlan: nextPlan,
        } as OccasionDebriefData)}
        disabled={!occasionType.trim()}
        isSaving={isSaving}
        isBambiMode={isBambiMode}
      />
    </div>
  );
}
