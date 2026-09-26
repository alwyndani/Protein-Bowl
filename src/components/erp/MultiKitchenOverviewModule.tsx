import React, { useState } from 'react';
import { 
  CloudKitchenBranch, 
  StaffUserAccount, 
  InterKitchenTransfer, 
  KitchenBranchId,
  Order,
  OmnichannelOrder
} from '../../types';
import { 
  CLOUD_KITCHEN_BRANCHES, 
  STAFF_USER_ACCOUNTS, 
  INITIAL_INTER_KITCHEN_TRANSFERS 
} from '../../data/cloudKitchensData';
import { 
  Building2, 
  MapPin, 
  ChefHat, 
  Truck, 
  Package, 
  TrendingUp, 
  Activity, 
  Users, 
  Clock, 
  ShieldCheck, 
  Thermometer, 
  ArrowRightLeft, 
  Plus, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Flame, 
  Phone, 
  Mail, 
  FileText, 
  Check, 
  Eye, 
  RotateCcw,
  Sparkles,
  Sliders,
  DollarSign
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface MultiKitchenOverviewModuleProps {
  selectedBranchId: KitchenBranchId;
  onSelectBranch: (branchId: KitchenBranchId) => void;
  onSwitchStaffAccount?: (staff: StaffUserAccount) => void;
  orders?: Order[];
  omnichannelOrders?: OmnichannelOrder[];
  branches?: CloudKitchenBranch[];
  onAddBranch?: (branch: CloudKitchenBranch) => void;
}

export const MultiKitchenOverviewModule: React.FC<MultiKitchenOverviewModuleProps> = ({
  selectedBranchId,
  onSelectBranch,
  onSwitchStaffAccount,
  orders = [],
  omnichannelOrders = [],
  branches: initialBranches,
  onAddBranch
}) => {
  const [internalBranches, setInternalBranches] = useState<CloudKitchenBranch[]>(initialBranches || CLOUD_KITCHEN_BRANCHES);
  
  // Use passed branches if provided, otherwise internal
  const branches = initialBranches || internalBranches;
  const setBranches = setInternalBranches;

  const [transfers, setTransfers] = useState<InterKitchenTransfer[]>(INITIAL_INTER_KITCHEN_TRANSFERS);
  const [staffAccounts, setStaffAccounts] = useState<StaffUserAccount[]>(STAFF_USER_ACCOUNTS);
  
  // Tab within multi-kitchen module
  const [subTab, setSubTab] = useState<'network' | 'stations' | 'transfers' | 'staff-roster' | 'coverage'>('network');
  
  // Inter-kitchen transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    sourceBranchId: 'kochi',
    destinationBranchId: 'trivandrum',
    itemName: 'Organic Royal White Quinoa',
    category: 'Grains & Superfoods',
    quantity: '25',
    unit: 'kg',
    estimatedValue: '8500',
    requestedBy: 'Trivandrum Kitchen Ops',
    dispatchVehicleNo: 'KL-07-CD-8812',
    notes: 'Urgent weekend replenish'
  });

  // Outlet Enrollment State (MD Feature)
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollForm, setEnrollForm] = useState({
    name: 'NutriFit Cloud Kitchen – Thrissur Cultural Hub',
    city: 'Thrissur',
    hubName: 'Thrissur Express Hub',
    tagline: 'Serving Swaraj Round, East Fort, Medical College & IT Enclaves',
    address: 'Building 4B, Round South, Kuruppam Road, Thrissur, Kerala - 680001',
    pincode: '680001',
    phone: '+91 487 242 8890',
    email: 'thrissur.kitchen@nutrifitkitchen.in',
    fssaiNumber: 'FSSAI-TCR-11322004000992',
    dailyMealCapacity: '350',
    deliveryRadiusKm: '14',
    pincodes: '680001, 680002, 680003, 680004, 680005, 680581',
    shiftTiming: '06:00 AM - 11:00 PM (Daily)',
    leadChef: 'Chef Arun Narayanan (Ex-Hyatt)',
    leadManager: 'Sanjay V. (Ops General Manager)',
    leadProcurement: 'Divya Nair',
    leadLogistics: 'Vipin Das',
    leadPOS: 'Rohit K. Menon',
    leadNutritionist: 'Dr. Meera Krishnan'
  });

  // Handle Outlet Enrollment Submit
  const handleEnrollOutlet = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = enrollForm.city.toLowerCase().replace(/[^a-z0-9]/g, '') || `kitchen-${Date.now()}`;
    
    const newBranch: CloudKitchenBranch = {
      id: cleanId,
      name: enrollForm.name,
      city: enrollForm.city,
      state: 'Kerala',
      hubName: enrollForm.hubName,
      tagline: enrollForm.tagline,
      address: enrollForm.address,
      pincode: enrollForm.pincode,
      phone: enrollForm.phone,
      email: enrollForm.email,
      fssaiNumber: enrollForm.fssaiNumber,
      operatingHours: enrollForm.shiftTiming,
      status: 'active',
      
      generalManager: enrollForm.leadManager,
      headChef: enrollForm.leadChef,
      procurementLead: enrollForm.leadProcurement,
      logisticsFleetLead: enrollForm.leadLogistics,
      leadDietician: enrollForm.leadNutritionist,

      dailyMealCapacity: Number(enrollForm.dailyMealCapacity) || 300,
      activeMealsToday: 0,
      capacityUtilizationPct: 0,
      activeStaffCount: 8,
      activeChefsCount: 3,
      activeRidersCount: 4,

      hygieneAuditScorePct: 98.5,
      avgPrepTimeMins: 14,
      deliveryOnTimeRatePct: 99.1,
      coldChainTempCelsius: 3.6,

      monthlyRevenue: 0,
      todayRevenue: 0,
      avgOrderValue: 450,
      todayOrdersCount: 0,

      deliveryRadiusKm: Number(enrollForm.deliveryRadiusKm) || 12,
      servicePincodes: enrollForm.pincodes.split(',').map(s => s.trim()),
      zonesCovered: [enrollForm.city, 'Central Enclave', 'Express Sector'],
      stations: [
        {
          id: `${cleanId}-st1`,
          name: 'Combi-Oven & High Protein Grill Station',
          stationType: 'hot_line',
          leadChef: enrollForm.leadChef,
          status: 'operational',
          activeItemsCount: 6
        },
        {
          id: `${cleanId}-st2`,
          name: 'Hydroponic Salad & Cold Press Macro Bar',
          stationType: 'salad_cold_prep',
          leadChef: 'Chef Assistant',
          status: 'operational',
          activeItemsCount: 4
        },
        {
          id: `${cleanId}-st3`,
          name: 'Macro Bakery & High-Protein Snack Deck',
          stationType: 'baking_dessert',
          leadChef: 'Pastry Lead',
          status: 'operational',
          activeItemsCount: 3
        },
        {
          id: `${cleanId}-st4`,
          name: 'Weighing QA, Seal & POS Dispatch Station',
          stationType: 'packing_dispatch',
          leadChef: enrollForm.leadLogistics,
          status: 'operational',
          activeItemsCount: 8
        }
      ]
    };

    if (onAddBranch) {
      onAddBranch(newBranch);
    } else {
      setInternalBranches(prev => [...prev, newBranch]);
    }

    // Add initial staff account for new POS & Chef
    const newPosStaff: StaffUserAccount = {
      id: `staff-${cleanId}-pos`,
      name: enrollForm.leadPOS,
      email: `pos.${cleanId}@nutrifitkitchen.in`,
      phone: enrollForm.phone,
      role: 'pos',
      designation: `Lead POS Cashier & Billing (${enrollForm.city} Kitchen)`,
      assignedBranchId: cleanId,
      branchName: enrollForm.name,
      avatarBg: 'bg-indigo-600',
      shiftTiming: 'Counter & Takeaway Billing (08:00 - 20:00)',
      isOnline: true
    };

    const newChefStaff: StaffUserAccount = {
      id: `staff-${cleanId}-chef`,
      name: enrollForm.leadChef,
      email: `chef.${cleanId}@nutrifitkitchen.in`,
      phone: enrollForm.phone,
      role: 'chef',
      designation: `Head Chef Lead (${enrollForm.city} Kitchen)`,
      assignedBranchId: cleanId,
      branchName: enrollForm.name,
      avatarBg: 'bg-amber-600',
      shiftTiming: 'Full Day Shifts (06:00 - 20:00)',
      isOnline: true
    };

    setStaffAccounts(prev => [...prev, newPosStaff, newChefStaff]);

    setShowEnrollModal(false);
    confetti({ particleCount: 75, spread: 70 });
    onSelectBranch(cleanId as any);
  };

  // Current active single branch (if not 'all')
  const currentBranch = branches.find(b => b.id === selectedBranchId) || branches[0];
  const isConsolidatedAll = selectedBranchId === 'all';

  // Aggregated Statewide Totals
  const totalCapacity = branches.reduce((sum, b) => sum + b.dailyMealCapacity, 0);
  const totalActiveMeals = branches.reduce((sum, b) => sum + b.activeMealsToday, 0);
  const totalStatewideRevenue = branches.reduce((sum, b) => sum + b.monthlyRevenue, 0);
  const totalStaffCount = branches.reduce((sum, b) => sum + b.activeStaffCount, 0);
  const avgHygieneScore = (branches.reduce((sum, b) => sum + b.hygieneAuditScorePct, 0) / branches.length).toFixed(1);

  // Handle Station Status Toggle
  const handleToggleStationStatus = (branchId: string, stationId: string) => {
    setBranches(prev => prev.map(b => {
      if (b.id !== branchId) return b;
      return {
        ...b,
        stations: b.stations.map(st => {
          if (st.id !== stationId) return st;
          const nextStatus = st.status === 'operational' ? 'busy' : st.status === 'busy' ? 'sanitizing' : 'operational';
          return { ...st, status: nextStatus };
        })
      };
    }));
  };

  // Handle Kitchen Status Switch
  const handleToggleKitchenStatus = (branchId: string) => {
    setBranches(prev => prev.map(b => {
      if (b.id !== branchId) return b;
      const nextStatus = b.status === 'active' ? 'rush' : b.status === 'rush' ? 'maintenance' : 'active';
      return { ...b, status: nextStatus };
    }));
  };

  // Handle Submitting Inter-Kitchen Transfer
  const handleCreateTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.itemName || !transferForm.quantity) return;

    const source = branches.find(b => b.id === transferForm.sourceBranchId);
    const dest = branches.find(b => b.id === transferForm.destinationBranchId);

    const newTransfer: InterKitchenTransfer = {
      id: `TRF-2026-${Math.floor(100 + Math.random() * 900)}`,
      transferDate: new Date().toISOString().split('T')[0],
      sourceBranchId: transferForm.sourceBranchId,
      sourceBranchName: source ? source.name : transferForm.sourceBranchId,
      destinationBranchId: transferForm.destinationBranchId,
      destinationBranchName: dest ? dest.name : transferForm.destinationBranchId,
      itemName: transferForm.itemName,
      category: transferForm.category,
      quantity: Number(transferForm.quantity),
      unit: transferForm.unit,
      estimatedValue: Number(transferForm.estimatedValue) || 5000,
      status: 'in_transit',
      requestedBy: transferForm.requestedBy,
      approvedBy: 'Central Procurement (Rajesh V.)',
      dispatchVehicleNo: transferForm.dispatchVehicleNo,
      notes: transferForm.notes
    };

    setTransfers([newTransfer, ...transfers]);
    setShowTransferModal(false);
    confetti({ particleCount: 50, spread: 60 });
  };

  // Handle Transfer Status Update
  const handleUpdateTransferStatus = (transferId: string, nextStatus: InterKitchenTransfer['status']) => {
    setTransfers(prev => prev.map(t => t.id === transferId ? { ...t, status: nextStatus } : t));
    if (nextStatus === 'received') {
      confetti({ particleCount: 35, spread: 50 });
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner with Statewide / Branch Controls */}
      <div className="bg-gradient-to-r from-stone-900 via-emerald-950 to-stone-900 text-white rounded-3xl p-6 sm:p-8 border border-emerald-800/40 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold uppercase tracking-wider">
              <Building2 className="w-3.5 h-3.5" />
              Statewide Multi-Cloud Kitchen Operations & Control Center
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white flex items-center gap-3">
              Multi-Kitchen Operating Engine
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 max-w-2xl">
              Centralized MD control across <span className="text-emerald-400 font-bold">Trivandrum</span>, <span className="text-emerald-400 font-bold">Kochi</span>, and <span className="text-emerald-400 font-bold">Kozhikode</span> cloud kitchens with independent chef logins, procurement lines, logistics fleets, and inter-kitchen stock balancing.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex flex-wrap items-center gap-3 bg-stone-950/80 p-4 rounded-2xl border border-stone-800 backdrop-blur-md">
            <div className="text-center px-3 border-r border-stone-800">
              <span className="text-[10px] text-stone-400 font-bold uppercase block">Active Kitchens</span>
              <span className="text-2xl font-black text-emerald-400">{branches.length}</span>
              <span className="text-[10px] text-stone-400 block">South / Central / North</span>
            </div>
            <div className="text-center px-3 border-r border-stone-800">
              <span className="text-[10px] text-stone-400 font-bold uppercase block">Daily Meal Capacity</span>
              <span className="text-2xl font-black text-white">{totalCapacity.toLocaleString()}</span>
              <span className="text-[10px] text-emerald-300 block">{totalActiveMeals} active today</span>
            </div>
            <div className="text-center px-3">
              <span className="text-[10px] text-stone-400 font-bold uppercase block">Statewide Staff</span>
              <span className="text-2xl font-black text-amber-400">{totalStaffCount}</span>
              <span className="text-[10px] text-stone-400 block">On Shift Today</span>
            </div>
          </div>
        </div>

        {/* Cloud Kitchen Location Selector Bar */}
        <div className="mt-8 pt-6 border-t border-stone-800/80">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              Select Cloud Kitchen Branch to Review or Switch Context:
            </span>
            <span className="text-[11px] text-emerald-400 font-bold hidden sm:inline">
              Currently reviewing: {isConsolidatedAll ? 'All 3 Cloud Kitchens (Statewide Consolidated)' : currentBranch.name}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* ALL KITCHENS CONSOLIDATED TAB */}
            <button
              onClick={() => onSelectBranch('all')}
              className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                isConsolidatedAll
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg ring-2 ring-emerald-400'
                  : 'bg-stone-900/90 text-stone-300 border-stone-800 hover:border-stone-700 hover:bg-stone-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  Statewide Network
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isConsolidatedAll ? 'bg-emerald-950 text-emerald-200' : 'bg-stone-800 text-emerald-400'
                }`}>
                  Master View
                </span>
              </div>
              <div>
                <div className="text-sm font-black">All Kitchens Consolidated</div>
                <div className={`text-[11px] mt-0.5 ${isConsolidatedAll ? 'text-emerald-100' : 'text-stone-400'}`}>
                  Statewide Rollup • ₹{(totalStatewideRevenue / 100000).toFixed(2)}L MRR
                </div>
              </div>
            </button>

            {/* TRIVANDRUM, KOCHI, KOZHIKODE BRANCH CARDS */}
            {branches.map(branch => {
              const active = selectedBranchId === branch.id;
              return (
                <button
                  key={branch.id}
                  onClick={() => onSelectBranch(branch.id)}
                  className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                    active
                      ? 'bg-amber-600 text-white border-amber-400 shadow-lg ring-2 ring-amber-400'
                      : 'bg-stone-900/90 text-stone-300 border-stone-800 hover:border-stone-700 hover:bg-stone-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-300" />
                      {branch.city}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                      branch.status === 'rush' 
                        ? 'bg-red-500/20 text-red-300 border border-red-500/40' 
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      {branch.status === 'rush' ? '⚡ Rush Load' : '● Active'}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-black line-clamp-1">{branch.hubName}</div>
                    <div className={`text-[11px] mt-0.5 flex items-center justify-between ${active ? 'text-amber-100' : 'text-stone-400'}`}>
                      <span>{branch.activeMealsToday} / {branch.dailyMealCapacity} meals</span>
                      <span className="font-bold">{branch.capacityUtilizationPct}% Cap</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* ENROLL NEW OUTLET BUTTON (MD PRIVILEGE) */}
            <button
              onClick={() => setShowEnrollModal(true)}
              className="p-4 rounded-2xl border-2 border-dashed border-emerald-500/50 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-300 hover:text-white transition-all flex flex-col items-center justify-center text-center gap-2 group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-stone-950 transition-all">
                <Plus className="w-5 h-5 font-black" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider">Enroll New Kitchen Outlet</div>
                <div className="text-[10px] text-emerald-400/80">Register Branch, FSSAI & POS</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-1">
        {[
          { id: 'network', label: '📊 Multi-Kitchen Scorecard & Comparison', icon: <TrendingUp className="w-4 h-4" /> },
          { id: 'stations', label: '🍳 Live Kitchen Stations & Preps', icon: <ChefHat className="w-4 h-4" /> },
          { id: 'transfers', label: '🚚 Inter-Kitchen Stock Transfers', icon: <ArrowRightLeft className="w-4 h-4" /> },
          { id: 'staff-roster', label: '👥 Branch Staff Logins & Key Leads', icon: <Users className="w-4 h-4" /> },
          { id: 'coverage', label: '📍 Delivery Coverage & FSSAI Details', icon: <MapPin className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
              subTab === tab.id
                ? 'bg-stone-900 text-white shadow-md'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* SUBTAB 1: MULTI-KITCHEN SCORECARD & COMPARISON */}
      {subTab === 'network' && (
        <div className="space-y-6">
          {/* Side-by-side branch comparison grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {branches.map((branch) => {
              const isSelected = selectedBranchId === branch.id;
              return (
                <div 
                  key={branch.id} 
                  className={`bg-white rounded-3xl border transition-all p-6 space-y-5 shadow-xs flex flex-col justify-between ${
                    isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md' : 'border-stone-200'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                          {branch.city} Cloud Kitchen
                        </span>
                        <h3 className="text-lg font-black text-stone-900 mt-1">{branch.name}</h3>
                        <p className="text-xs text-stone-500">{branch.hubName}</p>
                      </div>
                      <button
                        onClick={() => handleToggleKitchenStatus(branch.id)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors capitalize ${
                          branch.status === 'rush' 
                            ? 'bg-red-100 text-red-800 hover:bg-red-200' 
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                        title="Click to toggle status"
                      >
                        {branch.status === 'rush' ? '⚡ High Rush' : '● Operational'}
                      </button>
                    </div>

                    {/* Progress bar for capacity */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs font-bold text-stone-700">
                        <span>Daily Capacity Utilization</span>
                        <span className="text-emerald-700">{branch.capacityUtilizationPct}%</span>
                      </div>
                      <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            branch.capacityUtilizationPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${branch.capacityUtilizationPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-stone-400">
                        <span>{branch.activeMealsToday} meals cooked today</span>
                        <span>Max {branch.dailyMealCapacity} meals/day</span>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                      <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                        <span className="text-[10px] text-stone-400 font-bold block uppercase">Today Revenue</span>
                        <span className="text-sm font-black text-stone-900">₹{branch.todayRevenue.toLocaleString()}</span>
                        <span className="text-[10px] text-emerald-600 block">{branch.todayOrdersCount} orders</span>
                      </div>
                      <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                        <span className="text-[10px] text-stone-400 font-bold block uppercase">Monthly MRR</span>
                        <span className="text-sm font-black text-emerald-700">₹{(branch.monthlyRevenue / 100000).toFixed(2)}L</span>
                        <span className="text-[10px] text-stone-500 block">Avg ₹{branch.avgOrderValue} AOV</span>
                      </div>
                      <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                        <span className="text-[10px] text-stone-400 font-bold block uppercase">Hygiene & QA</span>
                        <span className="text-sm font-black text-emerald-600 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {branch.hygieneAuditScorePct}%
                        </span>
                        <span className="text-[10px] text-stone-500 block">Temp: {branch.coldChainTempCelsius}°C</span>
                      </div>
                      <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                        <span className="text-[10px] text-stone-400 font-bold block uppercase">Logistics SLA</span>
                        <span className="text-sm font-black text-purple-700 flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5" />
                          {branch.deliveryOnTimeRatePct}%
                        </span>
                        <span className="text-[10px] text-stone-500 block">Avg prep: {branch.avgPrepTimeMins}m</span>
                      </div>
                    </div>

                    {/* Key Leads */}
                    <div className="bg-stone-50/80 p-3 rounded-xl border border-stone-100 space-y-1 text-xs text-stone-600">
                      <div className="flex justify-between">
                        <span className="text-stone-400 text-[11px]">Head Chef:</span>
                        <span className="font-bold text-stone-800">{branch.headChef}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400 text-[11px]">Procurement:</span>
                        <span className="font-bold text-stone-800">{branch.procurementLead}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-400 text-[11px]">Logistics Fleet:</span>
                        <span className="font-bold text-stone-800">{branch.logisticsFleetLead}</span>
                      </div>
                    </div>
                  </div>

                  {/* Drilldown button */}
                  <button
                    onClick={() => onSelectBranch(branch.id)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      isSelected 
                        ? 'bg-emerald-800 text-white shadow-sm'
                        : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                    }`}
                  >
                    <span>{isSelected ? '✓ Currently Focused' : `Focus on ${branch.city} Details`}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Statewide Macro Revenue Comparison Table */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-stone-900">Statewide Performance Matrix (Trivandrum vs Kochi vs Kozhikode)</h3>
                <p className="text-xs text-stone-500">Comparative economics, active subscribers, and delivery metrics across all Kerala cloud kitchens</p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Live Data Synchronized
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 text-stone-600 font-bold border-b border-stone-200">
                    <th className="py-3 px-4">Cloud Kitchen Hub</th>
                    <th className="py-3 px-4">Status & Hours</th>
                    <th className="py-3 px-4">Daily Meals Load</th>
                    <th className="py-3 px-4">Active Staff (Chefs/Riders)</th>
                    <th className="py-3 px-4">Monthly Revenue</th>
                    <th className="py-3 px-4">Hygiene & Temp</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {branches.map(branch => (
                    <tr key={branch.id} className="hover:bg-stone-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-black text-stone-900">{branch.name}</div>
                        <div className="text-[11px] text-stone-500">{branch.address}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          branch.status === 'rush' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {branch.status.toUpperCase()}
                        </span>
                        <div className="text-[10px] text-stone-400 mt-0.5">{branch.operatingHours}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-800">{branch.activeMealsToday} / {branch.dailyMealCapacity} meals</div>
                        <div className="text-[10px] text-emerald-600 font-bold">{branch.capacityUtilizationPct}% Capacity</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-800">{branch.activeStaffCount} staff members</div>
                        <div className="text-[10px] text-stone-500">{branch.activeChefsCount} Chefs • {branch.activeRidersCount} Delivery Vans/Riders</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-black text-emerald-800">₹{branch.monthlyRevenue.toLocaleString()}</div>
                        <div className="text-[10px] text-stone-500">Today: ₹{branch.todayRevenue.toLocaleString()}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-800">{branch.hygieneAuditScorePct}% Pass</div>
                        <div className="text-[10px] text-stone-500">Cold Vault: {branch.coldChainTempCelsius}°C</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onSelectBranch(branch.id)}
                          className="px-3 py-1.5 rounded-xl bg-stone-900 text-white font-bold text-[11px] hover:bg-stone-800 transition-colors"
                        >
                          Select Branch
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: LIVE KITCHEN STATIONS & PREP */}
      {subTab === 'stations' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-stone-200 shadow-xs">
            <div>
              <h3 className="text-base font-black text-stone-900">
                {isConsolidatedAll ? 'Statewide Kitchen Production Stations' : `${currentBranch.name} – Prep Stations`}
              </h3>
              <p className="text-xs text-stone-500">
                Real-time monitor of Hot lines, Air-Fry decks, Salad cold-prep lines, and packing stations.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500">Filter View:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => onSelectBranch(e.target.value)}
                className="bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 text-xs font-bold text-stone-800"
              >
                <option value="all">All Kitchens</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.city} Kitchen</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(isConsolidatedAll 
              ? branches.flatMap(b => b.stations.map(st => ({ ...st, branchName: b.name, branchCity: b.city, branchId: b.id })))
              : currentBranch.stations.map(st => ({ ...st, branchName: currentBranch.name, branchCity: currentBranch.city, branchId: currentBranch.id }))
            ).map((station) => (
              <div 
                key={station.id}
                className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {station.branchCity}
                    </span>
                    <button
                      onClick={() => handleToggleStationStatus(station.branchId, station.id)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize transition-colors ${
                        station.status === 'operational' ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' :
                        station.status === 'busy' ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' :
                        'bg-blue-100 text-blue-800 hover:bg-blue-200'
                      }`}
                    >
                      ● {station.status}
                    </button>
                  </div>

                  <h4 className="font-black text-stone-900 text-sm">{station.name}</h4>
                  <div className="text-xs text-stone-500 flex items-center gap-1.5">
                    <ChefHat className="w-3.5 h-3.5 text-stone-400" />
                    <span>Station Lead: <strong>{station.leadChef}</strong></span>
                  </div>
                </div>

                <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="text-stone-400">Current Queue:</span>
                  <span className="font-black text-emerald-700 bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200">
                    {station.activeItemsCount} Portions Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB 3: INTER-KITCHEN STOCK TRANSFERS */}
      {subTab === 'transfers' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-stone-200 shadow-xs">
            <div>
              <h3 className="text-base font-black text-stone-900">Inter-Kitchen Stock Transfers & Material Balancing</h3>
              <p className="text-xs text-stone-500">
                Logistics pipeline to transfer raw materials (Quinoa, Protein Powders, Eco-packaging) between Trivandrum, Kochi, and Kozhikode hubs.
              </p>
            </div>
            <button
              onClick={() => setShowTransferModal(true)}
              className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Initiate Stock Transfer</span>
            </button>
          </div>

          {/* Transfers Table */}
          <div className="bg-white rounded-3xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 text-stone-600 font-bold border-b border-stone-200">
                    <th className="py-3 px-4">Transfer ID</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">From (Source)</th>
                    <th className="py-3 px-4">To (Destination)</th>
                    <th className="py-3 px-4">Material / Item</th>
                    <th className="py-3 px-4">Quantity</th>
                    <th className="py-3 px-4">Logistics Van & Temp</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {transfers.map(trf => (
                    <tr key={trf.id} className="hover:bg-stone-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-stone-800">{trf.id}</td>
                      <td className="py-3 px-4 text-stone-500">{trf.transferDate}</td>
                      <td className="py-3 px-4 font-bold text-stone-900">{trf.sourceBranchName.split('–')[1] || trf.sourceBranchName}</td>
                      <td className="py-3 px-4 font-bold text-emerald-800">{trf.destinationBranchName.split('–')[1] || trf.destinationBranchName}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-stone-900">{trf.itemName}</div>
                        <div className="text-[10px] text-stone-400">{trf.category}</div>
                      </td>
                      <td className="py-3 px-4 font-bold text-stone-900">
                        {trf.quantity} {trf.unit}
                        <span className="text-[10px] text-stone-400 block">Est: ₹{trf.estimatedValue.toLocaleString()}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-stone-700 font-medium">{trf.dispatchVehicleNo || 'Fleet Dispatch'}</div>
                        <div className="text-[10px] text-stone-400">{trf.transitTemperature || 'Ambient'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                          trf.status === 'received' ? 'bg-emerald-100 text-emerald-800' :
                          trf.status === 'in_transit' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {trf.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {trf.status === 'in_transit' ? (
                          <button
                            onClick={() => handleUpdateTransferStatus(trf.id, 'received')}
                            className="px-2.5 py-1 bg-emerald-700 text-white rounded-lg font-bold text-[11px] hover:bg-emerald-800 transition-colors"
                          >
                            Confirm Receipt
                          </button>
                        ) : (
                          <span className="text-[11px] text-stone-400 font-medium">Completed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: BRANCH STAFF LOGINS & KEY LEADS */}
      {subTab === 'staff-roster' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-stone-200 shadow-xs">
            <div>
              <h3 className="text-base font-black text-stone-900">Separate Staff Credentials & Logins per Cloud Kitchen</h3>
              <p className="text-xs text-stone-500">
                Chefs, logistics riders, and procurement leads operate within their isolated branch workspace, while MD maintains statewide enterprise visibility.
              </p>
            </div>
            <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
              {staffAccounts.length} Registered Enterprise Users
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {staffAccounts.map((staff) => (
              <div 
                key={staff.id}
                className="bg-white p-5 rounded-3xl border border-stone-200 shadow-xs space-y-4 flex flex-col justify-between hover:border-emerald-300 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl ${staff.avatarBg} text-white flex items-center justify-center font-black text-xs`}>
                        {staff.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-black text-stone-900 text-sm">{staff.name}</h4>
                        <span className="text-[10px] text-stone-400 block">{staff.email}</span>
                      </div>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" title="Online" />
                  </div>

                  <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-[11px]">Role:</span>
                      <span className="font-bold text-stone-800 uppercase text-[10px] bg-stone-200 px-2 py-0.5 rounded">{staff.role}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-[11px]">Assigned Kitchen:</span>
                      <span className="font-bold text-emerald-800 text-[11px]">{staff.branchName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-[11px]">Designation:</span>
                      <span className="text-stone-700 text-[11px] font-medium">{staff.designation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-[11px]">Shift:</span>
                      <span className="text-stone-500 text-[10px]">{staff.shiftTiming}</span>
                    </div>
                  </div>
                </div>

                {onSwitchStaffAccount && (
                  <button
                    onClick={() => onSwitchStaffAccount(staff)}
                    className="w-full py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Log In as {staff.name.split(' ')[0]}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB 5: COVERAGE & FSSAI LICENSES */}
      {subTab === 'coverage' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {branches.map(branch => (
              <div key={branch.id} className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50 px-2.5 py-1 rounded-full">
                      {branch.city} Hub
                    </span>
                    <h4 className="font-black text-stone-900 text-base mt-1">{branch.name}</h4>
                  </div>
                  <MapPin className="w-5 h-5 text-emerald-600" />
                </div>

                <div className="space-y-2 text-xs text-stone-600">
                  <div>
                    <span className="text-stone-400 block text-[10px] font-bold uppercase">Operating Address:</span>
                    <p className="font-medium text-stone-800">{branch.address}, Pincode: {branch.pincode}</p>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] font-bold uppercase">FSSAI Central Kitchen License:</span>
                    <p className="font-mono font-bold text-emerald-800">{branch.fssaiNumber}</p>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] font-bold uppercase">Contact & Ops Desk:</span>
                    <p className="font-medium text-stone-800">{branch.phone} • {branch.email}</p>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] font-bold uppercase">Delivery Radius & Pincodes:</span>
                    <p className="font-bold text-purple-700">{branch.deliveryRadiusKm} km Radius • {branch.servicePincodes.length} PIN Codes</p>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] font-bold uppercase text-stone-400 block mb-1.5">Key Delivery Zones Covered:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {branch.zonesCovered.map((zone, idx) => (
                      <span key={idx} className="bg-stone-100 text-stone-700 px-2 py-1 rounded-lg text-[10px] font-medium">
                        {zone}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: INITIATE INTER-KITCHEN TRANSFER */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-stone-200 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-stone-900">Initiate Inter-Kitchen Transfer</h3>
                  <p className="text-xs text-stone-500">Dispatch ingredients or packaging between cloud kitchens</p>
                </div>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="p-2 text-stone-400 hover:text-stone-700 rounded-xl hover:bg-stone-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-500 font-bold mb-1">Source Kitchen (From)</label>
                  <select
                    value={transferForm.sourceBranchId}
                    onChange={(e) => setTransferForm({ ...transferForm, sourceBranchId: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold"
                  >
                    <option value="kochi">Kochi Central HQ</option>
                    <option value="trivandrum">Trivandrum Kitchen</option>
                    <option value="kozhikode">Kozhikode Hub</option>
                  </select>
                </div>
                <div>
                  <label className="block text-stone-500 font-bold mb-1">Destination (To)</label>
                  <select
                    value={transferForm.destinationBranchId}
                    onChange={(e) => setTransferForm({ ...transferForm, destinationBranchId: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold"
                  >
                    <option value="trivandrum">Trivandrum Kitchen</option>
                    <option value="kochi">Kochi Central HQ</option>
                    <option value="kozhikode">Kozhikode Hub</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-500 font-bold mb-1">Material / Ingredient Name</label>
                <input
                  type="text"
                  value={transferForm.itemName}
                  onChange={(e) => setTransferForm({ ...transferForm, itemName: e.target.value })}
                  placeholder="e.g. Organic Quinoa (Bulk 50kg Sack)"
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold text-stone-800"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-500 font-bold mb-1">Quantity</label>
                  <input
                    type="number"
                    value={transferForm.quantity}
                    onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold text-stone-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-stone-500 font-bold mb-1">Unit</label>
                  <select
                    value={transferForm.unit}
                    onChange={(e) => setTransferForm({ ...transferForm, unit: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold"
                  >
                    <option value="kg">kg</option>
                    <option value="units">units</option>
                    <option value="litres">litres</option>
                    <option value="packs">packs</option>
                  </select>
                </div>
                <div>
                  <label className="block text-stone-500 font-bold mb-1">Est. Value (₹)</label>
                  <input
                    type="number"
                    value={transferForm.estimatedValue}
                    onChange={(e) => setTransferForm({ ...transferForm, estimatedValue: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold text-stone-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-500 font-bold mb-1">Logistics Vehicle / Courier</label>
                <input
                  type="text"
                  value={transferForm.dispatchVehicleNo}
                  onChange={(e) => setTransferForm({ ...transferForm, dispatchVehicleNo: e.target.value })}
                  placeholder="e.g. KL-07-CD-8812 (Refrigerated Logistics Van)"
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-stone-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 font-bold hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Dispatch Material Transfer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ENROLL NEW CLOUD KITCHEN OUTLET (MD EXCLUSIVE PRIVILEGE)           */}
      {/* ========================================================================= */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 border border-stone-200 text-stone-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-stone-900">Enroll New Cloud Kitchen Outlet</h3>
                  <p className="text-xs text-stone-500">Register new enterprise branch with independent chef, POS cashier & logistics</p>
                </div>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnrollOutlet} className="space-y-4 text-xs">
              {/* Outlet Basics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Official Outlet Name</label>
                  <input
                    type="text"
                    value={enrollForm.name}
                    onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })}
                    required
                    placeholder="e.g. NutriFit Cloud Kitchen – Thrissur Cultural Hub"
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold text-stone-800 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">City / District</label>
                  <input
                    type="text"
                    value={enrollForm.city}
                    onChange={(e) => setEnrollForm({ ...enrollForm, city: e.target.value })}
                    required
                    placeholder="e.g. Thrissur / Palakkad / Kollam"
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold text-stone-800 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Hub Code Name</label>
                  <input
                    type="text"
                    value={enrollForm.hubName}
                    onChange={(e) => setEnrollForm({ ...enrollForm, hubName: e.target.value })}
                    required
                    placeholder="e.g. Thrissur Express Kitchen"
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold text-stone-800 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Marketing Tagline / Enclave Description</label>
                  <input
                    type="text"
                    value={enrollForm.tagline}
                    onChange={(e) => setEnrollForm({ ...enrollForm, tagline: e.target.value })}
                    placeholder="e.g. Serving Swaraj Round, East Fort, Medical College & IT Enclaves"
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-stone-800"
                  />
                </div>
              </div>

              {/* Physical Address & FSSAI Compliance */}
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Compliance & Address Details</div>
                
                <div>
                  <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Kitchen Physical Address</label>
                  <input
                    type="text"
                    value={enrollForm.address}
                    onChange={(e) => setEnrollForm({ ...enrollForm, address: e.target.value })}
                    required
                    placeholder="Building, Street, Landmark"
                    className="w-full bg-white border border-stone-300 rounded-xl p-2.5 text-stone-800"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Pincode</label>
                    <input
                      type="text"
                      value={enrollForm.pincode}
                      onChange={(e) => setEnrollForm({ ...enrollForm, pincode: e.target.value })}
                      required
                      placeholder="680001"
                      className="w-full bg-white border border-stone-300 rounded-xl p-2.5 text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Official FSSAI Lic No.</label>
                    <input
                      type="text"
                      value={enrollForm.fssaiNumber}
                      onChange={(e) => setEnrollForm({ ...enrollForm, fssaiNumber: e.target.value })}
                      required
                      placeholder="FSSAI-TCR-11322004000992"
                      className="w-full bg-white border border-stone-300 rounded-xl p-2.5 font-mono text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Direct Phone</label>
                    <input
                      type="text"
                      value={enrollForm.phone}
                      onChange={(e) => setEnrollForm({ ...enrollForm, phone: e.target.value })}
                      required
                      placeholder="+91 487 242 8890"
                      className="w-full bg-white border border-stone-300 rounded-xl p-2.5 text-stone-800"
                    />
                  </div>
                </div>
              </div>

              {/* Operations Capacity & Service Radius */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Daily Meal Capacity</label>
                  <input
                    type="number"
                    value={enrollForm.dailyMealCapacity}
                    onChange={(e) => setEnrollForm({ ...enrollForm, dailyMealCapacity: e.target.value })}
                    required
                    placeholder="350"
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Delivery Radius (km)</label>
                  <input
                    type="number"
                    value={enrollForm.deliveryRadiusKm}
                    onChange={(e) => setEnrollForm({ ...enrollForm, deliveryRadiusKm: e.target.value })}
                    placeholder="14"
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 font-bold text-stone-800"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Shift Timings</label>
                  <input
                    type="text"
                    value={enrollForm.shiftTiming}
                    onChange={(e) => setEnrollForm({ ...enrollForm, shiftTiming: e.target.value })}
                    placeholder="06:00 AM - 11:00 PM"
                    className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-stone-800"
                  />
                </div>
              </div>

              {/* Service Pincodes */}
              <div>
                <label className="block text-stone-600 font-bold uppercase tracking-wider text-[10px] mb-1">Service Coverage Pincodes (Comma separated)</label>
                <input
                  type="text"
                  value={enrollForm.pincodes}
                  onChange={(e) => setEnrollForm({ ...enrollForm, pincodes: e.target.value })}
                  placeholder="680001, 680002, 680003, 680004"
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl p-2.5 text-stone-800"
                />
              </div>

              {/* Key Leads & Role Designations */}
              <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-900">Assigned Branch Personnel & Role Logins</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-600 font-bold uppercase tracking-wider text-[9px] mb-0.5">Head Chef Lead</label>
                    <input
                      type="text"
                      value={enrollForm.leadChef}
                      onChange={(e) => setEnrollForm({ ...enrollForm, leadChef: e.target.value })}
                      placeholder="e.g. Chef Arun Narayanan"
                      className="w-full bg-white border border-stone-300 rounded-xl p-2 text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-600 font-bold uppercase tracking-wider text-[9px] mb-0.5">POS Cashier Lead (Counter & Walk-ins)</label>
                    <input
                      type="text"
                      value={enrollForm.leadPOS}
                      onChange={(e) => setEnrollForm({ ...enrollForm, leadPOS: e.target.value })}
                      placeholder="e.g. Rohit K. Menon"
                      className="w-full bg-white border border-stone-300 rounded-xl p-2 text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-600 font-bold uppercase tracking-wider text-[9px] mb-0.5">Logistics & Fleet Lead</label>
                    <input
                      type="text"
                      value={enrollForm.leadLogistics}
                      onChange={(e) => setEnrollForm({ ...enrollForm, leadLogistics: e.target.value })}
                      placeholder="e.g. Vipin Das"
                      className="w-full bg-white border border-stone-300 rounded-xl p-2 text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-600 font-bold uppercase tracking-wider text-[9px] mb-0.5">Procurement & Store Buyer</label>
                    <input
                      type="text"
                      value={enrollForm.leadProcurement}
                      onChange={(e) => setEnrollForm({ ...enrollForm, leadProcurement: e.target.value })}
                      placeholder="e.g. Divya Nair"
                      className="w-full bg-white border border-stone-300 rounded-xl p-2 text-stone-800"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2.5 rounded-xl text-stone-600 font-bold hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-lg shadow-emerald-600/30 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Enroll Outlet & Provision Logins</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
