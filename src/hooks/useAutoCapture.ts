/**
 * useAutoCapture — Checks task capture_flag and prompts capture after completion.
 */

import { useState, useCallback, useEffect } from 'react';
import { getTaskCaptureContext, type CaptureContext } from '../lib/content/auto-capture';

export interface UseAutoCaptureReturn {
  captureContext: CaptureContext | null;
  shouldCapture: boolean;
  dismissCapture: () => void;
  triggerCapture: () => void;
}

export function useAutoCapture(taskId: string | null): UseAutoCaptureReturn {
  const [captureContext, setCaptureContext] = useState<CaptureContext | null>(null);
  const [shouldCapture, setShouldCapture] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setCaptureContext(null);
      setShouldCapture(false);
      return;
    }

    getTaskCaptureContext(taskId).then(ctx => {
      setCaptureContext(ctx);
    }).catch(() => {
      setCaptureContext(null);
    });
  }, [taskId]);

  const triggerCapture = useCallback(() => {
    if (captureContext) {
      setShouldCapture(true);
      // Dispatch event to navigate to content-capture with task context
      window.dispatchEvent(new CustomEvent('navigate-to-content-capture', {
        detail: captureContext,
      }));
    }
  }, [captureContext]);

  const dismissCapture = useCallback(() => {
    setShouldCapture(false);
  }, []);

  return {
    captureContext,
    shouldCapture,
    dismissCapture,
    triggerCapture,
  };
}
