/**
 * useHandlerChat — Client hook for conversational Handler.
 * Persists conversations in DB and resumes on reopen.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getPendingOutreach, markDelivered } from '../lib/conditioning/proactive-outreach';
import { TypingMetricsTracker } from '../lib/conditioning/typing-resistance';
import { sendVibrateCommand } from '../lib/lovense';
import { BUILTIN_PATTERNS } from '../types/lovense';
import type { CloudCommandResponse } from '../types/lovense';

// ============================================
// CLIENT-SIDE PATTERN PLAYBACK
// Steps through pattern intensities using timed Function commands.
// Lovense Pattern API doesn't loop reliably — this does.
// ============================================

let activePatternTimer: ReturnType<typeof setTimeout> | null = null;
let activePatternRunning = false;

function stopActivePattern() {
  activePatternRunning = false;
  if (activePatternTimer) {
    clearTimeout(activePatternTimer);
    activePatternTimer = null;
  }
}

async function playPatternLoop(patternId: string): Promise<CloudCommandResponse> {
  const pat = BUILTIN_PATTERNS.find(p => p.id === patternId);
  if (!pat) return { success: false, error: `Pattern "${patternId}" not found` };

  // Stop any existing pattern
  stopActivePattern();
  activePatternRunning = true;

  console.log(`[HandlerChat] Starting pattern "${patternId}" (${pat.steps.length} steps, looping)`);

  async function playStep(stepIdx: number) {
    if (!activePatternRunning) return;

    const idx = stepIdx % pat!.steps.length;
    const step = pat!.steps[idx];

    // Send intensity change — use short duration, we control timing
    sendVibrateCommand(step.intensity, Math.ceil(step.duration / 1000) + 1, 'conditioning')
      .catch(() => {}); // Non-blocking

    // Schedule next step
    activePatternTimer = setTimeout(() => {
      playStep(stepIdx + 1);
    }, step.duration);
  }

  // Start first step
  playStep(0);
  return { success: true };
}

// Execute a device command — pattern or simple vibrate
async function executeDeviceCmd(cmd: { intensity?: number; duration?: number; pattern?: string }): Promise<CloudCommandResponse> {
  if (cmd.pattern) {
    // Stop sends intensity 0
    if (cmd.pattern === 'stop') {
      stopActivePattern();
      return sendVibrateCommand(0, 1, 'conditioning');
    }
    return playPatternLoop(cmd.pattern);
  }

  // Simple vibrate — stop any active pattern first
  stopActivePattern();

  // Lovense rejects timeSec:0, use 3600 (1 hour) for "indefinite"
  const duration = (cmd.duration && cmd.duration > 0) ? cmd.duration : 3600;
  return sendVibrateCommand(cmd.intensity || 5, duration, 'conditioning');
}

export interface MediaAttachment {
  type: 'image' | 'audio';
  url: string;
  caption: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  mode?: string;
  media?: MediaAttachment[];
}

interface ConditioningSessionSignal {
  audioUrl?: string;
  scriptId?: string;
  target: string;
  phase: number;
  needsTts?: boolean;
}

interface ChatResponse {
  conversationId: string;
  message: string;
  mode: string;
  vulnerabilityWindow: boolean;
  commitmentOpportunity: boolean;
  shouldContinue: boolean;
  conditioningSession?: ConditioningSessionSignal;
  media?: MediaAttachment[];
  deviceCommands?: Array<{ intensity?: number; duration?: number; pattern?: string }>;
}

interface UseHandlerChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isSending: boolean;
  currentMode: string;
  conversationId: string | null;
  sendMessage: (text: string) => Promise<void>;
  startNewConversation: () => void;
  endConversation: () => void;
  /** P12.7: Call on each keydown in chat input for resistance detection */
  onKeystroke: () => void;
  /** P12.7: Call on backspace/delete for resistance detection */
  onDeletion: () => void;
}

