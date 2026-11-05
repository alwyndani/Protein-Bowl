import React, { useState } from 'react';
import { CustomerProfile } from '../../types';
import { HealthProfileTab } from './HealthProfileTab';
import { CustomerWorkouts } from './CustomerWorkouts';
import { Dumbbell, FileText, ShoppingBag, UserCheck } from 'lucide-react';

interface CustomerDashboardProps {
  profile: CustomerProfile;
  /** Switches the app to another customer tab ('plan_review', 'plan_builder', 'kerala_mess', 'menu', ...). */
  onNavigate: (tab: string) => void;
  /** Opens the real order history / tracking (server orders). */
  onOpenOrders: () => void;
}

type Tab = 'health-profile' | 'diet' | 'workout-plan' | 'orders';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'health-profile', label: 'Health profile', icon: <UserCheck className="w-4 h-4" aria-hidden="true" /> },
  { id: 'diet', label: 'Diet plans', icon: <FileText className="w-4 h-4" aria-hidden="true" /> },
  { id: 'workout-plan', label: 'Workout plans', icon: <Dumbbell className="w-4 h-4" aria-hidden="true" /> },
  { id: 'orders', label: 'My orders', icon: <ShoppingBag className="w-4 h-4" aria-hidden="true" /> }
];

const card = 'bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-3';
const primary = 'bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-sm rounded-xl px-5 py-3';
const secondary = 'bg-stone-800 hover:bg-stone-700 border border-stone-700 text-white font-bold text-sm rounded-xl px-5 py-3';

/**
 * Customer dashboard. Every tab is backed by real data: the health profile (server), diet requests and plans (diet API), workout plans from the
 * assigned trainer (trainer API) and the server order history. Nothing here is sample content: there are no invented dishes, prices, ratings,
 * wallet balances, chat messages, tracking stages or payment screens. Features without a backend do not appear.
 */
export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({ profile, onNavigate, onOpenOrders }) => {
  const [currentProfile, setCurrentProfile] = useState<CustomerProfile>(profile);
  const [activeTab, setActiveTab] = useState<Tab>('health-profile');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6 text-white" data-testid="customer-dashboard">
      <header className="bg-gradient-to-r from-stone-900 via-emerald-950 to-stone-900 rounded-3xl p-6 sm:p-8 border border-stone-800">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{currentProfile.name ? `Welcome, ${currentProfile.name}!` : 'Welcome!'}</h1>
        {currentProfile.targetCalories > 0 && (
          <p className="text-stone-300 text-xs sm:text-sm mt-1">
            Goal: <strong className="capitalize text-emerald-300">{currentProfile.goal.replace('_', ' ')}</strong> • Daily target: <strong className="text-white">{currentProfile.targetCalories} kcal</strong>
          </p>
        )}
      </header>

      <div role="tablist" aria-label="Dashboard sections" className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 bg-stone-900 rounded-2xl border border-stone-800 text-center">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`p-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 ${activeTab === tab.id ? 'bg-emerald-500 text-stone-950' : 'text-stone-300 hover:text-white hover:bg-stone-800/80'}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'health-profile' && <HealthProfileTab profile={currentProfile} onUpdateProfile={(updated) => setCurrentProfile(updated)} />}

      {activeTab === 'diet' && (
        <section className={card} aria-label="Diet plans">
          <h2 className="text-lg font-black">Your diet plan</h2>
          <p className="text-sm text-stone-300">Ask a nutritionist for a personal plan, or review the plan that is waiting for you. Your health profile is only visible to the nutritionist who accepts your request.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primary} onClick={() => onNavigate('plan_review')}>Review my plan</button>
            <button type="button" className={secondary} onClick={() => onNavigate('plan_builder')}>Request a new plan</button>
          </div>
        </section>
      )}

      {activeTab === 'workout-plan' && <CustomerWorkouts />}

      {activeTab === 'orders' && (
        <section className={card} aria-label="Orders">
          <h2 className="text-lg font-black">Your orders</h2>
          <p className="text-sm text-stone-300">See the status of your orders, pay, track delivery, cancel an eligible order and follow refunds. Kerala Mess subscriptions are in their own section.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primary} onClick={onOpenOrders}>View my orders</button>
            <button type="button" className={secondary} onClick={() => onNavigate('kerala_mess')}>Kerala Mess</button>
            <button type="button" className={secondary} onClick={() => onNavigate('menu')}>Browse the menu</button>
          </div>
        </section>
      )}
    </div>
  );
};
