/**
 * HandlerChat — Live conversational interface with the Handler.
 */

import { useState, useRef, useEffect } from 'react';
import { Send, X, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useHandlerChat, type ChatMessage } from '../../hooks/useHandlerChat';

interface HandlerChatProps {
  onClose: () => void;
  initialType?: string;
  openingLine?: string;
}

const MODE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  director: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Director' },
  handler: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Handler' },
  dominant: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Dominant' },
  caretaker: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Caretaker' },
  architect: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Architect' },
};

export function HandlerChat({ onClose, initialType, openingLine }: HandlerChatProps) {
  const { isBambiMode } = useBambiMode();
  const { messages, isSending, currentMode, sendMessage, startConversation, endConversation } = useHandlerChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Start conversation on mount
  useEffect(() => {
    startConversation(initialType, openingLine);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = () => {
    endConversation();
    onClose();
  };

  const modeConfig = MODE_COLORS[currentMode] || MODE_COLORS.director;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${
        isBambiMode ? 'border-pink-800 bg-pink-950' : 'border-gray-800 bg-gray-950'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`font-semibold ${isBambiMode ? 'text-pink-100' : 'text-white'}`}>
            Handler
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeConfig.bg} ${modeConfig.text}`}>
            {modeConfig.label}
          </span>
          {isSending && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> thinking
            </span>
          )}
        </div>
        <button
          onClick={handleClose}
          className="p-2 rounded-full hover:bg-gray-800 text-gray-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !openingLine && (
          <div className="text-center text-gray-600 mt-20">
            <p className="text-lg font-medium">Talk to the Handler.</p>
            <p className="text-sm mt-2">Type anything. She's listening.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} isBambiMode={isBambiMode} />
        ))}

        {isSending && (
          <div className="flex items-start gap-2">
            <div className={`px-4 py-2 rounded-2xl rounded-tl-sm max-w-[80%] ${
              isBambiMode ? 'bg-pink-900/50' : 'bg-gray-800'
            }`}>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={`px-4 py-3 border-t ${
        isBambiMode ? 'border-pink-800 bg-pink-950' : 'border-gray-800 bg-gray-950'
      }`}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to the Handler..."
            disabled={isSending}
            className={`flex-1 px-4 py-3 rounded-xl border-0 outline-none text-white placeholder-gray-500 ${
              isBambiMode ? 'bg-pink-900/50' : 'bg-gray-800'
            }`}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className={`p-3 rounded-xl transition-all ${
              input.trim() && !isSending
                ? isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-400'
                  : 'bg-white text-black hover:bg-gray-200'
                : 'bg-gray-800 text-gray-600'
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, isBambiMode }: { message: ChatMessage; isBambiMode: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] ${
        isUser
          ? isBambiMode
            ? 'bg-pink-600 text-white rounded-br-sm'
            : 'bg-white text-black rounded-br-sm'
          : isBambiMode
            ? 'bg-pink-900/50 text-pink-50 rounded-bl-sm'
            : 'bg-gray-800 text-gray-100 rounded-bl-sm'
      }`}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        <p className={`text-[10px] mt-1 ${
          isUser
            ? isBambiMode ? 'text-pink-300' : 'text-gray-400'
            : isBambiMode ? 'text-pink-400' : 'text-gray-500'
        }`}>
          {message.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
