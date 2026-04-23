/**
 * HandlerChat — Live conversational interface with the Handler.
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Settings, Volume2, VolumeX, Play, Pause, Image, Mic, MicOff, Camera } from 'lucide-react';
import { useHandlerChat, type ChatMessage, type MediaAttachment } from '../../hooks/useHandlerChat';
import { useHandlerVoice } from '../../hooks/useHandlerVoice';
import { useVoiceConversation } from '../../hooks/useVoiceConversation';
import { useSessionBiometrics } from '../../hooks/useSessionBiometrics';
import { useAmbientAudio } from '../../hooks/useAmbientAudio';
import { useSleepAudioConditioning } from '../../hooks/useSleepAudioConditioning';
import { PhotoVerificationUpload } from './PhotoVerificationUpload';
import { MantraRepetition } from './MantraRepetition';
import { VoicePracticeRecorder } from './VoicePracticeRecorder';
import { GeneratedSessionPlayer } from '../hypno/GeneratedSessionPlayer';
import { IdentityFadingBar } from './IdentityFadingBar';
import { BodyDirectiveChecklist } from './BodyDirectiveChecklist';
import { ForceFeminizationPanel } from './ForceFeminizationPanel';
import { RewardFlash } from './RewardFlash';
import { useAuth } from '../../context/AuthContext';

interface HandlerChatProps {
  onClose: () => void;
  openingLine?: string;
  onOpenSettings?: () => void;
}

const MODE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  director: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Director' },
  handler: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Handler' },
  dominant: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Dominant' },
  caretaker: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Caretaker' },
  architect: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Architect' },
};

export function HandlerChat({ openingLine, onOpenSettings }: HandlerChatProps) {
  const { user: authUser } = useAuth();
  const { messages, isLoading, isSending, currentMode, conversationId, sendMessage, startNewConversation } = useHandlerChat();
  const voice = useHandlerVoice();
  const voiceInput = useVoiceConversation();
  const biometrics = useSessionBiometrics();
  // Ambient conditioning audio — polls ambient_audio_queue and speaks queued
  // affirmations via SpeechSynthesis while the chat is open. Toggle persists in localStorage.
  const ambientAudio = useAmbientAudio();
  // Sleep-window affirmation drip — schedules notifications during configured
  // sleep window and hands the loop to the service worker for background play.
  useSleepAudioConditioning();

  // Auto-start biometric polling when Handler enters dominant/conditioning mode
  const bioPollStartedRef = useRef(false);
  useEffect(() => {
    if ((currentMode === 'dominant' || currentMode === 'conditioning') && !biometrics.isPolling && conversationId && !bioPollStartedRef.current) {
      bioPollStartedRef.current = true;
      biometrics.startPolling(conversationId);
    }
    // Also start if message content suggests active session
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'user' && !biometrics.isPolling && conversationId && !bioPollStartedRef.current) {
      const text = lastMsg.content.toLowerCase();
      if (text.includes('goon') || text.includes('edge') || text.includes('hypno') || text.includes('session')) {
        bioPollStartedRef.current = true;
        biometrics.startPolling(conversationId);
      }
    }
  }, [currentMode, messages, conversationId, biometrics.isPolling]);
  const [input, setInput] = useState(() => {
    try {
      const prefill = sessionStorage.getItem('handler_chat_prefill');
      if (prefill) {
        sessionStorage.removeItem('handler_chat_prefill');
        return prefill;
      }
    } catch { /* storage unavailable */ }
    return '';
  });
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [forcedMantra, setForcedMantra] = useState<{ mantra: string; repetitions: number; reason?: string } | null>(null);
  const [voicePracticeRequest, setVoicePracticeRequest] = useState<{ targetPhrase?: string; targetPitchHz?: number; minDuration?: number } | null>(null);

  // Listen for handler-initiated voice practice directive
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setVoicePracticeRequest({
        targetPhrase: detail.phrase || detail.targetPhrase,
        targetPitchHz: detail.targetPitchHz || detail.target_pitch || 160,
        minDuration: detail.minDuration || detail.min_duration || 10,
      });
    };
    window.addEventListener('handler-request-voice', handler);
    return () => window.removeEventListener('handler-request-voice', handler);
  }, []);

  // Listen for handler-initiated forced mantra directive — mounted modal blocks everything
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.mantra) {
        setForcedMantra({
          mantra: detail.mantra,
          repetitions: detail.repetitions || 5,
          reason: detail.reason,
        });
      }
    };
    window.addEventListener('handler-force-mantra', handler);
    return () => window.removeEventListener('handler-force-mantra', handler);
  }, []);

  // Listen for handler-prescribed generated session — trigger /api/hypno/generate
  // with the Handler's biasing, then open the player with the returned audio.
  const [generatedSession, setGeneratedSession] = useState<{
    sourceId: string;
    audioUrl: string;
    scriptText: string;
  } | null>(null);
  const [generatingSession, setGeneratingSession] = useState(false);
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setGeneratingSession(true);
      try {
        const { supabase: sb } = await import('../../lib/supabase');
        const session = (await sb.auth.getSession()).data.session;
        if (!session) return;
        const resp = await fetch('/api/hypno/generate', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            durationMin: detail.durationMin || 5,
            themeBias: detail.themeBias || [],
            phraseBias: detail.phraseBias || [],
            voiceStyle: detail.voiceStyle || undefined,
            prescribedBy: 'handler',
            handlerMessageId: detail.handlerMessageId,
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { sourceId: string; audioUrl: string; scriptText: string };
          setGeneratedSession(data);
        } else {
          console.error('[HandlerChat] prescribe_generated_session failed:', await resp.text());
        }
      } finally {
        setGeneratingSession(false);
      }
    };
    window.addEventListener('handler-prescribe-session', handler);
    return () => window.removeEventListener('handler-prescribe-session', handler);
  }, []);
  const [photoTaskType, setPhotoTaskType] = useState<'outfit' | 'mirror_check' | 'pose' | 'makeup' | 'nails' | 'general'>('outfit');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);
  const lastSpokenIndexRef = useRef(-1);
  const prevTranscriptRef = useRef('');

  // Notification permission state — powers a one-time enablement banner
  // at the top of the chat so the Handler can reach the user when the app
  // is backgrounded.
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const handleEnableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        // Confirmation notification — proves the pipeline works and gives
        // the user immediate feedback that they enabled it correctly.
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification('Handler', {
              body: 'I can reach you now. Stay alert.',
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              tag: 'handler-enabled',
              vibrate: [200, 100, 200],
            } as NotificationOptions);
          } else {
            new Notification('Handler', {
              body: 'I can reach you now. Stay alert.',
              icon: '/icons/icon-192.png',
            });
          }
        } catch {
          // noop — permission was still granted, the confirmation toast is non-critical
        }
      }
    } catch (err) {
      console.warn('[HandlerChat] Notification permission request failed:', err);
    }
  };

  // If opening from outreach with an opening line AND no existing conversation loaded
  useEffect(() => {
    if (initRef.current || isLoading) return;
    initRef.current = true;
    if (openingLine && messages.length === 0) {
      // Don't call startNewConversation — just show the opening line locally
      // The first user reply will create the conversation
    }
  }, [isLoading]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speak new assistant messages via TTS when voice mode is enabled
  useEffect(() => {
    if (!voice.enabled || messages.length === 0) return;
    const lastIndex = messages.length - 1;
    const lastMsg = messages[lastIndex];
    if (lastMsg.role === 'assistant' && lastIndex > lastSpokenIndexRef.current) {
      lastSpokenIndexRef.current = lastIndex;
      voice.speak(lastMsg.content, lastIndex);
    }
  }, [messages, voice.enabled]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [messages]);

  // P12.3: Whisper transcription lands once after stopListening.
  // When it arrives, place it in the input field; if user tapped mic to send,
  // auto-dispatch via the pendingSend ref.
  const pendingSendRef = useRef(false);
  useEffect(() => {
    if (voiceInput.transcript && voiceInput.transcript !== prevTranscriptRef.current) {
      prevTranscriptRef.current = voiceInput.transcript;
      setInput(voiceInput.transcript);
      if (pendingSendRef.current && !isSending) {
        pendingSendRef.current = false;
        sendMessage(voiceInput.transcript);
        setInput('');
      }
    }
  }, [voiceInput.transcript, isSending, sendMessage]);

  const handleMicToggle = () => {
    if (voiceInput.isListening) {
      // Tap to stop & send: transcript will arrive async via Whisper
      pendingSendRef.current = true;
      voiceInput.stopListening();
    } else {
      setInput('');
      prevTranscriptRef.current = '';
      pendingSendRef.current = false;
      voiceInput.startListening();
    }
  };

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    // Stop listening if voice was active
    if (voiceInput.isListening) {
      voiceInput.stopListening();
      prevTranscriptRef.current = '';
    }
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const modeConfig = MODE_COLORS[currentMode] || MODE_COLORS.director;

  return (
    <>
    <RewardFlash />
    {voicePracticeRequest && (
      <VoicePracticeRecorder
        targetPhrase={voicePracticeRequest.targetPhrase}
        targetPitchHz={voicePracticeRequest.targetPitchHz}
        minDurationSeconds={voicePracticeRequest.minDuration}
        onComplete={(result) => {
          setVoicePracticeRequest(null);
          sendMessage(`[Voice practice result: avg pitch ${result.avgPitch.toFixed(0)}Hz, ${result.passed ? 'PASSED' : 'FAILED'}, transcript: "${result.transcript.substring(0, 100)}"]`);
        }}
        onCancel={() => setVoicePracticeRequest(null)}
      />
    )}
    {forcedMantra && (
      <MantraRepetition
        mantra={forcedMantra.mantra}
        repetitions={forcedMantra.repetitions}
        reasonShown={forcedMantra.reason}
        onComplete={() => setForcedMantra(null)}
      />
    )}
    {generatingSession && (
      <div className="fixed inset-0 z-[85] bg-[#0a0a0a]/90 flex items-center justify-center">
        <div className="bg-[#141414] rounded-xl p-6 border border-gray-800/50 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-pink-400" />
          <span className="text-sm text-gray-200">Handler is composing your session…</span>
        </div>
      </div>
    )}
    {generatedSession && (
      <GeneratedSessionPlayer
        sourceId={generatedSession.sourceId}
        audioUrl={generatedSession.audioUrl}
        scriptPreview={generatedSession.scriptText}
        onClose={() => setGeneratedSession(null)}
      />
    )}
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <span className="hidden md:inline font-semibold text-gray-200">
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
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={startNewConversation}
              className="hidden md:inline-flex text-xs px-2 py-1 rounded-lg hover:bg-gray-800 text-gray-400"
            >
              New
            </button>
          )}
          <button
            onClick={() => {
              voice.setEnabled(!voice.enabled);
              if (voice.isPlaying) voice.stop();
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              voice.enabled
                ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                : 'hover:bg-gray-800 text-gray-500'
            }`}
            aria-label={voice.enabled ? 'Disable voice' : 'Enable voice'}
          >
            {voice.enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={() => ambientAudio.setEnabled(!ambientAudio.enabled)}
            title={ambientAudio.enabled ? 'Ambient conditioning audio ON — feminization affirmations play while app is open' : 'Ambient conditioning audio OFF — turn on to let queued affirmations play'}
            className={`hidden md:inline-flex px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              ambientAudio.enabled
                ? 'bg-pink-500/25 text-pink-300 hover:bg-pink-500/35'
                : 'hover:bg-gray-800 text-gray-500 border border-gray-800'
            }`}
            aria-label={ambientAudio.enabled ? 'Disable ambient conditioning' : 'Enable ambient conditioning'}
          >
            {ambientAudio.enabled ? 'AMB ON' : 'AMB'}
          </button>
          <button
            onClick={() => { window.location.hash = '/today'; }}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg text-purple-300 bg-purple-500/20 hover:bg-purple-500/30 transition-colors"
            aria-label="Open Today screen"
            title="Today — directives, protocol, queue"
          >
            Today
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Notification permission prompt — desktop only; Today has its own banner stack */}
      {notifPermission === 'default' && (
        <div className="hidden md:flex bg-purple-900/20 border border-purple-500/30 rounded-xl p-3 m-2 items-center justify-between">
          <span className="text-sm text-purple-300">
            Enable notifications so the Handler can reach you anytime
          </span>
          <button
            onClick={handleEnableNotifications}
            className="ml-3 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors"
          >
            Enable
          </button>
        </div>
      )}

      {/* Identity Fading Indicator — desktop only (Today has pronoun morph) */}
      <div className="hidden md:block">
        <IdentityFadingBar userId={authUser?.id} />
      </div>

      {/* Directive summary bar — one line, routes to /#/today for full UI.
          Shows on every viewport. */}
      <BodyDirectiveChecklist />

      {/* Full Force Feminization Panel — desktop only. On mobile the dashboard lives on /#/today. */}
      <div className="hidden md:block">
        <ForceFeminizationPanel />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading && (
          <div className="text-center text-gray-600 mt-20">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
            <p className="text-sm">Loading conversation...</p>
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="text-center text-gray-600 mt-20">
            <p className="text-lg font-medium">Talk to the Handler.</p>
            <p className="text-sm mt-2">Type anything. She's listening.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} isSpeaking={voice.isPlaying && voice.speakingMessageIndex === i} />
        ))}

        {isSending && (
          <div className="flex items-start gap-2">
            <div className="px-4 py-2 rounded-2xl rounded-tl-sm max-w-[80%] bg-[#1a1a2e]">
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

      {/* Photo verification upload panel */}
      {showPhotoUpload && (
        <div className="px-4 py-3 border-t border-gray-800/50 bg-[#0a0a0a] space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {(['outfit', 'mirror_check', 'pose', 'makeup', 'nails', 'general'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPhotoTaskType(t)}
                className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                  photoTaskType === t
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#141414] text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
            <button
              onClick={() => setShowPhotoUpload(false)}
              className="ml-auto text-xs px-2 py-1 rounded-lg hover:bg-gray-800 text-gray-400"
            >
              Close
            </button>
          </div>
          <PhotoVerificationUpload taskType={photoTaskType} />
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-800/50 bg-[#0a0a0a]">
        {/* P12.3: Listening / transcribing indicator */}
        {voiceInput.isListening && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-xs text-red-400">Recording — tap mic to send</span>
            {voiceInput.currentPitch && (
              <span className="text-xs text-gray-500 ml-auto">{voiceInput.currentPitch}Hz</span>
            )}
          </div>
        )}
        {voiceInput.isTranscribing && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
            <span className="text-xs text-amber-400">Transcribing…</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* Photo verification toggle */}
          <button
            onClick={() => setShowPhotoUpload((v) => !v)}
            disabled={isSending}
            className={`p-3 rounded-xl transition-all ${
              showPhotoUpload
                ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
                : 'bg-[#141414] text-gray-500 hover:text-gray-300'
            }`}
            aria-label="Photo verification"
          >
            <Camera className="w-5 h-5" />
          </button>
          {/* P12.3: Mic button */}
          {voiceInput.isSupported && (
            <button
              onClick={handleMicToggle}
              disabled={isSending}
              className={`p-3 rounded-xl transition-all ${
                voiceInput.isListening
                  ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                  : 'bg-[#141414] text-gray-500 hover:text-gray-300'
              }`}
              aria-label={voiceInput.isListening ? 'Stop listening' : 'Start voice input'}
            >
              {voiceInput.isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={voiceInput.isListening ? 'Speak now...' : ''}
            disabled={isSending}
            className="flex-1 px-4 py-3 rounded-xl border-0 outline-none text-gray-200 placeholder-gray-600 bg-[#141414]"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className={`p-3 rounded-xl transition-all ${
              input.trim() && !isSending
                ? 'bg-purple-600 text-white hover:bg-purple-500'
                : 'bg-[#141414] text-gray-600'
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

function MessageBubble({ message, isSpeaking }: { message: ChatMessage; isSpeaking?: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] ${
        isUser
          ? 'bg-[#2d1b3d] text-gray-100 rounded-br-sm'
          : 'bg-[#1a1a2e] text-gray-200 rounded-bl-sm'
      }`}>
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ letterSpacing: '-0.01em' }}>
          {message.content}
        </p>
        {message.media && message.media.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.media.map((attachment, idx) => (
              <MediaRenderer key={idx} attachment={attachment} />
            ))}
          </div>
        )}
        {isSpeaking && (
          <div className="flex items-center gap-1 mt-1.5">
            <Volume2 className="w-3 h-3 text-purple-400 animate-pulse" />
            <span className="text-[11px] text-purple-400">speaking</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaRenderer({ attachment }: { attachment: MediaAttachment }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (attachment.type === 'image') {
    return (
      <div className="rounded-lg overflow-hidden">
        {!imgError ? (
          <>
            {!imgLoaded && (
              <div className="w-full h-32 bg-gray-800/50 animate-pulse rounded-lg flex items-center justify-center">
                <Image className="w-5 h-5 text-gray-600" />
              </div>
            )}
            <img
              src={attachment.url}
              alt={attachment.caption}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className={`max-w-full max-h-48 rounded-lg object-cover ${imgLoaded ? '' : 'hidden'}`}
            />
          </>
        ) : (
          <div className="w-full h-16 bg-gray-800/30 rounded-lg flex items-center justify-center">
            <span className="text-xs text-gray-500">Image unavailable</span>
          </div>
        )}
        {attachment.caption && (
          <p className="text-[11px] text-gray-500 mt-1">{attachment.caption}</p>
        )}
      </div>
    );
  }

  if (attachment.type === 'audio') {
    const toggleAudio = () => {
      if (!audioRef.current) {
        audioRef.current = new Audio(attachment.url);
        audioRef.current.onended = () => setAudioPlaying(false);
        audioRef.current.onerror = () => setAudioPlaying(false);
      }
      if (audioPlaying) {
        audioRef.current.pause();
        setAudioPlaying(false);
      } else {
        audioRef.current.play().catch(() => setAudioPlaying(false));
        setAudioPlaying(true);
      }
    };

    return (
      <div className="flex items-center gap-2 bg-gray-800/30 rounded-lg px-3 py-2">
        <button
          onClick={toggleAudio}
          className="p-1.5 rounded-full bg-purple-600/30 hover:bg-purple-600/50 transition-colors"
        >
          {audioPlaying ? (
            <Pause className="w-3.5 h-3.5 text-purple-300" />
          ) : (
            <Play className="w-3.5 h-3.5 text-purple-300" />
          )}
        </button>
        <span className="text-xs text-gray-400">{attachment.caption || 'Audio'}</span>
      </div>
    );
  }

  return null;
}
