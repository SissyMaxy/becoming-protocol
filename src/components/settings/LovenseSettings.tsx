// Lovense Settings Component
// Central place to manage Lovense toy connection and preferences

import { useState } from 'react';
import {
  Vibrate,
  Wifi,
  WifiOff,
  RefreshCw,
  Zap,
  Target,
  Award,
  TrendingUp,
  Settings,
  ChevronDown,
  ChevronUp,
  Check,
  Smartphone,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useProtocol } from '../../context/ProtocolContext';
import { useLovense } from '../../hooks/useLovense';
import { setLovenseConfig } from '../../lib/lovense';

interface LovenseSettingsProps {
  className?: string;
}

export function LovenseSettings({ className = '' }: LovenseSettingsProps) {
  const { isBambiMode } = useBambiMode();
  const { lovenseRewardsEnabled, setLovenseRewardsEnabled } = useProtocol();
  const lovense = useLovense();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testingBuzz, setTestingBuzz] = useState(false);
  const [hostIp, setHostIp] = useState('127.0.0.1');
  const [hostPort, setHostPort] = useState('20010');

  // Apply config when host/port changes
  const handleApplyConfig = async () => {
    setLovenseConfig({
      localApiHost: hostIp,
      localApiPort: parseInt(hostPort) || 20010,
    });
    // Reconnect with new settings
    lovense.disconnect();
    await lovense.connect();
  };

  // Handle connection
  const handleConnect = async () => {
    if (lovense.cloudApiEnabled) {
      // Cloud mode: get QR code instead of local connection
      await lovense.getCloudQRCode();
    } else {
      // Local mode: connect to Lovense Connect app
      await lovense.connect();
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    lovense.disconnect();
  };

  // Refresh toys list
  const handleRefresh = async () => {
    await lovense.refreshToys();
  };

  // Test buzz
  const handleTestBuzz = async () => {
    if (lovense.status !== 'connected' && !lovense.cloudConnected) return;

    setTestingBuzz(true);
    await lovense.setIntensity(10);
    setTimeout(async () => {
      // Try stop first, then force intensity to 0 as fallback
      await lovense.stop();
      await lovense.setIntensity(0);
      setTestingBuzz(false);
    }, 5000);
  };

  const isConnected = lovense.status === 'connected' || lovense.cloudConnected;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Connection Status Card */}
      <div
        className={`p-4 rounded-xl border ${
          isBambiMode
            ? 'bg-pink-50 border-pink-200'
            : 'bg-protocol-surface border-protocol-border'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                isConnected
                  ? 'bg-green-500/20'
                  : isBambiMode
                    ? 'bg-pink-100'
                    : 'bg-protocol-surface-light'
              }`}
            >
              {isConnected ? (
                <Wifi className="w-5 h-5 text-green-500" />
              ) : (
                <WifiOff
                  className={`w-5 h-5 ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                />
              )}
            </div>
            <div>
              <h3
                className={`font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Lovense Connection
              </h3>
              <p
                className={`text-sm ${
                  isConnected
                    ? 'text-green-600'
                    : isBambiMode
                      ? 'text-pink-500'
                      : 'text-protocol-text-muted'
                }`}
              >
                {lovense.status === 'connecting'
                  ? 'Connecting...'
                  : isConnected
                    ? `Connected to ${lovense.activeToy?.name || 'toy'}`
                    : 'Not connected'}
              </p>
            </div>
          </div>

          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                  : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
              }`}
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={lovense.status === 'connecting'}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
                lovense.status === 'connecting'
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
              }`}
            >
              {lovense.status === 'connecting'
                ? 'Connecting...'
                : lovense.cloudApiEnabled
                  ? 'Get QR Code'
                  : 'Connect'}
            </button>
          )}
        </div>

        {/* Connected Toys */}
        {isConnected && lovense.toys.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p
                className={`text-xs font-medium ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Connected Toys
              </p>
              <button
                onClick={handleRefresh}
                className={`p-1 rounded ${
                  isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface-light'
                }`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                />
              </button>
            </div>
            {lovense.toys.map((toy) => (
              <div
                key={toy.id}
                onClick={() => lovense.selectToy(toy.id)}
                className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-all ${
                  lovense.activeToy?.id === toy.id
                    ? isBambiMode
                      ? 'bg-pink-200 border-2 border-pink-400'
                      : 'bg-protocol-accent/20 border-2 border-protocol-accent'
                    : isBambiMode
                      ? 'bg-pink-100 hover:bg-pink-150'
                      : 'bg-protocol-surface-light hover:bg-protocol-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Vibrate
                    className={`w-4 h-4 ${
                      lovense.activeToy?.id === toy.id
                        ? isBambiMode
                          ? 'text-pink-600'
                          : 'text-protocol-accent'
                        : isBambiMode
                          ? 'text-pink-400'
                          : 'text-protocol-text-muted'
                    }`}
                  />
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {toy.nickName || toy.name}
                    </p>
                    <p
                      className={`text-xs ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    >
                      {toy.type} • {toy.battery}% battery
                    </p>
                  </div>
                </div>
                {lovense.activeToy?.id === toy.id && (
                  <Check
                    className={`w-4 h-4 ${
                      isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* QR Code for connection */}
        {!isConnected && (lovense.qrCodeUrl || lovense.cloudQrUrl) && (
          <div className="mt-4 text-center">
            <p
              className={`text-xs mb-2 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Scan with Lovense Remote app
            </p>
            <img
              src={lovense.cloudQrUrl || lovense.qrCodeUrl || ''}
              alt="Lovense QR Code"
              className="w-32 h-32 mx-auto rounded-lg"
            />
          </div>
        )}


        {/* Connection Help */}
        {!isConnected && (
          <div
            className={`mt-4 p-3 rounded-lg ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
            }`}
          >
            <div className="flex items-start gap-2">
              <Smartphone
                className={`w-4 h-4 mt-0.5 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              />
              <div>
                <p
                  className={`text-xs font-medium ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                  }`}
                >
                  How to connect
                </p>
                {lovense.cloudApiEnabled ? (
                  <ol
                    className={`text-xs mt-1 space-y-1 ${
                      isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                    }`}
                  >
                    <li>1. Open Lovense Remote app on your phone</li>
                    <li>2. Connect your toy in the app</li>
                    <li>3. Click "Get QR Code" above</li>
                    <li>4. Scan the QR code with Lovense Remote</li>
                  </ol>
                ) : (
                  <ol
                    className={`text-xs mt-1 space-y-1 ${
                      isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                    }`}
                  >
                    <li>1. Open Lovense Connect app on your phone</li>
                    <li>2. Connect your toy in the app</li>
                    <li>3. Enable "Game Mode" in app settings</li>
                    <li>4. Click "Connect" above</li>
                  </ol>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Test Button */}
        {isConnected && (
          <button
            onClick={handleTestBuzz}
            disabled={testingBuzz}
            className={`w-full mt-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
              testingBuzz
                ? 'bg-green-500 text-white'
                : isBambiMode
                  ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                  : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
            }`}
          >
            <Vibrate className={`w-4 h-4 ${testingBuzz ? 'animate-pulse' : ''}`} />
            {testingBuzz ? 'Buzzing...' : 'Test Connection'}
          </button>
        )}
      </div>

      {/* Reward Settings */}
      <div
        className={`p-4 rounded-xl border ${
          isBambiMode
            ? 'bg-pink-50 border-pink-200'
            : 'bg-protocol-surface border-protocol-border'
        }`}
      >
        <h3
          className={`font-medium mb-4 ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          Reward Buzzes
        </h3>

        {/* Master Toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                lovenseRewardsEnabled
                  ? isBambiMode
                    ? 'bg-pink-200'
                    : 'bg-protocol-accent/20'
                  : isBambiMode
                    ? 'bg-pink-100'
                    : 'bg-protocol-surface-light'
              }`}
            >
              <Zap
                className={`w-4 h-4 ${
                  lovenseRewardsEnabled
                    ? isBambiMode
                      ? 'text-pink-600'
                      : 'text-protocol-accent'
                    : isBambiMode
                      ? 'text-pink-400'
                      : 'text-protocol-text-muted'
                }`}
              />
            </div>
            <div>
              <p
                className={`text-sm font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Enable Reward Buzzes
              </p>
              <p
                className={`text-xs ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Get buzzes for completing tasks & milestones
              </p>
            </div>
          </div>
          <button
            onClick={() => setLovenseRewardsEnabled(!lovenseRewardsEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              lovenseRewardsEnabled
                ? isBambiMode
                  ? 'bg-pink-500'
                  : 'bg-protocol-accent'
                : isBambiMode
                  ? 'bg-pink-200'
                  : 'bg-protocol-surface-light'
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                lovenseRewardsEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Cloud API Toggle */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                lovense.cloudApiEnabled
                  ? isBambiMode
                    ? 'bg-pink-200'
                    : 'bg-protocol-accent/20'
                  : isBambiMode
                    ? 'bg-pink-100'
                    : 'bg-protocol-surface-light'
              }`}
            >
              <Wifi
                className={`w-4 h-4 ${
                  lovense.cloudApiEnabled
                    ? isBambiMode
                      ? 'text-pink-600'
                      : 'text-protocol-accent'
                    : isBambiMode
                      ? 'text-pink-400'
                      : 'text-protocol-text-muted'
                }`}
              />
            </div>
            <div>
              <p
                className={`text-sm font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Cloud API Mode
              </p>
              <p
                className={`text-xs ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Use cloud patterns & command logging
              </p>
            </div>
          </div>
          <button
            onClick={() => lovense.setCloudApiEnabled(!lovense.cloudApiEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              lovense.cloudApiEnabled
                ? isBambiMode
                  ? 'bg-pink-500'
                  : 'bg-protocol-accent'
                : isBambiMode
                  ? 'bg-pink-200'
                  : 'bg-protocol-surface-light'
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                lovense.cloudApiEnabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Cloud Stats */}
        {lovense.cloudApiEnabled && lovense.hapticStats && (
          <div
            className={`p-3 rounded-lg mb-4 ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
            }`}
          >
            <p
              className={`text-xs font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Your Haptic Stats
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p
                  className={`text-lg font-bold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {lovense.hapticStats.totalCommands}
                </p>
                <p
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  Total Commands
                </p>
              </div>
              <div>
                <p
                  className={`text-lg font-bold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {lovense.hapticStats.totalSessions}
                </p>
                <p
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  Sessions
                </p>
              </div>
              <div>
                <p
                  className={`text-lg font-bold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {lovense.hapticStats.totalEdges}
                </p>
                <p
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  Total Edges
                </p>
              </div>
              <div>
                <p
                  className={`text-lg font-bold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {Math.round(lovense.hapticStats.totalMinutesControlled)}m
                </p>
                <p
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  Time Controlled
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Reward Types */}
        {lovenseRewardsEnabled && (
          <div
            className={`space-y-3 pt-3 border-t ${
              isBambiMode ? 'border-pink-200' : 'border-protocol-border'
            }`}
          >
            <p
              className={`text-xs font-medium ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Active Rewards
            </p>

            <div className="space-y-2">
              <RewardItem
                icon={Target}
                label="Task Completion"
                description="Quick buzz when you complete a task"
                isBambiMode={isBambiMode}
              />
              <RewardItem
                icon={TrendingUp}
                label="Streak Milestones"
                description="Pulsing celebration at 7, 14, 30+ days"
                isBambiMode={isBambiMode}
              />
              <RewardItem
                icon={Award}
                label="Level Up"
                description="Celebration pattern when you level up"
                isBambiMode={isBambiMode}
              />
            </div>
          </div>
        )}
      </div>

      {/* Advanced Settings */}
      <div
        className={`rounded-xl border overflow-hidden ${
          isBambiMode
            ? 'bg-pink-50 border-pink-200'
            : 'bg-protocol-surface border-protocol-border'
        }`}
      >
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`w-full p-4 flex items-center justify-between ${
            isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface-light'
          }`}
        >
          <div className="flex items-center gap-3">
            <Settings
              className={`w-4 h-4 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            />
            <span
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Advanced Settings
            </span>
          </div>
          {showAdvanced ? (
            <ChevronUp
              className={`w-4 h-4 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
          ) : (
            <ChevronDown
              className={`w-4 h-4 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
          )}
        </button>

        {showAdvanced && (
          <div
            className={`p-4 pt-0 space-y-4 ${
              isBambiMode ? 'border-t border-pink-200' : 'border-t border-protocol-border'
            }`}
          >
            <div className="pt-4">
              <label
                className={`block text-xs font-medium mb-2 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                }`}
              >
                Current Intensity: {lovense.currentIntensity}
              </label>
              <input
                type="range"
                min={0}
                max={20}
                value={lovense.currentIntensity}
                onChange={(e) => lovense.setIntensity(parseInt(e.target.value))}
                disabled={!isConnected}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                  isConnected
                    ? isBambiMode
                      ? 'accent-pink-500 bg-pink-200'
                      : 'accent-protocol-accent bg-protocol-surface-light'
                    : 'bg-gray-200 cursor-not-allowed'
                }`}
              />
              <div
                className={`flex justify-between text-xs mt-1 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                <span>Off</span>
                <span>Max</span>
              </div>
            </div>

            {/* Connection Settings */}
            <div
              className={`pt-4 border-t ${
                isBambiMode ? 'border-pink-200' : 'border-protocol-border'
              }`}
            >
              <label
                className={`block text-xs font-medium mb-2 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                }`}
              >
                Lovense Connect Address
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={hostIp}
                  onChange={(e) => setHostIp(e.target.value)}
                  placeholder="IP Address"
                  className={`flex-1 px-3 py-2 rounded-lg text-sm ${
                    isBambiMode
                      ? 'bg-pink-100 border border-pink-200 text-pink-700 placeholder-pink-400'
                      : 'bg-protocol-surface-light border border-protocol-border text-protocol-text placeholder-protocol-text-muted'
                  } focus:outline-none`}
                />
                <input
                  type="text"
                  value={hostPort}
                  onChange={(e) => setHostPort(e.target.value)}
                  placeholder="Port"
                  className={`w-20 px-3 py-2 rounded-lg text-sm ${
                    isBambiMode
                      ? 'bg-pink-100 border border-pink-200 text-pink-700 placeholder-pink-400'
                      : 'bg-protocol-surface-light border border-protocol-border text-protocol-text placeholder-protocol-text-muted'
                  } focus:outline-none`}
                />
              </div>
              <button
                onClick={handleApplyConfig}
                className={`w-full py-2 rounded-lg text-sm font-medium ${
                  isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                }`}
              >
                Apply & Reconnect
              </button>
              <p
                className={`text-xs mt-2 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Default: 127.0.0.1:20010 (localhost)
              </p>
            </div>

            {lovense.error && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  isBambiMode
                    ? 'bg-red-50 text-red-600 border border-red-200'
                    : 'bg-red-900/20 text-red-400 border border-red-900/30'
                }`}
              >
                {lovense.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper component for reward items
function RewardItem({
  icon: Icon,
  label,
  description,
  isBambiMode,
}: {
  icon: typeof Target;
  label: string;
  description: string;
  isBambiMode: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg ${
        isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
      }`}
    >
      <Icon
        className={`w-4 h-4 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`}
      />
      <div>
        <p
          className={`text-sm font-medium ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          {label}
        </p>
        <p
          className={`text-xs ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
