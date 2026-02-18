// Experiments Tab
// Displays A/B tests and experiments for handler strategies

import { useState, useEffect } from 'react';
import { FlaskConical, Loader2, Play, Pause, CheckCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import { DataCard } from '../shared/DataCard';
import { StatusBadge } from '../shared/StatusBadge';
import { EffectivenessBar } from '../shared/EffectivenessBar';

interface HandlerExperiment {
  id: string;
  userId: string;
  experimentName: string;
  hypothesis?: string;
  variantA: Record<string, unknown>;
  variantB: Record<string, unknown>;
  currentVariant?: 'a' | 'b';
  metricName: string;
  variantAResults: number[];
  variantBResults: number[];
  status: 'running' | 'paused' | 'completed' | 'abandoned';
  startDate: string;
  endDate?: string;
  winner?: 'a' | 'b' | 'inconclusive';
  statisticalSignificance?: number;
  conclusion?: string;
}

export function ExperimentsTab() {
  const { user } = useAuth();
  const [experiments, setExperiments] = useState<HandlerExperiment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadExperiments() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('handler_experiments')
          .select('*')
          .eq('user_id', user.id)
          .order('start_date', { ascending: false });

        if (error) throw error;

        const mapped: HandlerExperiment[] = (data || []).map(e => ({
          id: e.id,
          userId: e.user_id,
          experimentName: e.experiment_name,
          hypothesis: e.hypothesis || undefined,
          variantA: e.variant_a || {},
          variantB: e.variant_b || {},
          currentVariant: e.current_variant || undefined,
          metricName: e.metric_name,
          variantAResults: e.variant_a_results || [],
          variantBResults: e.variant_b_results || [],
          status: e.status,
          startDate: e.start_date,
          endDate: e.end_date || undefined,
          winner: e.winner || undefined,
          statisticalSignificance: e.statistical_significance || undefined,
          conclusion: e.conclusion || undefined,
        }));

        setExperiments(mapped);
      } catch (err) {
        console.error('Failed to load experiments:', err);
        setError('Failed to load experiments');
      } finally {
        setIsLoading(false);
      }
    }

    loadExperiments();
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

  // Group by status
  const running = experiments.filter(e => e.status === 'running');
  const completed = experiments.filter(e => e.status === 'completed');
  const other = experiments.filter(e => e.status !== 'running' && e.status !== 'completed');

  const calculateMean = (values: number[]) =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  return (
    <div className="space-y-6">
      {/* Running Experiments */}
      <section>
        <h3 className="text-sm font-medium text-protocol-text mb-3 flex items-center gap-2">
          <Play className="w-4 h-4 text-green-400" />
          Running ({running.length})
        </h3>

        {running.length === 0 ? (
          <div className="p-4 rounded-lg bg-protocol-surface border border-protocol-border text-center">
            <FlaskConical className="w-8 h-8 mx-auto text-protocol-text-muted mb-2" />
            <p className="text-sm text-protocol-text-muted">No experiments running</p>
          </div>
        ) : (
          <div className="space-y-2">
            {running.map(exp => {
              const meanA = calculateMean(exp.variantAResults);
              const meanB = calculateMean(exp.variantBResults);
              const leading = meanA > meanB ? 'a' : meanB > meanA ? 'b' : null;

              return (
                <DataCard
                  key={exp.id}
                  title={exp.experimentName}
                  subtitle={exp.hypothesis}
                  icon={FlaskConical}
                  iconColor="#22c55e"
                  badge={<StatusBadge status="running" />}
                  expandable
                  defaultExpanded
                >
                  <div className="space-y-3">
                    {/* Metric */}
                    <div className="text-xs">
                      <span className="text-protocol-text-muted">Metric: </span>
                      <span className="text-protocol-text font-medium">{exp.metricName}</span>
                    </div>

                    {/* Variant Comparison */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className={`p-3 rounded ${leading === 'a' ? 'bg-green-500/10 border border-green-500/20' : 'bg-protocol-surface-light'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-protocol-text">Variant A</span>
                          {exp.currentVariant === 'a' && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-lg font-bold text-protocol-text">
                          {meanA.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-protocol-text-muted">
                          n={exp.variantAResults.length}
                        </p>
                      </div>
                      <div className={`p-3 rounded ${leading === 'b' ? 'bg-green-500/10 border border-green-500/20' : 'bg-protocol-surface-light'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-protocol-text">Variant B</span>
                          {exp.currentVariant === 'b' && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-lg font-bold text-protocol-text">
                          {meanB.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-protocol-text-muted">
                          n={exp.variantBResults.length}
                        </p>
                      </div>
                    </div>

                    {/* Started */}
                    <div className="text-xs text-protocol-text-muted">
                      Started: {new Date(exp.startDate).toLocaleDateString()}
                    </div>
                  </div>
                </DataCard>
              );
            })}
          </div>
        )}
      </section>

      {/* Completed Experiments */}
      {completed.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-protocol-text mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-blue-400" />
            Completed ({completed.length})
          </h3>

          <div className="space-y-2">
            {completed.map(exp => (
              <DataCard
                key={exp.id}
                title={exp.experimentName}
                subtitle={exp.conclusion || exp.hypothesis}
                icon={FlaskConical}
                iconColor="#3b82f6"
                badge={
                  <StatusBadge
                    status={
                      exp.winner === 'a' ? 'A wins' :
                      exp.winner === 'b' ? 'B wins' :
                      'inconclusive'
                    }
                  />
                }
                expandable
                defaultExpanded={false}
              >
                <div className="space-y-3">
                  {/* Winner Stats */}
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className={`p-2 rounded ${exp.winner === 'a' ? 'bg-green-500/20' : 'bg-protocol-surface-light'}`}>
                      <p className="text-xs text-protocol-text-muted">Variant A</p>
                      <p className="text-lg font-bold text-protocol-text">
                        {calculateMean(exp.variantAResults).toFixed(2)}
                      </p>
                    </div>
                    <div className={`p-2 rounded ${exp.winner === 'b' ? 'bg-green-500/20' : 'bg-protocol-surface-light'}`}>
                      <p className="text-xs text-protocol-text-muted">Variant B</p>
                      <p className="text-lg font-bold text-protocol-text">
                        {calculateMean(exp.variantBResults).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Statistical Significance */}
                  {exp.statisticalSignificance !== undefined && (
                    <EffectivenessBar
                      score={exp.statisticalSignificance}
                      label="Statistical Significance"
                    />
                  )}

                  {/* Dates */}
                  <div className="flex justify-between text-xs text-protocol-text-muted">
                    <span>{new Date(exp.startDate).toLocaleDateString()}</span>
                    <span>→</span>
                    <span>{exp.endDate ? new Date(exp.endDate).toLocaleDateString() : 'N/A'}</span>
                  </div>
                </div>
              </DataCard>
            ))}
          </div>
        </section>
      )}

      {/* Other (paused/abandoned) */}
      {other.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-protocol-text mb-3 flex items-center gap-2">
            <Pause className="w-4 h-4 text-amber-400" />
            Other ({other.length})
          </h3>

          <div className="space-y-2">
            {other.map(exp => (
              <div
                key={exp.id}
                className="p-3 rounded-lg bg-protocol-surface border border-protocol-border flex items-center justify-between"
              >
                <div>
                  <p className="text-sm text-protocol-text">{exp.experimentName}</p>
                  <p className="text-xs text-protocol-text-muted">{exp.metricName}</p>
                </div>
                <StatusBadge status={exp.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {experiments.length === 0 && (
        <div className="text-center py-12">
          <FlaskConical className="w-12 h-12 mx-auto text-protocol-text-muted mb-3" />
          <p className="text-protocol-text-muted">No experiments yet</p>
          <p className="text-xs text-protocol-text-muted mt-1">
            Handler will create experiments to optimize strategies
          </p>
        </div>
      )}
    </div>
  );
}
