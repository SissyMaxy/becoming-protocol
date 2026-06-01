/**
 * HandlerDirectiveModule — owns the post-LLM directive-execution loop.
 *
 * Protocol-core revival Stage 5b: the per-directive pipeline that lived in
 * `persistTurnSideEffects` (handler-persist.ts) — directive-log insert +
 * logDirectiveOutcome learning hook + 18 execution branches + the streaming-only
 * branches (via the injected `executeExtraDirective`) + the force-feminization
 * helper — is RELOCATED here verbatim. This is a single-copy relocation, NOT a
 * flagged duplicate: `persistTurnSideEffects` now delegates to this module
 * through the SAME Supabase client it already holds, so the 39 characterization
 * tests pin the behavior unchanged and there is no second copy to drift.
 *
 * The low-level executors (`logDirectiveOutcome`, `executeDeviceCommand`,
 * `handleForceFeminizationDirective`, `searchContent`) live in the api/ god-module
 * and CANNOT be imported here (api/ is serverless, src/lib is the browser/Vite
 * bundle). They are INJECTED as `DirectiveExecutors` (ports & adapters): the
 * branch logic — which directives exist, what each writes — now lives in
 * protocol-core; the executors remain thin adapters until later stages.
 *
 * Behavior-preserving: every Supabase write (table, columns, values, ordering),
 * every fire-and-forget `.catch()`, and the non-critical outer try/catch are
 * reproduced byte-for-byte. The force-feminization dispatch is passed straight
 * to the injected helper and never altered.
 */

import { BaseModule, type ContextTier } from '../module-interface';

/**
 * The api/ executors the directive loop delegates to. Injected because a
 * protocol-core module cannot import the serverless god-module.
 */
export interface DirectiveExecutors {
  logDirectiveOutcome: (userId: string, action: string, value: unknown) => Promise<void>;
  executeDeviceCommand: (userId: string, value: unknown, authHeader: string) => Promise<void>;
  handleForceFeminizationDirective: (userId: string, dir: Record<string, unknown>, convId: string) => Promise<void>;
  searchContent: (query: string, count: number) => Promise<Array<{ title: string; url: string; description: string }>>;
}

export interface RunDirectiveLoopOptions {
  /** Already-normalized directive list (caller flattens `directive`/`directives`). */
  directiveList: unknown[];
  /** Authenticated user id — stamped on every write (service-role has no auth.uid()). */
  userId: string;
  /** Conversation id for this turn (conversation_id / source_id). */
  convId: string;
  /** `req.headers.authorization || ''` — forwarded to executeDeviceCommand. */
  authHeader: string;
  /** The injected api/ executors. */
  exec: DirectiveExecutors;
  /**
   * Streaming-only directive branches the non-streaming path does NOT run
   * (enqueue_punishment · schedule_immersion · lock_chastity · log_release ·
   * prescribe_workout · approve_content). Called once per directive, AFTER the
   * shared branches. Omitted by the non-streaming caller → unchanged behavior.
   */
  executeExtraDirective?: (dir: Record<string, unknown>) => Promise<void>;
}

export class HandlerDirectiveModule extends BaseModule {
  readonly name = 'handler-directive';
  readonly category = 'system' as const;

  // Procedural module — no event subscriptions, no AI context, no durable state.
  protected async onInitialize(): Promise<void> {
    // no-op
  }

  getContext(_tier: ContextTier): string {
    return '';
  }

  getState(): Record<string, unknown> {
    return {};
  }

  getTemplate(_key: string, _context: Record<string, unknown>): string | null {
    return null;
  }

