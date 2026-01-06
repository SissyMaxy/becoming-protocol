// Moment Logger Hook
// State management for quick euphoria/dysphoria logging

import { useState, useCallback, useEffect } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import { useArousalState } from './useArousalState';
import {
  logMoment,
  updateMomentSupport,
  getTodayStats,
} from '../lib/moment-logger';
import {
  MomentType,
  MomentIntensity,
  MomentLoggerStep,
  MomentLog,
  MomentLogContext,
  SupportType,
} from '../types/moment-logger';

interface UseMomentLoggerReturn {
  // Modal state
  isModalOpen: boolean;
  currentStep: MomentLoggerStep;

  // Selection state
  selectedType: MomentType | null;
  selectedIntensity: MomentIntensity;
  selectedTriggers: string[];
  customTriggerText: string;

  // Loading/error
  isLoading: boolean;
  error: string | null;

  // Stats
  todayStats: { euphoria: number; dysphoria: number };

  // Last logged moment (for post-log screens)
  lastLoggedMoment: MomentLog | null;

  // Actions
  openModal: () => void;
  closeModal: () => void;
  selectType: (type: MomentType) => void;
  selectIntensity: (intensity: MomentIntensity) => void;
  toggleTrigger: (triggerId: string) => void;
  setCustomTriggerText: (text: string) => void;
  saveMoment: () => Promise<MomentLog | null>;
  recordSupport: (support: SupportType) => Promise<void>;
  goBack: () => void;
  reset: () => void;
}

export function useMomentLogger(): UseMomentLoggerReturn {
  // External hooks
  const { currentEntry } = useProtocol();
  const { metrics, currentState } = useArousalState();

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<MomentLoggerStep>('type');

  // Selection state
  const [selectedType, setSelectedType] = useState<MomentType | null>(null);
  const [selectedIntensity, setSelectedIntensity] = useState<MomentIntensity>(2); // Default to "Nice"
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>([]);
  const [customTriggerText, setCustomTriggerText] = useState('');

  // Status
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stats
  const [todayStats, setTodayStats] = useState({ euphoria: 0, dysphoria: 0 });

  // Last logged moment (for post-log experience)
  const [lastLoggedMoment, setLastLoggedMoment] = useState<MomentLog | null>(null);

  // Context captured at modal open
  const [capturedContext, setCapturedContext] = useState<MomentLogContext>({});

  // Load today's stats on mount and after logging
  useEffect(() => {
    loadTodayStats();
  }, []);

  const loadTodayStats = useCallback(async () => {
    try {
      const stats = await getTodayStats();
      setTodayStats(stats);
    } catch (err) {
      console.error('Failed to load today stats:', err);
    }
  }, []);

  // Capture context when modal opens
  const captureContext = useCallback((): MomentLogContext => {
    // Get the most recently completed task
    const completedTasks = currentEntry?.tasks?.filter(t => t.completed) || [];
    const recentTask = completedTasks.length > 0
      ? completedTasks[completedTasks.length - 1]?.title
      : undefined;

    return {
      denialDay: metrics?.currentStreakDays,
      arousalState: currentState,
      recentTaskCompleted: recentTask,
    };
  }, [currentEntry, metrics, currentState]);

  // Actions
  const openModal = useCallback(() => {
    setCapturedContext(captureContext());
    setIsModalOpen(true);
    setCurrentStep('type');
    setError(null);
  }, [captureContext]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    // Reset after animation
    setTimeout(() => {
      reset();
    }, 300);
  }, []);

  const selectType = useCallback((type: MomentType) => {
    setSelectedType(type);
    setCurrentStep('details');
  }, []);

  const selectIntensity = useCallback((intensity: MomentIntensity) => {
    setSelectedIntensity(intensity);
  }, []);

  const toggleTrigger = useCallback((triggerId: string) => {
    setSelectedTriggers(prev =>
      prev.includes(triggerId)
        ? prev.filter(t => t !== triggerId)
        : [...prev, triggerId]
    );
  }, []);

  const goBack = useCallback(() => {
    if (currentStep === 'details') {
      setCurrentStep('type');
      setSelectedType(null);
      setSelectedIntensity(2);
      setSelectedTriggers([]);
      setCustomTriggerText('');
    }
  }, [currentStep]);

  const saveMoment = useCallback(async (): Promise<MomentLog | null> => {
    if (!selectedType) {
      setError('Please select euphoria or dysphoria');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const moment = await logMoment(
        {
          type: selectedType,
          intensity: selectedIntensity,
          triggers: selectedTriggers.length > 0 ? selectedTriggers : undefined,
          customTriggerText: customTriggerText.trim() || undefined,
        },
        capturedContext
      );

      setLastLoggedMoment(moment);

      // Move to post-log step
      if (selectedType === 'euphoria') {
        setCurrentStep('post-euphoria');
      } else if (selectedType === 'arousal') {
        setCurrentStep('post-arousal');
      } else {
        setCurrentStep('post-dysphoria');
      }

      // Refresh stats
      await loadTodayStats();

      return moment;
    } catch (err) {
      console.error('Failed to save moment:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, selectedIntensity, selectedTriggers, customTriggerText, capturedContext, loadTodayStats]);

  const recordSupport = useCallback(async (support: SupportType) => {
    if (!lastLoggedMoment) return;

    try {
      await updateMomentSupport(lastLoggedMoment.id, support);
    } catch (err) {
      console.error('Failed to record support:', err);
    }
  }, [lastLoggedMoment]);

  const reset = useCallback(() => {
    setCurrentStep('type');
    setSelectedType(null);
    setSelectedIntensity(2);
    setSelectedTriggers([]);
    setCustomTriggerText('');
    setLastLoggedMoment(null);
    setError(null);
    setCapturedContext({});
  }, []);

  return {
    isModalOpen,
    currentStep,
    selectedType,
    selectedIntensity,
    selectedTriggers,
    customTriggerText,
    isLoading,
    error,
    todayStats,
    lastLoggedMoment,
    openModal,
    closeModal,
    selectType,
    selectIntensity,
    toggleTrigger,
    setCustomTriggerText,
    saveMoment,
    recordSupport,
    goBack,
    reset,
  };
}
