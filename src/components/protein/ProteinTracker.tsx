/**
 * Protein Tracker — standalone wrapper around ProteinSection.
 * Kept for backward compatibility. The BodyDashboard uses ProteinSection directly.
 */

import { Utensils } from 'lucide-react';
import { useProtein } from '../../hooks/useProtein';
import { ProteinSection } from '../body/ProteinSection';

export function ProteinTracker() {
  const p = useProtein();

  if (p.isLoading) return null;

  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
      <div className="flex items-center gap-2 mb-3">
        <Utensils className="w-4 h-4 text-green-400" />
        <span className="text-sm font-medium text-white/80">Protein Today</span>
      </div>
      <ProteinSection
        today={p.today}
        count={p.count}
        grams={p.grams}
        progressPct={p.progressPct}
        gramsRating={p.gramsRating}
        rating={p.rating}
        visibleSources={p.visibleSources}
        history={p.history}
        supplements={p.supplements}
        groceryNudge={p.groceryNudge}
        handlerMessage={p.handlerMessage}
        toggle={p.toggle}
        toggleSupp={p.toggleSupp}
        adjustGrams={p.adjustGrams}
      />
    </div>
  );
}
