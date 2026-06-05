import { describe, it, expect } from 'vitest'
import {
  CLUSTER_STEPS, clusterSurfaceTimes, clusterDeliverAfter, isClusterReady,
} from '../../lib/gaslight-cluster'

// Regression guard for gaslight cluster scheduling (wish 3b2e8147, mig 597).

const AUTHORED = new Date('2026-06-05T18:00:00Z')

describe('cluster schedule', () => {
  it('is a three-beat seed/witness/reinforcement cluster', () => {
    expect(CLUSTER_STEPS.map(s => s.role)).toEqual(['seed', 'witness', 'reinforcement'])
  })

  it('staggers surface_after across the week', () => {
    const times = clusterSurfaceTimes(AUTHORED)
    expect(times[0].surfaceAfter.toISOString()).toBe('2026-06-05T18:00:00.000Z') // day 0
    expect(times[1].surfaceAfter.toISOString()).toBe('2026-06-07T18:00:00.000Z') // day 2
    expect(times[2].surfaceAfter.toISOString()).toBe('2026-06-09T18:00:00.000Z') // day 4
  })

  it('delivers the consensus one day after the final implant', () => {
    expect(clusterDeliverAfter(AUTHORED).toISOString()).toBe('2026-06-10T18:00:00.000Z') // day 5
  })

  it('readiness flips at deliver_after', () => {
    const da = clusterDeliverAfter(AUTHORED)
    expect(isClusterReady(da, new Date('2026-06-10T17:59:00Z'))).toBe(false)
    expect(isClusterReady(da, new Date('2026-06-10T18:00:00Z'))).toBe(true)
    expect(isClusterReady(da.toISOString(), new Date('2026-06-11T00:00:00Z'))).toBe(true)
  })
})
