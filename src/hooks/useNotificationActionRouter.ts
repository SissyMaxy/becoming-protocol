/**
 * useNotificationActionRouter — the deep-link half of actionable push.
 *
 * Notification ACTIONS ("Reply" / "Mark done" / "Snap it") are best-effort:
 * iOS PWAs render NO action buttons at all (a tap just opens the app), and on
 * any platform the cached SW token can be missing/expired. For those paths the
 * service worker falls back to opening the app at:
 *
 *     /?complete_outreach=<outreach_id>[&reply=<text>]
 *
 * This hook is what makes that fallback actually complete the task. On load it
 * reads those query params and finishes the outreach through the LIVE,
 * authenticated supabase session (so no SW-cached token is needed), then clears
 * the params from the URL so a refresh doesn't re-fire. It also listens for a
 * SW postMessage carrying the same payload, for the case where a window is
 * already open when the notification is tapped.
 *
 * Contract (must stay in sync with public/sw.js):
 *   - query param  ?complete_outreach=<uuid>   — the outreach to act on
 *   - query param  &ak=<action_kind>           — 'confession' | 'photo' | 'plain'
 *   - query param  &reply=<urlencoded text>    — optional inline reply text
 *   - SW message   { type: 'OUTREACH_ACTION', outreach_id, action_kind?, reply_text? }
 *
 * Completion gating by action_kind (so an empty open-tap doesn't falsely
 * "finish" a task that needs an answer or a photo):
 *   - reply text present              → POST /reply (answers it), any kind.
 *   - action_kind 'confession'/'photo' with NO reply → do NOT auto-complete;
 *     the app just opens (chat / photo surface) so the user can respond.
 *   - action_kind 'plain' / absent with NO reply → POST /complete (mark done).
 *
 * Mount ONCE at app root.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { startSwAuthSync } from '../lib/push/sw-auth';
import { planOutreachCompletion } from '../lib/push/outreach-action';

async function completeOutreach(
  outreachId: string,
  replyText: string | null,
  actionKind: string | null,
): Promise<void> {
  // Gating contract (shared with public/sw.js) lives in planOutreachCompletion:
  // an empty confession/photo tap resolves to endpoint=null and we do nothing
  // but open the app, so a task that needs content is never marked done.
  const plan = planOutreachCompletion(outreachId, replyText, actionKind);
  if (!plan.endpoint) return;

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return; // not authed yet — nothing we can do; the param stays for a later load

  try {
    await fetch(`/api/outreach/${plan.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(plan.body),
    });
    // 404 (not found / not owned), 409 (already replied), 200 (done) are all
    // terminal from the user's side — we don't retry or surface an error; the
    // task is either finished or already resolved.
  } catch (err) {
    console.warn('[notif-action-router] complete failed:', err);
  }
}

function clearOutreachParams(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('complete_outreach');
    url.searchParams.delete('reply');
    url.searchParams.delete('ak');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignore */
  }
}

export function useNotificationActionRouter(): void {
  const { user } = useAuth();
  // Guard against double-firing the same outreach within a session (param read
  // + a racing SW message could both fire).
  const handledRef = useRef<Set<string>>(new Set());

  // Keep the SW's IndexedDB access token fresh (app load + login + refresh,
  // cleared on sign-out) so notification ACTIONS can authenticate from inside
  // the worker. Mounted here so App.tsx needs only one hook call.
  useEffect(() => {
    const stop = startSwAuthSync();
    return stop;
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const handle = (outreachId: string, replyText: string | null, actionKind: string | null) => {
      if (!outreachId || handledRef.current.has(outreachId)) return;
      handledRef.current.add(outreachId);
      void completeOutreach(outreachId, replyText, actionKind);
    };

    // 1. Deep-link params on load (the iOS / token-expired fallback path).
    try {
      const params = new URLSearchParams(window.location.search);
      const outreachId = params.get('complete_outreach');
      if (outreachId) {
        handle(outreachId, params.get('reply'), params.get('ak'));
        clearOutreachParams();
      }
    } catch {
      /* ignore */
    }

    // 2. SW message — fired when a window is already open at tap time.
    const onMessage = (event: MessageEvent) => {
      const d = event.data;
      if (d && d.type === 'OUTREACH_ACTION' && typeof d.outreach_id === 'string') {
        handle(
          d.outreach_id,
          typeof d.reply_text === 'string' ? d.reply_text : null,
          typeof d.action_kind === 'string' ? d.action_kind : null,
        );
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [user?.id]);
}
