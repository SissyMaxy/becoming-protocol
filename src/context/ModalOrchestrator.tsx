/**
 * Modal Orchestrator
 *
 * Coordinates modal display to prevent stacking and ensure priority-based ordering.
 * Only one modal shows at a time; others are queued.
 *
 * Priority levels (highest first):
 * - critical: Recovery prompts, urgent interventions
 * - high: Handler interventions, streak warnings
 * - medium: Achievements, celebrations, reminders
 * - low: Informational modals, optional prompts
 */

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

// ============================================
// TYPES
// ============================================

export type ModalPriority = 'critical' | 'high' | 'medium' | 'low';

export interface QueuedModal {
  id: string;
  priority: ModalPriority;
  component: ReactNode;
  onDismiss?: () => void;
  /** If true, can be dismissed by clicking backdrop */
  dismissOnBackdrop?: boolean;
  /** Auto-dismiss after this many ms */
  autoDismissMs?: number;
  /** Source system for debugging */
  source?: string;
  /** Timestamp when queued */
  queuedAt: number;
}

interface ModalOrchestratorContextType {
  /** Currently displayed modal (if any) */
  currentModal: QueuedModal | null;
  /** Queue a modal for display */
  showModal: (modal: Omit<QueuedModal, 'id' | 'queuedAt'>) => string;
  /** Dismiss the current modal */
  dismissCurrent: () => void;
  /** Dismiss a specific modal by ID */
  dismissModal: (id: string) => void;
  /** Clear all queued modals */
  clearQueue: () => void;
  /** Number of modals in queue (including current) */
  queueLength: number;
  /** Check if a modal from a specific source is queued/showing */
  hasModalFromSource: (source: string) => boolean;
}

const ModalOrchestratorContext = createContext<ModalOrchestratorContextType | null>(null);

// ============================================
// PRIORITY ORDER
// ============================================

const PRIORITY_ORDER: ModalPriority[] = ['critical', 'high', 'medium', 'low'];

function getPriorityIndex(priority: ModalPriority): number {
  return PRIORITY_ORDER.indexOf(priority);
}

// ============================================
// PROVIDER
// ============================================

interface ModalOrchestratorProviderProps {
  children: ReactNode;
}

export function ModalOrchestratorProvider({ children }: ModalOrchestratorProviderProps) {
  const [queue, setQueue] = useState<QueuedModal[]>([]);

  // Current modal is the first in the sorted queue
  const currentModal = useMemo(() => {
    if (queue.length === 0) return null;

    // Sort by priority, then by time (FIFO within same priority)
    const sorted = [...queue].sort((a, b) => {
      const priorityDiff = getPriorityIndex(a.priority) - getPriorityIndex(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.queuedAt - b.queuedAt;
    });

    return sorted[0];
  }, [queue]);

  const showModal = useCallback((modal: Omit<QueuedModal, 'id' | 'queuedAt'>): string => {
    const id = `modal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const queuedModal: QueuedModal = {
      ...modal,
      id,
      queuedAt: Date.now(),
    };

    setQueue(prev => [...prev, queuedModal]);

    // Handle auto-dismiss
    if (modal.autoDismissMs) {
      setTimeout(() => {
        setQueue(prev => prev.filter(m => m.id !== id));
      }, modal.autoDismissMs);
    }

    return id;
  }, []);

  const dismissCurrent = useCallback(() => {
    if (!currentModal) return;

    // Call onDismiss callback if provided
    currentModal.onDismiss?.();

    // Remove from queue
    setQueue(prev => prev.filter(m => m.id !== currentModal.id));
  }, [currentModal]);

  const dismissModal = useCallback((id: string) => {
    setQueue(prev => {
      const modal = prev.find(m => m.id === id);
      modal?.onDismiss?.();
      return prev.filter(m => m.id !== id);
    });
  }, []);

  const clearQueue = useCallback(() => {
    queue.forEach(m => m.onDismiss?.());
    setQueue([]);
  }, [queue]);

  const hasModalFromSource = useCallback((source: string) => {
    return queue.some(m => m.source === source);
  }, [queue]);

  const value: ModalOrchestratorContextType = {
    currentModal,
    showModal,
    dismissCurrent,
    dismissModal,
    clearQueue,
    queueLength: queue.length,
    hasModalFromSource,
  };

  return (
    <ModalOrchestratorContext.Provider value={value}>
      {children}
      {/* Render the current modal */}
      {currentModal && (
        <div
          className="fixed inset-0 z-[60]"
          onClick={currentModal.dismissOnBackdrop ? dismissCurrent : undefined}
        >
          <div onClick={e => e.stopPropagation()}>
            {currentModal.component}
          </div>
        </div>
      )}
    </ModalOrchestratorContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useModalOrchestrator(): ModalOrchestratorContextType {
  const context = useContext(ModalOrchestratorContext);
  if (!context) {
    throw new Error('useModalOrchestrator must be used within ModalOrchestratorProvider');
  }
  return context;
}

// ============================================
// CONVENIENCE HOOKS
// ============================================

/**
 * Hook for showing a reminder modal
 */
export function useReminderModal() {
  const { showModal, dismissCurrent, hasModalFromSource } = useModalOrchestrator();

  const showReminder = useCallback((
    component: ReactNode,
    onDismiss?: () => void
  ) => {
    // Don't queue if already showing a reminder
    if (hasModalFromSource('reminder')) return null;

    return showModal({
      priority: 'medium',
      component,
      onDismiss,
      source: 'reminder',
      autoDismissMs: 30000, // Auto-dismiss after 30s
    });
  }, [showModal, hasModalFromSource]);

  return { showReminder, dismissReminder: dismissCurrent };
}

/**
 * Hook for showing intervention modals
 */
export function useInterventionModal() {
  const { showModal, dismissCurrent, hasModalFromSource } = useModalOrchestrator();

  const showIntervention = useCallback((
    component: ReactNode,
    priority: ModalPriority = 'high',
    onDismiss?: () => void
  ) => {
    if (hasModalFromSource('intervention')) return null;

    return showModal({
      priority,
      component,
      onDismiss,
      source: 'intervention',
    });
  }, [showModal, hasModalFromSource]);

  return { showIntervention, dismissIntervention: dismissCurrent };
}

/**
 * Hook for showing celebration/achievement modals
 */
export function useCelebrationModal() {
  const { showModal, dismissCurrent } = useModalOrchestrator();

  const showCelebration = useCallback((
    component: ReactNode,
    onDismiss?: () => void
  ) => {
    return showModal({
      priority: 'medium',
      component,
      onDismiss,
      dismissOnBackdrop: true,
      source: 'celebration',
      autoDismissMs: 10000, // Auto-dismiss after 10s
    });
  }, [showModal]);

  return { showCelebration, dismissCelebration: dismissCurrent };
}

/**
 * Hook for showing recovery/critical modals
 */
export function useRecoveryModal() {
  const { showModal, dismissCurrent, hasModalFromSource } = useModalOrchestrator();

  const showRecovery = useCallback((
    component: ReactNode,
    onDismiss?: () => void
  ) => {
    if (hasModalFromSource('recovery')) return null;

    return showModal({
      priority: 'critical',
      component,
      onDismiss,
      source: 'recovery',
    });
  }, [showModal, hasModalFromSource]);

  return { showRecovery, dismissRecovery: dismissCurrent };
}
