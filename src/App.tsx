/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Habit {
  id: string;
  name: string;
  streak: number;
  lastCompletedDate: string | null;
  isDoneToday: boolean;
  motivationTip: string | null;
}

const STORAGE_KEY = 'bloom_habits_v1';
const API_KEY_STORAGE = 'anthropic_api_key';

export default function App() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newHabitName, setNewHabitName] = useState('');
  const [anthropicKey, setAnthropicKey] = useState(localStorage.getItem(API_KEY_STORAGE) || '');
  const [loadingMotivations, setLoadingMotivations] = useState<Record<string, boolean>>({});

  // Initialize and check for daily reset
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const lastVisitDate = localStorage.getItem('last_visit_date');
    const today = new Date().toISOString().split('T')[0];

    let currentHabits: Habit[] = saved ? JSON.parse(saved) : [];

    if (lastVisitDate !== today) {
      // It's a new day!
      currentHabits = currentHabits.map((h) => {
        // If they missed yesterday, the streak is technically broken if they don't do it today,
        // but it definitely resets if the last completion wasn't yesterday.
        // Actually, just resetting 'isDoneToday' is the first step.
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // If today is a new day, isDoneToday must be false
        const updatedHabit = { ...h, isDoneToday: false, motivationTip: null };
        
        // If the last completion was NOT yesterday and NOT today (from previous runs), 
        // the streak should probably be 0 because they missed a day.
        // But let's only reset streak when they check it today and it wasn't yesterday.
        if (h.lastCompletedDate !== yesterdayStr && h.lastCompletedDate !== today) {
           // Streak is broken
           updatedHabit.streak = 0;
        }

        return updatedHabit;
      });
      localStorage.setItem('last_visit_date', today);
    }

    setHabits(currentHabits);
  }, []);

  // Save to localStorage whenever habits change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  }, [habits]);

  const addHabit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitName.trim()) return;

    const newHabit: Habit = {
      id: crypto.randomUUID(),
      name: newHabitName.trim(),
      streak: 0,
      lastCompletedDate: null,
      isDoneToday: false,
      motivationTip: null,
    };

    setHabits([...habits, newHabit]);
    setNewHabitName('');
  };

  const deleteHabit = (id: string) => {
    setHabits(habits.filter((h) => h.id !== id));
  };

  const toggleHabit = (id: string) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    setHabits(habits.map((h) => {
      if (h.id === id) {
        if (!h.isDoneToday) {
          // Marking as done
          let newStreak = 1;
          if (h.lastCompletedDate === yesterdayStr) {
            newStreak = h.streak + 1;
          }
          return {
            ...h,
            isDoneToday: true,
            lastCompletedDate: today,
            streak: newStreak,
          };
        } else {
          // Unmarking (oops button)
          const newStreak = Math.max(0, h.streak - 1);
          return {
            ...h,
            isDoneToday: false,
            // This is slightly flawed if we want to restore exact history, 
            // but simple for now. 
            lastCompletedDate: h.streak > 1 ? yesterdayStr : null,
            streak: newStreak,
          };
        }
      }
      return h;
    }));
  };

  const getMotivation = async (habit: Habit) => {
    if (!anthropicKey) {
      alert('Please enter your Anthropic API key first.');
      return;
    }

    setLoadingMotivations({ ...loadingMotivations, [habit.id]: true });

    try {
      // NOTE: Anthropic API typically does not allow direct client-side requests due to CORS settings.
      // This implementation follows the user's specific request for a client-side key.
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true', // Required for client-side calls
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229', // Using standard model as per user's request (mapped to available)
          max_tokens: 100,
          messages: [
            {
              role: 'user',
              content: `Give me one short, punchy motivational tip (1-2 sentences) for someone trying to build this habit: "${habit.name}"`
            }
          ]
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || "You've got this! Every step counts.";

      setHabits(habits.map((h) => 
        h.id === habit.id ? { ...h, motivationTip: content } : h
      ));
    } catch (err) {
      console.error(err);
      alert('Failed to fetch motivation. This might be due to CORS or an invalid API key.');
    } finally {
      setLoadingMotivations({ ...loadingMotivations, [habit.id]: false });
    }
  };

  return (
    <div className="min-h-screen bg-emerald-50/30 font-sans text-emerald-950 px-4 py-8 md:py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Header & API Key */}
        <header className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-serif font-bold tracking-tight text-emerald-900 italic">Bloom</h1>
              <p className="text-emerald-700/70 font-medium">Nurture your daily habits.</p>
            </div>
          </div>

          <form onSubmit={addHabit} className="flex gap-2">
            <input
              type="text"
              placeholder="What habit would you like to grow?"
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              className="flex-1 bg-white border-2 border-emerald-100 rounded-2xl px-6 py-4 focus:outline-none focus:border-emerald-400 transition-all shadow-sm"
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-8 font-semibold transition-all shadow-md active:scale-95 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Add</span>
            </button>
          </form>
        </header>

        {/* Habits List */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {habits.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/50 border-2 border-dashed border-emerald-100 rounded-3xl p-12 text-center space-y-2"
              >
                <div className="bg-emerald-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-emerald-800">No habits yet</h3>
                <p className="text-emerald-600/60 max-w-xs mx-auto">Start small. Add a habit above and watch it bloom over time.</p>
              </motion.div>
            ) : (
              habits.map((habit) => (
                <motion.div
                  key={habit.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border border-emerald-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <button 
                        onClick={() => toggleHabit(habit.id)}
                        className={`mt-1 transition-all active:scale-90 ${habit.isDoneToday ? 'text-emerald-500' : 'text-emerald-200 hover:text-emerald-300'}`}
                      >
                        {habit.isDoneToday ? (
                          <CheckCircle2 className="w-8 h-8 fill-emerald-50" />
                        ) : (
                          <Circle className="w-8 h-8" />
                        )}
                      </button>
                      <div>
                        <h3 className={`text-xl font-semibold transition-all ${habit.isDoneToday ? 'text-emerald-900/40 line-through' : 'text-emerald-900'}`}>
                          {habit.name}
                        </h3>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                            <Sparkles className="w-3.5 h-3.5" />
                            {habit.streak} day streak
                          </span>
                          <button
                            onClick={() => getMotivation(habit)}
                            disabled={loadingMotivations[habit.id]}
                            className="text-emerald-400 hover:text-emerald-600 text-sm flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {loadingMotivations[habit.id] ? 'Thinking...' : 'Motivate Me'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteHabit(habit.id)}
                      className="text-emerald-100 hover:text-red-400 transition-colors p-2 md:opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>

                  {habit.motivationTip && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="mt-6 pt-6 border-t border-emerald-50"
                    >
                      <p className="text-emerald-800 text-sm italic leading-relaxed bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50">
                        "{habit.motivationTip}"
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Footer info & Settings */}
        <footer className="pt-12 pb-8 flex flex-col items-center gap-6">
          <p className="text-emerald-700/30 text-[10px] uppercase tracking-widest font-bold">
            Bloom Habit Tracker
          </p>
        </footer>

      </div>
    </div>
  );
}
