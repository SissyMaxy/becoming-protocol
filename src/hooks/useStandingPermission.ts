/**
 * Standing Permission Hook
 *
 * Reads from handler_standing_permissions table.
 * Returns grant status and parameters for a permission domain.
 * Cached aggressively — these don't change often.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { PermissionDomain } from '../types/hypno-session';

interface StandingPermissionResult {
  granted: boolean;
  parameters: Record<string, unknown>;
  loading: boolean;
}

// In-memory cache — persists for app lifetime
const permissionCache = new Map<string, {
  granted: boolean;
  parameters: Record<string, unknown>;
  fetchedAt: number;
}>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useStandingPermission(domain: PermissionDomain): StandingPermissionResult {
  const { user } = useAuth();
  const [granted, setGranted] = useState(false);
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const cacheKey = `${user.id}:${domain}`;
    const cached = permissionCache.get(cacheKey);

    // Check cache
    if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
      setGranted(cached.granted);
      setParameters(cached.parameters);
      setLoading(false);
      return;
    }

    // Fetch from DB
    let cancelled = false;

    async function fetchPermission() {
      const { data } = await supabase
        .from('handler_standing_permissions')
        .select('granted, parameters')
        .eq('user_id', user!.id)
        .eq('permission_domain', domain)
        .single();

      if (cancelled) return;

      const isGranted = data?.granted ?? false;
      const params = (data?.parameters as Record<string, unknown>) ?? {};

      // Cache it
      permissionCache.set(cacheKey, {
        granted: isGranted,
        parameters: params,
        fetchedAt: Date.now(),
      });

      setGranted(isGranted);
      setParameters(params);
      setLoading(false);
    }

    fetchPermission();
    return () => { cancelled = true; };
  }, [user?.id, domain]);

  return { granted, parameters, loading };
}

/**
 * Batch fetch all standing permissions for a user.
 * Useful for components that need to check multiple permissions.
 */
export function useAllStandingPermissions(): {
  permissions: Map<PermissionDomain, { granted: boolean; parameters: Record<string, unknown> }>;
  loading: boolean;
} {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Map<PermissionDomain, { granted: boolean; parameters: Record<string, unknown> }>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      const { data } = await supabase
        .from('handler_standing_permissions')
        .select('permission_domain, granted, parameters')
        .eq('user_id', user!.id);

      if (cancelled) return;

      const map = new Map<PermissionDomain, { granted: boolean; parameters: Record<string, unknown> }>();

      if (data) {
        for (const row of data) {
          map.set(row.permission_domain as PermissionDomain, {
            granted: row.granted ?? false,
            parameters: (row.parameters as Record<string, unknown>) ?? {},
          });

          // Also populate single-permission cache
          const cacheKey = `${user!.id}:${row.permission_domain}`;
          permissionCache.set(cacheKey, {
            granted: row.granted ?? false,
            parameters: (row.parameters as Record<string, unknown>) ?? {},
            fetchedAt: Date.now(),
          });
        }
      }

      setPermissions(map);
      setLoading(false);
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { permissions, loading };
}
