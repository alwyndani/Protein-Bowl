import React, { useState } from 'react';
import { CustomerProfile, BloodTestResults, ActivityLevel, HealthGoal } from '../../types';
import { calculateHealthMetrics } from '../../utils/healthCalculator';
import { 
  User, Activity, Stethoscope, Droplets, Apple, Scale, Clock, AlertTriangle, 
  Sparkles, CheckCircle2, Edit3, Save, RotateCcw, ShieldAlert, Heart, Calendar,
  Flame, Award, Download, History
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface HealthProfileTabProps {
  profile: CustomerProfile;
  onUpdateProfile?: (updated: CustomerProfile) => void;
}

interface HealthHistoryLog {
  id: string;
  timestamp: string;
  weightKg: number;
  heightCm: number;
  bmi: number;
  bmr: number;
  tdee: number;
  targetCalories: number;
  goal: string;
  activityLevel: string;
  foodPreference: string;
}

export const HealthProfileTab: React.FC<HealthProfileTabProps> = ({ profile, onUpdateProfile }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);

  // Local Editable State
  const [editedProfile, setEditedProfile] = useState<CustomerProfile>({ ...profile });

  // History state keeping previous values
  const [historyLogs, setHistoryLogs] = useState<HealthHistoryLog[]>([
    {
      id: 'h1',
      timestamp: '01 Jul 2026, 09:15 AM (Initial)',
      weightKg: profile.weightKg || 70.0,
      heightCm: profile.heightCm || 165,
      bmi: profile.bmi || 25.7,
      bmr: profile.bmr || 1420,
      tdee: profile.tdee || 1950,
      targetCalories: profile.targetCalories || 1650,
      goal: profile.goal || 'weight_loss',
      activityLevel: profile.activityLevel || 'moderate',
      foodPreference: profile.foodPreference || 'Non-Vegetarian'
    }
  ]);

  // Blood test warning check
  const bloodTests = editedProfile.bloodTestResults || {};
  const isBloodTestSkipped = Object.values(bloodTests).every(
    (val) => val === undefined || val === null || val === 0 || isNaN(val as number)
  );

  // Auto-calculated metrics live computation
  const calculated = calculateHealthMetrics({
    weightKg: editedProfile.weightKg || 68,
    heightCm: editedProfile.heightCm || 165,
    age: editedProfile.age || 28,
    gender: editedProfile.gender || 'female',
    activityLevel: editedProfile.activityLevel || 'moderate',
    goal: editedProfile.goal || 'weight_loss',
    hasExercise: editedProfile.hasExercise ?? true
  });

  const handleSave = () => {
    confetti({ particleCount: 50, spread: 60 });
    
    // Save current values to history BEFORE updating
    const newLog: HealthHistoryLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      weightKg: editedProfile.weightKg,
      heightCm: editedProfile.heightCm,
      bmi: calculated.bmi,
      bmr: calculated.bmr,
      tdee: calculated.tdee,
      targetCalories: calculated.targetCalories,
      goal: editedProfile.goal,
      activityLevel: editedProfile.activityLevel,
      foodPreference: editedProfile.foodPreference
    };

    setHistoryLogs([newLog, ...historyLogs]);

    const finalProfile: CustomerProfile = {
      ...editedProfile,
      bmi: calculated.bmi,
      bmiCategory: calculated.bmiCategory,
      bmr: calculated.bmr,
      tdee: calculated.tdee,
      maintenanceCalories: calculated.maintenanceCalories,
      targetCalories: calculated.targetCalories,
      macroTargets: {
        proteinGrams: calculated.proteinGrams,
        carbsGrams: calculated.carbsGrams,
        fatGrams: calculated.fatGrams,
        fiberGrams: calculated.fiberGrams
      },
      waterRequirementL: calculated.waterRequirementL,
      idealBodyWeightKg: calculated.idealBodyWeightKg,
      leanBodyMassKg: calculated.leanBodyMassKg,
      calorieDeficitSurplus: calculated.calorieDeficitSurplus
    };

    if (onUpdateProfile) {
      onUpdateProfile(finalProfile);
    }
    setIsEditing(false);
  };

  const handleDownloadHistory = () => {
    const headers = 'Timestamp,Weight (kg),Height (cm),BMI,BMR,TDEE,Target Calories,Goal,Activity,Preference\n';
    const rows = historyLogs.map(l => 
      `"${l.timestamp}",${l.weightKg},${l.heightCm},${l.bmi},${l.bmr},${l.tdee},${l.targetCalories},"${l.goal}","${l.activityLevel}","${l.foodPreference}"`
    ).join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editedProfile.name.replace(/\s+/g, '_')}_health_history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleArrayItem = (field: keyof CustomerProfile, item: string) => {
    const currentList = (editedProfile[field] as string[]) || [];
    if (item === 'None') {
      setEditedProfile({ ...editedProfile, [field]: ['None'] });
      return;
    }
    const filtered = currentList.filter((x) => x !== 'None');
    if (filtered.includes(item)) {
      const updated = filtered.filter((x) => x !== item);
      setEditedProfile({ ...editedProfile, [field]: updated.length === 0 ? ['None'] : updated });
    } else {
      setEditedProfile({ ...editedProfile, [field]: [...filtered, item] });
    }
  };

  const primaryGoalOptions = [
    'Weight Loss', 'Fat Loss', 'Muscle Gain', 'Lean Muscle Gain', 'Body Recomposition', 
    'Weight Gain', 'Improve Athletic Performance', 'Improve Strength', 'Improve Endurance', 
    'Healthy Lifestyle', 'Disease Management', 'Improve Gut Health', 'Improve Energy Levels', 
    'Improve Skin & Hair', 'Other'
  ];

  const medicalOptions = [
    'None', 'Diabetes Type 1', 'Diabetes Type 2', 'Prediabetes', 'Hypertension', 'Hypotension', 
    'Hypothyroidism', 'Hyperthyroidism', 'PCOS', 'High Cholesterol', 'Heart Disease', 'Fatty Liver', 
    'Kidney Disease', 'Liver Disease', 'Arthritis', 'Osteoporosis', 'Gout', 'IBS', 'IBD', 
    'Gastritis', 'Acid Reflux (GERD)', 'Constipation', 'Food Allergies', 'Asthma', 'Sleep Apnea', 'Cancer', 'Other'
  ];

  const supplementOptions = [
    'None', 'Whey Protein', 'Creatine', 'Fish Oil', 'Omega-3', 'Multivitamin', 
    'Vitamin D', 'Vitamin B12', 'Calcium', 'Magnesium', 'Zinc', 'Iron', 
    'Collagen', 'Probiotics', 'Electrolytes', 'Other'
  ];

  const allergyOptions = ['None', 'Milk', 'Egg', 'Fish', 'Shellfish', 'Peanut', 'Tree Nuts', 'Soy', 'Wheat', 'Gluten', 'Sesame', 'Other'];

  const digestiveOptions = [
    'Good', 'Bloating', 'Gas', 'Constipation', 'Diarrhea', 'Acidity', 'Acid Reflux', 
    'IBS', 'Lactose Intolerance', 'Gluten Sensitivity', 'Poor Appetite', 'Other'
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Top Banner & Control Actions */}
      <div className="bg-gradient-to-r from-emerald-900 via-stone-900 to-emerald-950 text-white rounded-3xl p-6 shadow-lg border border-emerald-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-emerald-700/80 rounded-lg">
              <User className="w-4 h-4 text-emerald-300" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Demographic & Clinical Health Profile
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black">
            {editedProfile.name}'s Health Assessment
          </h2>
          <p className="text-xs text-stone-300 mt-0.5">
            Synchronized with Dietitian Portal & Automated Kitchen Calorie Engine
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowFormulas(!showFormulas)}
            className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-bold rounded-xl border border-stone-700 flex items-center gap-1.5 transition-all"
            title="View Scientific Formulas"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{showFormulas ? 'Hide Formulas' : 'View Formulas'}</span>
          </button>

          <button
            onClick={handleDownloadHistory}
            className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl border border-stone-700 flex items-center gap-1.5 transition-all"
            title="Download Health History as CSV"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Download History</span>
          </button>

          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Health Data</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { setEditedProfile({ ...profile }); setIsEditing(false); }}
                className="px-3 py-2 bg-stone-700 text-white font-bold text-xs rounded-xl flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scientific Formulas Reference Drawer */}
      {showFormulas && (
        <div className="bg-stone-900 text-stone-100 p-5 rounded-3xl border border-amber-500/30 shadow-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Auto-Calculated Scientific Formulas (Exact Specification)</span>
            </h3>
            <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full font-mono">
              Medical Grade Math
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">BMI (kg/m²)</strong>
              Weight (kg) ÷ Height² (m²)
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">BMR — Male (Mifflin-St Jeor)</strong>
              (10 × Weight) + (6.25 × Height) − (5 × Age) + 5 kcal/d
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">BMR — Female (Mifflin-St Jeor)</strong>
              (10 × Weight) + (6.25 × Height) − (5 × Age) − 161 kcal/d
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">TDEE (kcal/day)</strong>
              BMR × Activity Factor (1.2 to 1.9)
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">Daily Calorie Target</strong>
              TDEE ± Calorie Deficit/Surplus (500 kcal)
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">Protein Requirement</strong>
              Body Weight × Protein Factor (1.5g – 2.2g/kg)
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">Fat Requirement</strong>
              (Daily Calories × 25%) ÷ 9 g/day
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">Carbohydrate Requirement</strong>
              (Daily Calories − Protein Cals − Fat Cals) ÷ 4 g/day
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">Fibre Requirement</strong>
              14 × (Daily Calories ÷ 1000) g/day
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">Water Requirement</strong>
              Weight × 35 ml ÷ 1000 L/day
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">Ideal Body Weight — Devine</strong>
              M: 50 + 2.3 × (Inches - 60) | F: 45.5 + 2.3 × (Inches - 60)
            </div>
            <div className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700">
              <strong className="text-amber-300 block mb-0.5">Lean Body Mass — Boer</strong>
              M: 0.407W + 0.267H - 19.2 | F: 0.252W + 0.473H - 48.3
            </div>
          </div>
        </div>
      )}

      {/* Auto-Calculated Metrics Dashboard Grid */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 border border-stone-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-black uppercase tracking-wider text-amber-400">
              Auto-Calculated Scientific Energy & Macro Profile
            </h3>
          </div>
          <span className="text-[11px] text-emerald-400 font-bold bg-emerald-950 border border-emerald-800 px-3 py-1 rounded-full">
            Live Calculated
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
          <div className="bg-stone-800/80 p-3 rounded-2xl border border-stone-700">
            <span className="text-[10px] uppercase text-stone-400 block font-bold">BMI</span>
            <strong className="text-xl font-black text-white">{calculated.bmi}</strong> <span className="text-xs text-stone-400">kg/m²</span>
            <span className="block text-[10px] text-amber-300 font-bold mt-0.5">{calculated.bmiCategory}</span>
          </div>

          <div className="bg-stone-800/80 p-3 rounded-2xl border border-stone-700">
            <span className="text-[10px] uppercase text-stone-400 block font-bold">BMR</span>
            <strong className="text-xl font-black text-emerald-300">{calculated.bmr}</strong> <span className="text-xs text-stone-400">kcal/d</span>
            <span className="block text-[10px] text-stone-400 mt-0.5">Basal Metabolic</span>
          </div>

          <div className="bg-stone-800/80 p-3 rounded-2xl border border-stone-700">
            <span className="text-[10px] uppercase text-stone-400 block font-bold">TDEE</span>
            <strong className="text-xl font-black text-amber-300">{calculated.tdee}</strong> <span className="text-xs text-stone-400">kcal/d</span>
            <span className="block text-[10px] text-stone-400 mt-0.5">Total Daily Energy</span>
          </div>

          <div className="bg-stone-800/80 p-3 rounded-2xl border border-stone-700">
            <span className="text-[10px] uppercase text-stone-400 block font-bold">Target Cals</span>
            <strong className="text-xl font-black text-amber-400">{calculated.targetCalories}</strong> <span className="text-xs text-stone-400">kcal</span>
            <span className="block text-[10px] text-amber-300 font-bold mt-0.5">{calculated.calorieDeficitSurplus > 0 ? `+${calculated.calorieDeficitSurplus}` : calculated.calorieDeficitSurplus} kcal/d</span>
          </div>

          <div className="bg-stone-800/80 p-3 rounded-2xl border border-stone-700">
            <span className="text-[10px] uppercase text-stone-400 block font-bold">Protein Target</span>
            <strong className="text-xl font-black text-emerald-400">{calculated.proteinGrams}g</strong> <span className="text-xs text-stone-400">/day</span>
            <span className="block text-[10px] text-stone-400 mt-0.5">Carbs {calculated.carbsGrams}g • Fat {calculated.fatGrams}g</span>
          </div>

          <div className="bg-stone-800/80 p-3 rounded-2xl border border-stone-700">
            <span className="text-[10px] uppercase text-stone-400 block font-bold">Water Req.</span>
            <strong className="text-xl font-black text-blue-400">{calculated.waterRequirementL}L</strong> <span className="text-xs text-stone-400">/day</span>
            <span className="block text-[10px] text-stone-400 mt-0.5">Ideal Wt: {calculated.idealBodyWeightKg} kg</span>
          </div>
        </div>
      </div>

      {/* Blood Test Warning Alert Banner (If skipped) */}
      {isBloodTestSkipped && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <strong className="font-bold block text-sm mb-0.5">Blood Test Values Pending (Optional Entry)</strong>
            <span>
              You have skipped blood test fields. These clinical parameters (HbA1c, Fasting Glucose, Lipid Panel, Vitamin D & B12) may be required for optimal dietitian consultation & specialized medical meal customization. Submission is not blocked, but updating these anytime provides higher precision.
            </span>
          </div>
        </div>
      )}

      {/* Section 1: Profile Basics & Initial Entry */}
      <div className="bg-stone-900 rounded-3xl p-6 border border-stone-800 shadow-xl space-y-4 text-white">
        <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-stone-800 pb-3">
          <User className="w-4 h-4 text-emerald-400" />
          <span>1. Profile Basics & Initial Body Measurements</span>
        </h3>

        {isEditing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-bold text-white">
            <div>
              <label className="text-stone-300 block mb-1">Full Name</label>
              <input
                type="text"
                value={editedProfile.name}
                onChange={(e) => setEditedProfile({ ...editedProfile, name: e.target.value })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Mobile Number</label>
              <input
                type="text"
                value={editedProfile.phone}
                onChange={(e) => setEditedProfile({ ...editedProfile, phone: e.target.value })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Email Address</label>
              <input
                type="email"
                value={editedProfile.email}
                onChange={(e) => setEditedProfile({ ...editedProfile, email: e.target.value })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Date of Birth</label>
              <input
                type="date"
                value={editedProfile.dob}
                onChange={(e) => setEditedProfile({ ...editedProfile, dob: e.target.value })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Gender</label>
              <select
                value={editedProfile.gender || 'female'}
                onChange={(e) => setEditedProfile({ ...editedProfile, gender: e.target.value as any })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Height (cm)</label>
              <input
                type="number"
                value={editedProfile.heightCm}
                onChange={(e) => setEditedProfile({ ...editedProfile, heightCm: Number(e.target.value) })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Current Weight (kg)</label>
              <input
                type="number"
                value={editedProfile.weightKg}
                onChange={(e) => setEditedProfile({ ...editedProfile, weightKg: Number(e.target.value) })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Target Weight (kg)</label>
              <input
                type="number"
                value={editedProfile.targetWeightKg || 58}
                onChange={(e) => setEditedProfile({ ...editedProfile, targetWeightKg: Number(e.target.value) })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Occupation</label>
              <input
                type="text"
                value={editedProfile.occupation || 'IT Professional'}
                onChange={(e) => setEditedProfile({ ...editedProfile, occupation: e.target.value })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Work Schedule</label>
              <input
                type="text"
                value={editedProfile.workSchedule || 'Flexible Hours'}
                onChange={(e) => setEditedProfile({ ...editedProfile, workSchedule: e.target.value })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Sleep Duration (hrs)</label>
              <input
                type="number"
                value={editedProfile.sleepDuration || 7}
                onChange={(e) => setEditedProfile({ ...editedProfile, sleepDuration: Number(e.target.value) })}
                className="w-full p-2 bg-stone-950 border border-stone-800 rounded-xl text-white"
              />
            </div>
            <div>
              <label className="text-stone-300 block mb-1">Wake-up / Bed Time</label>
              <div className="flex gap-1">
                <input
                  type="time"
                  value={editedProfile.wakeUpTime || '06:30'}
                  onChange={(e) => setEditedProfile({ ...editedProfile, wakeUpTime: e.target.value })}
                  className="w-1/2 p-1.5 bg-stone-950 border border-stone-800 rounded-xl text-white"
                />
                <input
                  type="time"
                  value={editedProfile.bedTime || '23:00'}
                  onChange={(e) => setEditedProfile({ ...editedProfile, bedTime: e.target.value })}
                  className="w-1/2 p-1.5 bg-stone-950 border border-stone-800 rounded-xl text-white"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
            <div><span className="text-stone-400 block">Full Name:</span> <strong className="text-white">{editedProfile.name}</strong></div>
            <div><span className="text-stone-400 block">Mobile:</span> <strong className="text-white">{editedProfile.phone}</strong></div>
            <div><span className="text-stone-400 block">Email:</span> <strong className="text-white">{editedProfile.email}</strong></div>
            <div><span className="text-stone-400 block">DOB / Age:</span> <strong className="text-white">{editedProfile.dob} ({editedProfile.age} yrs)</strong></div>
            <div><span className="text-stone-400 block">Gender:</span> <strong className="text-white capitalize">{editedProfile.gender || 'Female'}</strong></div>
            <div><span className="text-stone-400 block">Height / Weight:</span> <strong className="text-white">{editedProfile.heightCm} cm / {editedProfile.weightKg} kg</strong></div>
            <div><span className="text-stone-400 block">Target Weight:</span> <strong className="text-emerald-400 font-bold">{editedProfile.targetWeightKg || 58} kg</strong></div>
            <div><span className="text-stone-400 block">Occupation:</span> <strong className="text-white">{editedProfile.occupation || 'IT Professional'}</strong></div>
            <div><span className="text-stone-400 block">Work Schedule:</span> <strong className="text-white">{editedProfile.workSchedule || 'Flexible Hours'}</strong></div>
            <div><span className="text-stone-400 block">Sleep Schedule:</span> <strong className="text-white">{editedProfile.sleepDuration || 7} hrs/day ({editedProfile.wakeUpTime || '06:30'} - {editedProfile.bedTime || '23:00'})</strong></div>
          </div>
        )}
      </div>

      {/* Section 2: Circumferences & Muscle Mass Tracking */}
      <div className="bg-stone-900 rounded-3xl p-6 border border-stone-800 shadow-xl space-y-4 text-white">
        <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-stone-800 pb-3">
          <Scale className="w-4 h-4 text-amber-400" />
          <span>2. Circumference & Limb Measurements (cm / kg)</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
            <span className="text-stone-400 block text-[10px] font-bold uppercase">Muscle Mass</span>
            <strong className="text-emerald-400 font-extrabold text-sm">{editedProfile.muscleMassKg || 24.5} kg</strong>
          </div>
          <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
            <span className="text-stone-400 block text-[10px] font-bold uppercase">Waist</span>
            <strong className="text-white font-extrabold text-sm">{editedProfile.circumferences?.waistCm || 81} cm</strong>
          </div>
          <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
            <span className="text-stone-400 block text-[10px] font-bold uppercase">Hip</span>
            <strong className="text-white font-extrabold text-sm">{editedProfile.circumferences?.hipCm || 98} cm</strong>
          </div>
          <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
            <span className="text-stone-400 block text-[10px] font-bold uppercase">Chest</span>
            <strong className="text-white font-extrabold text-sm">{editedProfile.circumferences?.chestCm || 88} cm</strong>
          </div>
          <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
            <span className="text-stone-400 block text-[10px] font-bold uppercase">Neck</span>
            <strong className="text-white font-extrabold text-sm">{editedProfile.circumferences?.neckCm || 34} cm</strong>
          </div>
          <div className="bg-stone-950 p-3 rounded-2xl border border-stone-800">
            <span className="text-stone-400 block text-[10px] font-bold uppercase">Arms (L/R)</span>
            <strong className="text-white font-extrabold text-xs">{editedProfile.limbCircumferences?.leftArmCm || 28} / {editedProfile.limbCircumferences?.rightArmCm || 28.5} cm</strong>
          </div>
        </div>
      </div>

      {/* Section 3: Primary Goals & Exercise Details */}
      <div className="bg-stone-900 rounded-3xl p-6 border border-stone-800 shadow-xl space-y-4 text-white">
        <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-stone-800 pb-3">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span>3. Primary Goals & Exercise Details</span>
        </h3>

        <div className="space-y-3">
          <div>
            <span className="text-stone-400 text-xs block mb-1.5 font-bold">Selected Goals:</span>
            <div className="flex flex-wrap gap-1.5">
              {(editedProfile.primaryGoals || ['Weight Loss', 'Fat Loss', 'Improve Gut Health']).map((g) => (
                <span key={g} className="px-3 py-1 bg-amber-400/20 text-amber-300 font-bold rounded-full text-xs border border-amber-400/30">
                  ✓ {g}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2">
            <div><span className="text-stone-400 block">Activity Level:</span> <strong className="text-white capitalize">{editedProfile.activityLevel}</strong></div>
            <div><span className="text-stone-400 block">Daily Step Target:</span> <strong className="text-white">{editedProfile.dailyStepCount || 8500} steps</strong></div>
            <div><span className="text-stone-400 block">Workout Frequency:</span> <strong className="text-white">{editedProfile.workoutFrequency || '3–4 Days'}</strong></div>
            <div><span className="text-stone-400 block">Session Duration:</span> <strong className="text-white">{editedProfile.workoutDuration || 45} mins</strong></div>
          </div>
        </div>
      </div>

      {/* Section 4: Clinical Medical, Medications & Blood Test Results */}
      <div className="bg-stone-900 rounded-3xl p-6 border border-stone-800 shadow-xl space-y-4 text-white">
        <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-stone-800 pb-3">
          <Stethoscope className="w-4 h-4 text-rose-400" />
          <span>4. Medical Conditions, Medications & Clinical Blood Tests</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-stone-400 block mb-1 font-bold">Medical Conditions:</span>
            <div className="flex flex-wrap gap-1.5">
              {(editedProfile.medicalConditions || ['PCOS']).map((mc) => (
                <span key={mc} className="px-2.5 py-1 bg-rose-500/20 text-rose-300 font-bold rounded-lg border border-rose-500/30">
                  {mc}
                </span>
              ))}
            </div>
          </div>

          <div>
            <span className="text-stone-400 block mb-1 font-bold">Current Medications:</span>
            <div className="p-2.5 bg-stone-950 rounded-xl border border-stone-800 font-medium text-stone-200">
              {editedProfile.currentMedications || 'None'}
            </div>
          </div>
        </div>

        {/* Blood Test Results Grid */}
        <div className="pt-2">
          <span className="text-stone-300 text-xs font-bold block mb-2">Blood Test Values (mg/dL, %, g/dL, ng/mL):</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
            {[
              { label: 'Fasting Sugar', val: bloodTests.fastingBloodSugar, unit: 'mg/dL' },
              { label: 'HbA1c', val: bloodTests.hbA1c, unit: '%' },
              { label: 'Total Cholesterol', val: bloodTests.totalCholesterol, unit: 'mg/dL' },
              { label: 'HDL', val: bloodTests.hdl, unit: 'mg/dL' },
              { label: 'LDL', val: bloodTests.ldl, unit: 'mg/dL' },
              { label: 'Triglycerides', val: bloodTests.triglycerides, unit: 'mg/dL' },
              { label: 'Hemoglobin', val: bloodTests.hemoglobin, unit: 'g/dL' },
              { label: 'Vitamin D', val: bloodTests.vitaminD, unit: 'ng/mL' },
              { label: 'Vitamin B12', val: bloodTests.vitaminB12, unit: 'pg/mL' },
              { label: 'TSH', val: bloodTests.tsh, unit: 'mIU/L' }
            ].map((bt, idx) => (
              <div key={idx} className="p-2.5 bg-stone-950 rounded-xl border border-stone-800 text-center">
                <span className="text-[10px] text-stone-400 uppercase font-bold block">{bt.label}</span>
                <strong className="text-white text-xs">{bt.val ? `${bt.val} ${bt.unit}` : 'Skipped'}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 5: Food Preferences, Allergies & Dislikes */}
      <div className="bg-stone-900 rounded-3xl p-6 border border-stone-800 shadow-xl space-y-4 text-white">
        <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2 border-b border-stone-800 pb-3">
          <Apple className="w-4 h-4 text-emerald-400" />
          <span>5. Dietary Preferences, Allergies & Food Dislikes</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-stone-400 block mb-1 font-bold">Food Preference:</span>
            <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 font-bold rounded-xl border border-emerald-500/30 inline-block">
              {editedProfile.foodPreference || 'Non-Vegetarian'}
            </span>
          </div>

          <div>
            <span className="text-stone-400 block mb-1 font-bold">Allergies:</span>
            <div className="flex flex-wrap gap-1.5">
              {(editedProfile.allergies || ['Peanuts']).map((al) => (
                <span key={al} className="px-2.5 py-1 bg-amber-500/20 text-amber-300 font-bold rounded-lg border border-amber-500/30">
                  ⚠️ {al}
                </span>
              ))}
            </div>
          </div>

          <div>
            <span className="text-stone-400 block mb-1 font-bold">Disliked Foods:</span>
            <div className="flex flex-wrap gap-1.5">
              {(editedProfile.foodDislikes || ['Mushroom']).map((fd) => (
                <span key={fd} className="px-2.5 py-1 bg-stone-950 text-stone-300 font-medium rounded-lg border border-stone-800">
                  ✕ {fd}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Section 6: Health Profile History & Revision Logs */}
      <div className="bg-stone-900 rounded-3xl p-6 border border-stone-800 shadow-xl space-y-4 text-white">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <h3 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <span>6. Profile Change History & Baseline Logs</span>
          </h3>
          <button
            onClick={handleDownloadHistory}
            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold rounded-xl border border-emerald-500/30 flex items-center gap-1.5 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-800 text-stone-400 text-[11px]">
                <th className="pb-2 font-bold">Timestamp</th>
                <th className="pb-2 font-bold">Weight</th>
                <th className="pb-2 font-bold">Height</th>
                <th className="pb-2 font-bold">BMI</th>
                <th className="pb-2 font-bold">BMR</th>
                <th className="pb-2 font-bold">TDEE</th>
                <th className="pb-2 font-bold">Target Cals</th>
                <th className="pb-2 font-bold">Goal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 font-medium text-stone-300">
              {historyLogs.map((log) => (
                <tr key={log.id} className="hover:bg-stone-950/50">
                  <td className="py-2.5 font-bold text-amber-300">{log.timestamp}</td>
                  <td className="py-2.5">{log.weightKg} kg</td>
                  <td className="py-2.5">{log.heightCm} cm</td>
                  <td className="py-2.5 font-bold text-emerald-400">{log.bmi}</td>
                  <td className="py-2.5">{log.bmr} kcal</td>
                  <td className="py-2.5">{log.tdee} kcal</td>
                  <td className="py-2.5 font-bold text-white">{log.targetCalories} kcal</td>
                  <td className="py-2.5 capitalize">{log.goal.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
