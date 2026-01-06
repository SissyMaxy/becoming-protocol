// SessionLauncher.tsx
// Menu to select and launch different session types

import { useState } from 'react';
import {
  Target,
  Moon,
  Waves,
  Flame,
  Sparkles,
  Clock,
  Zap,
  X,
  Vibrate,
  AlertCircle,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useLovense } from '../../hooks/useLovense';
import { EdgeSession } from './EdgeSession';
import { GooningSession } from './GooningSession';
import { EdgeSessionEntryFlow, type EdgeSessionConfig } from './EdgeSessionEntryFlow';
import { EdgeSessionCore } from './EdgeSessionCore';
import { AuctionModal, generateAuctionBid } from './AuctionModal';
import { SessionCompletionFlow } from './SessionCompletionFlow';
import type { AuctionBid, SessionSummary } from '../../types/edge-session';
import type { UserAnchor } from '../../types/rewards';

type SessionType = 'edge' | 'goon' | 'denial' | 'tease' | 'new_edge' | null;

interface SessionLauncherProps {
  className?: string;
}

interface SessionCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  duration: string;
  intensity: 'Low' | 'Medium' | 'High' | 'Variable';
  color: string;
  onClick: () => void;
  isBambiMode: boolean;
  disabled?: boolean;
}

function SessionCard({
  title,
  description,
  icon,
  duration,
  intensity,
  color,
  onClick,
  isBambiMode,
  disabled,
}: SessionCardProps) {
  const intensityColors = {
    Low: 'text-green-500',
    Medium: 'text-yellow-500',
    High: 'text-red-500',
    Variable: 'text-purple-500',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full p-4 rounded-xl text-left transition-all ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:scale-[1.02] active:scale-[0.98]'
      } ${
        isBambiMode
          ? 'bg-white border border-pink-200 hover:border-pink-400'
          : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`p-3 rounded-lg ${color}`}
        >
          {icon}
        </div>
        <div className="flex-1">
          <h3
            className={`font-bold text-lg ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {title}
          </h3>
          <p
            className={`text-sm mt-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {description}
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs">
            <div
              className={`flex items-center gap-1 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{duration}</span>
            </div>
            <div className={`flex items-center gap-1 ${intensityColors[intensity]}`}>
              <Zap className="w-3 h-3" />
              <span>{intensity}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// Mock anchors for testing - replace with real data from context
const MOCK_ANCHORS: UserAnchor[] = [
  { id: '1', userId: '', anchorType: 'scent', name: 'Perfume', isActive: true, timesUsed: 5, createdAt: '', updatedAt: '' },
  { id: '2', userId: '', anchorType: 'underwear', name: 'Pink Panties', isActive: true, timesUsed: 8, createdAt: '', updatedAt: '' },
  { id: '3', userId: '', anchorType: 'jewelry', name: 'Bracelet', isActive: true, timesUsed: 3, createdAt: '', updatedAt: '' },
];

export function SessionLauncher({ className = '' }: SessionLauncherProps) {
  const { isBambiMode } = useBambiMode();
  const lovense = useLovense();
  const [activeSession, setActiveSession] = useState<SessionType>(null);
  const [showSessionComplete, setShowSessionComplete] = useState(false);
  const [lastSessionStats, setLastSessionStats] = useState<any>(null);

  // New edge session flow state
  const [showEntryFlow, setShowEntryFlow] = useState(false);
  const [sessionConfig, setSessionConfig] = useState<EdgeSessionConfig | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [currentBid, setCurrentBid] = useState<AuctionBid | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);

  const isConnected = lovense.status === 'connected' || lovense.cloudConnected;

  const handleSessionComplete = (stats: any) => {
    setLastSessionStats(stats);
    setShowSessionComplete(true);
    setActiveSession(null);
  };

  const closeSession = () => {
    setActiveSession(null);
  };

  // New edge session handlers
  const handleStartNewEdgeSession = (config: EdgeSessionConfig) => {
    setSessionConfig(config);
    setShowEntryFlow(false);
    setSessionActive(true);
  };

  const handleEdge = (edgeNumber: number) => {
    console.log('Edge recorded:', edgeNumber);
  };

  const handlePhaseChange = (phase: string) => {
    console.log('Phase changed:', phase);
  };

  const handleAuctionTrigger = (edgeNumber: number) => {
    if (sessionConfig?.auctionEnabled) {
      const bid = generateAuctionBid(edgeNumber);
      setCurrentBid(bid);
    }
  };

  const handleAcceptBid = (bidId: string) => {
    console.log('Bid accepted:', bidId);
    setCurrentBid(null);
  };

  const handleRejectBid = (bidId: string) => {
    console.log('Bid rejected:', bidId);
    setCurrentBid(null);
  };

  const handleExpireBid = (bidId: string) => {
    console.log('Bid expired:', bidId);
    setCurrentBid(null);
  };

  const handleSessionEnd = (summary: SessionSummary) => {
    setSessionActive(false);
    setSessionSummary(summary);
    setShowCompletion(true);
  };

  const handleCompletionDone = () => {
    setShowCompletion(false);
    setSessionSummary(null);
    setSessionConfig(null);
  };

  // Render new edge session flow
  if (showEntryFlow) {
    return (
      <EdgeSessionEntryFlow
        anchors={MOCK_ANCHORS}
        canAccessReward={true}
        onStart={handleStartNewEdgeSession}
        onClose={() => setShowEntryFlow(false)}
      />
    );
  }

  if (sessionActive && sessionConfig) {
    return (
      <>
        <EdgeSessionCore
          config={sessionConfig}
          onEdge={handleEdge}
          onPhaseChange={handlePhaseChange}
          onAuctionTrigger={handleAuctionTrigger}
          onEnd={handleSessionEnd}
          onPause={() => console.log('Paused')}
          onResume={() => console.log('Resumed')}
        />
        {currentBid && (
          <AuctionModal
            bid={currentBid}
            edgeNumber={currentBid.edgeNumber}
            timeRemaining={30}
            onAccept={handleAcceptBid}
            onReject={handleRejectBid}
            onExpire={handleExpireBid}
          />
        )}
      </>
    );
  }

  if (showCompletion && sessionSummary) {
    return (
      <SessionCompletionFlow
        summary={sessionSummary}
        anchors={MOCK_ANCHORS}
        onComplete={handleCompletionDone}
        onClose={handleCompletionDone}
      />
    );
  }

  // Render active session (legacy)
  if (activeSession === 'edge') {
    return (
      <EdgeSession
        onClose={closeSession}
        onSessionComplete={handleSessionComplete}
      />
    );
  }

  if (activeSession === 'goon') {
    return (
      <GooningSession
        onClose={closeSession}
        onSessionComplete={handleSessionComplete}
      />
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className={`text-xl font-bold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          Sessions
        </h2>
        {!isConnected && (
          <div
            className={`flex items-center gap-2 text-sm ${
              isBambiMode ? 'text-orange-500' : 'text-orange-400'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>Connect toy for full experience</span>
          </div>
        )}
      </div>

      {/* Connection Status */}
      {isConnected && lovense.activeToy && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg ${
            isBambiMode ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-400'
          }`}
        >
          <Vibrate className="w-4 h-4" />
          <span className="text-sm">
            Connected: {lovense.activeToy.name} ({lovense.activeToy.battery}%)
          </span>
        </div>
      )}

      {/* Cloud mode status - show when waiting for connection */}
      {lovense.cloudApiEnabled && !isConnected && (
        <div
          className={`p-3 rounded-lg ${
            isBambiMode ? 'bg-yellow-50 text-yellow-700' : 'bg-yellow-900/20 text-yellow-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm">
              {lovense.cloudQrUrl ? 'Waiting for connection...' : 'Cloud mode enabled'}
            </span>
            <button
              onClick={() => lovense.checkCloudConnection()}
              className={`text-xs px-2 py-1 rounded ${
                isBambiMode ? 'bg-yellow-200 hover:bg-yellow-300' : 'bg-yellow-800/50 hover:bg-yellow-700/50'
              }`}
            >
              Refresh
            </button>
          </div>
          <p className="text-xs mt-1 opacity-70">
            Scan QR code in Lovense Remote app to connect
          </p>
        </div>
      )}

      {/* Session Cards */}
      <div className="space-y-3">
        {/* NEW Edge Session with full flow */}
        <SessionCard
          title="Edge Session (New)"
          description="Full session flow with anchors, auctions, patterns, and commitments."
          icon={<Sparkles className="w-6 h-6 text-white" />}
          duration="15-60 min"
          intensity="Variable"
          color="bg-gradient-to-br from-purple-500 to-pink-500"
          onClick={() => setShowEntryFlow(true)}
          isBambiMode={isBambiMode}
        />

        <SessionCard
          title="Edge Training (Classic)"
          description="Build up, edge, and record. Each edge increases intensity. Train your control."
          icon={<Target className="w-6 h-6 text-white" />}
          duration="15-30 min"
          intensity="Variable"
          color="bg-gradient-to-br from-pink-500 to-red-500"
          onClick={() => setActiveSession('edge')}
          isBambiMode={isBambiMode}
        />

        <SessionCard
          title="Goon Session"
          description="Hypnotic, immersive experience. Automatic cycles of building, denial, and reward."
          icon={<Moon className="w-6 h-6 text-white" />}
          duration="20-45 min"
          intensity="High"
          color="bg-gradient-to-br from-purple-500 to-indigo-500"
          onClick={() => setActiveSession('goon')}
          isBambiMode={isBambiMode}
        />

        <SessionCard
          title="Denial Training"
          description="Multiple build-up and denial cycles. Learn to stay on the edge without going over."
          icon={<Flame className="w-6 h-6 text-white" />}
          duration="20-40 min"
          intensity="High"
          color="bg-gradient-to-br from-orange-500 to-red-600"
          onClick={() => lovense.startDenialTraining()}
          isBambiMode={isBambiMode}
          disabled={!isConnected}
        />

        <SessionCard
          title="Tease Mode"
          description="Random pulses and patterns. Unpredictable stimulation to keep you guessing."
          icon={<Waves className="w-6 h-6 text-white" />}
          duration="10-30 min"
          intensity="Variable"
          color="bg-gradient-to-br from-cyan-500 to-blue-500"
          onClick={() => lovense.startTeaseMode()}
          isBambiMode={isBambiMode}
          disabled={!isConnected}
        />
      </div>

      {/* Session Complete Modal */}
      {showSessionComplete && lastSessionStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className={`w-full max-w-md rounded-2xl p-6 ${
              isBambiMode ? 'bg-white' : 'bg-protocol-surface'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className={`text-xl font-bold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Session Complete
              </h3>
              <button
                onClick={() => setShowSessionComplete(false)}
                className={`p-2 rounded-full ${
                  isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface-light'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-center mb-6">
              <Sparkles
                className={`w-16 h-16 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <StatBox
                label="Duration"
                value={`${Math.floor(lastSessionStats.duration / 60)}:${(lastSessionStats.duration % 60).toString().padStart(2, '0')}`}
                isBambiMode={isBambiMode}
              />
              <StatBox
                label="Peak Intensity"
                value={`${lastSessionStats.peakIntensity}/20`}
                isBambiMode={isBambiMode}
              />
              {lastSessionStats.edgeCount !== undefined && (
                <StatBox
                  label="Edges"
                  value={lastSessionStats.edgeCount}
                  isBambiMode={isBambiMode}
                />
              )}
              {lastSessionStats.cyclesCompleted !== undefined && (
                <StatBox
                  label="Cycles"
                  value={lastSessionStats.cyclesCompleted}
                  isBambiMode={isBambiMode}
                />
              )}
              {lastSessionStats.denials !== undefined && (
                <StatBox
                  label="Denials"
                  value={lastSessionStats.denials}
                  isBambiMode={isBambiMode}
                />
              )}
              {lastSessionStats.averageIntensity !== undefined && (
                <StatBox
                  label="Avg Intensity"
                  value={Math.round(lastSessionStats.averageIntensity)}
                  isBambiMode={isBambiMode}
                />
              )}
            </div>

            <button
              onClick={() => setShowSessionComplete(false)}
              className={`w-full py-3 rounded-xl font-medium ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
              }`}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  isBambiMode,
}: {
  label: string;
  value: string | number;
  isBambiMode: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg text-center ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
      }`}
    >
      <div
        className={`text-2xl font-bold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        {value}
      </div>
      <div
        className={`text-xs ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}
      >
        {label}
      </div>
    </div>
  );
}

export { EdgeSession, GooningSession };
