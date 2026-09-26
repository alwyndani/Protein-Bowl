import React, { useState } from 'react';
import { 
  AggregatorReservedInventory, 
  AggregatorLiveOrder, 
  KitchenBranchId 
} from '../../types';
import { 
  INITIAL_AGGREGATOR_INVENTORY, 
  INITIAL_AGGREGATOR_ORDERS 
} from '../../data/mockKeralaMessData';
import { 
  Layers, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  DollarSign, 
  RefreshCw, 
  Flame, 
  Truck, 
  User, 
  Phone, 
  QrCode, 
  Lock, 
  Unlock, 
  Sliders, 
  Power, 
  Search, 
  ChevronRight, 
  ArrowUpRight,
  Utensils
} from 'lucide-react';

interface SwiggyZomatoAggregatorPortalProps {
  selectedBranchId?: KitchenBranchId;
  onSelectBranch?: (branch: KitchenBranchId) => void;
  onSwitchToChef?: () => void;
  onSwitchToMessCustomer?: () => void;
}

export const SwiggyZomatoAggregatorPortal: React.FC<SwiggyZomatoAggregatorPortalProps> = ({
  selectedBranchId = 'all',
  onSelectBranch,
  onSwitchToChef,
  onSwitchToMessCustomer
}) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'live_orders' | 'financials'>('inventory');
  const [inventory, setInventory] = useState<AggregatorReservedInventory[]>(INITIAL_AGGREGATOR_INVENTORY);
  const [liveOrders, setLiveOrders] = useState<AggregatorLiveOrder[]>(INITIAL_AGGREGATOR_ORDERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<'all' | 'swiggy' | 'zomato'>('all');

  // Toggle Swiggy or Zomato channel availability
  const handleToggleChannel = (id: string, platform: 'swiggy' | 'zomato') => {
    setInventory(prev => prev.map(item => {
      if (item.id === id) {
        if (platform === 'swiggy') {
          return { ...item, swiggyActive: !item.swiggyActive };
        } else {
          return { ...item, zomatoActive: !item.zomatoActive };
        }
      }
      return item;
    }));
  };

  // Adjust reserved buffer slider
  const handleBufferChange = (id: string, delta: number) => {
    setInventory(prev => prev.map(item => {
      if (item.id === id) {
        const newReserved = Math.max(0, Math.min(item.totalCookedPortions - 20, item.reservedForSwiggyZomato + delta));
        const newMess = item.totalCookedPortions - newReserved;
        return {
          ...item,
          reservedForSwiggyZomato: newReserved,
          reservedForMess: newMess,
          swiggyLiveStock: Math.floor(newReserved * 0.6),
          zomatoLiveStock: Math.floor(newReserved * 0.4)
        };
      }
      return item;
    }));
  };

  // Advance live order stage
  const handleAdvanceOrderStatus = (orderId: string) => {
    setLiveOrders(prev => prev.map(ord => {
      if (ord.id === orderId) {
        if (ord.status === 'order_received') return { ...ord, status: 'kitchen_preparing' };
        if (ord.status === 'kitchen_preparing') return { ...ord, status: 'ready_for_pickup' };
        if (ord.status === 'ready_for_pickup') return { ...ord, status: 'rider_picked_up' };
        if (ord.status === 'rider_picked_up') return { ...ord, status: 'delivered' };
      }
      return ord;
    }));
  };

  // Aggregated Metrics
  const totalMessReserved = inventory.reduce((acc, i) => acc + i.reservedForMess, 0);
  const totalAggregatorReserved = inventory.reduce((acc, i) => acc + i.reservedForSwiggyZomato, 0);
  const totalGrossAggregatorSales = liveOrders.reduce((acc, o) => acc + o.subtotal, 0);
  const totalCommissionPaid = liveOrders.reduce((acc, o) => acc + o.platformCommission, 0);
  const totalNetPayout = liveOrders.reduce((acc, o) => acc + o.netPayout, 0);

  const filteredOrders = liveOrders.filter(o => {
    const platformMatch = selectedPlatformFilter === 'all' || o.platform === selectedPlatformFilter;
    const searchMatch = o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.items.some(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return platformMatch && searchMatch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* HEADER BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-stone-900 via-orange-950/40 to-stone-900 border border-orange-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 text-xs font-bold">
              <Layers className="w-3.5 h-3.5" />
              <span>Swiggy & Zomato Aggregator Portal | Food Portions Reservation Buffer</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Aggregator Channel & Stock Protection Manager
            </h1>
            <p className="text-stone-300 text-xs sm:text-sm max-w-2xl">
              Manage on-demand food portions allocated to Swiggy & Zomato while safeguarding baseline kitchen inventory for registered hostel mess subscribers.
            </p>
          </div>

          {/* Action Links */}
          <div className="flex flex-wrap items-center gap-3">
            {onSwitchToChef && (
              <button
                onClick={onSwitchToChef}
                className="bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
              >
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Chef Batch Production</span>
              </button>
            )}

            {onSwitchToMessCustomer && (
              <button
                onClick={onSwitchToMessCustomer}
                className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2"
              >
                <Utensils className="w-4 h-4" />
                <span>Customer Mess Portal</span>
              </button>
            )}
          </div>
        </div>

        {/* METRICS ROW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-stone-800/80">
          <div className="bg-stone-950/80 p-4 rounded-2xl border border-stone-800">
            <div className="text-[11px] text-stone-400 font-medium">Protected Mess Portions</div>
            <div className="text-2xl font-black text-emerald-400">{totalMessReserved} meals</div>
            <div className="text-[10px] text-emerald-500 font-bold flex items-center gap-1 mt-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Hostel Subscriptions Safe</span>
            </div>
          </div>

          <div className="bg-stone-950/80 p-4 rounded-2xl border border-stone-800">
            <div className="text-[11px] text-stone-400 font-medium">Swiggy & Zomato Reserved</div>
            <div className="text-2xl font-black text-orange-400">{totalAggregatorReserved} meals</div>
            <div className="text-[10px] text-orange-400 font-bold flex items-center gap-1 mt-1">
              <Layers className="w-3.5 h-3.5" />
              <span>18% Kitchen Production Buffer</span>
            </div>
          </div>

          <div className="bg-stone-950/80 p-4 rounded-2xl border border-stone-800">
            <div className="text-[11px] text-stone-400 font-medium">Live Aggregator Orders</div>
            <div className="text-2xl font-black text-cyan-400">{liveOrders.length} active</div>
            <div className="text-[10px] text-cyan-500 font-bold flex items-center gap-1 mt-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Avg Prep Time: 12 mins</span>
            </div>
          </div>

          <div className="bg-stone-950/80 p-4 rounded-2xl border border-stone-800">
            <div className="text-[11px] text-stone-400 font-medium">Net Channel Payout</div>
            <div className="text-2xl font-black text-amber-400">₹{totalNetPayout.toFixed(1)}</div>
            <div className="text-[10px] text-stone-400 font-bold flex items-center gap-1 mt-1">
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              <span>After 20% platform cut</span>
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex items-center gap-2 border-b border-stone-800 pb-3">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
            activeTab === 'inventory'
              ? 'bg-orange-500 text-stone-950 shadow-lg shadow-orange-500/20'
              : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Reserved Portion Buffer (Swiggy vs Mess)</span>
        </button>

        <button
          onClick={() => setActiveTab('live_orders')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 relative ${
            activeTab === 'live_orders'
              ? 'bg-orange-500 text-stone-950 shadow-lg shadow-orange-500/20'
              : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Live Swiggy & Zomato Orders</span>
          <span className="bg-stone-950 text-orange-400 text-[10px] font-black px-1.5 py-0.2 rounded-full">
            {liveOrders.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RESERVED PORTION INVENTORY & CHANNEL THROTTLING */}
      {/* ========================================================================= */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="bg-stone-900 p-5 rounded-2xl border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white">Live Food Portion Safeguard Matrix</h2>
              <p className="text-xs text-stone-400">
                Adjust allocated portion buffers between Registered Mess Subscribers and Public Aggregators. Real-time changes sync with Swiggy and Zomato menus.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3.5 py-2 rounded-xl border border-emerald-500/30">
              <ShieldCheck className="w-4 h-4" />
              <span>Mess Priority Protection Engine Active</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {inventory.map(item => {
              const messPercent = Math.round((item.reservedForMess / item.totalCookedPortions) * 100);
              const aggPercent = 100 - messPercent;

              return (
                <div 
                  key={item.id}
                  className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-5 shadow-xl hover:border-stone-700 transition-all"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          item.mealSlot === 'lunch' ? 'bg-amber-400 text-stone-950' : item.mealSlot === 'breakfast' ? 'bg-orange-400 text-stone-950' : 'bg-purple-400 text-stone-950'
                        }`}>
                          {item.mealSlot}
                        </span>
                        <span className="text-xs text-stone-400 font-bold">{item.malayalamName}</span>
                      </div>
                      <h3 className="text-lg font-bold text-white">{item.dishName}</h3>
                    </div>

                    {/* Price Comparison */}
                    <div className="flex items-center gap-4 bg-stone-950 p-3 rounded-2xl border border-stone-800 text-xs">
                      <div>
                        <div className="text-[10px] text-stone-500 font-semibold">Hostel Mess Rate</div>
                        <div className="text-sm font-black text-emerald-400">₹{item.messPrice}</div>
                      </div>
                      <div className="h-6 w-px bg-stone-800" />
                      <div>
                        <div className="text-[10px] text-stone-500 font-semibold">Swiggy Price</div>
                        <div className="text-sm font-black text-orange-400">₹{item.swiggyPrice}</div>
                      </div>
                      <div className="h-6 w-px bg-stone-800" />
                      <div>
                        <div className="text-[10px] text-stone-500 font-semibold">Zomato Price</div>
                        <div className="text-sm font-black text-rose-400">₹{item.zomatoPrice}</div>
                      </div>
                    </div>
                  </div>

                  {/* Allocation Visual Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Mess Reserved: {item.reservedForMess} portions ({messPercent}%)</span>
                      </span>
                      <span className="text-orange-400 font-bold flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        <span>Aggregator Buffer: {item.reservedForSwiggyZomato} portions ({aggPercent}%)</span>
                      </span>
                    </div>

                    <div className="w-full h-3 bg-stone-950 rounded-full overflow-hidden flex">
                      <div 
                        className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full transition-all duration-500" 
                        style={{ width: `${messPercent}%` }} 
                        title={`Protected Mess: ${item.reservedForMess}`}
                      />
                      <div 
                        className="bg-gradient-to-r from-orange-500 to-amber-400 h-full transition-all duration-500" 
                        style={{ width: `${aggPercent}%` }} 
                        title={`Swiggy/Zomato: ${item.reservedForSwiggyZomato}`}
                      />
                    </div>
                  </div>

                  {/* Control Buttons & Channel Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-stone-800 text-xs">
                    {/* Buffer Adjusters */}
                    <div className="flex items-center gap-2">
                      <span className="text-stone-400 font-semibold">Adjust Aggregator Buffer:</span>
                      <button
                        onClick={() => handleBufferChange(item.id, -10)}
                        className="bg-stone-800 hover:bg-stone-700 text-stone-200 px-2.5 py-1 rounded-lg font-bold"
                      >
                        -10 Meals
                      </button>
                      <button
                        onClick={() => handleBufferChange(item.id, +10)}
                        className="bg-stone-800 hover:bg-stone-700 text-stone-200 px-2.5 py-1 rounded-lg font-bold"
                      >
                        +10 Meals
                      </button>
                    </div>

                    {/* Platform Switches */}
                    <div className="flex items-center gap-3">
                      {/* Swiggy switch */}
                      <button
                        onClick={() => handleToggleChannel(item.id, 'swiggy')}
                        className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 ${
                          item.swiggyActive
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                            : 'bg-stone-800 text-stone-500 border border-stone-700'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>Swiggy: {item.swiggyActive ? `Active (${item.swiggyLiveStock})` : 'Paused'}</span>
                      </button>

                      {/* Zomato switch */}
                      <button
                        onClick={() => handleToggleChannel(item.id, 'zomato')}
                        className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 ${
                          item.zomatoActive
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            : 'bg-stone-800 text-stone-500 border border-stone-700'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>Zomato: {item.zomatoActive ? `Active (${item.zomatoLiveStock})` : 'Paused'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LIVE SWIGGY & ZOMATO ORDERS FEED */}
      {/* ========================================================================= */}
      {activeTab === 'live_orders' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-stone-900 p-4 rounded-2xl border border-stone-800">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search order ref, customer, or dish..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-stone-500 outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400 font-semibold">Filter:</span>
              <button
                onClick={() => setSelectedPlatformFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedPlatformFilter === 'all' ? 'bg-stone-700 text-white' : 'text-stone-400'}`}
              >
                All Platforms
              </button>
              <button
                onClick={() => setSelectedPlatformFilter('swiggy')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedPlatformFilter === 'swiggy' ? 'bg-orange-500 text-stone-950 font-black' : 'text-orange-400'}`}
              >
                Swiggy
              </button>
              <button
                onClick={() => setSelectedPlatformFilter('zomato')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedPlatformFilter === 'zomato' ? 'bg-rose-500 text-white font-black' : 'text-rose-400'}`}
              >
                Zomato
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrders.map(order => (
              <div 
                key={order.id}
                className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-4 shadow-xl flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                      order.platform === 'swiggy' ? 'bg-orange-500 text-stone-950' : 'bg-rose-500 text-white'
                    }`}>
                      {order.platform}
                    </span>

                    <div className="bg-stone-950 px-2.5 py-1 rounded-lg border border-stone-800 font-mono text-xs text-amber-400 font-bold">
                      OTP: {order.pickupOtp}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-stone-400">{order.orderNumber}</div>
                    <div className="text-sm font-bold text-white">{order.customerName}</div>
                    <div className="text-[11px] text-stone-400">{order.customerArea}</div>
                  </div>

                  {/* Items */}
                  <div className="bg-stone-950/80 p-3 rounded-2xl border border-stone-800 space-y-1.5 text-xs">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-stone-300">
                        <span>{it.quantity}x {it.name}</span>
                        <span className="font-bold text-white">₹{it.price * it.quantity}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-stone-800 flex justify-between font-bold text-white">
                      <span>Subtotal:</span>
                      <span className="text-amber-400">₹{order.subtotal}</span>
                    </div>
                  </div>

                  {/* Rider Info */}
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/80 text-[11px] space-y-1">
                    <div className="text-stone-400">Assigned Delivery Executive:</div>
                    <div className="font-bold text-white flex items-center justify-between">
                      <span>{order.riderName}</span>
                      <span className="text-emerald-400">{order.estimatedPickupTime}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-stone-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">Status:</span>
                    <span className="text-orange-400 font-bold uppercase">{order.status.replace(/_/g, ' ')}</span>
                  </div>

                  <button
                    onClick={() => handleAdvanceOrderStatus(order.id)}
                    className="w-full bg-orange-500 hover:bg-orange-400 text-stone-950 font-black py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    <span>Advance Status</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
