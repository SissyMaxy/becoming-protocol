/**
 * Appearance Settings
 *
 * Phase H1: Theme display, display options, preview.
 * BambiMode is auto-detected from preferred name — shown as read-only indicator.
 */

import { Moon, Sparkles, Type, Palette } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

export function AppearanceSettings() {
  const { isBambiMode } = useBambiMode();

  return (
    <div className="space-y-6">
      {/* Current Theme */}
      <div>
        <h3 className={`text-sm font-medium mb-3 ${
          isBambiMode ? 'text-pink-700' : 'text-gray-300'
        }`}>
          <Palette className="w-4 h-4 inline mr-1.5" />
          Active Theme
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Protocol Mode */}
          <div className={`p-4 rounded-xl border text-center transition-all ${
            !isBambiMode
              ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30'
              : 'border-gray-700 bg-protocol-surface opacity-50'
          }`}>
            <Moon className={`w-6 h-6 mx-auto mb-2 ${!isBambiMode ? 'text-purple-400' : 'text-gray-500'}`} />
            <div className={`text-sm font-medium ${!isBambiMode ? 'text-purple-300' : 'text-gray-400'}`}>
              Protocol
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              Dark, focused
            </div>
            {!isBambiMode && (
              <div className="text-[10px] mt-2 text-purple-400 font-medium">Active</div>
            )}
          </div>

          {/* Bambi Mode */}
          <div className={`p-4 rounded-xl border text-center transition-all ${
            isBambiMode
              ? 'border-pink-400 bg-pink-50 ring-2 ring-pink-300'
              : 'border-gray-700 bg-protocol-surface opacity-50'
          }`}>
            <Sparkles className={`w-6 h-6 mx-auto mb-2 ${isBambiMode ? 'text-pink-500' : 'text-gray-500'}`} />
            <div className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-gray-400'}`}>
              Bambi
            </div>
            <div className={`text-[10px] mt-1 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
              Soft, playful
            </div>
            {isBambiMode && (
              <div className="text-[10px] mt-2 text-pink-500 font-medium">Active</div>
            )}
          </div>
        </div>

        <p className={`text-xs mt-2 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
          Theme is auto-detected from your preferred name in profile settings.
        </p>
      </div>

      {/* Display Options */}
      <div>
        <h3 className={`text-sm font-medium mb-3 ${
          isBambiMode ? 'text-pink-700' : 'text-gray-300'
        }`}>
          <Type className="w-4 h-4 inline mr-1.5" />
          Display
        </h3>

        <div className={`rounded-lg p-4 space-y-4 ${
          isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
        }`}>
          <ToggleOption
            label="Celebration effects"
            description="Hearts and sparkles on achievements"
            checked={isBambiMode}
            isBambiMode={isBambiMode}
          />

          <ToggleOption
            label="Compact cards"
            description="Smaller task and goal cards"
            checked={false}
            isBambiMode={isBambiMode}
          />

          <ToggleOption
            label="Streak badges"
            description="Show streak count on nav bar"
            checked={true}
            isBambiMode={isBambiMode}
          />
        </div>
      </div>

      {/* Preview */}
      <div>
        <h3 className={`text-sm font-medium mb-3 ${
          isBambiMode ? 'text-pink-700' : 'text-gray-300'
        }`}>
          Preview
        </h3>
        <div className={`rounded-lg p-4 ${
          isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
        }`}>
          <div className={`text-sm font-medium mb-1 ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>
            Sample Task Card
          </div>
          <div className={`text-xs mb-2 ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
            Practice voice exercises for 10 minutes
          </div>
          <div className={`h-1.5 rounded-full overflow-hidden ${isBambiMode ? 'bg-pink-200' : 'bg-white/10'}`}>
            <div
              className="h-full rounded-full"
              style={{
                width: '60%',
                backgroundColor: isBambiMode ? '#ec4899' : '#a855f7',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleOption({ label, description, checked, isBambiMode }: {
  label: string;
  description: string;
  checked: boolean;
  isBambiMode: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className={`text-sm ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>{label}</div>
        <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>{description}</div>
      </div>
      <div className={`w-10 h-6 rounded-full relative transition-colors opacity-50 ${
        checked
          ? isBambiMode ? 'bg-pink-500' : 'bg-purple-500'
          : isBambiMode ? 'bg-pink-200' : 'bg-gray-700'
      }`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`} />
      </div>
    </div>
  );
}
