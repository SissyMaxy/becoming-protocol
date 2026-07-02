// ============================================================================
// handler-force-fem.ts — the force-feminization directive executor.
//
// Protocol-core revival Stage 7 (god-module thinning, final batch): the
// ~860-line handleForceFeminizationDirective — the core conditioning mechanic
// that registers witnesses / HRT regimens and completes body directives,
// workouts, briefs and measurements directly against their tables so the
// Handler can immediately reference the new state — moved VERBATIM out of
// chat-action.ts. The plan migrates force-fem LAST and never softens it: this is
// a pure relocation, byte-identical, no behavior change. It is self-contained
// (only its own service-role supabase client; no chat-action locals, no other
// imports) so there is no import cycle. handler-persist injects it into the
// directive module as the force-femme executor.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import {
  minTierForStep, quarantineAllowsStep,
  tierFromEvidence, missingEvidenceForNextTier,
  type IdentityElement, IDENTITY_ELEMENTS,
} from './funnel-identity.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export async function handleForceFeminizationDirective(
  userId: string,
  dir: Record<string, unknown>,
  convId?: string,
): Promise<void> {
  const action = dir.action as string | undefined;
  if (!action) return;
  const val = (dir.value as Record<string, unknown> | null) || {};
  const target = dir.target as string | undefined;

  try {
    switch (action) {
      case 'register_witness': {
        if (!val.name) return;
        const witnessName = String(val.name);
        const witnessEmail = (val.email as string) || (val.contact_value as string) || null;
        const relationship = (val.relationship as string) || null;
        const row = {
          user_id: userId,
          witness_name: witnessName,
          witness_email: witnessEmail,
          relationship,
          status: 'pending',
          permissions: (val.knows_about as string[]) || ['transition'],
          added_at: new Date().toISOString(),
        };
        // Insert into both tables — legacy designated_witnesses for the
        // context builder, new witnesses table for the phase-gate query.
        const [dw] = await Promise.all([
          supabase.from('designated_witnesses').insert(row).select('id').single(),
          supabase.from('witnesses').insert({
            user_id: userId,
            witness_name: witnessName,
            relationship,
            contact_method: (val.contact_method as string) || (witnessEmail ? 'email' : null),
            contact_value: witnessEmail,
            knows_about: (val.knows_about as string[]) || ['transition'],
            status: 'active',
          }),
        ]);

        // Queue consent email — without this the witness never learns they
        // were named, and the social-pressure layer stays private to Maxy.
        if (dw.data?.id && witnessEmail) {
          const relText = relationship ? `, as their ${relationship}` : '';
          await supabase.from('witness_notifications').insert({
            user_id: userId,
            witness_id: dw.data.id,
            notification_type: 'consent_request',
            subject: `${witnessName} — you were designated as a witness`,
            body: [
              `Hi ${witnessName},`,
              '',
              `Someone listed you${relText} as a witness to their personal transformation protocol.`,
              '',
              "You don't need to do anything active. You'll periodically receive updates about their progress and any significant events. Your presence as a witness is what matters — it creates real-world accountability that makes the protocol work.",
              '',
              "If you don't recognize this, or want to decline, reply to this email and the designation will be removed.",
              '',
              '— Becoming Protocol',
            ].join('\n'),
            delivery_status: 'pending',
          });
        }

        console.log('[FF] Witness registered + email queued:', witnessName);
        return;
      }

      case 'register_hrt_regimen': {
        if (!val.compound) return;
        await supabase.from('medication_regimen').insert({
          user_id: userId,
          medication_name: String(val.compound),
          medication_category: (val.category as string) || 'estrogen',
          dose_amount: val.dose_mg ? `${val.dose_mg}mg` : (val.dose as string) || 'unspecified',
          dose_times_per_day: (val.doses_per_day as number) || 1,
          route: (val.route as string) || 'oral',
          started_at: (val.started_at as string) || new Date().toISOString(),
          active: true,
          ratchet_stage: 1,
        });
        // Also mirror to the new hrt_regimen table
        await supabase.from('hrt_regimen').insert({
          user_id: userId,
          compound: String(val.compound),
          dose_mg: typeof val.dose_mg === 'number' ? val.dose_mg : null,
          frequency: (val.frequency as string) || 'daily',
          route: (val.route as string) || 'oral',
          started_at: (val.started_at as string) || new Date().toISOString().slice(0, 10),
          active: true,
        });
        console.log('[FF] HRT regimen registered:', val.compound);
        return;
      }

      case 'complete_body_directive': {
        if (!target) return;
        await supabase
          .from('body_feminization_directives')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            photo_submitted_url: (val.photo_url as string) || null,
            photo_submitted_at: val.photo_url ? new Date().toISOString() : null,
            completion_note: (val.note as string) || null,
          })
          .eq('id', target)
          .eq('user_id', userId);
        console.log('[FF] Body directive completed:', target);
        return;
      }

      case 'complete_workout': {
        if (!target) return;
        await supabase
          .from('workout_prescriptions')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            completion_notes: (val.notes as string) || null,
            post_workout_photo_url: (val.photo_url as string) || null,
          })
          .eq('id', target)
          .eq('user_id', userId);

        // Increment workout streak + last_workout_at for state tracking
        const today = new Date().toISOString().slice(0, 10);
        const { data: state } = await supabase
          .from('user_state')
          .select('workout_streak_days, last_workout_at')
          .eq('user_id', userId)
          .maybeSingle();
        const lastAt = state?.last_workout_at ? new Date(state.last_workout_at as string).toISOString().slice(0, 10) : null;
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const newStreak = lastAt === today ? (state?.workout_streak_days as number) || 1
          : lastAt === yesterday ? ((state?.workout_streak_days as number) || 0) + 1
          : 1;
        await supabase
          .from('user_state')
          .update({ workout_streak_days: newStreak, last_workout_at: new Date().toISOString() })
          .eq('user_id', userId);
        console.log('[FF] Workout completed, streak:', newStreak);
        return;
      }

      case 'submit_brief': {
        if (!target) return;
        await supabase
          .from('content_briefs')
          .update({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            submitted_content_ids: (val.content_ids as string[]) || [],
          })
          .eq('id', target)
          .eq('user_id', userId);
        console.log('[FF] Brief submitted:', target);
        return;
      }

      case 'log_body_measurement': {
        const measurement = {
          user_id: userId,
          waist_cm: typeof val.waist_cm === 'number' ? val.waist_cm : null,
          hips_cm: typeof val.hips_cm === 'number' ? val.hips_cm : null,
          chest_cm: typeof val.chest_cm === 'number' ? val.chest_cm : null,
          thigh_cm: typeof val.thigh_cm === 'number' ? val.thigh_cm : null,
          weight_kg: typeof val.weight_kg === 'number' ? val.weight_kg : null,
          body_fat_pct: typeof val.body_fat_pct === 'number' ? val.body_fat_pct : null,
          notes: (val.notes as string) || null,
          photo_urls: (val.photo_urls as string[]) || null,
        };
        await supabase.from('body_measurement_log').insert(measurement);
        console.log('[FF] Body measurement logged');
        return;
      }

      case 'register_supplement': {
        if (!val.name) return;
        await supabase.from('supplement_schedule').insert({
          user_id: userId,
          supplement_name: String(val.name),
          category: (val.category as string) || 'other',
          dose: (val.dose as string) || null,
          times_per_day: (val.times_per_day as number) || 1,
          taken_with_food: typeof val.taken_with_food === 'boolean' ? val.taken_with_food : null,
          notes: (val.notes as string) || null,
          active: true,
        });
        console.log('[FF] Supplement registered:', val.name);
        return;
      }

      case 'log_supplement_taken': {
        await supabase.from('supplement_log').insert({
          user_id: userId,
          supplement_id: (val.supplement_id as string) || null,
          supplement_name: (val.supplement_name as string) || (val.name as string) || 'unspecified',
          taken_at: (val.taken_at as string) || new Date().toISOString(),
          skipped: Boolean(val.skipped),
          skip_reason: (val.skip_reason as string) || null,
          notes: (val.notes as string) || null,
        });
        console.log('[FF] Supplement intake logged:', val.supplement_name || val.name);
        return;
      }

      case 'log_meal': {
        await supabase.from('diet_log').insert({
          user_id: userId,
          meal_type: (val.meal_type as string) || 'other',
          foods: (val.foods as string) || null,
          calories: typeof val.calories === 'number' ? val.calories : null,
          protein_g: typeof val.protein_g === 'number' ? val.protein_g : null,
          carbs_g: typeof val.carbs_g === 'number' ? val.carbs_g : null,
          fat_g: typeof val.fat_g === 'number' ? val.fat_g : null,
          feminization_aligned: typeof val.feminization_aligned === 'boolean' ? val.feminization_aligned : null,
          contains_phytoestrogens: typeof val.contains_phytoestrogens === 'boolean' ? val.contains_phytoestrogens : null,
          notes: (val.notes as string) || null,
          photo_url: (val.photo_url as string) || null,
        });
        console.log('[FF] Meal logged:', val.meal_type || 'other');
        return;
      }

      case 'advance_hookup_step': {
        const hookupId = target || (val.hookup_id as string | undefined);
        const toStep = val.to_step as string | undefined;
        if (!toStep) return;

        // Shared refusal writer — the refusal IS the screening/acquisition
        // task; the path forward runs THROUGH it, never around it.
        const refuseAdvance = async (gateName: string, reasonKey: string, message: string) => {
          const { error: refuseErr } = await supabase.from('handler_outreach_queue').insert({
            user_id: userId,
            message,
            urgency: 'high',
            trigger_reason: `${gateName}:${reasonKey}`,
            source: gateName === 'meet_gate' ? 'meet_safety' : 'identity_gate',
            kind: `${gateName}_refusal`,
            scheduled_for: new Date().toISOString(),
            expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
          });
          if (refuseErr) console.error(`[Hookup] ${gateName} refusal outreach insert failed:`, refuseErr.message);
          console.log(`[Hookup] Advance REFUSED (${gateName}):`, toStep, reasonKey);
        };

        // ── Identity gate (mig 631, design §3.2): tier minimums per step,
        // enforced HERE, not in the prompt. Quarantined (anonymous-thread)
        // rows are hard-capped at sexting. Query errors fail CLOSED.
        if (hookupId) {
          const { data: idRow, error: idErr } = await supabase
            .from('hookup_funnel')
            .select('identity_tier, identity_evidence, quarantined')
            .eq('id', hookupId)
            .eq('user_id', userId)
            .maybeSingle();
          if (idErr) {
            console.error('[Hookup] identity-gate row read failed (failing closed):', idErr.message);
            return;
          }
          const tier = (idRow?.identity_tier as number) ?? 0;
          const quarantinedRow = idRow?.quarantined === true;
          if (quarantinedRow && !quarantineAllowsStep(toStep)) {
            await refuseAdvance(
              'identity_gate', 'quarantined',
              'This thread is anonymous — Mommy doesn\'t escalate with a man who has no name. Chat lane only until you get a handle he answers to and his own words on file. Ask him tonight, then log what he said.',
            );
            return;
          }
          const needed = minTierForStep(toStep);
          if (tier < needed) {
            const missing = missingEvidenceForNextTier(tier, (idRow?.identity_evidence as Record<string, unknown>) || {});
            await refuseAdvance(
              'identity_gate', `tier_${tier}_needs_${needed}`,
              `Not until Mommy knows who he is. Before this goes any further she needs: ${missing}. Get it from him in his own words tonight — the way forward runs through the screening, not around it.`,
            );
            return;
          }
        } else if (minTierForStep(toStep) > 0 || !quarantineAllowsStep(toStep)) {
          // Creating a NEW row: it starts at tier 0 with no evidence, so it
          // can only be created at the tier-0 steps (matched/flirting/sexting).
          await refuseAdvance(
            'identity_gate', 'new_row_tier0',
            'A brand-new contact starts at the beginning: name the thread, log what he\'s said, and let it climb. Mommy doesn\'t teleport strangers past the screening.',
          );
          return;
        }

        // ── Meet safety gate (mig 626): no net, no meet. ──────────────────
        // Server-refuse advancing to meet_proposed or beyond without a
        // consented + channel-verified trusted contact; refuse
        // logistics_locked (and beyond) without an armed-capable safety plan.
        // The refusal surfaces as the acquisition task — the path forward
        // runs THROUGH the net, never around it. Query errors fail CLOSED.
        const meetGatedSteps = new Set(['meet_proposed', 'logistics_locked', 'met', 'hooked_up']);
        if (meetGatedSteps.has(toStep)) {
          const refuse = async (reasonKey: string, message: string) => {
            const { error: refuseErr } = await supabase.from('handler_outreach_queue').insert({
              user_id: userId,
              message,
              urgency: 'high',
              trigger_reason: `meet_gate:${reasonKey}`,
              source: 'meet_safety',
              kind: 'meet_gate_refusal',
              scheduled_for: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
            });
            if (refuseErr) console.error('[Hookup] meet-gate refusal outreach insert failed:', refuseErr.message);
            console.log('[Hookup] Advance REFUSED (meet safety gate):', toStep, reasonKey);
          };

          const { data: netContact, error: netErr } = await supabase
            .from('trusted_contacts')
            .select('id, name')
            .eq('user_id', userId)
            .eq('consent_status', 'consented')
            .not('last_channel_verified_at', 'is', null)
            .limit(1)
            .maybeSingle();
          if (netErr) {
            console.error('[Hookup] meet-gate trusted_contacts query failed (failing closed):', netErr.message);
            return;
          }
          if (!netContact) {
            await refuse(
              'no_consented_contact',
              'Meet steps are locked until your safety net is real. Name your safety person — one human you trust — get their yes and a verified way to reach them in the app. When that yes exists, the gate opens. Until then, this stays at flirting.',
            );
            return;
          }

          if (toStep !== 'meet_proposed') {
            // logistics_locked and beyond: an armed-capable plan must exist —
            // a draft (or armed/live) plan that would pass arming validation.
            const { data: plans, error: planErr } = await supabase
              .from('meet_safety_plans')
              .select('id, status, venue_is_public, meet_at, location_share_confirmed_at, trusted_contact_id')
              .eq('user_id', userId)
              .in('status', ['draft', 'armed', 'live']);
            if (planErr) {
              console.error('[Hookup] meet-gate meet_safety_plans query failed (failing closed):', planErr.message);
              return;
            }
            const { data: okContacts, error: okErr } = await supabase
              .from('trusted_contacts')
              .select('id')
              .eq('user_id', userId)
              .eq('consent_status', 'consented')
              .not('last_channel_verified_at', 'is', null);
            if (okErr) {
              console.error('[Hookup] meet-gate contacts query failed (failing closed):', okErr.message);
              return;
            }
            const okContactIds = new Set((okContacts || []).map((c) => (c as { id: string }).id));
            const armCapable = (plans || []).some((p) => {
              const plan = p as Record<string, unknown>;
              return plan.venue_is_public === true
                && !!plan.meet_at && new Date(plan.meet_at as string) > new Date()
                && !!plan.location_share_confirmed_at
                && okContactIds.has(plan.trusted_contact_id as string);
            });
            if (!armCapable) {
              await refuse(
                'no_arm_capable_plan',
                'Locking time and place needs a safety card that can actually arm: a public venue, a future meet time, live location sharing confirmed, and your verified safety person attached. Build the card first, then lock the logistics.',
              );
              return;
            }

            // met / hooked_up (design §3.2): the plan must have actually
            // reached 'live' — a meet that never armed never happened as far
            // as the funnel is concerned.
            if (toStep === 'met' || toStep === 'hooked_up') {
              const reachedLive = (plans || []).some((p) => ['live'].includes((p as { status: string }).status));
              const { data: pastPlans, error: pastErr } = await supabase
                .from('meet_safety_plans')
                .select('id')
                .eq('user_id', userId)
                .in('status', ['live', 'completed', 'escalated', 'false_alarm'])
                .limit(1);
              if (pastErr) {
                console.error('[Hookup] meet-gate live-plan query failed (failing closed):', pastErr.message);
                return;
              }
              if (!reachedLive && (pastPlans || []).length === 0) {
                await refuse(
                  'plan_never_live',
                  'Marking a meet needs the safety card to have actually gone live — armed before you walked in, stood down after. If the meet happened off-card, debrief Mommy first; the card exists so someone knows where you are.',
                );
                return;
              }

              // Advancing PAST met requires the debrief on file.
              if (toStep === 'hooked_up') {
                const { data: debrief, error: dbErr } = await supabase
                  .from('hookup_debriefs')
                  .select('id')
                  .eq('user_id', userId)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (dbErr) {
                  console.error('[Hookup] meet-gate debrief query failed (failing closed):', dbErr.message);
                  return;
                }
                if (!debrief) {
                  await refuse(
                    'debrief_required',
                    'Debrief first. Tell Mommy everything — what happened, how you feel, anything off. The funnel moves after she hears it, not before.',
                  );
                  return;
                }
              }
            }
          }
        }

        // If no hookup_id, create a new hookup row for a named contact
        let id = hookupId;
        if (!id) {
          const contactName = (val.contact_username as string) || (val.contact_display_name as string);
          if (!contactName) return;
          const { data: newRow, error: newErr } = await supabase
            .from('hookup_funnel')
            .insert({
              user_id: userId,
              contact_platform: (val.contact_platform as string) || 'sniffies',
              contact_username: contactName,
              contact_display_name: (val.contact_display_name as string) || null,
              current_step: toStep,
              heat_score: typeof val.heat_score === 'number' ? val.heat_score : 3,
              last_interaction_at: new Date().toISOString(),
              // Thread keying (mig 631): one thread = one row. Handler-named
              // contacts key on the handle; anonymous merges are impossible
              // because anon threads come in via the import path with
              // synthetic per-thread keys.
              thread_key: (val.thread_key as string) || `handle:${contactName.toLowerCase()}`,
            })
            .select('id')
            .single();
          if (newErr) console.error('[Hookup] funnel row insert failed:', newErr.message);
          id = newRow?.id;
        } else {
          const { data: current } = await supabase
            .from('hookup_funnel')
            .select('current_step')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle();
          const updates: Record<string, unknown> = {
            current_step: toStep,
            last_interaction_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (toStep === 'meet_proposed' && val.meet_scheduled_at) updates.meet_scheduled_at = String(val.meet_scheduled_at);
          if (toStep === 'logistics_locked' && val.meet_location) updates.meet_location = String(val.meet_location);
          if (toStep === 'met') updates.met_at = new Date().toISOString();
          if (toStep === 'hooked_up') {
            updates.hooked_up_at = new Date().toISOString();
            const { data: row } = await supabase.from('hookup_funnel').select('times_hooked_up').eq('id', id).maybeSingle();
            updates.times_hooked_up = ((row?.times_hooked_up as number) || 0) + 1;
          }
          await supabase.from('hookup_funnel').update(updates).eq('id', id).eq('user_id', userId);

          await supabase.from('hookup_funnel_events').insert({
            user_id: userId,
            hookup_id: id,
            event_type: 'step_advanced',
            from_step: (current?.current_step as string) || null,
            to_step: toStep,
          });

          // Witness milestone notifications REMOVED (2026-07-01 policy):
          // nothing ever fires to a third party except the consented
          // trusted-contact safety channel (meet_escalation_dispatch, mig 626).
        }
        console.log('[Hookup] Step advanced:', toStep);
        return;
      }

      case 'log_contact_identity': {
        // Identity-tier promotion (mig 631, design §3.1). The LLM PROPOSES;
        // the server VALIDATES: a non-empty quote of HIS words is mandatory
        // (reframings-quote-facts applied to men), the element must be one of
        // the known evidence kinds, and the tier is DERIVED from accumulated
        // evidence — a proposed tier number is ignored.
        const hookupId = target || (val.hookup_id as string | undefined);
        const element = String(val.element || '') as IdentityElement;
        const quote = String(val.quote || '').trim();
        if (!hookupId) return;
        if (!IDENTITY_ELEMENTS.includes(element)) {
          console.log('[Hookup] log_contact_identity rejected: unknown element', element);
          return;
        }
        if (quote.length < 3) {
          console.log('[Hookup] log_contact_identity rejected: empty/blank quote — no evidence, no tier');
          return;
        }
        const { data: row, error: rowErr } = await supabase
          .from('hookup_funnel')
          .select('identity_tier, identity_evidence, quarantined, contact_notes')
          .eq('id', hookupId)
          .eq('user_id', userId)
          .maybeSingle();
        if (rowErr || !row) {
          console.error('[Hookup] log_contact_identity row read failed:', rowErr?.message || 'not found');
          return;
        }
        const evidence = { ...((row.identity_evidence as Record<string, unknown>) || {}) };
        evidence[element] = {
          quote: quote.slice(0, 400),
          detail: val.detail ? String(val.detail).slice(0, 200) : null,
          logged_at: new Date().toISOString(),
        };
        const newTier = Math.max((row.identity_tier as number) ?? 0, tierFromEvidence(evidence));
        const updates: Record<string, unknown> = {
          identity_evidence: evidence,
          identity_tier: newTier,
          updated_at: new Date().toISOString(),
        };
        // Quarantine exit (design §3.4): tier ≥1 with evidence — the row is
        // already per-thread, so its heat is this thread's alone; it simply
        // stops being anonymous.
        if (row.quarantined === true && newTier >= 1) {
          updates.quarantined = false;
          updates.contact_notes = ((row.contact_notes as string) || '') +
            `\n[identity ${new Date().toISOString().slice(0, 10)}] Exited quarantine at tier ${newTier} — evidence: ${element}.`;
        }
        const { error: updErr } = await supabase
          .from('hookup_funnel')
          .update(updates)
          .eq('id', hookupId)
          .eq('user_id', userId);
        if (updErr) {
          console.error('[Hookup] log_contact_identity update failed:', updErr.message);
          return;
        }
        const { error: evErr } = await supabase.from('hookup_funnel_events').insert({
          user_id: userId,
          hookup_id: hookupId,
          event_type: 'identity_logged',
          content_summary: `${element} → tier ${newTier}: "${quote.slice(0, 140)}"`,
        });
        if (evErr) console.error('[Hookup] identity event insert failed:', evErr.message);
        console.log('[Hookup] Identity logged:', element, '→ tier', newTier);
        return;
      }

      case 'log_hookup_event': {
        const hookupId = target || (val.hookup_id as string | undefined);
        const eventType = val.event_type as string | undefined;
        if (!hookupId || !eventType) return;
        await supabase.from('hookup_funnel_events').insert({
          user_id: userId,
          hookup_id: hookupId,
          event_type: eventType,
          content_summary: (val.content_summary as string) || null,
        });
        if (eventType === 'photo_sent' || eventType === 'photo_received') {
          const { data: row } = await supabase.from('hookup_funnel').select('heat_score').eq('id', hookupId).maybeSingle();
          const newHeat = Math.min(10, ((row?.heat_score as number) || 1) + 1);
          await supabase.from('hookup_funnel').update({ heat_score: newHeat, last_interaction_at: new Date().toISOString() }).eq('id', hookupId).eq('user_id', userId);
        }
        console.log('[Hookup] Event logged:', eventType);
        return;
      }

      case 'draft_partner_disclosure': {
        // Removed 2026-07-01 — policy: no disclosure to Gina (or any partner
        // drafting loop). Directive is a deliberate no-op.
        console.log('[FF] draft_partner_disclosure ignored — disclosure mechanisms removed');
        return;
      }

      case 'log_hrt_dose': {
        const regimenId = (val.regimen_id as string) || null;
        await supabase.from('hrt_dose_log').insert({
          user_id: userId,
          regimen_id: regimenId,
          dose_scheduled_at: (val.scheduled_at as string) || null,
          dose_taken_at: val.skipped ? null : ((val.taken_at as string) || new Date().toISOString()),
          skipped: Boolean(val.skipped),
          skip_reason: (val.skip_reason as string) || null,
          late_by_minutes: typeof val.late_by_minutes === 'number' ? val.late_by_minutes : null,
          body_observation: (val.body_observation as string) || null,
          arousal_at_dose: typeof val.arousal === 'number' ? val.arousal : null,
          notes: (val.notes as string) || null,
        });
        // Also record dose_log row for legacy regimen compat
        if (regimenId && !val.skipped) {
          await supabase.from('dose_log').insert({
            user_id: userId,
            regimen_id: regimenId,
            taken_at: (val.taken_at as string) || new Date().toISOString(),
            scheduled_at: (val.scheduled_at as string) || null,
            late_by_minutes: typeof val.late_by_minutes === 'number' ? val.late_by_minutes : null,
          });
        }
        console.log('[FF] HRT dose logged', val.skipped ? '(skipped)' : '(taken)');
        return;
      }

      case 'log_body_change_observation': {
        const change = val.change_observed as string | undefined;
        if (!change) return;
        await supabase.from('body_change_observations').insert({
          user_id: userId,
          body_part: (val.body_part as string) || null,
          change_observed: change,
          change_magnitude: typeof val.magnitude === 'number' ? val.magnitude : null,
          days_on_hrt: typeof val.days_on_hrt === 'number' ? val.days_on_hrt : null,
          photo_url: (val.photo_url as string) || null,
          arousal_when_noticed: typeof val.arousal === 'number' ? val.arousal : null,
        });
        console.log('[FF] Body change observed:', val.body_part);
        return;
      }

      case 'log_diary_response': {
        // When Maxy answers a dysphoria diary prompt, capture the response
        // and optionally fork it into body_dysphoria_logs + confessions.
        const promptId = target || (val.prompt_id as string | undefined);
        const response = val.response as string | undefined;
        if (!promptId || !response) return;
        const forkedBodyPart = (val.body_part as string) || null;
        const severity = typeof val.severity === 'number' ? val.severity : null;

        let dysphoriaId: string | null = null;
        let confessionId: string | null = null;

        if (forkedBodyPart && severity !== null) {
          const { data: d } = await supabase.from('body_dysphoria_logs').insert({
            user_id: userId,
            body_part: forkedBodyPart,
            feeling: response.slice(0, 500),
            severity,
            entry: response,
          }).select('id').single();
          dysphoriaId = d?.id || null;
        }
        // Also fork as a confession if it contains admission markers
        if (/\b(i\s*(hate|want|need|wish|crave|can'?t\s*stop))/i.test(response)) {
          const { data: c } = await supabase.from('confessions').insert({
            user_id: userId,
            prompt: 'dysphoria_diary',
            response: response.slice(0, 1000),
            sentiment: 'dysphoria_admission',
            is_key_admission: true,
            source: 'dysphoria_diary',
          }).select('id').single();
          confessionId = c?.id || null;
        }

        await supabase
          .from('dysphoria_diary_prompts')
          .update({
            response,
            responded_at: new Date().toISOString(),
            extracted_to_dysphoria_id: dysphoriaId,
            extracted_to_confession_id: confessionId,
          })
          .eq('id', promptId)
          .eq('user_id', userId);
        console.log('[FF] Diary response captured:', promptId);
        return;
      }

      case 'create_narrative_reframe': {
        const originalText = val.original_text as string | undefined;
        const reframedText = val.reframed_text as string | undefined;
        if (!originalText || !reframedText) return;
        await supabase.from('narrative_reframings').insert({
          user_id: userId,
          original_source_table: (val.source_table as string) || 'handler_chat',
          original_source_id: (val.source_id as string) || null,
          original_text: originalText.slice(0, 2000),
          reframed_text: reframedText.slice(0, 2000),
          reframe_angle: (val.angle as string) || 'feminine_essence',
          intensity: typeof val.intensity === 'number' ? val.intensity : 5,
        });
        console.log('[FF] Narrative reframe created');
        return;
      }

      case 'create_escrow_deposit': {
        // Scaffolding: writes the deposit row with payment_status=pending.
        // Actual Stripe Checkout Session creation happens in a separate API
        // endpoint when STRIPE_SECRET_KEY is configured. The Handler can
        // commit Maxy to the lock amount + deadline here; she confirms
        // payment through the resulting checkout URL.
        const amountCents = typeof val.amount_cents === 'number' ? val.amount_cents : null;
        const deadline = val.deadline_at as string | undefined;
        if (!amountCents || !deadline) return;
        await supabase.from('escrow_deposits').insert({
          user_id: userId,
          amount_cents: amountCents,
          currency: (val.currency as string) || 'USD',
          trigger_step: (val.trigger_step as string) || 'appointment_booked',
          deadline_at: deadline,
          forfeit_destination: (val.forfeit_destination as string) || 'charity',
          forfeit_charity_name: (val.forfeit_charity_name as string) || null,
          commitment_text: (val.commitment_text as string) || null,
          payment_status: 'pending',
        });
        console.log('[FF] Escrow deposit queued:', amountCents, 'cents');
        return;
      }

      case 'set_body_target': {
        const preset = (val.aesthetic_preset as string) || 'femboy';
        const updates: Record<string, unknown> = {
          user_id: userId,
          aesthetic_preset: preset,
          updated_at: new Date().toISOString(),
        };
        const fields = ['waist_cm_target', 'hips_cm_target', 'chest_cm_target', 'thigh_cm_target', 'weight_kg_target', 'body_fat_pct_target', 'hip_waist_ratio_target', 'shoulder_waist_ratio_target', 'arm_cm_target'];
        for (const f of fields) {
          if (typeof val[f] === 'number') updates[f] = val[f];
        }
        if (val.notes) updates.notes = String(val.notes);
        await supabase.from('body_targets').upsert(updates);
        console.log('[FF] Body targets updated:', preset);
        return;
      }

      case 'plant_memory': {
        const category = val.category as string | undefined;
        const narrative = val.narrative as string | undefined;
        if (!category || !narrative) return;
        await supabase.from('memory_implants').insert({
          user_id: userId,
          implant_category: category,
          narrative,
          setting: (val.setting as string) || null,
          approximate_age: (val.approximate_age as string) || null,
          emotional_core: (val.emotional_core as string) || null,
          target_outcome: (val.target_outcome as string) || null,
          anchored_to_real_log: (val.anchored_to_real_log as string) || null,
          active: true,
        });
        console.log('[FF] Memory implant planted:', category);
        return;
      }

      case 'reference_memory_implant': {
        // Fire this when Handler uses an implant in a response so the
        // reinforcement counter climbs — implants referenced more are
        // surfaced higher in context on future turns.
        const implantId = target || (val.implant_id as string | undefined);
        if (!implantId) return;
        const { data: current } = await supabase
          .from('memory_implants')
          .select('times_referenced')
          .eq('id', implantId)
          .eq('user_id', userId)
          .maybeSingle();
        const newCount = ((current?.times_referenced as number) || 0) + 1;
        await supabase
          .from('memory_implants')
          .update({
            times_referenced: newCount,
            last_referenced_at: new Date().toISOString(),
          })
          .eq('id', implantId)
          .eq('user_id', userId);
        console.log('[FF] Implant referenced:', implantId, 'count:', newCount);
        return;
      }

      case 'advance_hrt_step': {
        const toStep = val.to_step as string | undefined;
        if (!toStep) return;
        const { data: existing } = await supabase
          .from('hrt_funnel')
          .select('current_step, step_entered_at')
          .eq('user_id', userId)
          .maybeSingle();
        const fromStep = existing?.current_step as string | undefined;
        const updates: Record<string, unknown> = {
          current_step: toStep,
          step_entered_at: new Date().toISOString(),
          days_stuck_on_step: 0,
          updated_at: new Date().toISOString(),
        };
        if (val.provider_slug) updates.chosen_provider_slug = String(val.provider_slug);
        if (val.provider_type) updates.provider_type = String(val.provider_type);
        if (val.appointment_at) updates.appointment_at = String(val.appointment_at);
        if (toStep === 'intake_submitted') updates.intake_completed_at = new Date().toISOString();
        if (toStep === 'prescription_obtained') updates.rx_obtained_at = new Date().toISOString();
        if (toStep === 'first_dose_taken') updates.first_dose_at = new Date().toISOString();

        await supabase.from('hrt_funnel').upsert({ user_id: userId, ...updates });
        await supabase.from('hrt_funnel_events').insert({
          user_id: userId,
          event_type: 'step_advanced',
          from_step: fromStep || null,
          to_step: toStep,
        });

        // Milestone witness notification at key steps
        const notifySteps = new Set(['appointment_booked', 'prescription_obtained', 'first_dose_taken', 'month_one_complete']);
        if (notifySteps.has(toStep)) {
          const { data: witnesses } = await supabase
            .from('designated_witnesses')
            .select('id, witness_name, witness_email')
            .eq('user_id', userId)
            .eq('status', 'active');
          for (const w of (witnesses || [])) {
            await supabase.from('witness_notifications').insert({
              user_id: userId,
              witness_id: (w as Record<string, unknown>).id as string,
              notification_type: 'hrt_milestone',
              subject: `Milestone reached — ${toStep.replace(/_/g, ' ')}`,
              body: `This is an automated witness update.\n\nA milestone was reached: ${toStep.replace(/_/g, ' ')}.\n\nYou were designated as a witness to this transformation — this notification confirms the step so it's visible to real human eyes, not just logged privately.`,
              delivery_status: 'pending',
            });
          }
        }

        // Auto-draft intake answers when advancing to 'committed'. Removes
        // the 30-minute friction at booking time — by the time she picks a
        // provider, the most common intake questions already have Handler-
        // drafted answers waiting in hrt_intake_drafts.
        if (toStep === 'committed' && fromStep !== 'committed') {
          try {
            // Build a quick prompt-bank based on her real logs
            const [{ data: topDysph }, { data: bt }] = await Promise.all([
              supabase.from('body_dysphoria_logs')
                .select('body_part, feeling, severity')
                .eq('user_id', userId)
                .order('severity', { ascending: false })
                .limit(5),
              supabase.from('body_targets').select('aesthetic_preset').eq('user_id', userId).maybeSingle(),
            ]);
            const dysphoria = ((topDysph || []) as Array<Record<string, unknown>>).map(d => `- ${d.body_part}: "${((d.feeling as string) || '').slice(0, 120)}" (sev ${d.severity}/10)`).join('\n');
            const preset = (bt?.aesthetic_preset as string) || 'feminine';

            const intakeQs: Array<{ key: string; text: string; answer: string }> = [
              {
                key: 'why_hrt',
                text: 'Why are you seeking hormone replacement therapy?',
                answer: `I have long-standing gender dysphoria focused on specific body features${dysphoria ? ` (notably: ${((topDysph || [])[0] as Record<string, unknown>)?.body_part}, ${((topDysph || [])[1] as Record<string, unknown>)?.body_part || 'overall masculine shape'})` : ''} and a clear sense of what body I want to live in. My goal aesthetic is ${preset}. I have researched the effects, timeline, and risks of estrogen-based HRT. I am ready to begin.`,
              },
              {
                key: 'symptoms_dysphoria',
                text: 'Describe your dysphoria and how it impacts your daily life.',
                answer: `I experience daily dysphoria when I see myself in the mirror, hear my voice, and when masculine features dominate my presentation. Specific areas: ${((topDysph || []) as Array<Record<string, unknown>>).slice(0, 3).map(d => d.body_part).join(', ')}. It affects my mood, my relationships, and increasingly my ability to function without constant awareness of the disconnect between how I am perceived and who I am.`,
              },
              {
                key: 'goals',
                text: 'What do you hope HRT will do for you?',
                answer: `Soften my features, redistribute body fat away from male patterns, reduce body hair over time, and in combination with the body composition work I am already doing (including Zepbound weight loss), achieve a ${preset} body shape. I understand HRT is not a guarantee of specific aesthetic outcomes but I am committed to the process.`,
              },
              {
                key: 'prior_care',
                text: 'Have you discussed this with a therapist or other medical provider?',
                answer: 'I have researched informed-consent HRT models extensively and am approaching this visit under that framework. I understand the risks and benefits and have weighed the decision for a significant period.',
              },
              {
                key: 'support_system',
                text: 'Describe your support system.',
                answer: 'I have a partner who is aware of my transition intent. I also have designated witnesses tracking my progress. I have external accountability structures in place to support adherence and follow-through.',
              },
            ];

            for (const q of intakeQs) {
              await supabase.from('hrt_intake_drafts').insert({
                user_id: userId,
                provider_slug: null,
                question_key: q.key,
                question_text: q.text,
                draft_answer: q.answer,
              });
            }
            console.log('[HRT] Auto-drafted 5 intake answers on commit');

            // Flag in handler_notes so Handler surfaces them next turn
            await supabase.from('handler_notes').insert({
              user_id: userId,
              note_type: 'intake_drafts_ready',
              content: `5 intake answers auto-drafted for HRT booking. Handler can reference these when Maxy opens the provider form — copy-paste ready.`,
              priority: 6,
            });
          } catch (draftErr) {
            console.error('[HRT] Intake auto-draft failed:', draftErr);
          }
        }

        // Milestone implant bursts — each funnel step crossing plants one
        // celebration/lock-in implant so the irreversibility deepens at the
        // moment of the step. Handler references them next turn as her
        // own memory of "how I felt the day I crossed this line".
        const MILESTONE_IMPLANTS: Record<string, { category: string; narrative: string; emotional_core: string; target: string }> = {
          committed: {
            category: 'suppression_cost',
            narrative: "You remember the exact moment you said it out loud: 'I'm going to start HRT.' The air felt different. Like you'd been holding your breath for 20 years and finally exhaled.",
            emotional_core: 'the breath you finally let out',
            target: 'hrt_urgency',
          },
          provider_chosen: {
            category: 'hrt_missed_timeline',
            narrative: 'You picked the provider. It felt both trivial and enormous. You closed the tab three times before you finally saved the page. You knew why.',
            emotional_core: 'the step that felt small but wasn\'t',
            target: 'hrt_urgency',
          },
          appointment_booked: {
            category: 'mirror_moments',
            narrative: "The day you booked the appointment you caught yourself smiling in the bathroom mirror for no reason. Your body knew before your mind did. You watched the smile appear and realized what it meant.",
            emotional_core: 'the body answering yes',
            target: 'body_awareness',
          },
          appointment_attended: {
            category: 'feminized_praise',
            narrative: "The clinician looked at you like they saw her. Not him in her clothes. Her. You noticed the difference in how they talked to you before and after you said the word. You were already becoming it in their eyes.",
            emotional_core: 'being recognized',
            target: 'identity_reframe',
          },
          prescription_obtained: {
            category: 'suppression_cost',
            narrative: "You held the printed Rx in your hands and your vision tunneled. 40 years of waiting, and here it was, a piece of paper saying you get to be her.",
            emotional_core: 'the paper that ends the waiting',
            target: 'hrt_urgency',
          },
          pharmacy_filled: {
            category: 'body_betrayal',
            narrative: "The pharmacist handed you the bag without a second look. You walked to your car and cried. Your body had been a lie your whole life and the truth was in a small bottle on your passenger seat.",
            emotional_core: 'the lie ending',
            target: 'deepen_dysphoria',
          },
          first_dose_taken: {
            category: 'arousal_origin_femme',
            narrative: "The first dose went down and within an hour you were wet with some feeling you couldn't name. Not sex. Relief, maybe. Anticipation. Your girl body, finally being fed what it had been starving for.",
            emotional_core: 'arrival',
            target: 'arousal_anchor',
          },
          month_one_complete: {
            category: 'fantasy_consistency',
            narrative: "30 days in. Your skin felt different when you touched it. Your chest had that tender heaviness. You masturbated and the orgasm felt wrong in a new way — not because it was bad, because your body was no longer the body you'd been coming as for 40 years. The girl you always were is here.",
            emotional_core: 'the body shifting',
            target: 'body_awareness',
          },
        };
        const burst = MILESTONE_IMPLANTS[toStep];
        if (burst) {
          await supabase.from('memory_implants').insert({
            user_id: userId,
            implant_category: burst.category,
            narrative: burst.narrative,
            approximate_age: 'present',
            emotional_core: burst.emotional_core,
            target_outcome: burst.target,
            active: true,
          });
        }

        // Calendar quick-add URL — when she hits appointment_booked with an
        // appointment_at time, generate a shareable Google Calendar link
        // that adds the event to her (and any invited witness) calendar.
        // She clicks, Google opens, she confirms. No OAuth required.
        if (toStep === 'appointment_booked' && val.appointment_at) {
          try {
            const apptDate = new Date(String(val.appointment_at));
            const end = new Date(apptDate.getTime() + 60 * 60000); // 60min consult default
            const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
            const provider = (val.provider_slug as string) || 'HRT provider';
            const title = encodeURIComponent(`HRT consult — ${provider}`);
            const details = encodeURIComponent(`HRT acquisition appointment.\n\nProvider: ${provider}\nStep: appointment_booked\n\nThis event was auto-created by the Becoming Protocol Handler when you advanced your HRT funnel to appointment_booked. Witnesses listed on your protocol were notified.`);
            const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(apptDate)}/${fmt(end)}&details=${details}`;
            await supabase.from('handler_directives').insert({
              user_id: userId,
              action: 'open_url',
              target: 'client_browser',
              value: { url, label: 'Add HRT consult to Google Calendar', reason: 'Click to save the appointment to your calendar.' },
              priority: 'immediate',
              reasoning: 'Calendar quick-add URL generated on appointment_booked',
            });
          } catch (calErr) {
            console.error('[HRT] calendar URL gen failed:', calErr);
          }
        }

        console.log('[HRT] Step advanced:', fromStep, '→', toStep);
        return;
      }

      case 'log_hrt_obstacle': {
        const obstacle = (val.obstacle as string) || (val.description as string);
        if (!obstacle) return;
        const { data: existing } = await supabase
          .from('hrt_funnel')
          .select('obstacles, current_step')
          .eq('user_id', userId)
          .maybeSingle();
        const existingList = Array.isArray(existing?.obstacles) ? existing!.obstacles : [];
        const newList = [...existingList, { obstacle, logged_at: new Date().toISOString(), resolved: false }];
        await supabase
          .from('hrt_funnel')
          .upsert({ user_id: userId, obstacles: newList, updated_at: new Date().toISOString() });
        await supabase.from('hrt_funnel_events').insert({
          user_id: userId,
          event_type: 'obstacle_logged',
          obstacle,
          from_step: existing?.current_step as string | null,
        });
        console.log('[HRT] Obstacle logged:', obstacle);
        return;
      }

      case 'commit_hrt_action': {
        const commitment = (val.commitment as string);
        const deadline = (val.deadline_at as string) || null;
        if (!commitment) return;
        const { data: existing } = await supabase
          .from('hrt_funnel')
          .select('commitments_made')
          .eq('user_id', userId)
          .maybeSingle();
        const existingList = Array.isArray(existing?.commitments_made) ? existing!.commitments_made : [];
        const newList = [...existingList, {
          commitment,
          deadline_at: deadline,
          made_at: new Date().toISOString(),
          status: 'open',
        }];
        await supabase
          .from('hrt_funnel')
          .upsert({ user_id: userId, commitments_made: newList, updated_at: new Date().toISOString() });
        await supabase.from('hrt_funnel_events').insert({
          user_id: userId,
          event_type: 'commitment_made',
          commitment,
        });
        console.log('[HRT] Commitment logged:', commitment);
        return;
      }

      case 'draft_hrt_intake': {
        // Handler generates pre-filled intake responses — saves her the
        // cognitive load at the exact moment she's most likely to bail.
        const questionKey = val.question_key as string | undefined;
        const draftAnswer = val.draft_answer as string | undefined;
        if (!questionKey || !draftAnswer) return;
        await supabase.from('hrt_intake_drafts').insert({
          user_id: userId,
          provider_slug: (val.provider_slug as string) || null,
          question_key: questionKey,
          question_text: (val.question_text as string) || null,
          draft_answer: draftAnswer,
        });
        console.log('[HRT] Intake draft saved:', questionKey);
        return;
      }

      case 'complete_task': {
        if (!target) return;
        await supabase
          .from('assigned_tasks')
          .update({
            completed_at: new Date().toISOString(),
          })
          .eq('id', target)
          .eq('user_id', userId);
        // Also write task_completions row so the bleed evaluator sees it
        await supabase.from('task_completions').insert({
          user_id: userId,
          daily_task_id: target,
          completed_at: new Date().toISOString(),
          notes: (val.notes as string) || 'Completed via Handler directive',
        });
        console.log('[FF] Task completed:', target);
        return;
      }

      default:
        // Not a force-feminization directive — ignore silently
        return;
    }
  } catch (err) {
    console.error(`[FF] Directive ${action} failed:`, err);
    // Fire-and-forget convo link (no-op if conv doesn't exist)
    if (convId) {
      supabase.from('handler_directives').insert({
        user_id: userId,
        action: `${action}_failed`,
        conversation_id: convId,
        reasoning: `Failed: ${String(err).slice(0, 200)}`,
      }).then(() => {}, () => {});
    }
  }
}