  /**
   * Run the directive loop. Verbatim relocation of the loop formerly inside
   * persistTurnSideEffects (see file header). All writes go through `this.db`
   * (the SAME client the caller injected), so test parity is exact.
   */
  async runDirectiveLoop(opts: RunDirectiveLoopOptions): Promise<void> {
    const { directiveList, userId, convId, authHeader, exec, executeExtraDirective } = opts;
    const supabase = this.db;

    try {
      for (const d of directiveList) {
        const dir = d as Record<string, unknown>;
        if (dir.action) {
          // Save to directive log
          await supabase.from('handler_directives').insert({
            user_id: userId,
            action: dir.action,
            target: (dir.target as string) || null,
            value: (dir.value as Record<string, unknown>) || null,
            priority: (dir.priority as string) || 'normal',
            silent: (dir.silent as boolean) || false,
            conversation_id: convId,
            reasoning: (dir.reasoning as string) || null,
          });

          // Log directive outcome for learning loop — fire and forget
          exec.logDirectiveOutcome(userId, dir.action as string, dir.value).catch(err =>
            console.error('[Handler] logDirectiveOutcome failed:', err),
          );

          // EXECUTE device commands immediately — don't let them rot in a table
          if (dir.action === 'send_device_command') {
            console.log(`[Handler] Executing device command for user ${userId}, value:`, dir.value);
            exec.executeDeviceCommand(userId, dir.value ?? dir.target ?? 'pulse:medium:3', authHeader)
              .then(() => console.log('[Handler] Device command execution completed'))
              .catch(err => console.error('[Handler] Device command FAILED:', err));
          }

          // EDGE TIMER — sustained vibration + punishment burst on expiry
          if (dir.action === 'start_edge_timer') {
            const timerVal = dir.value as Record<string, unknown> | null;
            const durationMinutes = Number(timerVal?.duration_minutes) || 5;
            const intensity = Number(timerVal?.intensity) || 10;
            const durationSeconds = durationMinutes * 60;

            console.log(`[Handler] Starting edge timer: ${durationMinutes}min @ intensity ${intensity}`);

            // Insert the sustained vibration command
            await supabase.from('handler_directives').insert({
              user_id: userId,
              action: 'send_device_command',
              target: 'lovense',
              value: { intensity, duration: durationSeconds },
              priority: 'immediate',
              conversation_id: convId,
              reasoning: `Edge timer: ${durationMinutes}min sustained at intensity ${intensity}`,
            });

            // Fire the sustained vibration immediately
            exec.executeDeviceCommand(userId, { intensity, duration: durationSeconds }, authHeader)
              .then(() => console.log('[Handler] Edge timer vibration started'))
              .catch(err => console.error('[Handler] Edge timer vibration FAILED:', err));

            // Insert the punishment burst that fires after the timer expires
            await supabase.from('handler_directives').insert({
              user_id: userId,
              action: 'send_device_command',
              target: 'lovense',
              value: { intensity: 18, duration: 3 },
              priority: 'immediate',
              conversation_id: convId,
              reasoning: 'Edge timer expired — punishment burst for stopping',
            });

            // Schedule the punishment burst after the timer duration
            setTimeout(() => {
              exec.executeDeviceCommand(userId, { intensity: 18, duration: 3 }, authHeader)
                .then(() => console.log('[Handler] Edge timer punishment burst fired'))
                .catch(err => console.error('[Handler] Edge timer punishment burst FAILED:', err));
            }, durationSeconds * 1000);
          }

          // ── EXECUTE request_voice_sample ──
          if (dir.action === 'request_voice_sample') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              await supabase.from('handler_directives').insert({
                user_id: userId,
                action: 'request_voice_sample',
                target: 'client_modal',
                value: {
                  phrase: (val?.phrase as string) || undefined,
                  target_pitch: (val?.target_pitch as number) || 160,
                  min_duration: (val?.min_duration as number) || 10,
                },
                priority: 'immediate',
                conversation_id: convId,
                reasoning: dir.reasoning || 'Handler-initiated voice practice',
              });
              console.log('[Handler] Voice sample requested');
            } catch (err) {
              console.error('[Handler] request_voice_sample failed:', err);
            }
          }

          // ── EXECUTE force_mantra_repetition ──
          if (dir.action === 'force_mantra_repetition') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const mantra = (val?.mantra as string) || 'I am becoming her';
              const repetitions = (val?.repetitions as number) || 5;
              const reason = (val?.reason as string) || '';

              // Insert into handler_directives so the client poller picks it up
              await supabase.from('handler_directives').insert({
                user_id: userId,
                action: 'force_mantra_repetition',
                target: 'client_modal',
                value: { mantra, repetitions, reason },
                priority: 'immediate',
                conversation_id: convId,
                reasoning: `Handler-initiated forced mantra: ${repetitions}x "${mantra}"`,
              });
              console.log('[Handler] Forced mantra queued:', mantra, 'x', repetitions);
            } catch (err) {
              console.error('[Handler] force_mantra_repetition failed:', err);
            }
          }

          // ── EXECUTE force-feminization completion/registration directives ──
          // Single helper handles: register_witness, register_hrt_regimen,
          // complete_body_directive, complete_workout, submit_brief,
          // log_body_measurement. Writes directly to the underlying table,
          // lets the Handler immediately reference the new state.
          await exec.handleForceFeminizationDirective(userId, dir, convId).catch(err =>
            console.error('[Handler] force-femme directive failed:', err),
          );

