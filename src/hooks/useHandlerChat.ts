/**
 * useHandlerChat — Client hook for conversational Handler.
 * Persists conversations in DB and resumes on reopen.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getPendingOutreach, markDelivered } from '../lib/conditioning/proactive-outreach';
import { TypingMetricsTracker } from '../lib/conditioning/typing-resistance';

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

          if (msgs && msgs.length > 0) {
            setMessages(msgs
              .filter(m => !(m.role === 'user' && m.content.startsWith('[system:')))
              .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
                timestamp: new Date(m.created_at),
                mode: m.detected_mode || undefined,
              })));
          }
        }
      } catch (err) {
        console.error('[HandlerChat] Failed to load conversation:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadRecent();
  }, [user?.id]);

  // Auto-open: if chat loads empty (no conversation, no messages), the Handler speaks first.
  // Sends a system-initiated message so the Handler leads with directives.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!user?.id || isLoading || autoOpenedRef.current) return;
    if (messages.length > 0 || conversationIdRef.current) return;
    autoOpenedRef.current = true;

    // Handler speaks first — send an empty "start of day" trigger
    (async () => {
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
    })();
  }, [user?.id, isLoading, messages.length]);

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
