import { MapPin, Calendar, Users, ArrowRight, Radio, Crown } from 'lucide-react'
import type { Trip } from '../types'

interface TripCardProps {
  trip: Trip
  onClick: () => void
}

const STATUS_CONFIG = {
  planning: { label: 'Planning', class: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' },
  active:   { label: 'Active',   class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  completed:{ label: 'Done',     class: 'bg-gray-500/15 text-gray-400 border-gray-500/20' },
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TripCard({ trip, onClick }: TripCardProps) {
  const status = STATUS_CONFIG[trip.status]
  const hasLiveMembers = trip.liveCount > 0
  // Organizer first so their avatar leads the stack
  const sortedMembers = [...trip.members].sort(
    (a, b) => Number(b.isOwner) - Number(a.isOwner),
  )

  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl overflow-hidden cursor-pointer border border-white/[0.07] hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40 bg-[#0f0f1a]"
    >
      {/* Photo header */}
      <div className="relative h-44 overflow-hidden">
        <img
          src={trip.photo}
          alt={trip.destination}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={e => {
            (e.target as HTMLImageElement).src = `https://source.unsplash.com/featured/800x450?${encodeURIComponent(trip.destination + ',travel')}`
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f1a] via-[#0f0f1a]/20 to-transparent" />

        {/* Live badge */}
        {hasLiveMembers && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">{trip.liveCount} live</span>
          </div>
        )}

        {/* Status badge */}
        <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-medium border ${status.class} backdrop-blur-md`}>
          {status.label}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-white text-base mb-1 truncate group-hover:text-indigo-300 transition-colors">
          {trip.name}
        </h3>

        <div className="flex items-center gap-1.5 text-gray-400 text-sm mb-3">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{trip.destination}, {trip.country}</span>
        </div>

        {trip.startDate && (
          <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-3">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span>{formatDate(trip.startDate)} – {formatDate(trip.endDate)}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          {/* Member avatars */}
          <div className="flex items-center">
            <div className="flex -space-x-2">
              {sortedMembers.slice(0, 4).map((m, i) => (
                <div key={m.identity ?? i} className="relative">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[#0f0f1a]"
                    style={{ background: m.color }}
                    title={m.isOwner ? `${m.name} · Organizer` : m.name}
                  >
                    {m.name.slice(0, 1).toUpperCase()}
                  </div>
                  {m.isOwner && (
                    <Crown className="absolute -top-1.5 -right-0.5 w-2.5 h-2.5 text-amber-400 fill-amber-400 drop-shadow" />
                  )}
                </div>
              ))}
              {trip.members.length > 4 && (
                <div className="w-6 h-6 rounded-full bg-white/10 border-2 border-[#0f0f1a] flex items-center justify-center text-[10px] text-gray-400">
                  +{trip.members.length - 4}
                </div>
              )}
            </div>
            <span className="text-xs text-gray-500 ml-2">
              <Users className="w-3 h-3 inline mr-0.5" />
              {trip.members.length}
            </span>
          </div>

          {/* Arrow */}
          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
            <ArrowRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-indigo-400 transition-colors" />
          </div>
        </div>
      </div>
    </div>
  )
}
