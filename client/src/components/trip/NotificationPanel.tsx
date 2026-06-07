import { ThumbsUp, ThumbsDown, X, MapPin, Bell } from 'lucide-react'
import type { Trip, PlaceCategory } from '../../types'
import type { TripProposal } from '../../hooks/useTripData'

interface Props {
  proposals: TripProposal[]
  myIdentity: string | null
  trip: Trip
  onVotePlace: (id: number, vote: boolean) => Promise<void>
  onRemoveVote: (id: number) => Promise<void>
  onClose: () => void
}

const CATEGORY_CONFIG: Record<PlaceCategory, { emoji: string; label: string; color: string }> = {
  attraction: { emoji: '🏛️', label: 'Attraction', color: 'bg-indigo-500/10 text-indigo-400' },
  restaurant:  { emoji: '🍽️', label: 'Restaurant', color: 'bg-amber-500/10 text-amber-400' },
  hotel:       { emoji: '🏨', label: 'Hotel',       color: 'bg-purple-500/10 text-purple-400' },
  activity:    { emoji: '🎯', label: 'Activity',    color: 'bg-emerald-500/10 text-emerald-400' },
  other:       { emoji: '📍', label: 'Other',       color: 'bg-gray-500/10 text-gray-400' },
}

export function notificationCount(proposals: TripProposal[], myIdentity: string | null): number {
  return proposals.filter(p => p.myVote === null && p.proposedBy !== (myIdentity ?? '')).length
}

export default function NotificationPanel({
  proposals, myIdentity, trip, onVotePlace, onRemoveVote, onClose,
}: Props) {
  // Show proposals the current user hasn't voted on yet, excluding their own (they auto-vote on add)
  const pending = proposals.filter(p => p.myVote === null && p.proposedBy !== (myIdentity ?? ''))
  // Also show ones they have voted on but are still open (for context)
  const voted = proposals.filter(p => p.myVote !== null)

  const memberFor = (id: string) => trip.members.find(m => m.identity === id)
  const memberName = (id: string) => memberFor(id)?.name ?? 'Someone'
  const memberColor = (id: string) => memberFor(id)?.color ?? '#6b7280'

  return (
    <div className="absolute right-0 top-full mt-2 w-96 z-50 bg-[#0f0f1a] border border-white/[0.1] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">Notifications</span>
          {pending.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-medium">
              {pending.length} need your vote
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white cursor-pointer transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {pending.length === 0 && voted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Bell className="w-8 h-8 text-gray-700 mb-2" />
            <p className="text-gray-500 text-sm font-medium">No notifications</p>
            <p className="text-gray-600 text-xs mt-1">
              When friends suggest places to add, they'll appear here for you to vote on.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {/* Pending votes */}
            {pending.map(p => {
              const cfg = CATEGORY_CONFIG[p.category]
              return (
                <div key={p.id} className="p-4 bg-indigo-500/[0.03]">
                  {/* Who proposed it */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: memberColor(p.proposedBy) }}
                    >
                      {memberName(p.proposedBy)[0]?.toUpperCase()}
                    </div>
                    <p className="text-xs text-gray-300">
                      <span className="text-white font-medium">{memberName(p.proposedBy)}</span>
                      {' '}wants to add a place{p.day > 0 ? ` to Day ${p.day}` : ''}
                    </p>
                  </div>

                  {/* Place card */}
                  <div className="flex items-start gap-3 mb-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-xl flex-shrink-0">{cfg.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      {p.address && (
                        <p className="text-[11px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                          {p.address}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {p.rating != null && (
                          <span className="text-[10px] text-amber-300">★ {p.rating.toFixed(1)}</span>
                        )}
                        {p.cost && (
                          <span className="text-[10px] text-gray-500">{p.cost}</span>
                        )}
                      </div>
                      {p.tip && (
                        <p className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">{p.tip}</p>
                      )}
                    </div>
                  </div>

                  {/* Vote buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => onVotePlace(p.id, true).catch(() => {})}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      Yes, add it · {p.yesVoters.length}
                    </button>
                    <button
                      onClick={() => onVotePlace(p.id, false).catch(() => {})}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      No · {p.noVoters.length}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Already-voted proposals (dimmed, for context) */}
            {voted.length > 0 && (
              <>
                {pending.length > 0 && (
                  <div className="px-4 py-2 bg-white/[0.02]">
                    <p className="text-[10px] text-gray-600 font-medium uppercase tracking-wider">Already voted</p>
                  </div>
                )}
                {voted.map(p => {
                  const cfg = CATEGORY_CONFIG[p.category]
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                      <span className="text-base flex-shrink-0">{cfg.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-300 truncate">{p.name}</p>
                        <p className="text-[10px] text-gray-600">
                          {p.day > 0 ? `Day ${p.day}` : 'Group pool'} ·{' '}
                          {p.myVote === true ? '✓ You voted yes' : '✗ You voted no'}
                        </p>
                      </div>
                      <button
                        onClick={() => onRemoveVote(p.id).catch(() => {})}
                        className="text-[10px] text-gray-600 hover:text-gray-300 cursor-pointer transition-colors flex-shrink-0"
                      >
                        Change
                      </button>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
