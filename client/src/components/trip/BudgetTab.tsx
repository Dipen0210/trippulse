import { useState } from 'react'
import { DollarSign, Plus, Trash2, X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { Trip, TripDetail, Expense, ExpenseCategory } from '../../types'

const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; emoji: string; color: string }> = {
  accommodation: { label: 'Accommodation', emoji: '🏨', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  food:          { label: 'Food & Drink',  emoji: '🍽️', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  transport:     { label: 'Transport',     emoji: '🚌', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  activity:      { label: 'Activities',   emoji: '🎯', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  shopping:      { label: 'Shopping',     emoji: '🛍️', color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  other:         { label: 'Other',        emoji: '💫', color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'SGD', 'THB']

function generateSettlements(
  members: string[],
  perPerson: Record<string, { balance: number }>,
): { from: string; to: string; amount: number }[] {
  const balances = members.map(n => ({ name: n, balance: perPerson[n]?.balance ?? 0 }))
  const debtors = balances.filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance)
  const creditors = balances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance)
  const result: { from: string; to: string; amount: number }[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(Math.abs(debtors[i].balance), creditors[j].balance)
    if (amount > 0.01) result.push({ from: debtors[i].name, to: creditors[j].name, amount })
    debtors[i].balance += amount
    creditors[j].balance -= amount
    if (Math.abs(debtors[i].balance) < 0.01) i++
    if (creditors[j].balance < 0.01) j++
  }
  return result
}

interface Props {
  trip: Trip
  detail: TripDetail
  totalSpent: number
  perPersonExpenses: Record<string, { paid: number; owed: number; balance: number }>
  onAddExpense: (e: Omit<Expense, 'id'>) => void
  onRemoveExpense: (id: string) => void
  onSetBudget: (amount: number, currency: string) => void
}

export default function BudgetTab({
  trip, detail, totalSpent, perPersonExpenses,
  onAddExpense, onRemoveExpense, onSetBudget,
}: Props) {
  const memberNames = trip.members.map(m => m.name)
  const [showForm, setShowForm] = useState(false)
  const [editBudget, setEditBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState(detail.budget > 0 ? String(detail.budget) : '')

  const [form, setForm] = useState({
    title: '',
    amount: '',
    currency: detail.currency || 'USD',
    paidBy: memberNames[0] || '',
    splitBetween: memberNames,
    category: 'food' as ExpenseCategory,
    date: new Date().toISOString().split('T')[0],
  })

  const handleAdd = () => {
    if (!form.title.trim() || !form.amount || !form.paidBy || form.splitBetween.length === 0) return
    onAddExpense({ ...form, amount: parseFloat(form.amount) })
    setForm(f => ({ ...f, title: '', amount: '' }))
    setShowForm(false)
  }

  const toggleSplit = (name: string) => {
    setForm(f => ({
      ...f,
      splitBetween: f.splitBetween.includes(name)
        ? f.splitBetween.filter(n => n !== name)
        : [...f.splitBetween, name],
    }))
  }

  const budgetPct = detail.budget > 0 ? Math.min((totalSpent / detail.budget) * 100, 100) : 0
  const budgetColor = budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
  const remaining = detail.budget - totalSpent

  const byCategory = (Object.entries(CATEGORY_CONFIG) as [ExpenseCategory, typeof CATEGORY_CONFIG[ExpenseCategory]][])
    .map(([cat, cfg]) => ({
      cat, ...cfg,
      amount: detail.expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
    }))
    .filter(c => c.amount > 0)

  const settlements = generateSettlements(memberNames, perPersonExpenses)

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Budget overview */}
      <div className="glass rounded-2xl p-5 border border-white/[0.06]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Budget overview</h3>
          {editBudget ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                autoFocus
                className="w-24 px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500/50"
                placeholder="0"
              />
              <span className="text-xs text-gray-500">{detail.currency}</span>
              <button
                onClick={() => { onSetBudget(parseFloat(budgetInput) || 0, detail.currency); setEditBudget(false) }}
                className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                Save
              </button>
              <button onClick={() => setEditBudget(false)} className="text-xs text-gray-500 cursor-pointer">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setEditBudget(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
            >
              {detail.budget > 0 ? 'Edit budget' : '+ Set budget'}
            </button>
          )}
        </div>

        <div className="flex items-end gap-5 mb-4">
          <div>
            <div className="text-3xl font-bold text-white">
              {detail.currency} {totalSpent.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {detail.budget > 0 ? `of ${detail.currency} ${detail.budget.toLocaleString()} budget` : 'total spent'}
            </div>
          </div>
          {detail.budget > 0 && (
            <div className={`text-sm font-medium mb-0.5 ${remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {remaining >= 0
                ? `${detail.currency} ${remaining.toFixed(2)} remaining`
                : `${detail.currency} ${Math.abs(remaining).toFixed(2)} over budget`
              }
            </div>
          )}
        </div>

        {detail.budget > 0 && (
          <div className="w-full bg-white/[0.06] rounded-full h-1.5 mb-4">
            <div className={`h-1.5 rounded-full transition-all duration-500 ${budgetColor}`} style={{ width: `${budgetPct}%` }} />
          </div>
        )}

        {byCategory.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {byCategory.map(c => (
              <div key={c.cat} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs ${c.color}`}>
                <span>{c.emoji}</span>
                <span>{c.label}</span>
                <span className="font-semibold">{detail.currency} {c.amount.toFixed(0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Split summary */}
      {memberNames.length > 1 && detail.expenses.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white mb-4">Group split</h3>

          <div className="space-y-3 mb-4">
            {memberNames.map(name => {
              const data = perPersonExpenses[name] ?? { paid: 0, owed: 0, balance: 0 }
              const member = trip.members.find(m => m.name === name)
              return (
                <div key={name} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: member?.color || '#6366f1' }}
                  >
                    {name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white font-medium">{name}</span>
                      <span className={`text-sm font-semibold ${
                        data.balance > 0.01 ? 'text-emerald-400'
                        : data.balance < -0.01 ? 'text-red-400'
                        : 'text-gray-500'
                      }`}>
                        {data.balance > 0.01 ? '+' : ''}{detail.currency} {data.balance.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      paid {detail.currency} {data.paid.toFixed(2)} · owes {detail.currency} {data.owed.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {data.balance > 0.01 ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                    : data.balance < -0.01 ? <TrendingDown className="w-4 h-4 text-red-400" />
                    : <Minus className="w-4 h-4 text-gray-600" />}
                  </div>
                </div>
              )
            })}
          </div>

          {settlements.length > 0 ? (
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-gray-500 mb-2 font-medium">Settlement plan</p>
              <div className="space-y-1.5">
                {settlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-red-400 font-medium">{s.from}</span>
                    <span className="text-gray-600">pays</span>
                    <span className="text-emerald-400 font-medium">{s.to}</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-white font-semibold">{detail.currency} {s.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-emerald-400">✓ Everyone is settled up!</p>
            </div>
          )}
        </div>
      )}

      {/* Expenses */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Expenses</h3>
            <p className="text-xs text-gray-500 mt-0.5">{detail.expenses.length} logged</p>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add expense
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="mb-4 glass rounded-2xl p-5 border border-white/[0.07]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">New expense</span>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="What was this for?"
                autoFocus
                className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="Amount"
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
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              {/* Category */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Category</p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.entries(CATEGORY_CONFIG) as [ExpenseCategory, typeof CATEGORY_CONFIG[ExpenseCategory]][]).map(([cat, cfg]) => (
                    <button
                      key={cat}
                      onClick={() => setForm(f => ({ ...f, category: cat }))}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border cursor-pointer transition-all ${
                        form.category === cat ? cfg.color : 'glass text-gray-500 border-white/[0.06] hover:text-gray-300'
                      }`}
                    >
                      {cfg.emoji} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {memberNames.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Paid by</p>
                  <div className="flex flex-wrap gap-2">
                    {memberNames.map(name => (
                      <button
                        key={name}
                        onClick={() => setForm(f => ({ ...f, paidBy: name }))}
                        className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                          form.paidBy === name ? 'bg-indigo-500 text-white' : 'glass text-gray-400 hover:text-white'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {memberNames.length > 1 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Split between</p>
                  <div className="flex flex-wrap gap-2">
                    {memberNames.map(name => {
                      const included = form.splitBetween.includes(name)
                      const perHead = included && form.amount
                        ? (parseFloat(form.amount) / form.splitBetween.length).toFixed(2)
                        : null
                      return (
                        <button
                          key={name}
                          onClick={() => toggleSplit(name)}
                          className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                            included
                              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                              : 'glass text-gray-500 hover:text-gray-300'
                          }`}
                        >
                          {name}{perHead && <span className="ml-1 opacity-70">({perHead})</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={handleAdd}
                disabled={!form.title.trim() || !form.amount || form.splitBetween.length === 0}
                className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white rounded-xl text-sm font-medium cursor-pointer transition-all"
              >
                Add expense
              </button>
            </div>
          </div>
        )}

        {/* Expense list */}
        {detail.expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 glass rounded-2xl border border-dashed border-white/[0.08] text-center">
            <DollarSign className="w-10 h-10 text-gray-700 mb-3" />
            <p className="text-gray-400 font-medium">No expenses yet</p>
            <p className="text-gray-600 text-sm mt-1">Track spending and split fairly with your group</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...detail.expenses].reverse().map(expense => {
              const cfg = CATEGORY_CONFIG[expense.category]
              const perPerson = expense.splitBetween.length > 0 ? expense.amount / expense.splitBetween.length : expense.amount
              return (
                <div key={expense.id} className="flex items-center gap-3 p-4 glass rounded-2xl border border-white/[0.05]">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 border ${cfg.color}`}>
                    {cfg.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{expense.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      <span className="text-gray-300">{expense.paidBy}</span> paid ·{' '}
                      {expense.splitBetween.length > 1
                        ? `split ${expense.splitBetween.length} ways (${expense.currency} ${perPerson.toFixed(2)}/person)`
                        : 'not split'
                      }
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-semibold text-white text-sm">{expense.currency} {expense.amount.toFixed(2)}</span>
                    <button onClick={() => onRemoveExpense(expense.id)} className="text-gray-600 hover:text-red-400 cursor-pointer transition-colors">
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
