import { useState } from 'react'
import { X, Plane, Calendar, Check, Minus, Plus, Navigation, Loader2, Sparkles, Hand, ArrowRight } from 'lucide-react'
import PlaceSearch from './PlaceSearch'
import type { PlaceResult } from '../types'

export type PlanMode = 'ai' | 'manual'

interface CreateTripModalProps {
  onClose: () => void
  onCreate: (
    name: string,
    destination: string,
    country: string,
    photo: string,
    startDate: string,
    endDate: string,
    mode: PlanMode,
  ) => Promise<void>
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDateRange(start: string, days: number): string {
  const startD = new Date(start)
  const endD = new Date(start)
  endD.setDate(endD.getDate() + days - 1)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(startD)} – ${fmt(endD)}`
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

type Step = 'destination' | 'details' | 'mode'
const STEPS: Step[] = ['destination', 'details', 'mode']
const STEP_LABEL: Record<Step, string> = {
  destination: 'Destination',
  details: 'Plan',
  mode: 'Build',
}

export default function CreateTripModal({ onClose, onCreate }: CreateTripModalProps) {
  const [step, setStep] = useState<Step>('destination')
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null)
  const [tripName, setTripName] = useState('')
  const [days, setDays] = useState(5)
  const [startDate, setStartDate] = useState(todayISO())
  const [creating, setCreating] = useState<PlanMode | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const endDate = addDays(startDate, days - 1)

  const handlePlaceSelect = (place: PlaceResult) => {
    setSelectedPlace(place)
    setTripName(`${place.name} Trip`)
    setStep('details')
  }

  const handleCreate = async (mode: PlanMode) => {
    if (!selectedPlace || !tripName.trim() || creating) return
    setCreating(mode)
    setCreateError(null)
    try {
      await onCreate(
        tripName.trim(),
        selectedPlace.name,
        selectedPlace.country,
        selectedPlace.photo,
        startDate,
        endDate,
        mode,
      )
      onClose()
    } catch (err) {
      console.error('[CreateTripModal] onCreate failed:', err)
      setCreateError(err instanceof Error ? err.message : 'Failed to create trip. Please try again.')
      setCreating(null)
    }
  }

  const changeDays = (delta: number) => {
    setDays(d => Math.max(1, Math.min(30, d + delta)))
  }

  const subtitle =
    step === 'destination' ? 'Where are you going?'
    : step === 'details' ? 'How long is the trip?'
    : 'How do you want to build it?'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f0f1a] shadow-2xl shadow-black/60 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Plane className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">New Trip</h2>
              <p className="text-xs text-gray-500">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-all cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center px-6 py-3 gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                step === s
                  ? 'bg-indigo-500 text-white'
                  : i < STEPS.indexOf(step)
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/[0.06] text-gray-500'
              }`}>
                {i < STEPS.indexOf(step) ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={`text-xs ${step === s ? 'text-white' : 'text-gray-500'}`}>
                {STEP_LABEL[s]}
              </span>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-white/[0.08] mx-1" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-2">
          {step === 'destination' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">Search for your destination and select it from the results.</p>
              <PlaceSearch onSelect={handlePlaceSelect} placeholder="e.g. Vadodara, Tokyo, Paris, Bali..." />
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-4">
              {/* Selected destination chip */}
              {selectedPlace && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    <img src={selectedPlace.photo} alt={selectedPlace.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{selectedPlace.name}</div>
                    {selectedPlace.country && <div className="text-xs text-gray-400">{selectedPlace.country}</div>}
                  </div>
                  <button onClick={() => setStep('destination')} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer flex-shrink-0">
                    Change
                  </button>
                </div>
              )}

              {/* Trip name */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Trip name</label>
                <input
                  type="text"
                  value={tripName}
                  onChange={e => setTripName(e.target.value)}
                  placeholder="My awesome trip..."
                  className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder-gray-600 text-sm focus:outline-none focus:border-indigo-500/60 transition-all"
                />
              </div>

              {/* Number of days */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">How many days?</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-0 bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
                    <button
                      onClick={() => changeDays(-1)}
                      disabled={days <= 1}
                      className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-14 h-10 flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">{days}</span>
                    </div>
                    <button
                      onClick={() => changeDays(1)}
                      disabled={days >= 30}
                      className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-sm text-gray-400">
                    {days === 1 ? '1 day' : `${days} days`}
                  </span>

                  {/* Quick presets */}
                  <div className="flex gap-1.5 ml-auto">
                    {[3, 5, 7, 10, 14].map(n => (
                      <button
                        key={n}
                        onClick={() => setDays(n)}
                        className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-all ${
                          days === n
                            ? 'bg-indigo-500 text-white'
                            : 'glass text-gray-500 hover:text-white'
                        }`}
                      >
                        {n}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Start date */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  <Calendar className="w-3 h-3 inline mr-1" />Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500/60 transition-all [color-scheme:dark]"
                />
              </div>

              {/* Preview banner */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <Navigation className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                    <span>{selectedPlace?.name}</span>
                    <span className="text-gray-600">·</span>
                    <span>{days} day{days !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{formatDateRange(startDate, days)}</div>
                </div>
              </div>

              {/* CTA → mode step */}
              <button
                onClick={() => setStep('mode')}
                disabled={!tripName.trim()}
                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 'mode' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                {days} day{days !== 1 ? 's' : ''} in <span className="text-white font-medium">{selectedPlace?.name}</span>. How should we build your itinerary?
              </p>

              {/* AI suggested */}
              <button
                onClick={() => handleCreate('ai')}
                disabled={!!creating}
                className="w-full text-left p-4 rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/15 hover:to-purple-500/15 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    {creating === 'ai' ? <Loader2 className="w-5 h-5 text-indigo-300 animate-spin" /> : <Sparkles className="w-5 h-5 text-indigo-300" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">Use AI suggested plan</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Fastest</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      {creating === 'ai'
                        ? 'Creating your trip… you’ll land on the itinerary as it generates.'
                        : 'We instantly research and design a full day-by-day plan with top-rated places, food, and timing.'}
                    </p>
                  </div>
                </div>
              </button>

              {/* Manual */}
              <button
                onClick={() => handleCreate('manual')}
                disabled={!!creating}
                className="w-full text-left p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/15 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                    {creating === 'manual' ? <Loader2 className="w-5 h-5 text-gray-300 animate-spin" /> : <Hand className="w-5 h-5 text-gray-300" />}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white">Create manually</span>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      {creating === 'manual'
                        ? 'Creating your trip…'
                        : 'Pick the places you care about first, then hit “Generate trip” — the AI builds the plan around your picks.'}
                    </p>
                  </div>
                </div>
              </button>

              {createError && (
                <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {createError}
                </div>
              )}

              <button
                onClick={() => setStep('details')}
                disabled={!!creating}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer disabled:opacity-40"
              >
                ← Back to details
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
