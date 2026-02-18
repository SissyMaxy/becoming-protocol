// Resistance Tab
// Displays resistance patterns and bypass strategies

import { useState, useEffect } from 'react';
import { Shield, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import type { ResistancePattern } from '../../../types/handler';
import { DataCard } from '../shared/DataCard';
import { EffectivenessBar } from '../shared/EffectivenessBar';

export function ResistanceTab() {
  const { user } = useAuth();
  const [patterns, setPatterns] = useState<ResistancePattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPatterns() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('resistance_patterns')
          .select('*')
          .eq('user_id', user.id)
          .order('last_observed', { ascending: false, nullsFirst: false });

        if (error) throw error;

        const mapped: ResistancePattern[] = (data || []).map(p => ({
          id: p.id,
          userId: p.user_id,
          patternType: p.pattern_type,
          description: p.description || undefined,
          conditions: p.conditions || undefined,
          frequency: p.frequency || undefined,
          intensity: p.intensity || undefined,
          bypassStrategiesTested: p.bypass_strategies_tested || [],
          effectiveBypasses: p.effective_bypasses || [],
          lastObserved: p.last_observed || undefined,
          createdAt: p.created_at,
        }));

        setPatterns(mapped);
      } catch (err) {
        console.error('Failed to load resistance patterns:', err);
        setError('Failed to load resistance patterns');
      } finally {
        setIsLoading(false);
      }
    }

    loadPatterns();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-protocol-accent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (patterns.length === 0) {
    return (
      <div className="text-center py-12">
        <Shield className="w-12 h-12 mx-auto text-protocol-text-muted mb-3" />
        <p className="text-protocol-text-muted">No resistance patterns recorded</p>
        <p className="text-xs text-protocol-text-muted mt-1">
          Patterns are detected when user avoids or resists interventions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {patterns.map(pattern => {
        return (
          <DataCard
            key={pattern.id}
            title={pattern.patternType.replace(/_/g, ' ')}
            subtitle={pattern.description}
            icon={Shield}
            iconColor="#f97316"
            expandable
            defaultExpanded={false}
          >
            <div className="space-y-3">
              {/* Intensity */}
              {pattern.intensity !== undefined && (
                <EffectivenessBar
                  score={pattern.intensity / 10}
                  label="Resistance Intensity"
                  colorScheme="danger"
                />
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-protocol-surface-light">
                  <span className="text-protocol-text-muted">Frequency:</span>
                  <p className="text-protocol-text font-medium">{pattern.frequency || 'Unknown'}</p>
                </div>
                <div className="p-2 rounded bg-protocol-surface-light">
                  <span className="text-protocol-text-muted">Last Observed:</span>
                  <p className="text-protocol-text font-medium">
                    {pattern.lastObserved
                      ? new Date(pattern.lastObserved).toLocaleDateString()
                      : 'Never'}
                  </p>
                </div>
              </div>

              {/* Bypass Strategies */}
              {pattern.bypassStrategiesTested.length > 0 && (
                <div>
                  <p className="text-xs text-protocol-text-muted mb-2">
                    Bypass Strategies ({pattern.effectiveBypasses.length}/{pattern.bypassStrategiesTested.length} effective)
                  </p>
                  <div className="space-y-1">
                    {pattern.bypassStrategiesTested.map((strategy, idx) => {
                      const isEffective = pattern.effectiveBypasses.includes(strategy);
                      return (
                        <div
                          key={idx}
                          className={`p-2 rounded flex items-center gap-2 ${
                            isEffective
                              ? 'bg-green-500/10 border border-green-500/20'
                              : 'bg-red-500/10 border border-red-500/20'
                          }`}
                        >
                          {isEffective ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                          )}
                          <span className={`text-xs ${isEffective ? 'text-green-400' : 'text-red-400'}`}>
                            {strategy}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Conditions */}
              {pattern.conditions && Object.keys(pattern.conditions).length > 0 && (
                <div>
                  <p className="text-xs text-protocol-text-muted mb-1">Trigger Conditions:</p>
                  <div className="p-2 rounded bg-protocol-surface-light">
                    <pre className="text-[10px] text-protocol-text overflow-x-auto">
                      {JSON.stringify(pattern.conditions, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </DataCard>
        );
      })}
    </div>
  );
}
