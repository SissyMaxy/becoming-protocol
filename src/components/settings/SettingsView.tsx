// Settings View
// Main settings page for the app

import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  User,
  Vibrate,
  Bell,
  Shield,
  Palette,
  Database,
  HelpCircle,
  ChevronRight,
  RefreshCw,
  ClipboardEdit,
  Clock,
  Brain,
  Upload,
  Zap,
  Moon,
  Gauge,
  Package,
  LogOut,
  Trash2,
  Loader2,
} from 'lucide-react';
import { profileStorageV2 } from '../../lib/profile-storage-v2';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import { useProtocol } from '../../context/ProtocolContext';
import { useDebugMode } from '../../context/DebugContext';
import { useOpacity } from '../../context/OpacityContext';
import { OpacitySelector } from './OpacitySelector';
import { useReminders } from '../../hooks/useReminders';
import { LovenseSettings } from './LovenseSettings';
import { EquipmentInventory } from './EquipmentInventory';
import { ProfileView } from './ProfileView';
import { TimeRatchetsSettings } from './TimeRatchetsSettings';
import { ReminderSettingsPanel } from '../reminders';
import { HandlerDashboard } from '../handler-dashboard';
import { TaskUploadSettings } from './TaskUploadSettings';
import { DataExportView } from './DataExportView';
import { AppearanceSettings } from './AppearanceSettings';
import { PrivacySettings } from './PrivacySettings';
import { MicroTaskSettings } from '../micro-tasks';
import { CorruptionDashboard } from '../admin/CorruptionDashboard';
import { SleepContentSettings } from '../sleep-content/SleepContentSettings';

const DIFFICULTY_LEVELS = [
  { id: 'gentle', label: 'Gentle', desc: 'Lighter load, longer timers' },
  { id: 'moderate', label: 'Moderate', desc: 'Balanced pace' },
  { id: 'intense', label: 'Intense', desc: 'Harder tasks, shorter windows' },
  { id: 'relentless', label: 'Relentless', desc: 'Maximum pressure' },
] as const;

