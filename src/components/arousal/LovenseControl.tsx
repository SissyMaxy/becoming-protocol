import { useState } from 'react';
import {
  Bluetooth,
  BluetoothOff,
  Vibrate,
  Battery,
  Play,
  Square,
  RefreshCw,
  Zap,
  Waves,
  Target,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useLovense } from '../../hooks/useLovense';
import type { LovensePattern } from '../../types/lovense';

interface LovenseControlProps {
  onEdgeRecorded?: (count: number) => void;
  onIntensityChange?: (intensity: number) => void;
  arousalLevel?: number;
  compact?: boolean;
  className?: string;
}

export function LovenseControl({
  onEdgeRecorded,
  onIntensityChange,
  arousalLevel,
  compact = false,
  className = '',
}: LovenseControlProps) {
  const { isBambiMode } = useBambiMode();
  const {
    status,
    toys,
    activeToy,
    error,
    connect,
    disconnect,
    selectToy,
    refreshToys,
    setIntensity,
    stop,
    patterns,
    activePattern,
    playPattern,
    stopPattern,
    activeMode,
    startEdgeTraining,
    recordEdge,
    stopEdgeTraining,
    startTeaseMode,
    stopTeaseMode,
    startDenialTraining,
    stopDenialTraining,
    syncToArousal,
    currentIntensity,
    edgeCount,
    denialPhase,
    denialCycle,
  } = useLovense();

  const [expanded, setExpanded] = useState(!compact);
  const [showPatterns, setShowPatterns] = useState(false);

  const isConnected = status === 'connected';
  const hasToy = activeToy !== null;

  const handleIntensityChange = async (value: number) => {
    await setIntensity(value);
    onIntensityChange?.(value);
  };

  const handleRecordEdge = async () => {
    const count = await recordEdge();
    onEdgeRecorded?.(count);
  };

  const handleSyncArousal = async () => {
    if (arousalLevel !== undefined) {
      await syncToArousal(arousalLevel);
    }
  };

  // Compact connection indicator
  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          isConnected && hasToy
            ? isBambiMode
              ? 'bg-pink-100 text-pink-700'
              : 'bg-protocol-accent/20 text-protocol-accent'
            : isBambiMode
              ? 'bg-gray-100 text-gray-500'
              : 'bg-protocol-surface text-protocol-text-muted'
        } ${className}`}
      >
        {isConnected && hasToy ? (
          <>
            <Vibrate className="w-4 h-4" />
            <span className="text-sm font-medium">
              {activeToy?.nickName || activeToy?.name}
            </span>
            {currentIntensity > 0 && (
              <span className="text-xs opacity-75">{currentIntensity}/20</span>
            )}
          </>
        ) : (
          <>
            <BluetoothOff className="w-4 h-4" />
            <span className="text-sm">No toy</span>
          </>
        )}
        <ChevronDown className="w-4 h-4 ml-1" />
      </button>
    );
  }

  return (
    <div
      className={`rounded-xl overflow-hidden ${
        isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      } ${className}`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between p-3 ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
        }`}
      >
        <div className="flex items-center gap-2">
          {isConnected && hasToy ? (
            <Vibrate
              className={`w-5 h-5 ${
                currentIntensity > 0
                  ? 'text-pink-500 animate-pulse'
                  : isBambiMode
                    ? 'text-pink-400'
                    : 'text-protocol-accent'
              }`}
            />
          ) : (
            <Bluetooth
              className={
                isBambiMode ? 'w-5 h-5 text-gray-400' : 'w-5 h-5 text-protocol-text-muted'
              }
            />
          )}
          <span
            className={`font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {isConnected && hasToy
              ? activeToy?.nickName || activeToy?.name
              : 'Lovense'}
          </span>
          {activeToy && (
            <div className="flex items-center gap-1 text-xs opacity-75">
              <Battery className="w-3 h-3" />
              {activeToy.battery}%
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={refreshToys}
              className={`p-1.5 rounded-full ${
                isBambiMode
                  ? 'hover:bg-pink-100 text-pink-400'
                  : 'hover:bg-protocol-surface-light text-protocol-text-muted'
              }`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {compact && (
            <button
              onClick={() => setExpanded(false)}
              className={`p-1.5 rounded-full ${
                isBambiMode
                  ? 'hover:bg-pink-100 text-pink-400'
                  : 'hover:bg-protocol-surface-light text-protocol-text-muted'
              }`}
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Connection Status */}
        {!isConnected ? (
          <div className="text-center py-4">
            <BluetoothOff
              className={`w-10 h-10 mx-auto mb-3 ${
                isBambiMode ? 'text-gray-300' : 'text-protocol-text-muted'
              }`}
            />
            <p
              className={`text-sm mb-3 ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}
            >
              {error || 'Connect to Lovense'}
            </p>
            <button
              onClick={connect}
              disabled={status === 'connecting'}
              className={`px-4 py-2 rounded-lg font-medium ${
                status === 'connecting'
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              } ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
              }`}
            >
              {status === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
            <p
              className={`text-xs mt-2 ${
                isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
              }`}
            >
              Requires Lovense Connect app
            </p>
          </div>
        ) : !hasToy ? (
          <div className="text-center py-4">
            <Vibrate
              className={`w-10 h-10 mx-auto mb-3 ${
                isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
              }`}
            />
            <p
              className={`text-sm mb-3 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              No toys connected
            </p>
            <button
              onClick={refreshToys}
              className={`px-4 py-2 rounded-lg font-medium ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                  : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
              }`}
            >
              Scan for Toys
            </button>
          </div>
        ) : (
          <>
            {/* Toy Selector (if multiple) */}
            {toys.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {toys.map((toy) => (
                  <button
                    key={toy.id}
                    onClick={() => selectToy(toy.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm ${
                      toy.id === activeToy?.id
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isBambiMode
                          ? 'bg-pink-100 text-pink-600'
                          : 'bg-protocol-surface-light text-protocol-text'
                    }`}
                  >
                    {toy.nickName || toy.name}
                  </button>
                ))}
              </div>
            )}

            {/* Intensity Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-sm font-medium ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                  }`}
                >
                  Intensity
                </span>
                <span
                  className={`text-lg font-bold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {currentIntensity}/20
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                value={currentIntensity}
                onChange={(e) => handleIntensityChange(Number(e.target.value))}
                className={`w-full h-3 rounded-full appearance-none cursor-pointer ${
                  isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface-light'
                }`}
                style={{
                  background: `linear-gradient(to right, ${
                    isBambiMode ? '#ec4899' : '#8b5cf6'
                  } 0%, ${isBambiMode ? '#ec4899' : '#8b5cf6'} ${
                    (currentIntensity / 20) * 100
                  }%, ${isBambiMode ? '#fce7f3' : '#1e1b4b'} ${
                    (currentIntensity / 20) * 100
                  }%, ${isBambiMode ? '#fce7f3' : '#1e1b4b'} 100%)`,
                }}
              />
              <div className="flex justify-between mt-2">
                <button
                  onClick={stop}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                    isBambiMode
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-protocol-surface-light text-protocol-text-muted hover:bg-protocol-border'
                  }`}
                >
                  <Square className="w-3 h-3" />
                  Stop
                </button>
                {arousalLevel !== undefined && (
                  <button
                    onClick={handleSyncArousal}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                      isBambiMode
                        ? 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                        : 'bg-purple-900/30 text-purple-400 hover:bg-purple-900/50'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    Sync ({arousalLevel}/10)
                  </button>
                )}
              </div>
            </div>

            {/* Mode Selection */}
            <div>
              <span
                className={`block text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                }`}
              >
                Mode
              </span>
              <div className="grid grid-cols-2 gap-2">
                <ModeButton
                  icon={<Target className="w-4 h-4" />}
                  label="Edge Training"
                  active={activeMode === 'edge_sync'}
                  onClick={() =>
                    activeMode === 'edge_sync'
                      ? stopEdgeTraining()
                      : startEdgeTraining()
                  }
                  isBambiMode={isBambiMode}
                />
                <ModeButton
                  icon={<Waves className="w-4 h-4" />}
                  label="Tease"
                  active={activeMode === 'tease'}
                  onClick={() =>
                    activeMode === 'tease' ? stopTeaseMode() : startTeaseMode()
                  }
                  isBambiMode={isBambiMode}
                />
                <ModeButton
                  icon={<Zap className="w-4 h-4" />}
                  label="Denial Training"
                  active={activeMode === 'denial_training'}
                  onClick={() =>
                    activeMode === 'denial_training'
                      ? stopDenialTraining()
                      : startDenialTraining()
                  }
                  isBambiMode={isBambiMode}
                />
                <ModeButton
                  icon={<Play className="w-4 h-4" />}
                  label="Pattern"
                  active={activeMode === 'pattern'}
                  onClick={() => setShowPatterns(!showPatterns)}
                  isBambiMode={isBambiMode}
                />
              </div>
            </div>

            {/* Active Mode Info */}
            {activeMode === 'edge_sync' && (
              <div
                className={`p-3 rounded-lg ${
                  isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-sm ${
                      isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                    }`}
                  >
                    Edge Count
                  </span>
                  <span
                    className={`text-2xl font-bold ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    {edgeCount}
                  </span>
                </div>
                <button
                  onClick={handleRecordEdge}
                  className={`w-full py-3 rounded-lg font-medium ${
                    isBambiMode
                      ? 'bg-pink-500 text-white hover:bg-pink-600'
                      : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                  }`}
                >
                  Record Edge
                </button>
              </div>
            )}

            {activeMode === 'denial_training' && denialPhase && (
              <div
                className={`p-3 rounded-lg ${
                  isBambiMode ? 'bg-purple-50' : 'bg-purple-900/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm ${
                      isBambiMode ? 'text-purple-600' : 'text-purple-400'
                    }`}
                  >
                    Cycle {denialCycle}
                  </span>
                  <span
                    className={`text-lg font-bold capitalize ${
                      isBambiMode ? 'text-purple-700' : 'text-purple-300'
                    }`}
                  >
                    {denialPhase}
                  </span>
                </div>
              </div>
            )}

            {/* Pattern Selector */}
            {showPatterns && (
              <div
                className={`p-3 rounded-lg ${
                  isBambiMode ? 'bg-gray-50' : 'bg-protocol-bg'
                }`}
              >
                <div className="grid grid-cols-2 gap-2">
                  {patterns.map((pattern) => (
                    <PatternButton
                      key={pattern.id}
                      pattern={pattern}
                      active={activePattern?.id === pattern.id}
                      onClick={() =>
                        activePattern?.id === pattern.id
                          ? stopPattern()
                          : playPattern(pattern.id, true)
                      }
                      isBambiMode={isBambiMode}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Disconnect */}
            <button
              onClick={disconnect}
              className={`w-full py-2 rounded-lg text-sm ${
                isBambiMode
                  ? 'text-gray-500 hover:bg-gray-100'
                  : 'text-protocol-text-muted hover:bg-protocol-surface-light'
              }`}
            >
              Disconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Mode Button Component
function ModeButton({
  icon,
  label,
  active,
  onClick,
  isBambiMode,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  isBambiMode: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium transition-all ${
        active
          ? isBambiMode
            ? 'bg-pink-500 text-white'
            : 'bg-protocol-accent text-white'
          : isBambiMode
            ? 'bg-pink-50 text-pink-600 hover:bg-pink-100'
            : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Pattern Button Component
function PatternButton({
  pattern,
  active,
  onClick,
  isBambiMode,
}: {
  pattern: LovensePattern;
  active: boolean;
  onClick: () => void;
  isBambiMode: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-lg text-sm text-left transition-all ${
        active
          ? isBambiMode
            ? 'bg-pink-500 text-white'
            : 'bg-protocol-accent text-white'
          : isBambiMode
            ? 'bg-white text-pink-600 border border-pink-200 hover:border-pink-400'
            : 'bg-protocol-surface text-protocol-text border border-protocol-border hover:border-protocol-accent'
      }`}
    >
      <div className="font-medium">{pattern.name}</div>
      <div className="text-xs opacity-75">
        {Math.round(pattern.totalDuration / 1000)}s
      </div>
    </button>
  );
}

// Compact inline indicator for use in other components
export function LovenseIndicator({
  className = '',
}: {
  className?: string;
}) {
  const { isBambiMode } = useBambiMode();
  const { status, activeToy, currentIntensity, connect } = useLovense();

  const isConnected = status === 'connected' && activeToy;

  if (!isConnected) {
    return (
      <button
        onClick={connect}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
          isBambiMode
            ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            : 'bg-protocol-surface text-protocol-text-muted hover:bg-protocol-surface-light'
        } ${className}`}
      >
        <Bluetooth className="w-3 h-3" />
        Connect Toy
      </button>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
        currentIntensity > 0
          ? isBambiMode
            ? 'bg-pink-100 text-pink-700'
            : 'bg-protocol-accent/20 text-protocol-accent'
          : isBambiMode
            ? 'bg-gray-100 text-gray-600'
            : 'bg-protocol-surface text-protocol-text-muted'
      } ${className}`}
    >
      <Vibrate
        className={`w-3 h-3 ${currentIntensity > 0 ? 'animate-pulse' : ''}`}
      />
      <span>{activeToy.nickName || activeToy.name}</span>
      {currentIntensity > 0 && <span className="opacity-75">{currentIntensity}</span>}
    </div>
  );
}
