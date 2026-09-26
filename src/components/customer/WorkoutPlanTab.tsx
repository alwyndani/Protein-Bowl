import React, { useState } from 'react';
import { CustomerProfile, ClientWorkoutPlan, ProgressPhoto, OneOnOneVideoSession, WorkoutExercise } from '../../types';
import { Dumbbell, Shield, Video, Calendar, Upload, Eye, CheckCircle2, AlertCircle, Clock, Sparkles, User, Play, X, Lock, Flame, Scale, ChevronRight, RefreshCw, MessageSquare } from 'lucide-react';
import confetti from 'canvas-confetti';

interface WorkoutPlanTabProps {
  profile: CustomerProfile;
  workoutPlan: ClientWorkoutPlan;
  onUpdateWorkoutPlanRequest: (level: 'Beginner' | 'Intermediate' | 'Advanced', split: '3_day' | '5_day' | '6_day', reqs: string) => void;
  progressPhotos: ProgressPhoto[];
  onUploadProgressPhoto: (newPhoto: ProgressPhoto) => void;
  videoSessions: OneOnOneVideoSession[];
  onBookVideoSession: (session: OneOnOneVideoSession) => void;
  hasActive21or30DayPlan: boolean;
}

export const WorkoutPlanTab: React.FC<WorkoutPlanTabProps> = ({
  profile,
  workoutPlan,
  onUpdateWorkoutPlanRequest,
  progressPhotos,
  onUploadProgressPhoto,
  videoSessions,
  onBookVideoSession,
  hasActive21or30DayPlan
}) => {
  // Exactly 4 Sub-Tabs
  const [subTab, setSubTab] = useState<'request' | 'schedule' | 'monitoring' | 'booking'>('schedule');

  // Exercise Detail & Video Modal State
  const [selectedExercise, setSelectedExercise] = useState<WorkoutExercise | null>(null);

  // Active Selected Day in Workout Schedule
  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);

  // --------------------------------------------------------------------------
  // TAB 1: REQUIREMENTS & BEFORE PHOTOS STATE
  // --------------------------------------------------------------------------
  const [fitnessLevel, setFitnessLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>(workoutPlan.fitnessLevel || 'Intermediate');
  const [splitType, setSplitType] = useState<'3_day' | '5_day' | '6_day'>(workoutPlan.splitType || '5_day');
  const [specificRequirements, setSpecificRequirements] = useState<string>(workoutPlan.specificRequirements || '');
  const [requestSavedSuccess, setRequestSavedSuccess] = useState<boolean>(false);

  // Photo Upload & AI Face Masking State
  const [photoType, setPhotoType] = useState<'Front Progress' | 'Side Progress' | 'Back Progress'>('Front Progress');
  const [photoNotes, setPhotoNotes] = useState<string>('');
  const [isProcessingAIMask, setIsProcessingAIMask] = useState<boolean>(false);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [aiFaceShieldActive, setAiFaceShieldActive] = useState<boolean>(true);

  // --------------------------------------------------------------------------
  // TAB 3: WORKOUT MONITORING & REVISED MEASUREMENTS STATE
  // --------------------------------------------------------------------------
  const [completedDays, setCompletedDays] = useState<number[]>([1, 2]); // default completed days
  const [monitoringSelectedDay, setMonitoringSelectedDay] = useState<number>(1);
  const [revisedWeight, setRevisedWeight] = useState<string>(profile.weightKg.toString());
  const [revisedWaist, setRevisedWaist] = useState<string>((profile.circumferences?.waistCm || 81).toString());
  const [revisedChest, setRevisedChest] = useState<string>((profile.circumferences?.chestCm || 88).toString());
  const [revisedHip, setRevisedHip] = useState<string>((profile.circumferences?.hipCm || 98).toString());
  const [revisedArm, setRevisedArm] = useState<string>('28');
  const [revisedBodyFat, setRevisedBodyFat] = useState<string>('22.5');
  const [measurementsUpdatedSuccess, setMeasurementsUpdatedSuccess] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // TAB 4: BOOKING STATE
  // --------------------------------------------------------------------------
  const [selectedCoachingPackage, setSelectedCoachingPackage] = useState<'Single' | '5_Day_Week' | '20_Day_Month'>('5_Day_Week');
  const [bookingDate, setBookingDate] = useState<string>('2026-08-06');
  const [selectedPeriod, setSelectedPeriod] = useState<'Morning' | 'Evening'>('Morning');
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('06:00 AM - 07:00 AM');
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);

  const MORNING_SLOTS = ['05:00 AM - 06:00 AM', '06:00 AM - 07:00 AM', '07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM'];
  const EVENING_SLOTS = ['05:00 PM - 06:00 PM', '06:00 PM - 07:00 PM', '07:00 PM - 08:00 PM', '08:00 PM - 09:00 PM'];

  const SAMPLE_UPLOADS = [
    { label: 'Front Pose Sample', url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80' },
    { label: 'Side Pose Sample', url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&auto=format&fit=crop&q=80' },
    { label: 'Back Pose Sample', url: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&auto=format&fit=crop&q=80' }
  ];

  const handleSelectImageForUpload = (url: string) => {
    setIsProcessingAIMask(true);
    setUploadedPreviewUrl(url);
    setTimeout(() => {
      setIsProcessingAIMask(false);
    }, 1000);
  };

  const handleFinalizePhotoUpload = (targetDay?: number) => {
    if (!uploadedPreviewUrl) return;
    const dayTag = targetDay ? ` - Day ${targetDay}` : '';
    const newPhoto: ProgressPhoto = {
      id: `ph-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().split('T')[0],
      type: photoType,
      imageUrl: uploadedPreviewUrl,
      isFaceMasked: aiFaceShieldActive,
      notes: photoNotes ? `${photoNotes}${dayTag}` : `${photoType}${dayTag} - AI Shielded`
    };
    onUploadProgressPhoto(newPhoto);
    setUploadedPreviewUrl(null);
    setPhotoNotes('');
    confetti({ particleCount: 40, spread: 50 });
  };

  const handleSaveRequirements = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateWorkoutPlanRequest(fitnessLevel, splitType, specificRequirements);
    if (uploadedPreviewUrl) {
      handleFinalizePhotoUpload();
    }
    setRequestSavedSuccess(true);
    confetti({ particleCount: 50, spread: 60 });
    setTimeout(() => setRequestSavedSuccess(false), 3500);
  };

  const toggleDayCompletion = (dayNum: number) => {
    if (completedDays.includes(dayNum)) {
      setCompletedDays(completedDays.filter(d => d !== dayNum));
    } else {
      setCompletedDays([...completedDays, dayNum]);
      confetti({ particleCount: 35, spread: 45 });
    }
  };

  const handleSaveRevisedMeasurements = (e: React.FormEvent) => {
    e.preventDefault();
    setMeasurementsUpdatedSuccess(true);
    confetti({ particleCount: 45, spread: 55 });
    setTimeout(() => setMeasurementsUpdatedSuccess(false), 3000);
  };

  const handleConfirmBooking = () => {
    const pkgDetails = {
      Single: { name: 'Single 1-Hour Session', price: 499 },
      '5_Day_Week': { name: '5-Day Weekly Coaching Plan', price: 1999 },
      '20_Day_Month': { name: '20-Day Monthly Coaching Plan', price: 6999 }
    }[selectedCoachingPackage];

    const newSession: OneOnOneVideoSession = {
      id: `vs-${Date.now().toString().slice(-4)}`,
      customerId: profile.id,
      customerName: profile.name,
      date: bookingDate,
      timeSlot: selectedSlotTime,
      period: selectedPeriod === 'Morning' ? 'Morning (5 AM - 9 AM)' : 'Evening (5 PM - 9 PM)',
      trainerName: workoutPlan.assignedTrainerName || 'Coach Vikram Verma',
      isFreeSession: false,
      priceAmount: pkgDetails.price,
      status: 'Booked',
      meetLink: 'https://meet.google.com/pbw-fit-live'
    };
    onBookVideoSession(newSession);
    setBookingSuccessMsg(`Booked ${pkgDetails.name} starting ${bookingDate} at ${selectedSlotTime}!`);
    confetti({ particleCount: 60, spread: 70 });
    setTimeout(() => setBookingSuccessMsg(null), 4000);
  };

  const activeDayObj = workoutPlan.schedule.find(s => s.dayNumber === selectedDayNumber) || workoutPlan.schedule[0];

  return (
    <div className="space-y-6 text-white animate-fadeIn">
      
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-stone-900 via-emerald-950 to-stone-900 border-2 border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-emerald-500 text-stone-950 font-black text-[10px] uppercase rounded-full tracking-wider flex items-center gap-1">
                <Dumbbell className="w-3.5 h-3.5" />
                <span>Certified Workout Center</span>
              </span>
              <span className="px-2.5 py-1 bg-stone-900 text-emerald-400 font-bold text-[10px] rounded-full border border-emerald-500/30">
                Trainer: {workoutPlan.assignedTrainerName}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              {profile.name}'s Workout & Transformation Hub
            </h2>
            <p className="text-stone-300 text-xs">
              Routine: <strong className="text-amber-300 capitalize">{workoutPlan.splitType.replace('_', '-')} Split ({workoutPlan.fitnessLevel})</strong> • Goal: <strong className="text-emerald-400 capitalize">{profile.goal.replace('_', ' ')}</strong>
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-amber-500/40 bg-stone-900 text-amber-300 flex items-center gap-3">
            <Video className="w-8 h-8 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider block text-stone-400">1-on-1 Video Coaching Plans</span>
              <strong className="text-xs sm:text-sm font-black text-white">
                5-Day Week & 20-Day Month Packages Available
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* EXACTLY 4 TOP NAVIGATION TABS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-1.5 bg-stone-900 rounded-2xl border border-stone-800 text-center">
        {[
          { id: 'request', label: '1. Plan Requirements', icon: <Sparkles className="w-4 h-4" /> },
          { id: 'schedule', label: '2. Workout Schedule', icon: <Dumbbell className="w-4 h-4" /> },
          { id: 'monitoring', label: '3. Schedule Monitoring', icon: <Calendar className="w-4 h-4" /> },
          { id: 'booking', label: '4. Book 1-on-1 Call', icon: <Video className="w-4 h-4" /> }
        ].map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`p-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                active
                  ? 'bg-emerald-500 text-stone-950 shadow-md scale-[1.02]'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800/80'
              }`}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: PLAN REQUIREMENTS (Experience, Split, Notes, Before Photos) */}
      {/* ==================================================================== */}
      {subTab === 'request' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveRequirements} className="bg-stone-950 p-6 rounded-3xl border border-stone-800 space-y-6">
            <div className="border-b border-stone-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white">1. Workout Plan Requirements & Current Photos</h3>
                <p className="text-xs text-stone-400">Specify your fitness level, desired split, equipment notes, and upload current transformation baseline photos for Coach {workoutPlan.assignedTrainerName}.</p>
              </div>
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-full">
                Trainer Review Active
              </span>
            </div>

            {requestSavedSuccess && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Workout requirements & current photos successfully submitted to your trainer!</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Questionnaire */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-amber-300 mb-2">Experience Level</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Beginner', 'Intermediate', 'Advanced'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setFitnessLevel(lvl)}
                        className={`p-3 rounded-xl text-xs font-black border transition-all ${
                          fitnessLevel === lvl
                            ? 'bg-emerald-500 text-stone-950 border-emerald-400 shadow-md'
                            : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-amber-300 mb-2">Desired Weekly Split</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: '3_day', label: '3-Day Split', desc: 'Full Body' },
                      { id: '5_day', label: '5-Day Split', desc: 'Hypertrophy' },
                      { id: '6_day', label: '6-Day Split', desc: 'Athletic' }
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSplitType(s.id as any)}
                        className={`p-3 rounded-xl text-xs font-black border transition-all text-left ${
                          splitType === s.id
                            ? 'bg-emerald-500 text-stone-950 border-emerald-400 shadow-md'
                            : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                        }`}
                      >
                        <div className="font-extrabold">{s.label}</div>
                        <div className={`text-[10px] ${splitType === s.id ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}>{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-amber-300 mb-1">
                    Specific Requirements / Health Restrictions / Equipment
                  </label>
                  <textarea
                    value={specificRequirements}
                    onChange={(e) => setSpecificRequirements(e.target.value)}
                    rows={4}
                    placeholder="e.g. Mild left knee stiffness, focus on shoulders and core, home dumbbell set up to 20kg..."
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Right Column: Photos of Current Photos Before Transformation */}
              <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                  <h4 className="font-extrabold text-amber-300 text-xs uppercase flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span>Upload Current Transformation Baseline Photos</span>
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    AI Face Shield Active
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-400 mb-1">Pose Category</label>
                      <select
                        value={photoType}
                        onChange={(e) => setPhotoType(e.target.value as any)}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none"
                      >
                        <option value="Front Progress">Front Pose</option>
                        <option value="Side Progress">Side Pose</option>
                        <option value="Back Progress">Back Pose</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-stone-400 mb-1">Quick Samples</label>
                      <div className="flex gap-1">
                        {SAMPLE_UPLOADS.map((sample, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectImageForUpload(sample.url)}
                            className="flex-1 py-1 bg-stone-950 hover:bg-stone-800 border border-stone-800 rounded-lg text-[9px] font-bold text-stone-300 truncate"
                          >
                            Sample {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Preview Container */}
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 flex flex-col items-center justify-center text-center space-y-2 min-h-[160px] relative">
                    {uploadedPreviewUrl ? (
                      <div className="relative w-28 aspect-[3/4] rounded-lg overflow-hidden border-2 border-emerald-500">
                        <img src={uploadedPreviewUrl} alt="Baseline Preview" className="w-full h-full object-cover" />
                        {aiFaceShieldActive && (
                          <div className="absolute top-[8%] left-[25%] right-[25%] h-[20%] bg-stone-950/95 backdrop-blur-md rounded-full border border-emerald-400 flex items-center justify-center">
                            <span className="text-[7px] font-black text-emerald-300">🔒 MASKED</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1 text-stone-500 text-xs">
                        <Upload className="w-8 h-8 mx-auto opacity-50" />
                        <p className="text-[11px]">Select sample pose or attach current photo</p>
                      </div>
                    )}

                    {uploadedPreviewUrl && (
                      <div className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          id="shieldReqCheck"
                          checked={aiFaceShieldActive}
                          onChange={(e) => setAiFaceShieldActive(e.target.checked)}
                          className="rounded accent-emerald-500"
                        />
                        <label htmlFor="shieldReqCheck" className="text-[11px] font-bold text-emerald-300 cursor-pointer">
                          AI Face Privacy Mask Enabled
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-xl text-xs shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Submit Requirement & Photos to Trainer</span>
            </button>
          </form>

          {/* List of Previously Submitted Baseline Photos */}
          <div className="bg-stone-950 p-6 rounded-3xl border border-stone-800 space-y-4">
            <h3 className="text-sm font-extrabold uppercase text-stone-300 flex items-center justify-between">
              <span>Submitted Baseline Progress Vault ({progressPhotos.length})</span>
              <span className="text-xs font-normal text-emerald-400">🔒 Encrypted Storage</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {progressPhotos.map((photo) => (
                <div key={photo.id} className="bg-stone-900 p-3 rounded-2xl border border-stone-800 space-y-2">
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-stone-700">
                    <img src={photo.imageUrl} alt={photo.type} className="w-full h-full object-cover" />
                    {photo.isFaceMasked && (
                      <div className="absolute top-[8%] left-[25%] right-[25%] h-[20%] bg-stone-950/95 backdrop-blur-md rounded-full border border-emerald-400 flex items-center justify-center">
                        <span className="text-[8px] font-black text-emerald-300">🔒 MASKED</span>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 bg-stone-950/90 px-2 py-0.5 rounded-md text-[10px] font-bold text-amber-300">
                      {photo.date}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-white">{photo.type}</span>
                    <span className="text-[10px] text-emerald-400 font-bold">Trainer Verified</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: WORKOUT SCHEDULE (Routine Display + Watch Video Option) */}
      {/* ==================================================================== */}
      {subTab === 'schedule' && (
        <div className="space-y-5">
          <div className="bg-stone-950 p-6 rounded-3xl border border-stone-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                  Assigned Routine by Coach {workoutPlan.assignedTrainerName}
                </span>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>Workout Schedule:</span>
                  <span className="text-amber-300 capitalize">
                    {workoutPlan.splitType.replace('_', '-')} Split ({workoutPlan.fitnessLevel})
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setSubTab('request')}
                className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/30 self-start sm:self-auto"
              >
                Request Routine Change
              </button>
            </div>

            {/* Day Selector Buttons */}
            <div className="space-y-2">
              <span className="text-xs font-extrabold uppercase text-amber-300">Select Workout Day</span>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {workoutPlan.schedule.map((day) => {
                  const isActive = selectedDayNumber === day.dayNumber;
                  return (
                    <button
                      key={day.dayNumber}
                      onClick={() => setSelectedDayNumber(day.dayNumber)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap border ${
                        isActive
                          ? 'bg-emerald-500 text-stone-950 border-emerald-400 shadow-lg scale-105'
                          : day.isRestDay
                          ? 'bg-stone-900 text-stone-400 border-stone-800 hover:bg-stone-800'
                          : 'bg-stone-900 text-white border-stone-800 hover:bg-stone-800'
                      }`}
                    >
                      Day {day.dayNumber} {day.isRestDay ? ' (Rest)' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Day Exercises Display with Watch Video Options */}
            <div className="p-5 bg-stone-900/90 rounded-2xl border border-stone-800 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <h4 className="font-black text-amber-300 text-sm sm:text-base flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-400" />
                  <span>{activeDayObj.dayName}</span>
                </h4>
                <span className="text-xs font-bold text-stone-400">
                  {activeDayObj.isRestDay ? 'Rest & Recovery Day' : `${activeDayObj.exercises.length} Exercises Assigned`}
                </span>
              </div>

              {activeDayObj.isRestDay ? (
                <div className="p-8 text-center text-stone-300 text-xs bg-stone-950/80 rounded-2xl border border-amber-500/30 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <Clock className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-extrabold text-white text-sm">Official Rest & Recovery Day</h5>
                    <p className="text-stone-400 text-xs max-w-md mx-auto">
                      Coach {workoutPlan.assignedTrainerName} designated Day {activeDayObj.dayNumber} as a Rest Day. Focus on mobility and nutrition!
                    </p>
                  </div>
                </div>
              ) : activeDayObj.exercises.length === 0 ? (
                <div className="p-8 text-center text-stone-400 text-xs">
                  No exercises assigned for this day.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeDayObj.exercises.map((ex) => (
                    <div
                      key={ex.id}
                      className="bg-stone-950 p-4 rounded-2xl border border-stone-800 hover:border-emerald-500/50 transition-all space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                            {ex.targetMuscle}
                          </span>

                          {/* WATCH VIDEO BUTTON */}
                          <button
                            onClick={() => setSelectedExercise(ex)}
                            className="text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all"
                          >
                            <Play className="w-3.5 h-3.5 fill-amber-400" />
                            <span>Watch Video</span>
                          </button>
                        </div>

                        <h5 className="font-extrabold text-white text-sm">
                          {ex.name}
                        </h5>

                        <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed">
                          {ex.description}
                        </p>
                      </div>

                      {/* Set-by-Set Breakdown if available or summary */}
                      {ex.setDetails && ex.setDetails.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {ex.setDetails.map((s, idx) => (
                            <span key={idx} className="bg-stone-900 border border-stone-800 px-2 py-0.5 rounded text-[10px] font-bold text-amber-300">
                              S{s.setNumber}: {s.weightKg} × {s.reps}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5 bg-stone-900 p-2.5 rounded-xl border border-stone-800 text-center text-xs font-bold">
                          <div>
                            <span className="text-[9px] text-stone-400 block font-normal uppercase">Weight</span>
                            <span className="text-white text-xs">{ex.weightKg}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-stone-400 block font-normal uppercase">Sets x Reps</span>
                            <span className="text-emerald-400 text-xs">{ex.sets} x {ex.reps}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-stone-400 block font-normal uppercase">Rest</span>
                            <span className="text-amber-300 text-xs">{ex.restSeconds}s</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: MONITORING OF WORKOUT SCHEDULE & TRANSFORMATION JOURNEY */}
      {/* ==================================================================== */}
      {subTab === 'monitoring' && (
        <div className="space-y-6">
          
          {/* SECTION A: WORKOUT CALENDAR & COMPLETION CHECKLIST */}
          <div className="bg-stone-950 p-6 rounded-3xl border border-stone-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  <span>Workout Schedule Calendar & Attendance Tracker</span>
                </h3>
                <p className="text-xs text-stone-400">Mark workouts as completed when finished to track your daily progress.</p>
              </div>
              <div className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold">
                Progress: {completedDays.length} / {workoutPlan.schedule.length} Days Completed
              </div>
            </div>

            {/* Completion Progress Bar */}
            <div className="w-full bg-stone-900 h-3 rounded-full overflow-hidden border border-stone-800">
              <div
                className="bg-gradient-to-r from-emerald-500 to-amber-400 h-full transition-all duration-500"
                style={{ width: `${Math.round((completedDays.length / workoutPlan.schedule.length) * 100)}%` }}
              />
            </div>

            {/* Days Calendar Checklist Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
              {workoutPlan.schedule.map((day) => {
                const isDone = completedDays.includes(day.dayNumber);
                return (
                  <div
                    key={day.dayNumber}
                    className={`p-4 rounded-2xl border transition-all space-y-3 flex flex-col justify-between ${
                      isDone
                        ? 'bg-emerald-950/40 border-emerald-500/50'
                        : 'bg-stone-900 border-stone-800'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-amber-300">
                          Day {day.dayNumber}
                        </span>
                        {isDone ? (
                          <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" /> Done
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-stone-500">Pending</span>
                        )}
                      </div>
                      <h5 className="font-extrabold text-white text-xs">{day.dayName}</h5>
                      <p className="text-[11px] text-stone-400">
                        {day.isRestDay ? 'Rest & Recovery' : `${day.exercises.length} Exercises`}
                      </p>
                    </div>

                    <button
                      onClick={() => toggleDayCompletion(day.dayNumber)}
                      className={`w-full py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        isDone
                          ? 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                          : 'bg-emerald-500 text-stone-950 border-emerald-400 hover:bg-emerald-400'
                      }`}
                    >
                      {isDone ? 'Mark as Pending' : 'Mark as Done'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION B: SELECT PARTICULAR DAY FOR PROGRESS PHOTO & REVISED MEASUREMENTS */}
          <div className="bg-stone-950 p-6 rounded-3xl border border-stone-800 space-y-5">
            <div className="border-b border-stone-800 pb-3">
              <h3 className="text-base font-black text-white">Update Revised Measurements & Daily Photo</h3>
              <p className="text-xs text-stone-400">Select a specific day to attach updated photos and revised physical measurements.</p>
            </div>

            {measurementsUpdatedSuccess && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Revised body measurements saved successfully! Your transformation chart updated.</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Revised Measurements Form */}
              <form onSubmit={handleSaveRevisedMeasurements} className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-amber-300 text-xs uppercase">Revised Physical Measurements</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-400 font-bold">Day:</span>
                    <select
                      value={monitoringSelectedDay}
                      onChange={(e) => setMonitoringSelectedDay(Number(e.target.value))}
                      className="bg-stone-950 border border-stone-800 rounded-lg px-2 py-1 text-xs font-bold text-white"
                    >
                      {workoutPlan.schedule.map(d => (
                        <option key={d.dayNumber} value={d.dayNumber}>Day {d.dayNumber}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] text-stone-400 block font-bold mb-1">Body Weight (kg)</label>
                    <input
                      type="text"
                      value={revisedWeight}
                      onChange={(e) => setRevisedWeight(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 block font-bold mb-1">Waist (cm)</label>
                    <input
                      type="text"
                      value={revisedWaist}
                      onChange={(e) => setRevisedWaist(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 block font-bold mb-1">Chest (cm)</label>
                    <input
                      type="text"
                      value={revisedChest}
                      onChange={(e) => setRevisedChest(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 block font-bold mb-1">Hip (cm)</label>
                    <input
                      type="text"
                      value={revisedHip}
                      onChange={(e) => setRevisedHip(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 block font-bold mb-1">Arm (cm)</label>
                    <input
                      type="text"
                      value={revisedArm}
                      onChange={(e) => setRevisedArm(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 block font-bold mb-1">Body Fat %</label>
                    <input
                      type="text"
                      value={revisedBodyFat}
                      onChange={(e) => setRevisedBodyFat(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-2.5 rounded-xl text-xs shadow-md transition-all"
                >
                  Save Revised Measurements for Day {monitoringSelectedDay}
                </button>
              </form>

              {/* Photo Upload for Particular Day */}
              <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-amber-300 text-xs uppercase">Attach Photo for Day {monitoringSelectedDay}</h4>
                  <span className="text-[10px] font-bold text-emerald-400">AI Face Shield</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {SAMPLE_UPLOADS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectImageForUpload(sample.url)}
                      className="py-2 bg-stone-950 hover:bg-stone-800 border border-stone-800 rounded-xl text-[10px] font-bold text-stone-300 text-center"
                    >
                      Sample {idx + 1}
                    </button>
                  ))}
                </div>

                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 flex flex-col items-center justify-center text-center space-y-2 min-h-[140px]">
                  {uploadedPreviewUrl ? (
                    <div className="relative w-24 aspect-[3/4] rounded-lg overflow-hidden border border-emerald-500">
                      <img src={uploadedPreviewUrl} alt="Day Progress" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <p className="text-[11px] text-stone-500">Select photo sample above to link to Day {monitoringSelectedDay}</p>
                  )}

                  {uploadedPreviewUrl && (
                    <button
                      onClick={() => handleFinalizePhotoUpload(monitoringSelectedDay)}
                      className="w-full bg-amber-400 text-stone-950 font-black py-2 rounded-xl text-xs"
                    >
                      Save Photo for Day {monitoringSelectedDay}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION C: INITIAL VS FINAL TRANSFORMATION COMPARISON */}
          <div className="bg-stone-950 p-6 rounded-3xl border-2 border-emerald-500/50 space-y-5 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                  Transformation Showcase
                </span>
                <h3 className="text-lg font-black text-white">Initial Measurements & Photos vs. Final Transformation</h3>
              </div>
              <span className="px-3 py-1 bg-emerald-500 text-stone-950 text-xs font-black rounded-full">
                🎉 Active Progress Verified
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* INITIAL BASELINE */}
              <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                  <span className="text-xs font-black uppercase text-stone-400">Initial Baseline (Start)</span>
                  <span className="text-[10px] text-stone-500 font-bold">Week 1</span>
                </div>

                <div className="flex gap-4 items-center">
                  <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden border border-stone-700 bg-stone-950 shrink-0 relative">
                    <img
                      src={progressPhotos[0]?.imageUrl || SAMPLE_UPLOADS[0].url}
                      alt="Initial Photo"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1 left-1 bg-stone-950/90 text-[8px] font-bold text-amber-300 px-1 rounded">
                      Initial
                    </div>
                  </div>

                  <div className="space-y-1 text-xs w-full">
                    <div className="flex justify-between py-1 border-b border-stone-800">
                      <span className="text-stone-400">Weight:</span>
                      <strong className="text-white">{profile.weightKg} kg</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-800">
                      <span className="text-stone-400">Waist:</span>
                      <strong className="text-white">{profile.circumferences?.waistCm || 81} cm</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-stone-800">
                      <span className="text-stone-400">Chest:</span>
                      <strong className="text-white">{profile.circumferences?.chestCm || 88} cm</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-stone-400">Body Fat:</span>
                      <strong className="text-white">25.0%</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* FINAL / REVISED TRANSFORMATION */}
              <div className="bg-emerald-950/40 p-5 rounded-2xl border border-emerald-500/50 space-y-4">
                <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2">
                  <span className="text-xs font-black uppercase text-emerald-400">Revised / Current State</span>
                  <span className="text-[10px] text-emerald-300 font-bold">Latest Transformation</span>
                </div>

                <div className="flex gap-4 items-center">
                  <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden border border-emerald-500/80 bg-stone-950 shrink-0 relative">
                    <img
                      src={progressPhotos[progressPhotos.length - 1]?.imageUrl || SAMPLE_UPLOADS[1].url}
                      alt="Final Photo"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1 left-1 bg-emerald-500 text-stone-950 text-[8px] font-black px-1 rounded">
                      Current
                    </div>
                  </div>

                  <div className="space-y-1 text-xs w-full">
                    <div className="flex justify-between py-1 border-b border-emerald-500/20">
                      <span className="text-stone-300">Weight:</span>
                      <strong className="text-emerald-300">{revisedWeight} kg</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-emerald-500/20">
                      <span className="text-stone-300">Waist:</span>
                      <strong className="text-emerald-300">{revisedWaist} cm</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-emerald-500/20">
                      <span className="text-stone-300">Chest:</span>
                      <strong className="text-emerald-300">{revisedChest} cm</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-stone-300">Body Fat:</span>
                      <strong className="text-emerald-300">{revisedBodyFat}%</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: BOOK 1-ON-1 VIDEO CALL (Single, 5-Day Week, 20-Day Month) */}
      {/* ==================================================================== */}
      {subTab === 'booking' && (
        <div className="space-y-6">
          <div className="bg-stone-950 p-6 rounded-3xl border border-stone-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Live Personal Coaching Room</span>
                <h3 className="text-base font-black text-white">Book 1-on-1 Video Call Session & Coaching Package</h3>
              </div>
              <span className="px-3 py-1 text-xs font-black rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40">
                With Coach {workoutPlan.assignedTrainerName || 'Vikram Verma'}
              </span>
            </div>

            {bookingSuccessMsg && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{bookingSuccessMsg}</span>
              </div>
            )}

            {/* PACKAGE SELECTION: 5-DAY WEEK PLAN, 20-DAY MONTH PLAN, SINGLE SESSION */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase text-amber-300">Select Suitable Coaching Plan</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { id: 'Single', name: 'Single 1-Hour Session', price: '₹499', period: '1 Live Video Session', desc: 'Ideal for form check & technique review.' },
                  { id: '5_Day_Week', name: '5-Day Week Plan', price: '₹1,999 / wk', period: '5 Live Video Sessions', desc: 'Daily live coaching for 1 week.' },
                  { id: '20_Day_Month', name: '20-Day Month Plan', price: '₹6,999 / mo', period: '20 Live Video Sessions', desc: 'Complete 1-month intensive transformation.' }
                ].map((pkg) => {
                  const isSel = selectedCoachingPackage === pkg.id;
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedCoachingPackage(pkg.id as any)}
                      className={`p-4 rounded-2xl border text-left space-y-2 transition-all ${
                        isSel
                          ? 'bg-emerald-950/60 border-emerald-400 shadow-xl scale-[1.02]'
                          : 'bg-stone-900 border-stone-800 hover:bg-stone-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-black ${isSel ? 'text-emerald-300' : 'text-white'}`}>{pkg.name}</span>
                        <span className="text-xs font-extrabold text-amber-300">{pkg.price}</span>
                      </div>
                      <div className="text-[11px] font-bold text-stone-300">{pkg.period}</div>
                      <p className="text-[10px] text-stone-400 leading-relaxed">{pkg.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              {/* Date & Slot Picker */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-amber-300 mb-1">Select Starting Date</label>
                  <input
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-300 mb-2">Select Preferred Period</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setSelectedPeriod('Morning'); setSelectedSlotTime(MORNING_SLOTS[0]); }}
                      className={`p-2.5 rounded-xl text-xs font-extrabold border transition-all ${
                        selectedPeriod === 'Morning'
                          ? 'bg-emerald-500 text-stone-950 border-emerald-400 font-black shadow-md'
                          : 'bg-stone-900 text-stone-300 border-stone-800'
                      }`}
                    >
                      Morning (5 AM - 9 AM)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedPeriod('Evening'); setSelectedSlotTime(EVENING_SLOTS[0]); }}
                      className={`p-2.5 rounded-xl text-xs font-extrabold border transition-all ${
                        selectedPeriod === 'Evening'
                          ? 'bg-emerald-500 text-stone-950 border-emerald-400 font-black shadow-md'
                          : 'bg-stone-900 text-stone-300 border-stone-800'
                      }`}
                    >
                      Evening (5 PM - 9 PM)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-300 mb-2">Select Preferred Time Slot</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(selectedPeriod === 'Morning' ? MORNING_SLOTS : EVENING_SLOTS).map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedSlotTime(slot)}
                        className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                          selectedSlotTime === slot
                            ? 'bg-emerald-500 text-stone-950 border-emerald-400 font-black shadow-md'
                            : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleConfirmBooking}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-xl text-xs shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Video className="w-4 h-4" />
                  <span>Confirm Plan Booking</span>
                </button>
              </div>

              {/* Booked Sessions List */}
              <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800 space-y-3">
                <h4 className="font-extrabold text-white text-xs uppercase text-stone-400">My Booked Live Video Sessions ({videoSessions.length})</h4>
                
                {videoSessions.length === 0 ? (
                  <p className="text-stone-500 text-xs text-center py-6">No video sessions booked yet.</p>
                ) : (
                  <div className="space-y-2">
                    {videoSessions.map((session) => (
                      <div key={session.id} className="p-3 bg-stone-950 rounded-xl border border-stone-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{session.date}</span>
                          <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                            ₹{session.priceAmount}
                          </span>
                        </div>
                        <p className="text-xs text-stone-300 font-medium">{session.timeSlot}</p>
                        <p className="text-[11px] text-stone-400">{session.period} • Coach: {session.trainerName}</p>
                        
                        {session.meetLink && (
                          <a
                            href={session.meetLink}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-center py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs rounded-lg border border-emerald-500/30 transition-all"
                          >
                            Join Live Video Call Room →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* EXERCISE DETAIL MODAL WITH VIDEO DEMONSTRATION */}
      {/* ==================================================================== */}
      {selectedExercise && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-xl rounded-3xl p-6 space-y-4 shadow-2xl animate-fadeIn relative">
            <button
              onClick={() => setSelectedExercise(null)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white bg-stone-950 rounded-full border border-stone-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-500/30">
                {selectedExercise.targetMuscle}
              </span>
              <h3 className="text-xl font-black text-white">{selectedExercise.name}</h3>
            </div>

            {/* Embedded YouTube Video Demonstration */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-stone-950 border border-stone-800 flex items-center justify-center">
              {selectedExercise.videoUrl ? (
                <iframe
                  src={selectedExercise.videoUrl}
                  title={selectedExercise.name}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="text-center space-y-2 text-stone-500">
                  <Play className="w-12 h-12 mx-auto text-emerald-400 opacity-60" />
                  <p className="text-xs font-bold text-stone-300">Exercise Demonstration Video</p>
                </div>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <h4 className="font-extrabold text-amber-300 uppercase mb-1">Technique Execution</h4>
                <p className="text-stone-300 leading-relaxed bg-stone-950 p-3 rounded-xl border border-stone-800">
                  {selectedExercise.description}
                </p>
              </div>

              {selectedExercise.setDetails && selectedExercise.setDetails.length > 0 && (
                <div>
                  <h4 className="font-extrabold text-amber-300 uppercase mb-1">Set-by-Set Target Breakdown</h4>
                  <div className="flex flex-wrap gap-2 bg-stone-950 p-3 rounded-xl border border-stone-800">
                    {selectedExercise.setDetails.map((s, idx) => (
                      <span key={idx} className="px-3 py-1 bg-stone-900 border border-stone-800 rounded-lg text-xs font-bold text-amber-300">
                        Set {s.setNumber}: <strong className="text-white">{s.weightKg}</strong> × <strong className="text-emerald-400">{s.reps}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
