import { useCallback } from 'react'
import { useStdb } from '../contexts/StdbContext'
import type { Trip, TripMember } from '../types'

const MEMBER_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4']

function colorForIndex(i: number): string {
  return MEMBER_COLORS[i % MEMBER_COLORS.length]
}

/** Map a STDB identity hex to a deterministic display name.
 *  Falls back to the first 8 chars of the identity. */
function identityLabel(identity: string): string {
  return identity.slice(0, 8)
}

export function useTrips(_userName?: string) {
  const stdb = useStdb()

  const profileFor = (identity: string) =>
    stdb.userProfiles.find(p => p.identity === identity)

  // Build Trip[] from stdb data
  const trips: Trip[] = stdb.trips.map(stdbTrip => {
    const members = stdb.tripMembers
      .filter(m => m.trip_id === stdbTrip.id)
      .map((m, i): TripMember => {
        const profile = profileFor(m.identity)
        return {
          memberId: m.id,
          name: profile?.username || identityLabel(m.identity),
          color: profile?.avatar_color || colorForIndex(i),
          isOnline: stdb.presence.some(
            p => p.identity === m.identity && p.trip_id === stdbTrip.id,
          ),
          identity: m.identity,
          isOwner: m.identity === stdbTrip.owner,
        }
      })

    const itemCount = stdb.itineraryItems.filter(item => item.trip_id === stdbTrip.id).length
    const liveCount = stdb.presence.filter(p => p.trip_id === stdbTrip.id).length

    return {
      id: stdbTrip.id.toString(),
      owner: stdbTrip.owner,
      name: stdbTrip.name,
      destination: stdbTrip.destination,
      country: stdbTrip.country,
      photo: stdbTrip.photo,
      origin: stdbTrip.origin,
      originLat: stdbTrip.origin_lat || undefined,
      originLng: stdbTrip.origin_lng || undefined,
      startDate: stdbTrip.start_date,
      endDate: stdbTrip.end_date,
      members,
      status: 'planning' as const,
      itemCount,
      liveCount,
      createdAt: new Date(Number(stdbTrip.created_at) / 1000).toISOString(),
    }
  })

  const createTrip = useCallback(async (
    name: string,
    destination: string,
    country: string,
    photo: string,
    startDate = '',
    endDate = '',
    origin = '',
    originLat?: number,
    originLng?: number,
  ): Promise<number> => {
    return await stdb.createTrip(
      name,
      destination,
      country,
      photo,
      origin,
      originLat ?? 0,
      originLng ?? 0,
      startDate,
      endDate,
    )
  }, [stdb])

  const deleteTrip = useCallback(async (id: string) => {
    const numId = parseInt(id, 10)
    if (!isNaN(numId)) {
      await stdb.deleteTrip(numId)
    }
  }, [stdb])

  // addMember is kept for backwards compat — shows no-op (invite flow needed instead)
  const addMember = useCallback((_tripId: string, _memberName: string) => {
    // Member joining is handled via invite codes (createInvite / joinTrip)
    console.info('[useTrips] addMember: use invite flow instead')
  }, [])

  return { trips, createTrip, deleteTrip, addMember }
}
