/**
 * useHandlerChat — Client hook for conversational Handler.
 * Persists conversations in DB and resumes on reopen.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  mode?: string;
}

interface ChatResponse {
  conversationId: string;
  message: string;
  mode: string;
  vulnerabilityWindow: boolean;
  commitmentOpportunity: boolean;
  shouldContinue: boolean;
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
}

export function useHandlerChat(): UseHandlerChatReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState('director');
  const conversationIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

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
            setMessages(msgs.map(m => ({
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

    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsSending(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No auth token');

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
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data: ChatResponse = await res.json();

      conversationIdRef.current = data.conversationId;
      setCurrentMode(data.mode || 'director');

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        mode: data.mode,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[HandlerChat] Error:', errorMsg);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection error: ${errorMsg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsSending(false);
    }
  }, [user?.id]);

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
  };
}
