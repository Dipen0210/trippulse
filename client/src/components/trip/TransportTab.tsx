import { useState } from 'react'
import { Plane, Train, Bus, Car, Ship, Plus, ExternalLink, Trash2, X } from 'lucide-react'
import type { Trip, TripDetail, TransportLeg, TransportMode } from '../../types'

const MODE_CONFIG: Record<TransportMode, {
  label: string
  Icon: React.ElementType
  color: string
  site: string
  url: (from: string, to: string) => string
}> = {
  flight: {
    label: 'Flight', Icon: Plane,
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
    site: 'Google Flights',
    url: (f, t) => `https://www.google.com/travel/flights?q=flights+from+${encodeURIComponent(f)}+to+${encodeURIComponent(t)}`,
  },
  train: {
    label: 'Train', Icon: Train,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    site: 'Rome2Rio',
    url: (f, t) => `https://www.rome2rio.com/s/${encodeURIComponent(f)}/${encodeURIComponent(t)}`,
  },
  bus: {
    label: 'Bus', Icon: Bus,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    site: 'Rome2Rio',
    url: (f, t) => `https://www.rome2rio.com/s/${encodeURIComponent(f)}/${encodeURIComponent(t)}`,
  },
  car: {
    label: 'Drive', Icon: Car,
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    site: 'Google Maps',
    url: (f, t) => `https://www.google.com/maps/dir/${encodeURIComponent(f)}/${encodeURIComponent(t)}`,
  },
  ferry: {
    label: 'Ferry', Icon: Ship,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    site: 'DirectFerries',
    url: () => 'https://www.directferries.com/',
  },
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'SGD', 'THB']

interface Props {
  trip: Trip
  detail: TripDetail
  onAddLeg: (leg: Omit<TransportLeg, 'id'>) => void
  onRemoveLeg: (id: string) => void
  onUpdatePreferences: (p: Partial<TripDetail['preferences']>) => void
}

