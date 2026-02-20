// Settings View
// Main settings page for the app

import { useState } from 'react';
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
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useProtocol } from '../../context/ProtocolContext';
import { useDebugMode } from '../../context/DebugContext';
import { useOpacity } from '../../context/OpacityContext';
import { OpacitySelector } from './OpacitySelector';
import { useReminders } from '../../hooks/useReminders';
import { LovenseSettings } from './LovenseSettings';
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

interface SettingsViewProps {
  onBack: () => void;
  onEditIntake?: () => void;
}

type SettingsSection = 'main' | 'profile' | 'lovense' | 'timeratchets' | 'reminders' | 'privacy' | 'appearance' | 'data' | 'handler' | 'taskupload' | 'microtasks' | 'corruption' | 'sleep-content' | 'opacity';

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
