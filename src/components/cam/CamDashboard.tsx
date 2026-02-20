/**
 * CamDashboard — Top-level cam session page
 * Routes between idle/launcher, live view, and summary based on session phase
 */

import { useState } from 'react';
import { ArrowLeft, Camera, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useCamSession } from '../../hooks/useCamSession';
import { CamLauncher } from './CamLauncher';
import { CamLiveView } from './CamLiveView';
import { CamSummary } from './CamSummary';
import { createCamSession } from '../../lib/content/cam-engine';
import { useAuth } from '../../context/AuthContext';
import type { CamPrescription } from '../../types/cam';

interface CamDashboardProps {
  onBack: () => void;
}

export function CamDashboard({ onBack }: CamDashboardProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const cam = useCamSession();
  const [isCreating, setIsCreating] = useState(false);

  // Quick-create a session if none exists
  const handleQuickCreate = async () => {
    if (!user?.id) return;
    setIsCreating(true);
    try {
      const defaultPrescription: CamPrescription = {
        minimumDuration: 30,
        platform: 'fansly',
        roomType: 'public',
        requiredActivities: ['greet_fans', 'feminine_voice'],
        allowedActivities: ['chat', 'device_control', 'voice', 'edge', 'tease'],
        voiceRequired: true,
        denialEnforced: true,
        handlerControlled: true,
        edgingRequired: true,
        isConsequence: false,
      };
      const session = await createCamSession(user.id, defaultPrescription);
      if (session) {
        await cam.startPreparation(session.id);
      }
    } catch (err) {
      console.error('Failed to create cam session:', err);
    } finally {
      setIsCreating(false);
    }
  };

  // Phase-based rendering
  if (cam.phase === 'summary' && cam.summary) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className={`flex items-center gap-1.5 text-sm ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          } hover:opacity-80`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <CamSummary summary={cam.summary} onDismiss={onBack} />
      </div>
    );
  }

  if (cam.phase === 'live' && cam.session) {
    return (
      <CamLiveView
        session={cam.session}
        elapsedSeconds={cam.elapsedSeconds}
        tipTotal={cam.tipTotal}
        edgeCount={cam.edgeCount}
        tipGoals={cam.tipGoals}
        unacknowledgedPrompts={cam.unacknowledgedPrompts}
        latestPrompt={cam.latestPrompt}
        announcements={cam.announcements}
        onRecordTip={cam.recordTip}
        onAckPrompt={cam.ackPrompt}
        onRecordEdge={cam.recordEdge}
        onMarkHighlight={cam.markHighlight}
        onEndSession={cam.endSession}
        onDismissAnnouncement={cam.dismissAnnouncement}
        isEnding={cam.isLoading}
      />
    );
  }

  if ((cam.phase === 'preparing' || cam.phase === 'ending') && cam.session) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className={`flex items-center gap-1.5 text-sm ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          } hover:opacity-80`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <CamLauncher
          session={cam.session}
          onStartPrep={() => cam.startPreparation(cam.session!.id)}
          onGoLive={cam.goLive}
          isPreparing={cam.isLoading}
          isGoingLive={cam.isLoading}
        />
      </div>
    );
  }

  // Idle — no active session
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className={`flex items-center gap-1.5 text-sm ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        } hover:opacity-80`}
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className={`rounded-2xl p-8 text-center ${
        isBambiMode
          ? 'bg-white border-2 border-pink-200'
          : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <Camera className={`w-12 h-12 mx-auto mb-4 ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`} />
        <h2 className={`text-xl font-bold mb-2 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          Cam Session
        </h2>
        <p className={`text-sm mb-6 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          Live session dashboard with tip tracking, Handler prompts, and edge management.
          Self-hosted — runs alongside your streaming platform.
        </p>

        {cam.error && (
          <p className="text-red-500 text-sm mb-4">{cam.error}</p>
        )}

        <button
          onClick={handleQuickCreate}
          disabled={isCreating}
          className={`px-6 py-3 rounded-xl font-semibold text-white transition-colors ${
            isBambiMode
              ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500 hover:from-pink-600 hover:to-fuchsia-600'
              : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
          }`}
        >
          {isCreating ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            'Start New Session'
          )}
        </button>
      </div>
    </div>
  );
}
