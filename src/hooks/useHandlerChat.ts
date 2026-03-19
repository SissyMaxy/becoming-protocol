/**
 * useHandlerChat — Client hook for conversational Handler.
 */

import { useState, useCallback, useRef } from 'react';
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
  startConversation: (type?: string, openingLine?: string) => void;
  endConversation: () => void;
}

export function useHandlerChat(): UseHandlerChatReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading] = useState(false);
  const [currentMode, setCurrentMode] = useState('director');
  const conversationIdRef = useRef<string | null>(null);

  const startConversation = useCallback((_type?: string, openingLine?: string) => {
    conversationIdRef.current = null;
    setMessages([]);
    setCurrentMode('director');

    if (openingLine) {
      setMessages([{
        role: 'assistant',
        content: openingLine,
        timestamp: new Date(),
        mode: 'director',
      }]);
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!user?.id || !text.trim()) return;

    // Add user message optimistically
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
    conversationIdRef.current = null;
  }, []);

  return {
    messages,
    isLoading,
    isSending,
    currentMode,
    conversationId: conversationIdRef.current,
    sendMessage,
    startConversation,
    endConversation,
  };
}
