import React, { useState } from 'react';
import { DeliveryWorkspace } from './DeliveryWorkspace';
import { MessDeliveryPanel } from './MessDeliveryPanel';

/**
 * The DELIVERY employee's home: the P9 per-order queue and the P10C Kerala Mess bulk runs are two SEPARATE workflows with separate data, so they are separate tabs.
 * Nothing is shared between them except the central staff session.
 */
export const DeliveryHome: React.FC<{ onSessionExpired?: () => void }> = ({ onSessionExpired }) => {
  const [view, setView] = useState<'orders' | 'mess'>('orders');
  const tab = (id: 'orders' | 'mess', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      onClick={() => setView(id)}
      className={`min-h-11 px-4 rounded-xl text-sm font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${view === id ? 'bg-orange-600 text-white border-orange-700' : 'bg-white text-stone-900 border-stone-400'}`}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Delivery work" className="flex gap-2">
        {tab('orders', 'Orders')}
        {tab('mess', 'Kerala Mess runs')}
      </div>
      {view === 'orders' ? (
        <DeliveryWorkspace onSessionExpired={onSessionExpired} />
      ) : (
        <div className="bg-white text-stone-900 border border-stone-200 rounded-3xl p-4 sm:p-6">
          <MessDeliveryPanel onSessionExpired={onSessionExpired} />
        </div>
      )}
    </div>
  );
};
