import React, { useState } from 'react';
import { CustomerProfile, ClientWorkoutPlan, ProgressPhoto, OneOnOneVideoSession, WorkoutExercise, WorkoutDaySchedule, SetDetail } from '../../types';
import { 
  Dumbbell, Shield, Video, Plus, Trash2, Edit3, Save, CheckCircle2, User, Clock, Flame, 
  Calendar, Sparkles, ExternalLink, HeartPulse, Activity, Stethoscope, Droplets, Pill, 
  AlertCircle, Scale, Ruler, Moon, Zap, TrendingDown, ShieldAlert, FileText, Phone, Mail, 
  Utensils, AlertTriangle 
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface TrainerDashboardProps {
  clientProfile: CustomerProfile;
  workoutPlan: ClientWorkoutPlan;
  onUpdateWorkoutPlan: (updatedPlan: ClientWorkoutPlan) => void;
  progressPhotos: ProgressPhoto[];
  videoSessions: OneOnOneVideoSession[];
  onUpdateVideoSessions?: (sessions: OneOnOneVideoSession[]) => void;
}

export const TrainerDashboard: React.FC<TrainerDashboardProps> = ({
  clientProfile,
  workoutPlan,
  onUpdateWorkoutPlan,
  progressPhotos,
  videoSessions,
  onUpdateVideoSessions
}) => {
  const [activeTab, setActiveTab] = useState<'roster' | 'plan_editor' | 'video_sessions'>('roster');

  // Plan Editor State
  const [editingPlan, setEditingPlan] = useState<ClientWorkoutPlan>(workoutPlan);
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Toggle Rest Day for Selected Day
  const handleToggleRestDay = () => {
    const updatedSchedule = editingPlan.schedule.map(s => {
      if (s.dayNumber === selectedDayNumber) {
        return {
          ...s,
          isRestDay: !s.isRestDay
        };
      }
      return s;
    });
    setEditingPlan({ ...editingPlan, schedule: updatedSchedule });
  };

  // New Exercise Form State for Active Day
  const [newExName, setNewExName] = useState<string>('');
  const [newExMuscle, setNewExMuscle] = useState<string>('');
  const [newExSets, setNewExSets] = useState<number>(3);
  const [newExRest, setNewExRest] = useState<number>(60);
  const [setBreakdown, setSetBreakdown] = useState<Array<{ weight: string; reps: string }>>([
    { weight: '15 kg', reps: '12 reps' },
    { weight: '15 kg', reps: '12 reps' },
    { weight: '15 kg', reps: '10 reps' }
  ]);

  const handleNumSetsChange = (num: number) => {
    const count = Math.max(1, Math.min(8, num));
    setNewExSets(count);
    setSetBreakdown(prev => {
      const next = [...prev];
      while (next.length < count) {
        const last = next[next.length - 1] || { weight: '15 kg', reps: '12 reps' };
        next.push({ ...last });
      }
      return next.slice(0, count);
    });
  };

  const handleSetRowChange = (index: number, field: 'weight' | 'reps', val: string) => {
    const updated = [...setBreakdown];
    updated[index] = { ...updated[index], [field]: val };
    setSetBreakdown(updated);
  };

  const currentDayObj = editingPlan.schedule.find(s => s.dayNumber === selectedDayNumber) || editingPlan.schedule[0];

  // Handle Adding Exercise
  const handleAddExerciseToActiveDay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExName) return;

    const setDetailsList: SetDetail[] = setBreakdown.map((s, idx) => ({
      setNumber: idx + 1,
      weightKg: s.weight || '15 kg',
      reps: s.reps || '12 reps'
    }));

    const summaryReps = setBreakdown.map(s => s.reps).join(', ');
    const summaryWeight = setBreakdown[0]?.weight || '15 kg';

    const newEx: WorkoutExercise = {
      id: `ex-${Date.now().toString().slice(-4)}`,
      name: newExName,
      targetMuscle: newExMuscle || 'Full Body',
      weightKg: summaryWeight,
      sets: newExSets,
      reps: summaryReps,
      restSeconds: newExRest,
      setDetails: setDetailsList,
      description: `${newExSets} sets sequence for ${newExMuscle || 'Full Body'}.`,
      videoUrl: 'https://www.youtube.com/embed/0G2_XV7slIg'
    };

    const updatedSchedule = editingPlan.schedule.map(s => {
      if (s.dayNumber === selectedDayNumber) {
        return {
          ...s,
          exercises: [...s.exercises, newEx]
        };
      }
      return s;
    });

    setEditingPlan({ ...editingPlan, schedule: updatedSchedule });
    setNewExName('');
    setNewExMuscle('');
  };

  // Remove Exercise
  const handleRemoveExercise = (exId: string) => {
    const updatedSchedule = editingPlan.schedule.map(s => {
      if (s.dayNumber === selectedDayNumber) {
        return {
          ...s,
          exercises: s.exercises.filter(ex => ex.id !== exId)
        };
      }
      return s;
    });
    setEditingPlan({ ...editingPlan, schedule: updatedSchedule });
  };

  // Save Plan
  const handleSaveAndPublishPlan = () => {
    const publishedPlan = {
      ...editingPlan,
      updatedAt: new Date().toISOString().split('T')[0]
    };
    onUpdateWorkoutPlan(publishedPlan);
    setSaveSuccessMsg('✓ Custom Workout Plan & Variations Published Live to Client Dashboard!');
    confetti({ particleCount: 60, spread: 70 });
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 text-white animate-fadeIn">
      
      {/* TRAINER HEADER */}
      <div className="bg-gradient-to-r from-stone-900 via-emerald-950 to-stone-900 border-2 border-emerald-500/50 rounded-3xl p-6 shadow-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-stone-950 flex items-center justify-center font-black">
              <Dumbbell className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Internal ERP Portal</span>
              <h1 className="text-xl sm:text-2xl font-black text-white">Fitness Trainer Workspace</h1>
              <p className="text-xs text-stone-300">Head Coach: Coach Vikram Verma (CSCS Master Trainer)</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-stone-900/90 border border-stone-800 px-4 py-2 rounded-2xl text-xs font-bold text-stone-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>1 Active Client Pending Plan Audit</span>
          </div>
        </div>
      </div>

      {/* TOP TAB SWITCHER */}
      <div className="flex items-center gap-2 bg-stone-900 p-1.5 rounded-2xl border border-stone-800 text-xs font-black">
        <button
          onClick={() => setActiveTab('roster')}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'roster'
              ? 'bg-emerald-500 text-stone-950 shadow-md font-black'
              : 'text-stone-300 hover:bg-stone-800'
          }`}
        >
          <User className="w-4 h-4" />
          <span>1. Client Roster, Macros & Masked Photos</span>
        </button>

        <button
          onClick={() => setActiveTab('plan_editor')}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'plan_editor'
              ? 'bg-emerald-500 text-stone-950 shadow-md font-black'
              : 'text-stone-300 hover:bg-stone-800'
          }`}
        >
          <Dumbbell className="w-4 h-4" />
          <span>2. Workout Plan Builder & Variations</span>
        </button>

        <button
          onClick={() => setActiveTab('video_sessions')}
          className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'video_sessions'
              ? 'bg-emerald-500 text-stone-950 shadow-md font-black'
              : 'text-stone-300 hover:bg-stone-800'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>3. 1-on-1 Video Coaching ({videoSessions.length} Opted)</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: WORKOUT PLAN BUILDER & VARIATIONS */}
      {/* ==================================================================== */}
      {activeTab === 'plan_editor' && (
        <div className="space-y-6">
          {saveSuccessMsg && (
            <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-2xl flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          <div className="bg-stone-950 p-6 rounded-3xl border border-stone-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Editing Client: {clientProfile.name}</span>
                <h3 className="text-base font-black text-white">Configure Workout Split & Variations</h3>
              </div>

              <button
                onClick={handleSaveAndPublishPlan}
                className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-6 py-2.5 rounded-xl text-xs shadow-lg transition-all flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Publish Plan to Client</span>
              </button>
            </div>

            {/* Split Switcher */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-amber-300 mb-1">Target Split Type</label>
                <select
                  value={editingPlan.splitType}
                  onChange={(e) => setEditingPlan({ ...editingPlan, splitType: e.target.value as any })}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="3_day">3-Day Full Body / Push-Pull-Legs</option>
                  <option value="5_day">5-Day Hypertrophy & Toning Split</option>
                  <option value="6_day">6-Day Athletic High Frequency Split</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-300 mb-1">Client Level</label>
                <select
                  value={editingPlan.fitnessLevel}
                  onChange={(e) => setEditingPlan({ ...editingPlan, fitnessLevel: e.target.value as any })}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
            </div>

            {/* Day Selector */}
            <div className="space-y-2 pt-2">
              <span className="text-xs font-extrabold uppercase text-amber-300">Select Day to Edit Exercises</span>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {editingPlan.schedule.map((day) => (
                  <button
                    key={day.dayNumber}
                    onClick={() => setSelectedDayNumber(day.dayNumber)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap border ${
                      selectedDayNumber === day.dayNumber
                        ? 'bg-emerald-500 text-stone-950 border-emerald-400 shadow-md'
                        : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                    }`}
                  >
                    Day {day.dayNumber} {day.isRestDay ? '(Rest)' : ''}
                  </button>
                ))}
              </div>
            </div>

            {/* Current Exercises List for Selected Day */}
            <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-amber-300 text-sm">{currentDayObj.dayName}</h4>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                    currentDayObj.isRestDay
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}>
                    {currentDayObj.isRestDay ? 'Rest Day' : 'Active Workout Day'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleRestDay}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      currentDayObj.isRestDay
                        ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {currentDayObj.isRestDay ? '✓ Mark as Active Workout Day' : '🌙 Mark as Rest Day'}
                  </button>
                  <span className="text-xs text-stone-400 font-bold">{currentDayObj.exercises.length} Variations</span>
                </div>
              </div>

              {currentDayObj.isRestDay && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>This day is currently marked as a Rest Day for the client. You can still add optional recovery or mobility exercises below if needed!</span>
                </div>
              )}

              <div className="space-y-3">
                {currentDayObj.exercises.map((ex) => (
                  <div key={ex.id} className="p-4 bg-stone-950 rounded-xl border border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-2 w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            {ex.targetMuscle}
                          </span>
                          <h5 className="font-extrabold text-white text-sm">{ex.name}</h5>
                        </div>

                        <button
                          onClick={() => handleRemoveExercise(ex.id)}
                          className="p-1.5 text-stone-400 hover:text-red-400 bg-stone-900 rounded-lg hover:bg-stone-800 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Set-by-Set Breakdown Display */}
                      {ex.setDetails && ex.setDetails.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {ex.setDetails.map((s, idx) => (
                            <span key={idx} className="bg-stone-900 border border-stone-800 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-300">
                              Set {s.setNumber}: <strong className="text-white">{s.weightKg}</strong> × <strong className="text-emerald-400">{s.reps}</strong>
                            </span>
                          ))}
                          <span className="text-[11px] text-stone-400 ml-1">Rest: {ex.restSeconds}s</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-300 font-bold">
                          Target Weight: {ex.weightKg} • Sets: {ex.sets} • Reps: {ex.reps} • Rest: {ex.restSeconds}s
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Exercise Form */}
              <form onSubmit={handleAddExerciseToActiveDay} className="pt-4 border-t border-stone-800 space-y-4">
                <h5 className="text-xs font-extrabold uppercase text-emerald-400 flex items-center gap-1">
                  <Plus className="w-4 h-4" />
                  <span>Add New Exercise Variation to Day {selectedDayNumber}</span>
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Exercise Name</label>
                    <input
                      type="text"
                      required
                      value={newExName}
                      onChange={(e) => setNewExName(e.target.value)}
                      placeholder="e.g. Incline DB Press"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Target Muscle</label>
                    <input
                      type="text"
                      value={newExMuscle}
                      onChange={(e) => setNewExMuscle(e.target.value)}
                      placeholder="e.g. Upper Chest"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">No. of Sets</label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={newExSets}
                      onChange={(e) => handleNumSetsChange(Number(e.target.value))}
                      placeholder="e.g. 3"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                    />
                  </div>
                </div>

                {/* Set 1, Set 2, Set 3 Breakdown Inputs */}
                <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase text-amber-300">Set-by-Set Breakdown (Weight & Reps)</span>
                    <span className="text-[10px] text-stone-400 font-bold">{newExSets} Sets Configured</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {setBreakdown.map((setRow, index) => (
                      <div key={index} className="p-3 bg-stone-900 rounded-xl border border-stone-800 space-y-2">
                        <span className="text-[10px] font-black text-emerald-400 block uppercase">Set {index + 1}</span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] text-stone-400 block font-bold uppercase mb-0.5">Weight</label>
                            <input
                              type="text"
                              value={setRow.weight}
                              onChange={(e) => handleSetRowChange(index, 'weight', e.target.value)}
                              placeholder="e.g. 15 kg"
                              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-stone-400 block font-bold uppercase mb-0.5">Reps</label>
                            <input
                              type="text"
                              value={setRow.reps}
                              onChange={(e) => handleSetRowChange(index, 'reps', e.target.value)}
                              placeholder="e.g. 12 reps"
                              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-400 font-bold">Rest Timer (seconds):</label>
                    <input
                      type="number"
                      value={newExRest}
                      onChange={(e) => setNewExRest(Number(e.target.value))}
                      className="w-24 bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bg-amber-400 hover:bg-amber-300 text-stone-950 font-black px-6 py-2.5 rounded-xl text-xs shadow-lg transition-all flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Save & Add Exercise</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: CLIENT ROSTER, MACROS, CLINICAL PARAMETERS & MASKED PHOTOS */}
      {/* ==================================================================== */}
      {activeTab === 'roster' && (
        <div className="space-y-6">
          <div className="bg-stone-950 p-6 rounded-3xl border border-stone-800 space-y-6">
            <div className="border-b border-stone-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Trainer Client Roster & Medical Dossier</span>
                <h3 className="text-base font-black text-white">Clinical Parameters, Macros & Masked Vault</h3>
                <p className="text-xs text-stone-400">Complete health parameters, lab markers, macro targets and privacy-protected progress photos.</p>
              </div>
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded-xl border border-emerald-500/30 flex items-center gap-1.5 self-start sm:self-auto">
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified Client Profile</span>
              </span>
            </div>

            {/* SECTION: CLINICAL NOTES, MEDICAL RESTRICTIONS & TRAINER DIRECTIVES (BIG ROW) */}
            <div className="bg-stone-900 p-6 rounded-3xl border-2 border-amber-500/50 space-y-5 shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    <Stethoscope className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">Trainer & Medical Dossier</span>
                    <h3 className="text-lg font-black text-white">Clinical Notes, Medical Restrictions & Specific Directives</h3>
                  </div>
                </div>
                <span className="px-3 py-1 bg-rose-500/20 text-rose-300 text-xs font-black rounded-full border border-rose-500/40 flex items-center gap-1.5 self-start sm:self-auto">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Mandatory Clinical Clearance</span>
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Clinical Notes & Trainer Directives */}
                <div className="bg-stone-950 p-5 rounded-2xl border border-stone-800 space-y-3">
                  <h4 className="font-extrabold text-amber-300 text-xs uppercase flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    Detailed Clinical Instructions & Workout Restrictions
                  </h4>
                  <div className="p-4 bg-stone-900/90 rounded-xl border border-amber-500/30 text-stone-200 text-xs leading-relaxed space-y-2 font-medium">
                    <p className="text-sm font-bold text-white leading-relaxed">
                      {workoutPlan.specificRequirements || clientProfile.clinicalNotes || `PCOD & Insulin Resistance protocol active. Focus on progressive overload on guided machines & dumbbells with 3-1-1 tempo. Avoid heavy axial spinal loading (no heavy barbell back squats). Target 120g+ daily protein with zero refined sugars.`}
                    </p>
                    <div className="pt-2 border-t border-stone-800 text-amber-300 text-[11px] font-semibold space-y-1">
                      <p>• <strong>Orthopedic Directives:</strong> Patient reports mild left patellar tendonitis. Replace high-impact plyometric jump squats with controlled leg extensions and Bulgarian split squats.</p>
                      <p>• <strong>Metabolic Guidance:</strong> High protein meal timing around workouts to optimize insulin sensitivity.</p>
                    </div>
                  </div>
                </div>

                {/* Medical Diagnoses & Exclusions */}
                <div className="bg-stone-950 p-5 rounded-2xl border border-stone-800 space-y-3">
                  <h4 className="font-extrabold text-rose-400 text-xs uppercase flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    Reported Medical Conditions & Exclusions
                  </h4>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {(clientProfile.medicalConditions && clientProfile.medicalConditions.length > 0
                        ? clientProfile.medicalConditions
                        : ['PCOD / PCOS', 'Insulin Resistance', 'Mild Patellar Tendonitis', 'Lower Back Stiffness']
                      ).map((cond, i) => (
                        <span key={i} className="px-3.5 py-2 bg-rose-500/20 text-rose-200 border border-rose-500/40 rounded-xl text-xs font-black flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-400" />
                          {cond}
                        </span>
                      ))}
                    </div>

                    <div className="p-3 bg-stone-900 rounded-xl border border-stone-800 text-xs space-y-1">
                      <span className="text-stone-400 block text-[10px] font-bold uppercase">Allergies & Food Exclusions</span>
                      <p className="text-white font-bold">{clientProfile.allergies?.join(', ') || 'Peanuts, Lactose Sensitivity'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 1: CLIENT IDENTITY & CONTACT */}
            <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-stone-950 font-black text-xl flex items-center justify-center shadow-lg">
                  {clientProfile.name.charAt(0)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-white text-lg">{clientProfile.name}</h4>
                    <span className="px-2 py-0.5 bg-stone-800 text-amber-300 text-[10px] font-black rounded-full border border-stone-700 uppercase">
                      ID: {clientProfile.id}
                    </span>
                  </div>
                  <p className="text-xs text-stone-300 flex flex-wrap items-center gap-3">
                    <span>{clientProfile.age} yrs • {clientProfile.gender?.toUpperCase() || 'FEMALE'}</span>
                    <span>• {clientProfile.occupation || 'IT Professional'}</span>
                    <span className="text-stone-400 flex items-center gap-1"><Phone className="w-3 h-3 text-emerald-400" /> {clientProfile.phone}</span>
                    <span className="text-stone-400 flex items-center gap-1"><Mail className="w-3 h-3 text-emerald-400" /> {clientProfile.email}</span>
                  </p>
                </div>
              </div>

              {clientProfile.primaryGoals && clientProfile.primaryGoals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-w-xs">
                  {clientProfile.primaryGoals.map((g, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold">
                      🎯 {g}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 2: MACRO TARGETS & CALORIC DISTRIBUTION */}
            <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <h4 className="font-extrabold text-amber-300 text-xs uppercase tracking-wider">Macro Targets & Daily Energy Balance</h4>
                </div>
                <span className="text-xs text-stone-400 font-bold">Auto-Calculated for Training</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                  <span className="text-stone-400 text-[10px] block font-medium">Daily Calorie Target</span>
                  <strong className="text-emerald-400 text-sm font-black">{clientProfile.targetCalories || 1550} kcal</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                  <span className="text-stone-400 text-[10px] block font-medium">Maintenance (TDEE)</span>
                  <strong className="text-white text-sm font-black">{clientProfile.tdee || clientProfile.maintenanceCalories || 1850} kcal</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                  <span className="text-stone-400 text-[10px] block font-medium">Deficit / Surplus</span>
                  <strong className="text-amber-400 text-sm font-black">{clientProfile.calorieDeficitSurplus || -300} kcal/day</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                  <span className="text-stone-400 text-[10px] block font-medium">BMR (Resting)</span>
                  <strong className="text-stone-300 text-sm font-black">{clientProfile.bmr || 1410} kcal</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-amber-500/30 space-y-1">
                  <span className="text-amber-300 text-[10px] block font-bold">Protein Target</span>
                  <strong className="text-amber-300 text-sm font-black">{clientProfile.macroTargets?.proteinGrams || 125} g</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                  <span className="text-stone-400 text-[10px] block font-medium">Water Target</span>
                  <strong className="text-sky-400 text-sm font-black">{clientProfile.waterIntakeL || clientProfile.waterRequirementL || 3.0} L/day</strong>
                </div>
              </div>

              {/* Macro Bar Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-stone-950 p-3.5 rounded-xl border border-stone-800 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-amber-400">Protein</span>
                    <span className="text-white">{clientProfile.macroTargets?.proteinGrams || 125}g ({((clientProfile.macroTargets?.proteinGrams || 125) * 4)} kcal)</span>
                  </div>
                  <div className="w-full bg-stone-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-400 h-full rounded-full" style={{ width: '35%' }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-sky-400">Carbs</span>
                    <span className="text-white">{clientProfile.macroTargets?.carbsGrams || 140}g ({((clientProfile.macroTargets?.carbsGrams || 140) * 4)} kcal)</span>
                  </div>
                  <div className="w-full bg-stone-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-sky-400 h-full rounded-full" style={{ width: '40%' }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-rose-400">Healthy Fats</span>
                    <span className="text-white">{clientProfile.macroTargets?.fatGrams || 45}g ({((clientProfile.macroTargets?.fatGrams || 45) * 9)} kcal)</span>
                  </div>
                  <div className="w-full bg-stone-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-rose-400 h-full rounded-full" style={{ width: '25%' }}></div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-emerald-400">Dietary Fiber</span>
                    <span className="text-white">{clientProfile.macroTargets?.fiberGrams || 28}g</span>
                  </div>
                  <div className="w-full bg-stone-900 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-400 h-full rounded-full" style={{ width: '70%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 3: ANTHROPOMETRIC & BODY MEASUREMENTS */}
            <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
              <div className="flex items-center gap-2 border-b border-stone-800 pb-2">
                <Ruler className="w-4 h-4 text-emerald-400" />
                <h4 className="font-extrabold text-amber-300 text-xs uppercase tracking-wider">Anthropometric & Body Circumferences</h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] block">Height</span>
                  <strong className="text-white text-sm">{clientProfile.heightCm} cm</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] block">Current Weight</span>
                  <strong className="text-white text-sm">{clientProfile.weightKg} kg</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-emerald-500/30">
                  <span className="text-emerald-300 text-[10px] block font-bold">Target Weight</span>
                  <strong className="text-emerald-400 text-sm font-black">{clientProfile.targetWeightKg || 58} kg</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] block">BMI & Category</span>
                  <strong className="text-amber-300 text-sm">{clientProfile.bmi || 25.0} ({clientProfile.bmiCategory || 'Overweight'})</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] block">Muscle Mass</span>
                  <strong className="text-white text-sm">{clientProfile.muscleMassKg || 24.5} kg</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] block">Ideal Body Weight</span>
                  <strong className="text-stone-300 text-sm">{clientProfile.idealBodyWeightKg || '55 - 58'} kg</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Core Circumferences */}
                <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
                  <span className="text-[10px] font-black uppercase text-amber-400 block tracking-wider">Core Body Circumferences</span>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                      <span className="text-stone-400 text-[9px] block">Waist</span>
                      <strong className="text-white">{clientProfile.circumferences?.waistCm || 81} cm</strong>
                    </div>
                    <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                      <span className="text-stone-400 text-[9px] block">Hip</span>
                      <strong className="text-white">{clientProfile.circumferences?.hipCm || 98} cm</strong>
                    </div>
                    <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                      <span className="text-stone-400 text-[9px] block">Chest</span>
                      <strong className="text-white">{clientProfile.circumferences?.chestCm || 88} cm</strong>
                    </div>
                    <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                      <span className="text-stone-400 text-[9px] block">Neck</span>
                      <strong className="text-white">{clientProfile.circumferences?.neckCm || 34} cm</strong>
                    </div>
                  </div>
                </div>

                {/* Limb Circumferences */}
                <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
                  <span className="text-[10px] font-black uppercase text-amber-400 block tracking-wider">Limb Circumferences</span>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                      <span className="text-stone-400 text-[9px] block">Arms (L / R)</span>
                      <strong className="text-white">{clientProfile.limbCircumferences?.leftArmCm || 28} / {clientProfile.limbCircumferences?.rightArmCm || 28.5} cm</strong>
                    </div>
                    <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                      <span className="text-stone-400 text-[9px] block">Thighs (L / R)</span>
                      <strong className="text-white">{clientProfile.limbCircumferences?.leftThighCm || 56} / {clientProfile.limbCircumferences?.rightThighCm || 56.5} cm</strong>
                    </div>
                    <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                      <span className="text-stone-400 text-[9px] block">Calves (L / R)</span>
                      <strong className="text-white">{clientProfile.limbCircumferences?.leftCalfCm || 36} / {clientProfile.limbCircumferences?.rightCalfCm || 36} cm</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4: CLINICAL CONDITIONS, MEDICATIONS & ALLERGIES */}
            <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
              <div className="flex items-center gap-2 border-b border-stone-800 pb-2">
                <Stethoscope className="w-4 h-4 text-rose-400" />
                <h4 className="font-extrabold text-amber-300 text-xs uppercase tracking-wider">Clinical Conditions, Medications & Allergies</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Medical Conditions */}
                <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
                  <span className="text-[10px] font-black uppercase text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Medical Conditions
                  </span>
                  {clientProfile.medicalConditions && clientProfile.medicalConditions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {clientProfile.medicalConditions.map((cond, i) => (
                        <span key={i} className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-lg font-bold text-xs">
                          ⚠️ {cond}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-stone-400 italic">No reported chronic conditions.</p>
                  )}
                </div>

                {/* Medications & Supplements */}
                <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
                  <span className="text-[10px] font-black uppercase text-amber-400 flex items-center gap-1">
                    <Pill className="w-3.5 h-3.5" /> Prescriptions & Supplements
                  </span>
                  <div className="space-y-1 text-stone-300">
                    <p><strong>Meds:</strong> {clientProfile.currentMedications || 'Metformin 500mg once daily'}</p>
                    {clientProfile.supplements && clientProfile.supplements.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {clientProfile.supplements.map((sup, i) => (
                          <span key={i} className="px-2 py-0.5 bg-stone-800 text-amber-300 rounded text-[10px] font-bold">
                            💊 {sup}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Allergies & Dislikes */}
                <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
                  <span className="text-[10px] font-black uppercase text-sky-400 flex items-center gap-1">
                    <Utensils className="w-3.5 h-3.5" /> Allergies & Dietary Restrictions
                  </span>
                  <div className="space-y-1 text-stone-300">
                    <p><strong>Preference:</strong> <span className="text-emerald-400 font-bold">{clientProfile.foodPreference || 'Non-Vegetarian'}</span></p>
                    <p><strong>Allergies:</strong> <span className="text-rose-300 font-bold">{clientProfile.allergies?.join(', ') || 'Peanuts'}</span></p>
                    <p><strong>Dislikes:</strong> <span className="text-stone-400">{clientProfile.foodDislikes?.join(', ') || 'Mushroom, Bitter Gourd'}</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 5: CLINICAL LAB / BLOOD TEST RESULTS */}
            {clientProfile.bloodTestResults && (
              <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-extrabold text-amber-300 text-xs uppercase tracking-wider">Clinical Blood Diagnostic Panel</h4>
                  </div>
                  <span className="text-[10px] font-bold text-stone-400">Verified Lab Report</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                    <span className="text-stone-400 text-[10px] block">Fasting Blood Sugar</span>
                    <strong className="text-white">{clientProfile.bloodTestResults.fastingBloodSugar} mg/dL</strong>
                  </div>
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                    <span className="text-stone-400 text-[10px] block">HbA1c</span>
                    <strong className="text-emerald-400">{clientProfile.bloodTestResults.hbA1c} %</strong>
                  </div>
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                    <span className="text-stone-400 text-[10px] block">Total Cholesterol</span>
                    <strong className="text-white">{clientProfile.bloodTestResults.totalCholesterol} mg/dL</strong>
                  </div>
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                    <span className="text-stone-400 text-[10px] block">HDL / LDL</span>
                    <strong className="text-stone-300">{clientProfile.bloodTestResults.hdl} / {clientProfile.bloodTestResults.ldl} mg/dL</strong>
                  </div>
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                    <span className="text-stone-400 text-[10px] block">Triglycerides</span>
                    <strong className="text-white">{clientProfile.bloodTestResults.triglycerides} mg/dL</strong>
                  </div>
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                    <span className="text-stone-400 text-[10px] block">Hemoglobin</span>
                    <strong className="text-white">{clientProfile.bloodTestResults.hemoglobin} g/dL</strong>
                  </div>
                  <div className="bg-stone-950 p-3 rounded-xl border border-amber-500/40 space-y-1">
                    <span className="text-amber-300 text-[10px] block font-bold">Vitamin D</span>
                    <strong className="text-amber-400 font-black">{clientProfile.bloodTestResults.vitaminD} ng/mL (Low)</strong>
                  </div>
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                    <span className="text-stone-400 text-[10px] block">Vitamin B12</span>
                    <strong className="text-white">{clientProfile.bloodTestResults.vitaminB12} pg/mL</strong>
                  </div>
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                    <span className="text-stone-400 text-[10px] block">TSH (Thyroid)</span>
                    <strong className="text-white">{clientProfile.bloodTestResults.tsh} mIU/L</strong>
                  </div>
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
                    <span className="text-stone-400 text-[10px] block">Liver SGOT/SGPT</span>
                    <strong className="text-white">{clientProfile.bloodTestResults.sgot} / {clientProfile.bloodTestResults.sgpt} U/L</strong>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 6: LIFESTYLE, SLEEP & EXERCISE HABITS */}
            <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
              <div className="flex items-center gap-2 border-b border-stone-800 pb-2">
                <Moon className="w-4 h-4 text-sky-400" />
                <h4 className="font-extrabold text-amber-300 text-xs uppercase tracking-wider">Lifestyle, Recovery & Exercise Routine</h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] block">Daily Step Target</span>
                  <strong className="text-emerald-400 text-sm font-black">{clientProfile.dailyStepCount || 8500} Steps</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] block">Sleep Duration & Schedule</span>
                  <strong className="text-white text-sm">{clientProfile.sleepDuration || 7} hrs ({clientProfile.wakeUpTime || '06:30'} - {clientProfile.bedTime || '23:00'})</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] block">Workout Types & Duration</span>
                  <strong className="text-white text-sm">{clientProfile.workoutTypes?.join(', ') || 'Strength, Yoga'} ({clientProfile.workoutDuration || 45} mins)</strong>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-stone-400 text-[10px] block">Stress Level & Vices</span>
                  <strong className="text-stone-300 text-sm">Stress: {clientProfile.stressLevel || 4}/10 • Alcohol: {clientProfile.alcohol || 'Monthly'}</strong>
                </div>
              </div>
            </div>

            {/* SECTION 7: MASKED PROGRESS PHOTOS VAULT */}
            <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <h4 className="font-extrabold text-amber-300 text-xs uppercase tracking-wider">Client Progress Vault ({progressPhotos.length} Masked Photos)</h4>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                  🔒 Confidential Face Masking Active
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {progressPhotos.map((photo) => (
                  <div key={photo.id} className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-stone-700 bg-stone-950 shadow-md group">
                    <img src={photo.imageUrl} alt={photo.type} className="w-full h-full object-cover" />

                    {photo.isFaceMasked && (
                      <div className="absolute top-[8%] left-[25%] right-[25%] h-[20%] bg-stone-950/95 backdrop-blur-md rounded-full border border-emerald-400/80 flex items-center justify-center shadow-lg">
                        <span className="text-[8px] font-black text-emerald-300 tracking-tighter uppercase px-1.5 flex items-center gap-1">
                          🔒 MASKED
                        </span>
                      </div>
                    )}

                    <div className="absolute bottom-2 left-2 right-2 bg-stone-950/90 backdrop-blur-md p-2 rounded-xl border border-stone-800 flex items-center justify-between text-[10px]">
                      <div>
                        <span className="font-bold text-amber-300 block uppercase text-[9px]">{photo.type}</span>
                        <span className="text-stone-400 text-[8px]">{photo.uploadedAt || '2026-08-01'}</span>
                      </div>
                      <span className="font-black text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded text-[9px]">
                        {photo.weightKg || clientProfile.weightKg} kg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: 1-ON-1 VIDEO SESSIONS */}
      {/* ==================================================================== */}
      {activeTab === 'video_sessions' && (
        <div className="bg-stone-950 p-6 rounded-3xl border border-stone-800 space-y-4">
          <div className="border-b border-stone-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Paid Feature • ₹499 / Hour</span>
              <h3 className="text-base font-black text-white">Opted 1-on-1 Video Coaching Sessions</h3>
              <p className="text-xs text-stone-400">Slots Available to Clients: Morning (5:00 AM - 9:00 AM) & Evening (5:00 PM - 9:00 PM)</p>
            </div>
            <span className="px-3 py-1 bg-stone-900 text-stone-300 text-xs font-bold rounded-xl border border-stone-800 self-start sm:self-auto">
              Total Opted Sessions: {videoSessions.length}
            </span>
          </div>

          <div className="space-y-3">
            {videoSessions.length === 0 ? (
              <div className="p-8 text-center bg-stone-900/80 rounded-2xl border border-stone-800 space-y-2">
                <Video className="w-8 h-8 text-stone-600 mx-auto" />
                <h4 className="font-extrabold text-white text-xs">No Clients Have Opted for 1-on-1 Video Coaching Yet</h4>
                <p className="text-stone-400 text-[11px] max-w-sm mx-auto">
                  1-on-1 Video Coaching is a paid option (₹499/hr). When a client opts and books a session from their dashboard, it will appear here for you to conduct.
                </p>
              </div>
            ) : (
              videoSessions.map((session) => (
                <div key={session.id} className="p-4 bg-stone-900 rounded-2xl border border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white">{session.customerName}</span>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {session.period}
                      </span>
                      <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                        Opted & Paid ₹499
                      </span>
                    </div>

                    <p className="text-xs text-stone-300 font-bold">
                      Date: {session.date} • Time Slot: {session.timeSlot}
                    </p>
                  </div>

                  {session.meetLink && (
                    <a
                      href={session.meetLink}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                    >
                      <Video className="w-4 h-4" />
                      <span>Start Video Room</span>
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

    </div>
  );
};
