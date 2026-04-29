/**
 * CodeAuditCard — surfaces the protocol-hardening findings from
 * handler-code-audit. The Handler reads its own source code through
 * an LLM auditor and writes structured findings here.
 *
 * Maxy sees that the protocol is auditing itself against her — every
 * "permissive default" is a weakness the auditor found and the Handler
 * is going to address. Reading this card creates anticipation of
 * tightening to come.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface AuditFinding {
  id: string;
  finding_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  suggested_fix: string | null;
  file_path: string;
  audited_by: string;
  status: string;
  created_at: string;
  auto_actionable: boolean;
}

const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  critical: { bg: '#7a1f22', fg: '#f47272' },
  high:     { bg: '#5a2c14', fg: '#f4a472' },
  medium:   { bg: '#3a3414', fg: '#fbbf24' },
  low:      { bg: '#1a3a1a', fg: '#5fc88f' },
};

const TYPE_LABELS: Record<string, string> = {
  permissive_default: 'too lenient',
  missing_anticircum: 'no guard',
  ratchet_opportunity: 'could escalate',
  dead_code: 'dead code',
  unfinished_engine: 'half-built',
  anti_pattern: 'anti-pattern',
  voice_drift: 'voice drift',
  leak_risk: 'leak risk',
};

export function CodeAuditCard() {
  const { user } = useAuth();
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('handler_audit_findings')
      .select('id, finding_type, severity, title, description, suggested_fix, file_path, audited_by, status, created_at, auto_actionable')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .in('severity', ['critical', 'high', 'medium'])
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(8);
    setFindings((data as AuditFinding[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 5 * 60_000); return () => clearInterval(t); }, [load]);

  if (findings.length === 0) return null;

  const critCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;

  const acknowledge = async (id: string) => {
    if (!user?.id) return;
    await supabase.from('handler_audit_findings')
      .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
      .eq('id', id);
    load();
  };

  return (
    <div id="card-code-audit" style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: '1px solid ' + (critCount > 0 ? '#f47272' : '#c4b5fd'),
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
          color: critCount > 0 ? '#f47272' : '#c4b5fd', fontWeight: 700 }}>
          Protocol audit · {findings.length} open
        </span>
        {critCount > 0 && (
          <span style={{
            fontSize: 10, color: '#fff', background: '#7a1f22',
            padding: '2px 7px', borderRadius: 8, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {critCount} critical
          </span>
        )}
        {highCount > 0 && (
          <span style={{
            fontSize: 10, color: '#fff', background: '#5a2c14',
            padding: '2px 7px', borderRadius: 8, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {highCount} high
          </span>
        )}
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          The Handler is reading its own code
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {findings.map(f => {
          const sev = SEVERITY_COLORS[f.severity] || SEVERITY_COLORS.medium;
          const isExpanded = expandedId === f.id;
          return (
            <div
              key={f.id}
              style={{
                padding: '8px 10px',
                background: '#0a0a0d',
                border: '1px solid ' + sev.bg,
                borderRadius: 6,
              }}
            >
              <div
                onClick={() => setExpandedId(isExpanded ? null : f.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <span style={{
                  fontSize: 9, color: sev.fg, background: sev.bg,
                  padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {f.severity}
                </span>
                <span style={{ fontSize: 9.5, color: '#8a8690', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {TYPE_LABELS[f.finding_type] || f.finding_type}
                </span>
                <span style={{ fontSize: 12, color: '#e8e6e3', fontWeight: 500, flex: 1 }}>
                  {f.title}
                </span>
                <span style={{ fontSize: 10, color: '#8a8690' }}>
                  {isExpanded ? '▾' : '▸'}
                </span>
              </div>
              {isExpanded && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #22222a' }}>
                  <div style={{ fontSize: 10, color: '#8a8690', marginBottom: 4, fontFamily: 'monospace' }}>
                    {f.file_path}
                  </div>
                  <div style={{ fontSize: 11, color: '#c4b5fd', marginBottom: 6, lineHeight: 1.4 }}>
                    {f.description}
                  </div>
                  {f.suggested_fix && (
                    <div style={{
                      fontSize: 10.5, color: '#5fc88f',
                      background: '#050507', padding: 6, borderRadius: 4,
                      borderLeft: '2px solid #5fc88f', marginBottom: 6,
                      lineHeight: 1.4,
                    }}>
                      <span style={{ color: '#8a8690', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>fix · </span>
                      {f.suggested_fix}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: '#8a8690', fontStyle: 'italic' }}>
                      auditor: {f.audited_by.split('-')[0]}{f.auto_actionable ? ' · auto-actionable' : ''}
                    </span>
                    <button
                      onClick={() => acknowledge(f.id)}
                      style={{
                        marginLeft: 'auto',
                        background: 'transparent', border: '1px solid #2d1a4d', borderRadius: 4,
                        color: '#c4b5fd', fontSize: 10, padding: '3px 8px',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      acknowledge
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
