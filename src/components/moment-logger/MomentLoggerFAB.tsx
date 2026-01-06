// Moment Logger FAB - Floating Action Button
// Always visible (except during sessions), opens quick logger modal

import { Sparkles } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { MomentLoggerModal } from './MomentLoggerModal';
import { useMomentLogger } from '../../hooks/useMomentLogger';

export function MomentLoggerFAB() {
  const { isBambiMode } = useBambiMode();
  const momentLogger = useMomentLogger();

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={momentLogger.openModal}
        className={`fixed bottom-24 right-4 z-[45] w-14 h-14 rounded-full shadow-lg
                    flex items-center justify-center transition-all duration-200
                    hover:scale-110 active:scale-95 ${
          isBambiMode
            ? 'bg-gradient-to-br from-pink-500 to-fuchsia-600 shadow-pink-500/30'
            : 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/30'
        }`}
        aria-label="Log a moment"
      >
        <Sparkles className="w-6 h-6 text-white" />
      </button>

      {/* Modal */}
      <MomentLoggerModal
        isOpen={momentLogger.isModalOpen}
        onClose={momentLogger.closeModal}
        momentLogger={momentLogger}
      />
    </>
  );
}
