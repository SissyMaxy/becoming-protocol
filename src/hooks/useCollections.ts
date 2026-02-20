/**
 * useCollections — React hooks for wig, scent, and anchor collections.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getWigs, addWig, woreWigToday, setPrimaryWig, deleteWig,
  getScentProducts, addScentProduct, toggleScentRestock, deleteScentProduct,
  getScentPairings, addOrIncrementPairing,
  getAnchors, addAnchor, toggleAnchorActive, deleteAnchor,
} from '../lib/collections';
import type {
  Wig, WigInput,
  ScentProduct, ScentInput, ScentPairing, PairingActivity,
  AnchorObject, AnchorInput,
} from '../types/collections';

// =============================
// Wigs
// =============================

export function useWigs() {
  const { user } = useAuth();
  const userId = user?.id;
  const [wigs, setWigs] = useState<Wig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const data = await getWigs(userId);
    setWigs(data);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (input: WigInput) => {
    if (!userId) return;
    await addWig(userId, input);
    await refresh();
  }, [userId, refresh]);

  const woreToday = useCallback(async (wigId: string) => {
    await woreWigToday(wigId);
    setWigs(prev => prev.map(w =>
      w.id === wigId ? { ...w, timesWorn: w.timesWorn + 1, lastWornAt: new Date().toISOString() } : w
    ));
  }, []);

  const makePrimary = useCallback(async (wigId: string) => {
    if (!userId) return;
    await setPrimaryWig(userId, wigId);
    setWigs(prev => prev.map(w => ({ ...w, isPrimary: w.id === wigId })));
  }, [userId]);

  const remove = useCallback(async (wigId: string) => {
    await deleteWig(wigId);
    setWigs(prev => prev.filter(w => w.id !== wigId));
  }, []);

  return { wigs, isLoading, add, woreToday, makePrimary, remove, refresh };
}

// =============================
// Scents
// =============================

export function useScents() {
  const { user } = useAuth();
  const userId = user?.id;
  const [products, setProducts] = useState<ScentProduct[]>([]);
  const [pairings, setPairings] = useState<ScentPairing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const [p, pa] = await Promise.all([
      getScentProducts(userId),
      getScentPairings(userId),
    ]);
    setProducts(p);
    setPairings(pa);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (input: ScentInput) => {
    if (!userId) return;
    await addScentProduct(userId, input);
    await refresh();
  }, [userId, refresh]);

  const toggleRestock = useCallback(async (productId: string, needs: boolean) => {
    await toggleScentRestock(productId, needs);
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, needsRestock: needs } : p
    ));
  }, []);

  const pairWith = useCallback(async (productId: string, activity: PairingActivity) => {
    if (!userId) return;
    await addOrIncrementPairing(userId, productId, activity);
    await refresh();
  }, [userId, refresh]);

  const remove = useCallback(async (productId: string) => {
    await deleteScentProduct(productId);
    setProducts(prev => prev.filter(p => p.id !== productId));
    setPairings(prev => prev.filter(p => p.scentProductId !== productId));
  }, []);

  const getPairingsForProduct = useCallback(
    (productId: string) => pairings.filter(p => p.scentProductId === productId),
    [pairings]
  );

  return { products, pairings, isLoading, add, toggleRestock, pairWith, remove, getPairingsForProduct, refresh };
}

// =============================
// Anchors
// =============================

export function useAnchors() {
  const { user } = useAuth();
  const userId = user?.id;
  const [anchors, setAnchors] = useState<AnchorObject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    const data = await getAnchors(userId);
    setAnchors(data);
    setIsLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (input: AnchorInput) => {
    if (!userId) return;
    await addAnchor(userId, input);
    await refresh();
  }, [userId, refresh]);

  const toggleActive = useCallback(async (anchorId: string, active: boolean) => {
    await toggleAnchorActive(anchorId, active);
    setAnchors(prev => prev.map(a =>
      a.id === anchorId ? { ...a, isActive: active } : a
    ));
  }, []);

  const remove = useCallback(async (anchorId: string) => {
    await deleteAnchor(anchorId);
    setAnchors(prev => prev.filter(a => a.id !== anchorId));
  }, []);

  const totalInvestment = anchors.reduce((sum, a) => sum + (a.cost || 0), 0);

  return { anchors, isLoading, add, toggleActive, remove, totalInvestment, refresh };
}
