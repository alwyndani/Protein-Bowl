import React, { useState } from 'react';
import { Truck } from 'lucide-react';
import { OperateDirect } from './OperateDirect';
import { OperateMess } from './OperateMess';

type Tab = 'orders' | 'mess';

/**
 * SUPER_ADMIN delivery operations: direct orders and Kerala Mess runs. Mounted only inside the SUPER_ADMIN workspace (UX gate; the backend authorizes every call
 * with the 'delivery:operate' / 'mess:delivery:operate' permissions and a fresh password step-up on every write).
 */
export const DeliveryOperations: React.FC = () => {
  const [tab, setTab] = useState<Tab>('orders');
  const tabClass = (t: Tab) =>
    `px-4 py-2 rounded-xl text-sm font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
      tab === t ? 'bg-amber-500 text-stone-950 border-amber-400' : 'bg-stone-900/70 text-stone-300 border-stone-800 hover:border-amber-500/40'
    }`;
  return (
    <section aria-label="Delivery operations" data-testid="delivery-operations" className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-white flex items-center gap-2">
          <Truck className="w-5 h-5 text-amber-400" aria-hidden="true" />
          Delivery operations
        </h2>
        <p className="text-xs text-stone-400">Operate deliveries as an administrator. Every action asks for your password and is recorded in the audit log.</p>
      </div>
      <div role="tablist" aria-label="Delivery type" className="flex gap-2">
        <button type="button" role="tab" id="ops-tab-orders" aria-selected={tab === 'orders'} aria-controls="ops-panel" onClick={() => setTab('orders')} className={tabClass('orders')}>
          Orders
        </button>
        <button type="button" role="tab" id="ops-tab-mess" aria-selected={tab === 'mess'} aria-controls="ops-panel" onClick={() => setTab('mess')} className={tabClass('mess')}>
          Kerala Mess runs
        </button>
      </div>
      <div id="ops-panel" role="tabpanel" aria-labelledby={tab === 'orders' ? 'ops-tab-orders' : 'ops-tab-mess'}>
        {tab === 'orders' ? <OperateDirect /> : <OperateMess />}
      </div>
    </section>
  );
};