export function useHandlerChat(): UseHandlerChatReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState('director');
  const conversationIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const typingTrackerRef = useRef(new TypingMetricsTracker());

  // Load most recent active conversation on mount
  useEffect(() => {
    if (!user?.id || loadedRef.current) return;
    loadedRef.current = true;

    async function loadRecent() {
      setIsLoading(true);
      let needsAutoOpen = false;
      try {
        // Find most recent conversation that isn't ended (any date)
        const { data: conv } = await supabase
          .from('handler_conversations')
          .select('id, final_mode')
          .eq('user_id', user!.id)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (conv) {
          conversationIdRef.current = conv.id;
          if (conv.final_mode) setCurrentMode(conv.final_mode);

          // Load messages
          const { data: msgs } = await supabase
            .from('handler_messages')
            .select('role, content, detected_mode, created_at')
            .eq('conversation_id', conv.id)
            .order('message_index', { ascending: true });

          const filtered = (msgs || [])
            .filter(m => !(m.role === 'user' && m.content.startsWith('[system:')))
            .map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: new Date(m.created_at),
              mode: m.detected_mode || undefined,
            }));

          if (filtered.length > 0) {
            setMessages(filtered);
          } else {
            // Conversation exists but no visible messages — Handler should open
            needsAutoOpen = true;
          }
        } else {
          // No conversation at all — Handler should open
          needsAutoOpen = true;
        }
      } catch (err) {
        console.error('[HandlerChat] Failed to load conversation:', err);
        needsAutoOpen = true;
      } finally {
        setIsLoading(false);
        if (needsAutoOpen) {
          triggerAutoOpen();
        }
      }
    }

    // Handler speaks first — called when chat has no visible messages
    async function triggerAutoOpen() {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;

        setIsSending(true);
        const res = await fetch('/api/handler/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            conversationId: null,
            message: '[system: start of day — Handler opens. Assign tasks. Set the tone. Lead.]',
            conversationType: 'morning',
            stream: false,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.conversationId) conversationIdRef.current = data.conversationId;
          if (data.mode) setCurrentMode(data.mode);
          if (data.message) {
            setMessages([{
              role: 'assistant',
              content: data.message,
              timestamp: new Date(),
              mode: data.mode || 'director',
            }]);
          }
        }
      } catch (err) {
        console.error('[HandlerChat] Auto-open failed:', err);
      } finally {
        setIsSending(false);
      }
    }

    loadRecent();
  }, [user?.id]);

  // P11.1: Poll for Handler-initiated messages every 60s
  useEffect(() => {
    if (!user?.id) return;

    let mounted = true;

    async function checkOutreach() {
      if (!mounted || !user?.id) return;
      try {
        const msg = await getPendingOutreach(user.id);
        if (msg && mounted) {
          // Display as Handler message
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: msg.message,
            timestamp: new Date(),
            mode: 'director',
          }]);
          // Mark delivered (fire-and-forget)
          markDelivered(msg.id).catch(() => {});
        }
      } catch {
        // Non-critical — proactive outreach polling failure doesn't break chat
      }
    }

    // Initial check
    checkOutreach();

    // Poll every 60s
    const interval = setInterval(checkOutreach, 60_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user?.id]);

  // Poll handler_directives for device commands and execute them client-side
  // This bypasses the response pipeline entirely — reliable delivery
  const lastDirectiveRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;

    async function pollDirectives() {
      if (!mounted) return;
      try {
        const { data, error } = await supabase
          .from('handler_directives')
          .select('id, value, created_at')
          .eq('user_id', user!.id)
          .eq('action', 'send_device_command')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[HandlerChat] Directive poll error:', error.message, error.code);
          return;
        }

        if (data && data.id !== lastDirectiveRef.current) {
          console.log('[HandlerChat] Directive poll found device command:', JSON.stringify(data.value));

          try {
            // Execute it
            const result = await executeDeviceCmd(data.value as any);
            console.log('[HandlerChat] Device command result:', JSON.stringify(result));

            // Only mark as processed after successful execution
            lastDirectiveRef.current = data.id;

            // Mark as completed (ignore errors — the command already fired)
            supabase.from('handler_directives')
              .update({ status: 'completed', executed_at: new Date().toISOString() })
              .eq('id', data.id)
              .then(() => {});
          } catch (execErr) {
            console.error('[HandlerChat] Device command execution error:', execErr);
            // Still mark this directive to avoid infinite retry
            lastDirectiveRef.current = data.id;
          }
        }
      } catch (err) {
        // Non-critical
      }
    }

    // Poll every 3 seconds
    pollDirectives();
    const directiveInterval = setInterval(pollDirectives, 3000);

    return () => {
      mounted = false;
      clearInterval(directiveInterval);
    };
  }, [user?.id]);

  const startNewConversation = useCallback(() => {
    // End current conversation if exists
    if (conversationIdRef.current) {
      supabase.from('handler_conversations').update({
        ended_at: new Date().toISOString(),
      }).eq('id', conversationIdRef.current).then(() => {});
    }
    conversationIdRef.current = null;
    setMessages([]);
    setCurrentMode('director');
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!user?.id || !text.trim()) return;

    // P12.7: Collect typing metrics before sending
    const typingMetrics = typingTrackerRef.current.getMetrics(text.trim().length);

    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsSending(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No auth token');

      // P12.2: Use streaming endpoint
      const res = await fetch('/api/handler/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId: conversationIdRef.current,
          message: text.trim(),
          conversationType: 'general',
          stream: false,
          typingMetrics,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // P12.2: Handle SSE streaming response
      if (res.headers.get('content-type')?.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantText = '';
        let sseBuffer = '';

        // Add empty assistant message to fill incrementally
        const tempMsg: ChatMessage = { role: 'assistant', content: '', timestamp: new Date() };
        setMessages(prev => [...prev, tempMsg]);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.error) {
                    throw new Error(data.error);
                  }
                  if (data.text) {
                    assistantText += data.text;
                    const currentText = assistantText;
                    setMessages(prev => {
                      const updated = [...prev];
                      updated[updated.length - 1] = {
                        ...updated[updated.length - 1],
                        content: currentText,
                      };
                      return updated;
                    });
                  }
                  if (data.done) {
                    conversationIdRef.current = data.conversationId;
                    setCurrentMode(data.mode || 'director');

                    // Execute device commands from streaming response
                    console.log('[HandlerChat] SSE done event keys:', Object.keys(data));
                    if (data.deviceCommands && Array.isArray(data.deviceCommands)) {
                      console.log('[HandlerChat] SSE device commands:', JSON.stringify(data.deviceCommands));
                      for (const cmd of data.deviceCommands) {
                        executeDeviceCmd(cmd).catch(err =>
                          console.error('[HandlerChat] Device command failed:', err)
                        );
                      }
                    } else {
                      console.log('[HandlerChat] No deviceCommands in SSE done event');
                    }
                  }
                } catch (parseErr) {
                  // Skip malformed SSE events unless it's a thrown error
                  if (parseErr instanceof Error && parseErr.message !== 'Unknown') {
                    throw parseErr;
                  }
                }
              }
            }
          }
        } catch (streamErr) {
          if (assistantText) {
            // Partial response received — keep what we have
            console.warn('[HandlerChat] Stream interrupted, keeping partial response');
          } else {
            throw streamErr;
          }
        }
      } else {
        // Fallback: non-streaming JSON response (backward compatibility)
        const data: ChatResponse = await res.json();

        conversationIdRef.current = data.conversationId;
        setCurrentMode(data.mode || 'director');

        if (data.conditioningSession) {
          try {
            window.dispatchEvent(
              new CustomEvent('handler-conditioning-session', {
                detail: data.conditioningSession,
              }),
            );
          } catch {
            // Non-critical
          }
        }

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data.message,
          timestamp: new Date(),
          mode: data.mode,
          media: data.media,
        };
        setMessages(prev => [...prev, assistantMsg]);

        // Execute device commands via cloud API (same path as working test button)
        if (data.deviceCommands && Array.isArray(data.deviceCommands)) {
          console.log('[HandlerChat] Executing device commands via cloud API:', data.deviceCommands);
          for (const cmd of data.deviceCommands) {
            try {
              const result = await executeDeviceCmd(cmd);
              console.log(`[HandlerChat] Device result: ${result.success ? 'OK' : result.error}, intensity=${cmd.intensity}, duration=${cmd.duration}`);
            } catch (err) {
              console.error('[HandlerChat] Device command failed:', err);
            }
          }
        } else {
          console.log('[HandlerChat] No deviceCommands in response. Keys:', Object.keys(data));
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[HandlerChat] Error:', errorMsg);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection error: ${errorMsg}`,
        timestamp: new Date(),
      }]);
      // P12.7: Start tracking typing metrics after handler responds
      typingTrackerRef.current.startTracking();
    } finally {
      setIsSending(false);
    }
  }, [user?.id]);

  // P12.7: Typing resistance detection callbacks
  const onKeystroke = useCallback(() => {
    typingTrackerRef.current.recordKeystroke();
  }, []);

  const onDeletion = useCallback(() => {
    typingTrackerRef.current.recordDeletion();
  }, []);

  const endConversation = useCallback(() => {
    if (conversationIdRef.current) {
      supabase.from('handler_conversations').update({
        ended_at: new Date().toISOString(),
      }).eq('id', conversationIdRef.current).then(() => {});
    }
  }, []);

  return {
    messages,
    isLoading,
    isSending,
    currentMode,
    conversationId: conversationIdRef.current,
    sendMessage,
    startNewConversation,
    endConversation,
    onKeystroke,
    onDeletion,
  };
}