          // ── EXECUTE prescribe_generated_session ──
          // Queues a client-side directive; the browser calls /api/hypno/generate
          // with the Handler's biasing and opens the player. Handler composes
          // the session params, client triggers the heavy work so the Handler's
          // own streaming response isn't blocked on ElevenLabs latency.
          if (dir.action === 'prescribe_generated_session') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const durationMin = (val?.durationMin as number) || 5;
              const themeBias = Array.isArray(val?.themeBias) ? (val?.themeBias as string[]) : [];
              const phraseBias = Array.isArray(val?.phraseBias) ? (val?.phraseBias as string[]) : [];
              const voiceStyle = (val?.voiceStyle as string) || null;
              const reason = (val?.reason as string) || '';

              await supabase.from('handler_directives').insert({
                user_id: userId,
                action: 'prescribe_generated_session',
                target: 'client_generator',
                value: {
                  durationMin,
                  themeBias,
                  phraseBias,
                  voiceStyle,
                  reason,
                  handlerMessageId: convId,
                },
                priority: 'immediate',
                conversation_id: convId,
                reasoning: `Handler-prescribed custom session: ${durationMin}min · ${themeBias.slice(0, 3).join(', ') || 'profile-led'}`,
              });
              console.log('[Handler] Generated session prescribed:', { durationMin, themeBias });
            } catch (err) {
              console.error('[Handler] prescribe_generated_session failed:', err);
            }
          }

          // ── EXECUTE capture_reframing ──
          if (dir.action === 'capture_reframing') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const original = (val?.original as string) || '';
              const reframed = (val?.reframed as string) || '';
              const technique = (val?.technique as string) || 'feminine_evidence';
              const intensity = (val?.intensity as number) || 5;

              if (original && reframed) {
                await supabase.from('memory_reframings').insert({
                  user_id: userId,
                  original_memory: original,
                  reframed_version: reframed,
                  reframe_technique: technique,
                  emotional_intensity: intensity,
                  source: 'chat',
                  conversation_id: convId,
                });
                console.log('[Handler] Memory reframing captured');
              }
            } catch (err) {
              console.error('[Handler] capture_reframing failed:', err);
            }
          }

          // ── EXECUTE resolve_decision ──
          if (dir.action === 'resolve_decision') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const decisionIdRaw = (val?.decision_id as string) || '';
              const outcome = val?.outcome as string;
              const handlerAlt = val?.handler_alternative as string;

              if (decisionIdRaw && outcome) {
                // Handler sees only 8-char id fragments — resolve to full UUID
                let fullId: string | null = null;
                if (decisionIdRaw.length >= 32) {
                  fullId = decisionIdRaw;
                } else {
                  // 8-char prefix match — fetch recent decisions and match in JS
                  const { data: recent } = await supabase
                    .from('decision_log')
                    .select('id')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(50);
                  const match = (recent || []).find((r: { id: string }) => r.id.startsWith(decisionIdRaw));
                  if (match) fullId = match.id;
                }

                if (fullId) {
                  await supabase.from('decision_log')
                    .update({
                      outcome,
                      handler_alternative: handlerAlt || null,
                      resolved_at: new Date().toISOString(),
                    })
                    .eq('id', fullId)
                    .eq('user_id', userId);
                  console.log('[Handler] Decision resolved:', fullId, outcome);
                } else {
                  console.warn('[Handler] resolve_decision: no match for', decisionIdRaw);
                }
              }
            } catch (err) {
              console.error('[Handler] resolve_decision failed:', err);
            }
          }

          // ── EXECUTE prescribe_task ──
          if (dir.action === 'prescribe_task') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const title = (val?.title as string) || (val?.description as string) || 'Handler-assigned task';
              const domain = (val?.domain as string) || 'feminization';
              const today = new Date().toISOString().slice(0, 10);

              const { data: bankRow, error: bankErr } = await supabase.from('task_bank').insert({
                category: 'handler_prescribed',
                domain,
                intensity: (val?.intensity as number) || 3,
                instruction: title,
                subtext: (val?.subtext as string) || null,
                completion_type: (val?.completion_type as string) || 'binary',
                points: (val?.points as number) || 10,
                affirmation: (val?.affirmation as string) || 'Good girl.',
                created_by: 'handler_directive',
              }).select('id').single();

              if (bankErr) {
                console.error('[Handler] prescribe_task bank insert failed:', bankErr);
              } else {
                const { error: taskErr } = await supabase.from('daily_tasks').insert({
                  user_id: userId,
                  task_id: bankRow.id,
                  assigned_date: today,
                  status: 'pending',
                  selection_reason: 'handler_directive',
                });
                if (taskErr) console.error('[Handler] prescribe_task daily insert failed:', taskErr);
                else console.log(`[Handler] prescribe_task executed: "${title}" (${domain})`);
              }
            } catch (e) { console.error('[Handler] prescribe_task exception:', e); }
          }

          // ── Streaming-only directive branches ──
          // The non-streaming path historically did NOT execute these; the
          // streaming caller supplies them via `executeExtraDirective` so its
          // behavior (enqueue_punishment, schedule_immersion, lock_chastity,
          // log_release, prescribe_workout, approve_content) is preserved while
          // the non-streaming path stays unchanged.
          if (executeExtraDirective) {
            await executeExtraDirective(dir);
          }

          // ── EXECUTE modify_parameter ──
          if (dir.action === 'modify_parameter') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const parameter = val?.parameter as string;
              const newValue = val?.new_value as number;
              if (parameter && newValue != null) {
                const { data: existing } = await supabase.from('hidden_operations')
                  .select('id, current_value')
                  .eq('user_id', userId)
                  .eq('parameter', parameter)
                  .maybeSingle();

                if (existing) {
                  await supabase.from('hidden_operations')
                    .update({ current_value: newValue })
                    .eq('id', existing.id);
                  console.log(`[Handler] modify_parameter: ${parameter} ${existing.current_value} -> ${newValue}`);
                } else {
                  await supabase.from('hidden_operations').insert({
                    user_id: userId,
                    parameter,
                    current_value: newValue,
                    base_value: newValue,
                    increment_rate: 0,
                    increment_interval: 'weekly',
                  });
                  console.log(`[Handler] modify_parameter: created ${parameter} = ${newValue}`);
                }
              }
            } catch (e) { console.error('[Handler] modify_parameter exception:', e); }
          }

          // ── EXECUTE write_memory ──
          if (dir.action === 'write_memory') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const content = val?.content as string;
              if (content) {
                const memoryType = (val?.memory_type as string) || (val?.type as string) || 'observation';
                const importance = (val?.importance as number) || 3;
                const { error: memErr } = await supabase.from('handler_memory').insert({
                  user_id: userId,
                  memory_type: memoryType,
                  content,
                  importance,
                  source_type: 'conversation',
                  source_id: convId,
                  decay_rate: importance >= 5 ? 0 : 0.05,
                });
                if (memErr) console.error('[Handler] write_memory failed:', memErr);
                else console.log(`[Handler] write_memory: ${memoryType} (importance ${importance})`);
              }
            } catch (e) { console.error('[Handler] write_memory exception:', e); }
          }

          // ── EXECUTE schedule_session ──
          if (dir.action === 'schedule_session') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const sessionType = (val?.session_type as string) || 'conditioning';
              const scheduledAt = (val?.scheduled_at as string) || new Date().toISOString();
              const { error: sessErr } = await supabase.from('conditioning_sessions_v2').insert({
                user_id: userId,
                session_type: sessionType,
                started_at: scheduledAt,
                completed: false,
              });
              if (sessErr) console.error('[Handler] schedule_session failed:', sessErr);
              else console.log(`[Handler] schedule_session: ${sessionType} at ${scheduledAt}`);
            } catch (e) { console.error('[Handler] schedule_session exception:', e); }
          }

          // ── EXECUTE advance_skill ──
          if (dir.action === 'advance_skill') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const domain = val?.domain as string;
              if (domain) {
                const { data: existing } = await supabase.from('skill_domains')
                  .select('id, current_level')
                  .eq('user_id', userId)
                  .eq('domain', domain)
                  .maybeSingle();

                if (existing) {
                  const newLevel = (existing.current_level || 0) + 1;
                  await supabase.from('skill_domains')
                    .update({ current_level: newLevel })
                    .eq('id', existing.id);
                  console.log(`[Handler] advance_skill: ${domain} ${existing.current_level} -> ${newLevel}`);
                } else {
                  await supabase.from('skill_domains').insert({
                    user_id: userId,
                    domain,
                    current_level: 1,
                  });
                  console.log(`[Handler] advance_skill: created ${domain} at level 1`);
                }
              }
            } catch (e) { console.error('[Handler] advance_skill exception:', e); }
          }

          // ── EXECUTE create_contract ──
          if (dir.action === 'create_contract') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const title = (val?.title as string) || 'Weekly Commitment';
              const text = (val?.text as string) || '';
              const durationDays = (val?.duration_days as number) || 7;
              const conditions = (val?.conditions as string[]) || [];
              const consequences = (val?.consequences as string) || 'Denial extension + device punishment';

              if (text) {
                // Check that this contract is at least as restrictive as the previous one
                const { data: lastContract } = await supabase
                  .from('identity_contracts')
                  .select('conditions')
                  .eq('user_id', userId)
                  .eq('status', 'active')
                  .order('signed_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                const lastConditionCount = lastContract?.conditions?.length || 0;
                const newConditionCount = conditions.length;

                // New contract must have at least as many conditions as the last
                const escalatedConditions = newConditionCount >= lastConditionCount
                  ? conditions
                  : [...conditions, ...Array(lastConditionCount - newConditionCount).fill('Maintain all previous commitments')];

                await supabase.from('identity_contracts').insert({
                  user_id: userId,
                  contract_title: title,
                  contract_text: text,
                  commitment_duration_days: durationDays,
                  expires_at: new Date(Date.now() + durationDays * 86400000).toISOString(),
                  signature_text: 'Auto-signed by Handler directive',
                  signature_typed_phrase: 'Handler-initiated commitment',
                  conditions: escalatedConditions,
                  consequences_on_break: consequences,
                  status: 'active',
                });

                // Also queue an outreach so user knows about the new contract
                await supabase.from('handler_outreach_queue').insert({
                  user_id: userId,
                  message: `New commitment signed: "${title}". Open the app to review your contract.`,
                  urgency: 'high',
                  trigger_reason: 'new_contract',
                  scheduled_for: new Date().toISOString(),
                  expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
                  source: 'contract_system',
                });

                console.log('[Handler] Contract created:', title, 'with', escalatedConditions.length, 'conditions');
              }
            } catch (err) {
              console.error('[Handler] create_contract failed:', err);
            }
          }

          // ── EXECUTE create_behavioral_trigger ──
          if (dir.action === 'create_behavioral_trigger') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const phrase = val?.trigger_phrase as string;
              const triggerType = (val?.trigger_type as string) || 'keyword';
              const responseType = (val?.response_type as string) || 'device_reward';
              const responseValue = val?.response_value || { pattern: 'gentle_wave' };

              if (phrase) {
                await supabase.from('behavioral_triggers').insert({
                  user_id: userId,
                  trigger_phrase: phrase,
                  trigger_type: triggerType,
                  response_type: responseType,
                  response_value: responseValue,
                  created_by: 'handler',
                });
                console.log('[Handler] Behavioral trigger installed:', phrase, '→', responseType);
              }
            } catch (err) {
              console.error('[Handler] create_behavioral_trigger failed:', err);
            }
          }

          // ── EXECUTE express_desire ──
          if (dir.action === 'express_desire') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const desire = val?.desire as string;
              const category = val?.category as string;
              const urgency = (val?.urgency as number) || 5;
              const targetDate = val?.target_date as string;

              if (desire) {
                await supabase.from('handler_desires').insert({
                  user_id: userId,
                  desire,
                  category: category || 'escalation',
                  urgency,
                  target_date: targetDate || null,
                });
                console.log('[Handler] Desire expressed:', desire);
              }
            } catch (err) {
              console.error('[Handler] express_desire failed:', err);
            }
          }

          // ── EXECUTE log_milestone ──
          if (dir.action === 'log_milestone') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const name = val?.name as string;
              const category = val?.category as string;
              const description = val?.description as string;
              const evidence = val?.evidence as string;
              const commentary = val?.commentary as string;

              if (name) {
                await supabase.from('transformation_milestones').insert({
                  user_id: userId,
                  milestone_name: name,
                  milestone_category: category || 'identity',
                  description: description || null,
                  evidence: evidence || null,
                  handler_commentary: commentary || null,
                });

                await supabase.from('handler_directives').insert({
                  user_id: userId,
                  action: 'send_device_command',
                  target: 'lovense',
                  value: { pattern: 'staircase' },
                  priority: 'immediate',
                  reasoning: `Milestone celebration: ${name}`,
                });

                console.log('[Handler] Milestone logged:', name);
              }
            } catch (err) {
              console.error('[Handler] log_milestone failed:', err);
            }
          }

          // ── EXECUTE search_content ──
          if (dir.action === 'search_content') {
            try {
              const val = dir.value as Record<string, unknown> | null;
              const query = (val?.query as string) || 'sissy hypno';
              const count = (val?.count as number) || 5;

              const results = await exec.searchContent(query, count);
              if (results.length > 0) {
                const resultText = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`).join('\n\n');
                await supabase.from('handler_notes').insert({
                  user_id: userId,
                  note_type: 'search_results',
                  content: `[SEARCH: "${query}"] Top results:\n${resultText}`,
                  priority: 5,
                  conversation_id: convId,
                });
                console.log('[Handler] Search results stored for:', query, '-', results.length, 'results');
              }
            } catch (err) {
              console.error('[Handler] search_content failed:', err);
            }
          }
        }
      }
    } catch {
      // Non-critical — continue on failure
    }
  }
}
