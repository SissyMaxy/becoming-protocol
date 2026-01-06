// Profile View
// Display and view user profile information

import { useState, useEffect } from 'react';
import {
  User,
  Heart,
  Target,
  Calendar,
  Users,
  Shield,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { profileStorage } from '../../lib/storage';
import type { UserProfile } from '../Onboarding/types';
import { TimeRatchetsDisplay } from '../ratchets/TimeRatchets';

export function ProfileView() {
  const { isBambiMode } = useBambiMode();
  const [profile, setProfile] = useState<Partial<UserProfile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    anchors: true,
    journey: false,
    partner: false,
    dysphoria: false,
    euphoria: false,
    fears: false,
    goals: false,
    preferences: false,
  });

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await profileStorage.getProfile();
        setProfile(data);
      } catch (error) {
        console.error('Failed to load profile:', error);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-protocol-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
          No profile found. Complete onboarding to set up your profile.
        </p>
      </div>
    );
  }

  const sections = [
    {
      id: 'basic',
      title: 'Basic Info',
      icon: User,
      color: '#3b82f6',
      content: (
        <div className="space-y-3">
          <ProfileField label="Preferred Name" value={profile.preferredName} />
          <ProfileField label="Pronouns" value={profile.pronouns} />
          <ProfileField label="Age Range" value={profile.ageRange} />
        </div>
      ),
    },
    {
      id: 'anchors',
      title: 'Time Anchors',
      icon: Clock,
      color: '#f472b6',
      content: (
        <TimeRatchetsDisplay showEmpty />
      ),
    },
    {
      id: 'journey',
      title: 'Journey',
      icon: Target,
      color: '#22c55e',
      content: (
        <div className="space-y-3">
          <ProfileField label="Stage" value={formatJourneyStage(profile.journeyStage)} />
          <ProfileField label="Months on Journey" value={profile.monthsOnJourney?.toString()} />
          <ProfileField label="Living Situation" value={formatLivingSituation(profile.livingSituation)} />
          <ProfileField label="Out Level" value={formatOutLevel(profile.outLevel)} />
        </div>
      ),
    },
    {
      id: 'partner',
      title: 'Partner',
      icon: Users,
      color: '#ec4899',
      content: profile.hasPartner ? (
        <div className="space-y-3">
          <ProfileField label="Partner Name" value={profile.partnerName} />
          <ProfileField label="Support Level" value={formatPartnerSupport(profile.partnerSupportive)} />
          {profile.partnerNotes && (
            <ProfileField label="Notes" value={profile.partnerNotes} />
          )}
        </div>
      ) : (
        <p className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
          No partner information
        </p>
      ),
    },
    {
      id: 'dysphoria',
      title: 'Dysphoria Triggers',
      icon: AlertTriangle,
      color: '#ef4444',
      content: (
        <div className="space-y-3">
          {profile.dysphoriaTriggers && profile.dysphoriaTriggers.length > 0 ? (
            <>
              {profile.dysphoriaTriggers.map((trigger, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className={isBambiMode ? 'text-pink-700' : 'text-protocol-text'}>
                    {trigger.area}
                  </span>
                  <IntensityDots intensity={trigger.intensity} color="#ef4444" />
                </div>
              ))}
              {profile.dysphoriaWorstTimes && (
                <ProfileField label="Worst Times" value={profile.dysphoriaWorstTimes} />
              )}
              {profile.dysphoriaCoping && (
                <ProfileField label="Coping Strategies" value={profile.dysphoriaCoping} />
              )}
            </>
          ) : (
            <p className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
              No dysphoria triggers recorded
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'euphoria',
      title: 'Euphoria Sources',
      icon: Sparkles,
      color: '#a855f7',
      content: (
        <div className="space-y-3">
          {profile.euphoriaTriggers && profile.euphoriaTriggers.length > 0 ? (
            <>
              {profile.euphoriaTriggers.map((trigger, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className={isBambiMode ? 'text-pink-700' : 'text-protocol-text'}>
                    {trigger.activity}
                  </span>
                  <IntensityDots intensity={trigger.intensity} color="#a855f7" />
                </div>
              ))}
              {profile.euphoriaBestMoments && (
                <ProfileField label="Best Moments" value={profile.euphoriaBestMoments} />
              )}
              {profile.euphoriaSeeks && (
                <ProfileField label="What You Seek" value={profile.euphoriaSeeks} />
              )}
            </>
          ) : (
            <p className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
              No euphoria sources recorded
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'fears',
      title: 'Fears & Resistance',
      icon: Shield,
      color: '#f59e0b',
      content: (
        <div className="space-y-3">
          {profile.fears && profile.fears.length > 0 ? (
            <>
              {profile.fears.map((fear, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className={isBambiMode ? 'text-pink-700' : 'text-protocol-text'}>
                    {fear.fear}
                  </span>
                  <IntensityDots intensity={fear.intensity} color="#f59e0b" />
                </div>
              ))}
              {profile.biggestFear && (
                <ProfileField label="Biggest Fear" value={profile.biggestFear} />
              )}
              {profile.resistancePatterns && (
                <ProfileField label="Resistance Patterns" value={profile.resistancePatterns} />
              )}
            </>
          ) : (
            <p className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
              No fears recorded
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'goals',
      title: 'Goals & Vision',
      icon: Heart,
      color: '#06b6d4',
      content: (
        <div className="space-y-3">
          {profile.shortTermGoals && (
            <ProfileField label="Short-term Goals" value={profile.shortTermGoals} />
          )}
          {profile.longTermVision && (
            <ProfileField label="Long-term Vision" value={profile.longTermVision} />
          )}
          {profile.nonNegotiables && (
            <ProfileField label="Non-negotiables" value={profile.nonNegotiables} />
          )}
          {!profile.shortTermGoals && !profile.longTermVision && !profile.nonNegotiables && (
            <p className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
              No goals recorded
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'preferences',
      title: 'Preferences',
      icon: Calendar,
      color: '#8b5cf6',
      content: (
        <div className="space-y-3">
          <ProfileField label="Intensity" value={formatIntensity(profile.preferredIntensity)} />
          <ProfileField label="Voice Focus" value={formatVoiceFocus(profile.voiceFocusLevel)} />
          <ProfileField label="Social Comfort" value={formatSocialComfort(profile.socialComfort)} />
          <div className="flex gap-2 flex-wrap mt-2">
            {profile.morningAvailable && (
              <span className="px-2 py-1 text-xs rounded-full bg-protocol-surface-light text-protocol-text">
                Morning
              </span>
            )}
            {profile.eveningAvailable && (
              <span className="px-2 py-1 text-xs rounded-full bg-protocol-surface-light text-protocol-text">
                Evening
              </span>
            )}
            {profile.workFromHome && (
              <span className="px-2 py-1 text-xs rounded-full bg-protocol-surface-light text-protocol-text">
                WFH
              </span>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const Icon = section.icon;
        const isExpanded = expandedSections[section.id];

        return (
          <div
            key={section.id}
            className={`rounded-xl border overflow-hidden ${
              isBambiMode
                ? 'bg-pink-50 border-pink-200'
                : 'bg-protocol-surface border-protocol-border'
            }`}
          >
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full p-4 flex items-center gap-3 text-left"
            >
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${section.color}20` }}
              >
                <Icon className="w-4 h-4" style={{ color: section.color }} />
              </div>
              <span
                className={`flex-1 font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                {section.title}
              </span>
              {isExpanded ? (
                <ChevronUp className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
              ) : (
                <ChevronDown className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
              )}
            </button>

            {isExpanded && (
              <div className={`px-4 pb-4 border-t ${isBambiMode ? 'border-pink-200' : 'border-protocol-border'}`}>
                <div className="pt-3">
                  {section.content}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Helper components
function ProfileField({ label, value }: { label: string; value?: string }) {
  const { isBambiMode } = useBambiMode();

  if (!value) return null;

  return (
    <div>
      <p className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
        {label}
      </p>
      <p className={`text-sm ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
        {value}
      </p>
    </div>
  );
}

function IntensityDots({ intensity, color }: { intensity: number; color: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((level) => (
        <div
          key={level}
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: level <= intensity ? color : `${color}30`,
          }}
        />
      ))}
    </div>
  );
}

// Formatters
function formatJourneyStage(stage?: string): string {
  const map: Record<string, string> = {
    exploring: 'Exploring',
    decided: 'Decided',
    started: 'Started Transition',
    established: 'Established',
  };
  return stage ? map[stage] || stage : '';
}

function formatLivingSituation(situation?: string): string {
  const map: Record<string, string> = {
    alone: 'Living Alone',
    with_partner: 'With Partner',
    with_family: 'With Family',
    with_roommates: 'With Roommates',
    other: 'Other',
  };
  return situation ? map[situation] || situation : '';
}

function formatOutLevel(level?: string): string {
  const map: Record<string, string> = {
    not_out: 'Not Out',
    few_people: 'Out to Few People',
    mostly_out: 'Mostly Out',
    fully_out: 'Fully Out',
  };
  return level ? map[level] || level : '';
}

function formatPartnerSupport(support?: string): string {
  const map: Record<string, string> = {
    very_supportive: 'Very Supportive',
    supportive: 'Supportive',
    neutral: 'Neutral',
    unsupportive: 'Unsupportive',
    doesnt_know: "Doesn't Know",
  };
  return support ? map[support] || support : '';
}

function formatIntensity(intensity?: string): string {
  const map: Record<string, string> = {
    gentle: 'Gentle',
    normal: 'Normal',
    challenging: 'Challenging',
  };
  return intensity ? map[intensity] || intensity : '';
}

function formatVoiceFocus(level?: string): string {
  const map: Record<string, string> = {
    not_now: 'Not Now',
    gentle: 'Gentle',
    moderate: 'Moderate',
    intensive: 'Intensive',
  };
  return level ? map[level] || level : '';
}

function formatSocialComfort(comfort?: string): string {
  const map: Record<string, string> = {
    very_anxious: 'Very Anxious',
    nervous: 'Nervous',
    comfortable: 'Comfortable',
    confident: 'Confident',
  };
  return comfort ? map[comfort] || comfort : '';
}