export default function TransportTab({ trip, detail, onAddLeg, onRemoveLeg, onUpdatePreferences }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    from: trip.origin || trip.destination,
    to: trip.origin ? trip.destination : '',
    mode: 'flight' as TransportMode,
    date: trip.startDate || '',
    cost: '',
    currency: detail.currency || 'USD',
  })

  const handleAdd = () => {
    if (!form.from.trim() || !form.to.trim()) return
    onAddLeg({
      from: form.from.trim(),
      to: form.to.trim(),
      mode: form.mode,
      date: form.date,
      estimatedCost: parseFloat(form.cost) || 0,
      currency: form.currency,
      booked: false,
    })
    setForm(f => ({ ...f, to: '', cost: '', date: trip.startDate || '' }))
    setShowForm(false)
  }

  const toggleMode = (mode: TransportMode) => {
    const curr = detail.preferences.transportModes
    const next = curr.includes(mode)
      ? curr.filter(m => m !== mode)
      : [...curr, mode]
    if (next.length > 0) onUpdatePreferences({ transportModes: next })
  }

  return (
    <div className="space-y-6">
      {/* Preferences card */}
      <div className="glass rounded-2xl p-5 border border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white mb-4">Travel preferences</h3>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-2">Preferred transport</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(MODE_CONFIG) as [TransportMode, typeof MODE_CONFIG[TransportMode]][]).map(([mode, cfg]) => {
                const { Icon } = cfg
                const active = detail.preferences.transportModes.includes(mode)
                return (
                  <button
                    key={mode}
                    onClick={() => toggleMode(mode)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border cursor-pointer transition-all ${
                      active ? cfg.color : 'text-gray-500 bg-white/[0.03] border-white/[0.08] hover:border-white/20 hover:text-gray-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-2">Budget level</p>
              <div className="flex gap-2">
                {(['budget', 'mid-range', 'luxury'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => onUpdatePreferences({ budgetLevel: level })}
                    className={`px-3 py-1.5 rounded-lg text-xs capitalize cursor-pointer transition-all ${
                      detail.preferences.budgetLevel === level
                        ? 'bg-indigo-500 text-white'
                        : 'glass text-gray-400 hover:text-white'
                    }`}
                  >
                    {level === 'budget' ? '💰' : level === 'mid-range' ? '💳' : '💎'} {level}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">Trip pace</p>
              <div className="flex gap-2">
                {(['relaxed', 'moderate', 'packed'] as const).map(pace => (
                  <button
                    key={pace}
                    onClick={() => onUpdatePreferences({ pace })}
                    className={`px-3 py-1.5 rounded-lg text-xs capitalize cursor-pointer transition-all ${
                      detail.preferences.pace === pace
                        ? 'bg-purple-500 text-white'
                        : 'glass text-gray-400 hover:text-white'
                    }`}
                  >
                    {pace}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legs section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Transport legs</h3>
            <p className="text-xs text-gray-500 mt-0.5">Routes between your destinations</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add leg
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="mb-4 glass rounded-2xl p-5 border border-white/[0.07]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">New transport leg</span>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode selector */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(Object.entries(MODE_CONFIG) as [TransportMode, typeof MODE_CONFIG[TransportMode]][]).map(([mode, cfg]) => {
                const { Icon } = cfg
                return (
                  <button
                    key={mode}
                    onClick={() => setForm(f => ({ ...f, mode }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border cursor-pointer transition-all ${
                      form.mode === mode ? cfg.color : 'text-gray-500 bg-white/[0.03] border-white/[0.08]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">From</label>
                <input
                  value={form.from}
                  onChange={e => setForm(f => ({ ...f, from: e.target.value }))}
                  placeholder="City, airport, or station"
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">To</label>
                <input
                  value={form.to}
                  onChange={e => setForm(f => ({ ...f, to: e.target.value }))}
                  placeholder="City, airport, or station"
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Est. cost / person</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={form.cost}
                    onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                    placeholder="0"
                    className="flex-1 px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                  />
                  <select
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="px-2 bg-white/[0.06] border border-white/[0.08] rounded-xl text-gray-300 text-xs focus:outline-none cursor-pointer"
                  >
                    {CURRENCIES.map(c => <option key={c} className="bg-[#0f0f1a]">{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={handleAdd}
              disabled={!form.from.trim() || !form.to.trim()}
              className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white rounded-xl text-sm font-medium cursor-pointer transition-all"
            >
              Add transport leg
            </button>
          </div>
        )}

        {/* Legs list */}
        {detail.transport.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 glass rounded-2xl border border-dashed border-white/[0.08] text-center">
            <Plane className="w-10 h-10 text-gray-700 mb-3" />
            <p className="text-gray-400 font-medium">No transport legs yet</p>
            <p className="text-gray-600 text-sm mt-1">Add flights, trains or drives between destinations</p>
          </div>
        ) : (
          <div className="space-y-3">
            {detail.transport.map(leg => {
              const cfg = MODE_CONFIG[leg.mode]
              const { Icon } = cfg
              const bookUrl = cfg.url(leg.from, leg.to)
              return (
                <div key={leg.id} className="flex items-center gap-4 p-4 glass rounded-2xl border border-white/[0.05]">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm mb-0.5">
                      <span className="font-semibold text-white">{leg.from}</span>
                      <span className="text-gray-600">→</span>
                      <span className="font-semibold text-white">{leg.to}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>{cfg.label}</span>
                      {leg.date && <><span>·</span><span>{new Date(leg.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>}
                      {leg.estimatedCost > 0 && <><span>·</span><span className="text-gray-300">~{leg.currency} {leg.estimatedCost}/person</span></>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={bookUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 rounded-lg text-xs cursor-pointer transition-all"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {cfg.site}
                    </a>
                    <button
                      onClick={() => onRemoveLeg(leg.id)}
                      className="text-gray-600 hover:text-red-400 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