function DifficultySection() {
  const { isBambiMode } = useBambiMode();
  const [level, setLevel] = useState<string>('moderate');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profileStorageV2.getDifficultyLevel().then(setLevel).catch(() => {});
  }, []);

  const handleChange = async (newLevel: string) => {
    setLevel(newLevel);
    setSaving(true);
    try {
      await profileStorageV2.setDifficultyLevel(newLevel);
    } catch {
      // Revert on failure
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className={`text-sm font-medium mb-3 ${
        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
      }`}>
        Difficulty
      </h2>
      <div className={`rounded-xl border p-4 ${
        isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-surface border-protocol-border'
      }`}>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`} />
          <span className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Protocol Difficulty {saving && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {DIFFICULTY_LEVELS.map(d => (
            <button
              key={d.id}
              onClick={() => handleChange(d.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                level === d.id
                  ? isBambiMode
                    ? 'border-pink-400 bg-pink-100'
                    : 'border-protocol-accent bg-protocol-accent/10'
                  : isBambiMode
                    ? 'border-pink-200 bg-white hover:border-pink-300'
                    : 'border-protocol-border bg-protocol-surface-light hover:border-protocol-accent/30'
              }`}
            >
              <p className={`text-sm font-medium ${
                level === d.id
                  ? isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  : isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}>{d.label}</p>
              <p className={`text-xs mt-0.5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted/70'
              }`}>{d.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DangerZoneSection() {
  const { isBambiMode } = useBambiMode();
  const { signOut } = useAuth();
  const [showConfirm, setShowConfirm] = useState<'logout' | 'reset' | null>(null);

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div>
      <h2 className={`text-sm font-medium mb-3 ${
        isBambiMode ? 'text-pink-500' : 'text-red-400/70'
      }`}>
        Danger Zone
      </h2>
      <div className={`rounded-xl border p-4 space-y-3 ${
        isBambiMode ? 'bg-red-50 border-red-200' : 'bg-red-950/10 border-red-900/30'
      }`}>
        {showConfirm === 'logout' ? (
          <div className="text-center py-2">
            <p className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-red-700' : 'text-red-400'}`}>
              Sign out of this device?
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600"
              >
                Sign Out
              </button>
              <button
                onClick={() => setShowConfirm(null)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  isBambiMode ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-gray-300'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowConfirm('logout')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                isBambiMode
                  ? 'hover:bg-red-100 text-red-600'
                  : 'hover:bg-red-900/20 text-red-400'
              }`}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
            <div className={`flex items-center gap-3 p-3 rounded-lg opacity-50 cursor-not-allowed ${
              isBambiMode ? 'text-red-400' : 'text-red-500/60'
            }`}>
              <Trash2 className="w-4 h-4" />
              <div>
                <span className="text-sm font-medium">Delete All Data</span>
                <p className="text-xs mt-0.5 opacity-60">Contact support to delete your account</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface SettingsViewProps {
  onBack: () => void;
  onEditIntake?: () => void;
}

type SettingsSection = 'main' | 'profile' | 'lovense' | 'equipment' | 'timeratchets' | 'reminders' | 'privacy' | 'appearance' | 'data' | 'handler' | 'taskupload' | 'microtasks' | 'corruption' | 'sleep-content' | 'opacity';

export function SettingsView({ onBack, onEditIntake }: SettingsViewProps) {
  const { isBambiMode } = useBambiMode();
  const { regenerateToday } = useProtocol();
  const { isDebugMode, registerTap, disableDebugMode } = useDebugMode();
  const { canSee } = useOpacity();
  const {
    settings: reminderSettings,
    updateSettings: updateReminderSettings,
    notificationPermission,
    requestNotificationPermission,
    triggerReminder,
  } = useReminders();
  const [activeSection, setActiveSection] = useState<SettingsSection>('main');
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Map section IDs to opacity feature keys
  const SECTION_FEATURE: Record<string, string> = {
    lovense: 'settings_basic',        // always visible
    equipment: 'settings_basic',      // always visible — equipment filters tasks
    timeratchets: 'settings_timeratchets',
    reminders: 'settings_reminders',
    microtasks: 'settings_microtasks',
    'sleep-content': 'settings_sleep',
    privacy: 'settings_privacy',
    appearance: 'settings_appearance',
    data: 'settings_data',
  };

  const allSections = [
    {
      id: 'lovense' as const,
      icon: Vibrate,
      label: 'Lovense',
      description: 'Toy connection & rewards',
      color: '#ec4899',
    },
    {
      id: 'equipment' as const,
      icon: Package,
      label: 'Equipment',
      description: 'Items you own for tasks',
      color: '#f97316',
    },
    {
      id: 'timeratchets' as const,
      icon: Clock,
      label: 'Time Anchors',
      description: 'Commitment milestones & service',
      color: '#f472b6',
    },
    {
      id: 'reminders' as const,
      icon: Bell,
      label: 'Reminders',
      description: 'All-day feminization presence',
      color: '#f59e0b',
    },
    {
      id: 'microtasks' as const,
      icon: Zap,
      label: 'Micro-Tasks',
      description: 'Identity reinforcement during work',
      color: '#a855f7',
    },
    {
      id: 'sleep-content' as const,
      icon: Moon,
      label: 'Sleep Content',
      description: 'Bedtime affirmations & voice settings',
      color: '#6366f1',
    },
    {
      id: 'privacy' as const,
      icon: Shield,
      label: 'Privacy',
      description: 'Data and security',
      color: '#22c55e',
    },
    {
      id: 'appearance' as const,
      icon: Palette,
      label: 'Appearance',
      description: 'Theme and display',
      color: '#a855f7',
    },
    {
      id: 'data' as const,
      icon: Database,
      label: 'Data',
      description: 'Export and backup',
      color: '#3b82f6',
    },
  ];

  // Filter sections by opacity level
  const sections = allSections.filter(s => {
    const feature = SECTION_FEATURE[s.id];
    return !feature || canSee(feature);
  });

  const handleBack = () => {
    if (activeSection === 'main') {
      onBack();
    } else {
      setActiveSection('main');
    }
  };

  const getSectionTitle = () => {
    if (activeSection === 'main') return 'Settings';
    if (activeSection === 'profile') return 'Profile';
    if (activeSection === 'equipment') return 'Equipment Inventory';
    if (activeSection === 'timeratchets') return 'Time Anchors';
    if (activeSection === 'reminders') return 'Feminization Reminders';
    if (activeSection === 'handler') return 'Handler Dashboard';
    if (activeSection === 'taskupload') return 'Task Upload';
    if (activeSection === 'microtasks') return 'Micro-Tasks';
    if (activeSection === 'privacy') return 'Privacy & Security';
    if (activeSection === 'appearance') return 'Appearance';
    if (activeSection === 'data') return 'Data Export';
    if (activeSection === 'opacity') return 'Visibility';
    const section = sections.find(s => s.id === activeSection);
    return section?.label || 'Settings';
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div
        className={`sticky top-0 z-10 p-4 border-b ${
          isBambiMode
            ? 'bg-white border-pink-200'
            : 'bg-protocol-bg border-protocol-border'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className={`p-2 rounded-full ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-600'
                : 'hover:bg-protocol-surface text-protocol-text'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1
            className={`text-xl font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {getSectionTitle()}
          </h1>
        </div>
      </div>

      <div className="p-4">
        {/* Main Menu */}
        {activeSection === 'main' && (
          <div className="space-y-6">
            {/* Account Section */}
            <div>
              <h2
                className={`text-sm font-medium mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Account
              </h2>
              <div className="space-y-2">
                <button
                  onClick={() => setActiveSection('profile')}
                  className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all ${
                    isBambiMode
                      ? 'bg-pink-50 border-pink-200 hover:border-pink-300'
                      : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/30'
                  }`}
                >
                  <div
                    className={`p-3 rounded-xl ${
                      isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
                    }`}
                  >
                    <User
                      className={`w-5 h-5 ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <p
                      className={`font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      Profile
                    </p>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Your identity and preferences
                    </p>
                  </div>
                  <ChevronRight
                    className={`w-5 h-5 ${
                      isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                    }`}
                  />
                </button>

                {/* Edit Intake Button */}
                <button
                  onClick={onEditIntake}
                  className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all ${
                    isBambiMode
                      ? 'bg-pink-50 border-pink-200 hover:border-pink-300'
                      : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/30'
                  }`}
                >
                  <div
                    className="p-3 rounded-xl"
                    style={{ backgroundColor: '#8b5cf620' }}
                  >
                    <ClipboardEdit
                      className="w-5 h-5"
                      style={{ color: '#8b5cf6' }}
                    />
                  </div>
                  <div className="flex-1">
                    <p
                      className={`font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      Edit Intake
                    </p>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Update your intake exam answers
                    </p>
                  </div>
                  <ChevronRight
                    className={`w-5 h-5 ${
                      isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Opacity Selector — always visible */}
            <div className={`rounded-xl border p-4 ${
              isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-surface border-protocol-border'
            }`}>
              <OpacitySelector />
            </div>

            {/* Difficulty — always visible (settings_basic) */}
            <DifficultySection />

            {/* Features Section */}
            <div>
              <h2
                className={`text-sm font-medium mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Features
              </h2>
              <div className="space-y-2">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all ${
                        isBambiMode
                          ? 'bg-pink-50 border-pink-200 hover:border-pink-300'
                          : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/30'
                      }`}
                    >
                      <div
                        className="p-3 rounded-xl"
                        style={{ backgroundColor: `${section.color}20` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: section.color }} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className={`font-medium ${
                              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                            }`}
                          >
                            {section.label}
                          </p>
                        </div>
                        <p
                          className={`text-sm ${
                            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                          }`}
                        >
                          {section.description}
                        </p>
                      </div>
                      <ChevronRight
                        className={`w-5 h-5 ${
                          isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Help Section */}
            <div>
              <h2
                className={`text-sm font-medium mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Support
              </h2>
              <button
                className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left ${
                  isBambiMode
                    ? 'bg-pink-50 border-pink-200 hover:border-pink-300'
                    : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/30'
                }`}
              >
                <div
                  className={`p-3 rounded-xl ${
                    isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
                  }`}
                >
                  <HelpCircle
                    className={`w-5 h-5 ${
                      isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <p
                    className={`font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    Help & Feedback
                  </p>
                  <p
                    className={`text-sm ${
                      isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                    }`}
                  >
                    Get support or share ideas
                  </p>
                </div>
                <ChevronRight
                  className={`w-5 h-5 ${
                    isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                  }`}
                />
              </button>
            </div>

            {/* Developer Section — only at opacity level 0 */}
            {canSee('developer_tools') && <div>
              <h2
                className={`text-sm font-medium mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Developer
              </h2>
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    setIsRegenerating(true);
                    try {
                      await regenerateToday();
                      onBack();
                    } catch (error) {
                      console.error('Failed to regenerate:', error);
                    } finally {
                      setIsRegenerating(false);
                    }
                  }}
                  disabled={isRegenerating}
                  className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all ${
                    isRegenerating ? 'opacity-50' : ''
                  } ${
                    isBambiMode
                      ? 'bg-pink-50 border-pink-200 hover:border-pink-300'
                      : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/30'
                  }`}
                >
                  <div
                    className="p-3 rounded-xl"
                    style={{ backgroundColor: '#6366f120' }}
                  >
                    <RefreshCw
                      className={`w-5 h-5 ${isRegenerating ? 'animate-spin' : ''}`}
                      style={{ color: '#6366f1' }}
                    />
                  </div>
                  <div className="flex-1">
                    <p
                      className={`font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {isRegenerating ? 'Regenerating...' : 'Regenerate Tasks'}
                    </p>
                    <p
                      className={`text-sm ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}
                    >
                      Delete and recreate today's tasks
                    </p>
                  </div>
                </button>

                {/* Task Upload - Always visible for flooding the protocol */}
                <button
                  onClick={() => setActiveSection('taskupload')}
                    className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all ${
                      isBambiMode
                        ? 'bg-pink-50 border-pink-200 hover:border-pink-300'
                        : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/30'
                    }`}
                  >
                    <div
                      className="p-3 rounded-xl"
                      style={{ backgroundColor: '#10b98120' }}
                    >
                      <Upload
                        className="w-5 h-5"
                        style={{ color: '#10b981' }}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`font-medium ${
                            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                          }`}
                        >
                          Task Upload
                        </p>
                      </div>
                      <p
                        className={`text-sm ${
                          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                        }`}
                      >
                        Import tasks from CSV or JSON
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-5 h-5 ${
                        isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                      }`}
                    />
                  </button>

                {/* Handler Dashboard - Debug Mode Only */}
                {isDebugMode && (
                  <button
                    onClick={() => setActiveSection('handler')}
                    className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all ${
                      isBambiMode
                        ? 'bg-pink-50 border-pink-200 hover:border-pink-300'
                        : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/30'
                    }`}
                  >
                    <div
                      className="p-3 rounded-xl"
                      style={{ backgroundColor: '#dc262620' }}
                    >
                      <Brain
                        className="w-5 h-5"
                        style={{ color: '#dc2626' }}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`font-medium ${
                            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                          }`}
                        >
                          Handler Dashboard
                        </p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                          DEBUG
                        </span>
                      </div>
                      <p
                        className={`text-sm ${
                          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                        }`}
                      >
                        View Handler AI strategies and behavior
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-5 h-5 ${
                        isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                      }`}
                    />
                  </button>
                )}

                {/* Corruption Dashboard - Debug Mode Only */}
                {isDebugMode && (
                  <button
                    onClick={() => setActiveSection('corruption')}
                    className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all ${
                      isBambiMode
                        ? 'bg-pink-50 border-pink-200 hover:border-pink-300'
                        : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/30'
                    }`}
                  >
                    <div
                      className="p-3 rounded-xl"
                      style={{ backgroundColor: '#22c55e20' }}
                    >
                      <Shield
                        className="w-5 h-5"
                        style={{ color: '#22c55e' }}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`font-medium ${
                            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                          }`}
                        >
                          Corruption Dashboard
                        </p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                          DEBUG
                        </span>
                      </div>
                      <p
                        className={`text-sm ${
                          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                        }`}
                      >
                        View corruption state and advancement
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-5 h-5 ${
                        isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                      }`}
                    />
                  </button>
                )}

                {/* Debug Mode Toggle */}
                {isDebugMode && (
                  <button
                    onClick={disableDebugMode}
                    className={`w-full p-4 rounded-xl border flex items-center gap-4 text-left transition-all ${
                      isBambiMode
                        ? 'bg-pink-50 border-pink-200 hover:border-pink-300'
                        : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/30'
                    }`}
                  >
                    <div
                      className="p-3 rounded-xl"
                      style={{ backgroundColor: '#f9731620' }}
                    >
                      <Shield
                        className="w-5 h-5"
                        style={{ color: '#f97316' }}
                      />
                    </div>
                    <div className="flex-1">
                      <p
                        className={`font-medium ${
                          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                        }`}
                      >
                        Exit Debug Mode
                      </p>
                      <p
                        className={`text-sm ${
                          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                        }`}
                      >
                        Hide developer features
                      </p>
                    </div>
                  </button>
                )}
              </div>
            </div>}

            {/* Danger Zone — always visible (settings_basic) */}
            <DangerZoneSection />

            {/* App Version - Tap to enable debug mode */}
            <div className="text-center pt-4">
              <button
                onClick={registerTap}
                className={`text-xs ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                } hover:opacity-70 transition-opacity`}
              >
                Becoming Protocol v1.0.0
                {isDebugMode && (
                  <span className="ml-2 text-red-400">(Debug)</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Profile View */}
        {activeSection === 'profile' && <ProfileView />}

        {/* Lovense Settings */}
        {activeSection === 'lovense' && <LovenseSettings />}

        {/* Equipment Inventory */}
        {activeSection === 'equipment' && <EquipmentInventory />}

        {/* Time Ratchets Settings */}
        {activeSection === 'timeratchets' && <TimeRatchetsSettings />}

        {/* Reminders Settings */}
        {activeSection === 'reminders' && (
          <ReminderSettingsPanel
            settings={reminderSettings}
            onUpdate={updateReminderSettings}
            notificationPermission={notificationPermission}
            onRequestPermission={requestNotificationPermission}
            onTestReminder={triggerReminder}
          />
        )}

        {/* Handler Dashboard - Debug Mode Only */}
        {activeSection === 'handler' && isDebugMode && (
          <HandlerDashboard onBack={() => setActiveSection('main')} />
        )}

        {/* Corruption Dashboard - Debug Mode Only */}
        {activeSection === 'corruption' && isDebugMode && (
          <CorruptionDashboard onBack={() => setActiveSection('main')} />
        )}

        {/* Task Upload - Always available for flooding the protocol */}
        {activeSection === 'taskupload' && (
          <TaskUploadSettings />
        )}

        {/* Micro-Tasks */}
        {activeSection === 'microtasks' && <MicroTaskSettings />}

        {/* Sleep Content */}
        {activeSection === 'sleep-content' && <SleepContentSettings />}

        {/* Privacy & Security */}
        {activeSection === 'privacy' && <PrivacySettings />}

        {/* Appearance */}
        {activeSection === 'appearance' && <AppearanceSettings />}

        {/* Data Export */}
        {activeSection === 'data' && <DataExportView />}
      </div>
    </div>
  );
}
