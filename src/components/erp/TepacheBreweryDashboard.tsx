import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  FlaskConical, 
  Package, 
  Building2, 
  RotateCcw, 
  DollarSign, 
  ShoppingBag, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ThermometerSnowflake, 
  TrendingUp, 
  Truck, 
  FileText, 
  Download, 
  Phone, 
  MapPin, 
  Search, 
  Filter, 
  ChevronRight, 
  Printer,
  Droplets,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Award
} from 'lucide-react';
import { 
  TEPACHE_PRODUCTS, 
  INITIAL_TEPACHE_RAW_MATERIALS, 
  INITIAL_TEPACHE_BREW_BATCHES, 
  INITIAL_TEPACHE_B2B_ORDERS, 
  INITIAL_TEPACHE_REVERSE_LOGISTICS 
} from '../../data/mockTepacheData';
import { 
  TepacheBrewBatch, 
  TepacheRawMaterial, 
  TepacheB2BClientOrder, 
  TepacheReverseLogisticsRecord, 
  DirectGuestOrder,
  TepacheFlavorType
} from '../../types';

interface TepacheBreweryDashboardProps {
  onBackToHome?: () => void;
  guestOrders?: DirectGuestOrder[];
}

export const TepacheBreweryDashboard: React.FC<TepacheBreweryDashboardProps> = ({ 
  onBackToHome,
  guestOrders = []
}) => {
  const [activeTab, setActiveTab] = useState<'tanks' | 'sourcing' | 'b2b' | 'returns' | 'payments' | 'guest_orders'>('tanks');

  // State
  const [batches, setBatches] = useState<TepacheBrewBatch[]>(INITIAL_TEPACHE_BREW_BATCHES);
  const [rawMaterials, setRawMaterials] = useState<TepacheRawMaterial[]>(INITIAL_TEPACHE_RAW_MATERIALS);
  const [b2bOrders, setB2bOrders] = useState<TepacheB2BClientOrder[]>(INITIAL_TEPACHE_B2B_ORDERS);
  const [returns, setReturns] = useState<TepacheReverseLogisticsRecord[]>(INITIAL_TEPACHE_REVERSE_LOGISTICS);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showNewB2BModal, setShowNewB2BModal] = useState(false);
  const [showLogReturnModal, setShowLogReturnModal] = useState(false);
  const [showChallanModal, setShowChallanModal] = useState<TepacheB2BClientOrder | null>(null);

  // New Batch Form State
  const [newBatchFlavor, setNewBatchFlavor] = useState<TepacheFlavorType>('classic_pineapple_cinnamon');
  const [newBatchTank, setNewBatchTank] = useState('Fermenter Tank 05 (500L SS304)');
  const [newBatchLiters, setNewBatchLiters] = useState('400');
  const [newBatchWildSource, setNewBatchWildSource] = useState('Organic Queen Pineapple Rinds + Native Epiphytic LAB');

  // New B2B Order Form State
  const [b2bClientName, setB2bClientName] = useState('');
  const [b2bContactPerson, setB2bContactPerson] = useState('');
  const [b2bPhone, setB2bPhone] = useState('');
  const [b2bLocation, setB2bLocation] = useState('');
  const [b2bCrates, setB2bCrates] = useState('10');
  const [b2bPaymentTerms, setB2bPaymentTerms] = useState<'advance_paid' | 'net_15_days' | 'net_30_days' | 'cod'>('net_15_days');

  // New Return Log State
  const [returnPartyName, setReturnPartyName] = useState('');
  const [returnBottlesCount, setReturnBottlesCount] = useState('48');
  const [returnCratesCount, setReturnCratesCount] = useState('4');

  // Summary Metrics
  const totalFermentingLiters = batches.reduce((sum, b) => sum + b.totalLiters, 0);
  const totalB2bRevenue = b2bOrders.reduce((sum, b) => sum + b.netPayable, 0);
  const totalBottlesReturned = returns.reduce((sum, r) => sum + r.bottles330mlReturned, 0);
  const totalDepositsRefunded = returns.reduce((sum, r) => sum + r.totalRefundCredited, 0);

  // Handlers
  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const flavorObj = TEPACHE_PRODUCTS.find(p => p.flavor === newBatchFlavor) || TEPACHE_PRODUCTS[0];
    const liters = parseInt(newBatchLiters) || 400;

    const newBatch: TepacheBrewBatch = {
      id: `batch-tep-${Date.now()}`,
      batchCode: `TEP-BATCH-2026-F0${batches.length + 1}`,
      tankId: newBatchTank,
      flavor: newBatchFlavor,
      flavorTitle: flavorObj.name.split('Tepache')[0] || flavorObj.name,
      totalLiters: liters,
      startDate: new Date().toISOString().split('T')[0],
      targetHarvestDate: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0],
      currentPh: 3.85,
      targetPhMin: 3.40,
      targetPhMax: 3.65,
      currentBrix: 6.5,
      tempCelsius: 26.0,
      stage: 'primary_wild_ferment',
      liveCfuCount: '2.5 x 10^9 CFU/ml',
      wildCultureSource: newBatchWildSource,
      headBrewer: 'Master Fermentologist S. Nambiar',
      qcStatus: 'in_fermentation',
      expectedYield330ml: Math.floor(liters * 3),
      sensoryNotes: 'Batch initialized with fresh organic rinds and wild palm jaggery.'
    };

    setBatches([newBatch, ...batches]);
    setShowNewBatchModal(false);
  };

  const handleCreateB2BOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const crates = parseInt(b2bCrates) || 10;
    const totalBottles = crates * 12;
    const avgPrice = 100;
    const gross = totalBottles * avgPrice;
    const discount = 10;
    const net = gross * 0.9;
    const deposit = totalBottles * 10;

    const newOrder: TepacheB2BClientOrder = {
      id: `b2b-tep-${Date.now()}`,
      orderNumber: `B2B-TEP-2026-0${b2bOrders.length + 90}`,
      clientName: b2bClientName || 'Boutique Wellness Cafe',
      clientCategory: 'organic_cafe',
      contactPerson: b2bContactPerson || 'Manager',
      contactPhone: b2bPhone || '+91 98470 00000',
      outletLocation: b2bLocation || 'Kochi, Kerala',
      orderDate: new Date().toISOString().split('T')[0],
      deliveryDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      crates12Pack: crates,
      totalBottles,
      flavorsBreakdown: [
        { flavorName: 'Classic Pineapple & Ceylon Cinnamon', bottles: Math.floor(totalBottles / 2) },
        { flavorName: 'Zesty Ginger, Kaffir Lime & Lemongrass', bottles: Math.floor(totalBottles / 2) }
      ],
      grossAmount: gross,
      wholesaleDiscountPct: discount,
      netPayable: net,
      bottleDepositCollected: deposit,
      paymentTerms: b2bPaymentTerms,
      paymentStatus: b2bPaymentTerms === 'advance_paid' ? 'paid' : 'pending',
      fulfillmentStatus: 'cold_packed',
      dispatchChallan: `CHL-TEP-2026-0${Math.floor(400 + Math.random() * 100)}`
    };

    setB2bOrders([newOrder, ...b2bOrders]);
    setShowNewB2BModal(false);
  };

  const handleLogReturn = (e: React.FormEvent) => {
    e.preventDefault();
    const bottles = parseInt(returnBottlesCount) || 48;
    const crates = parseInt(returnCratesCount) || 4;
    const refund = bottles * 10;

    const newRecord: TepacheReverseLogisticsRecord = {
      id: `rev-tep-${Date.now()}`,
      logNumber: `REV-BOTTLE-2026-${returns.length + 105}`,
      partyName: returnPartyName || 'B2B Partner Cafe',
      partyType: 'b2b_cafe',
      date: new Date().toISOString().split('T')[0],
      bottles330mlReturned: bottles,
      bottles500mlReturned: 0,
      totalRefundCredited: refund,
      cratesReturned: crates,
      condition: 'sterilized_ready',
      inspectorStaff: 'Reverse Logistics QA S. Rajesh',
      status: 'credited'
    };

    setReturns([newRecord, ...returns]);
    setShowLogReturnModal(false);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-white font-sans pb-16">
      
      {/* Top Header */}
      <header className="border-b border-stone-800 bg-stone-900/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider mb-0.5">
                <Sparkles className="w-3 h-3" />
                Enterprise Probiotic Brewery ERP
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white">
                Wild Tepache Fermentation & Sourcing Hub
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onBackToHome && (
              <button
                onClick={onBackToHome}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold transition-all border border-stone-700 flex items-center gap-1.5"
              >
                <span>← Customer Landing</span>
              </button>
            )}
            <button
              onClick={() => setShowNewBatchModal(true)}
              className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-4 py-2.5 rounded-xl text-xs transition-all shadow-lg flex items-center gap-1.5 hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              <span>New Brew Batch</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        
        {/* KPI Banner Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-5 space-y-2">
            <div className="flex items-center justify-between text-stone-400">
              <span className="text-xs font-bold uppercase">Active Fermentation</span>
              <FlaskConical className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {totalFermentingLiters} <span className="text-sm font-bold text-stone-400">Liters</span>
            </div>
            <div className="text-[11px] text-emerald-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {batches.length} Brewery Tanks Live
            </div>
          </div>

          <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-5 space-y-2">
            <div className="flex items-center justify-between text-stone-400">
              <span className="text-xs font-bold uppercase">B2B Wholesale Revenue</span>
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              ₹{totalB2bRevenue.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-amber-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {b2bOrders.length} Gyms & Cafe Accounts
            </div>
          </div>

          <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-5 space-y-2">
            <div className="flex items-center justify-between text-stone-400">
              <span className="text-xs font-bold uppercase">Glass Bottles Returned</span>
              <RotateCcw className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {totalBottlesReturned} <span className="text-sm font-bold text-stone-400">Bottles</span>
            </div>
            <div className="text-[11px] text-teal-400 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              ₹{totalDepositsRefunded} Deposits Credited
            </div>
          </div>

          <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-5 space-y-2">
            <div className="flex items-center justify-between text-stone-400">
              <span className="text-xs font-bold uppercase">Direct Guest Online Orders</span>
              <ShoppingBag className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white">
              {guestOrders.length} <span className="text-sm font-bold text-stone-400">Orders</span>
            </div>
            <div className="text-[11px] text-purple-400 flex items-center gap-1">
              <Truck className="w-3 h-3" />
              Statewide Dispatch Hub Active
            </div>
          </div>

        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-stone-800 pb-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('tanks')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'tanks'
                ? 'bg-emerald-500 text-stone-950 shadow-lg font-black'
                : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            <span>Fermentation Tanks & Live Batches ({batches.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('sourcing')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'sourcing'
                ? 'bg-emerald-500 text-stone-950 shadow-lg font-black'
                : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Raw Sourcing & Botanical Stock ({rawMaterials.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('b2b')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'b2b'
                ? 'bg-emerald-500 text-stone-950 shadow-lg font-black'
                : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>B2B Wholesale & Gym Distribution ({b2bOrders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('returns')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'returns'
                ? 'bg-emerald-500 text-stone-950 shadow-lg font-black'
                : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Bottle Returns & Reverse Logistics ({returns.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'payments'
                ? 'bg-emerald-500 text-stone-950 shadow-lg font-black'
                : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>B2B Invoices & Payments Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab('guest_orders')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === 'guest_orders'
                ? 'bg-emerald-500 text-stone-950 shadow-lg font-black'
                : 'bg-stone-900 text-stone-300 hover:text-white border border-stone-800'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Direct Website Orders ({guestOrders.length})</span>
          </button>
        </div>

        {/* ==================================================== */}
        {/* TAB 1: LIVE FERMENTATION TANKS & BATCHES */}
        {/* ==================================================== */}
        {activeTab === 'tanks' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white">Active SS304 Fermentation Tanks</h3>
                <p className="text-xs text-stone-400">Live pH telemetry, Brix attenuation curves, temperature and probiotic CFU counts</p>
              </div>

              <button
                onClick={() => setShowNewBatchModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-black transition-all flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Initialize Fermenter Tank</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className="bg-stone-900/90 border border-stone-800 rounded-3xl p-6 space-y-4 shadow-xl relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-emerald-400">{batch.batchCode}</span>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-stone-800 text-stone-300 border border-stone-700">
                          {batch.tankId}
                        </span>
                      </div>
                      <h4 className="text-base font-black text-white mt-1">{batch.flavorTitle}</h4>
                    </div>

                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                      batch.stage === 'bottling_packaging' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                      batch.stage === 'cold_crash_4c' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' :
                      'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}>
                      {batch.stage.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Fermentation Live Dials */}
                  <div className="grid grid-cols-4 gap-2 bg-stone-950 rounded-2xl p-3 border border-stone-800/80 text-center">
                    <div>
                      <div className="text-[10px] text-stone-500 uppercase font-bold">Acidity pH</div>
                      <div className="text-sm font-black text-amber-400 mt-0.5">{batch.currentPh}</div>
                      <div className="text-[9px] text-stone-500">Tgt {batch.targetPhMin}-{batch.targetPhMax}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-stone-500 uppercase font-bold">Sugar Brix</div>
                      <div className="text-sm font-black text-teal-400 mt-0.5">{batch.currentBrix}° Bx</div>
                      <div className="text-[9px] text-stone-500">LAB Attenuating</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-stone-500 uppercase font-bold">Tank Temp</div>
                      <div className="text-sm font-black text-cyan-400 mt-0.5">{batch.tempCelsius}°C</div>
                      <div className="text-[9px] text-stone-500">Controlled</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-stone-500 uppercase font-bold">Volume Yield</div>
                      <div className="text-sm font-black text-emerald-400 mt-0.5">{batch.totalLiters}L</div>
                      <div className="text-[9px] text-stone-500">~{batch.expectedYield330ml} Btls</div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-stone-300">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-stone-400">Wild Culture Origin:</span>
                      <span className="font-bold text-stone-200">{batch.wildCultureSource}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-stone-400">Probiotic CFU Lab Test:</span>
                      <span className="font-bold text-emerald-400">{batch.liveCfuCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-stone-400">Head Brewer:</span>
                      <span className="text-stone-300">{batch.headBrewer}</span>
                    </div>
                    <div className="text-[11px] text-stone-400 italic pt-1 border-t border-stone-800">
                      "{batch.sensoryNotes}"
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: RAW SOURCING & BOTANICAL INVENTORY */}
        {/* ==================================================== */}
        {activeTab === 'sourcing' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white">Botanical & Packaging Raw Material Sourcing</h3>
                <p className="text-xs text-stone-400">Queen pineapple peels, organic palm jaggery, Wayanad ginger, Mexican hibiscus, and UV amber glass bottles</p>
              </div>

              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                <ShieldCheck className="w-4 h-4" />
                <span>100% Traceable Direct Farmer Collectives</span>
              </div>
            </div>

            <div className="bg-stone-900/90 border border-stone-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950 text-[11px] font-black uppercase text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="p-4">Material / Botanical</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Current Stock</th>
                      <th className="p-4">Unit Cost</th>
                      <th className="p-4">Organic Vendor Collective</th>
                      <th className="p-4">Lot & Expiry</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800">
                    {rawMaterials.map((mat) => (
                      <tr key={mat.id} className="hover:bg-stone-850 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-white">{mat.name}</div>
                          {mat.organicCertified && (
                            <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded border border-emerald-500/30">
                              Organic Certified
                            </span>
                          )}
                        </td>
                        <td className="p-4 capitalize text-stone-400">{mat.category.replace(/_/g, ' ')}</td>
                        <td className="p-4">
                          <span className="font-black text-white text-sm">{mat.currentStock}</span> {mat.unit}
                          <div className="text-[10px] text-stone-500">Min {mat.reorderThreshold} {mat.unit}</div>
                        </td>
                        <td className="p-4 font-bold text-stone-200">₹{mat.costPerUnit} / {mat.unit}</td>
                        <td className="p-4">
                          <div className="font-semibold text-stone-200">{mat.vendorName}</div>
                          <div className="text-[10px] text-stone-500">{mat.vendorPhone}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-mono text-[11px] text-stone-300">{mat.lotNumber}</div>
                          <div className="text-[10px] text-stone-500">Exp: {mat.expiryOrHarvestDate}</div>
                        </td>
                        <td className="p-4">
                          {mat.status === 'low_stock' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-black uppercase border border-red-500/40">
                              <AlertTriangle className="w-3 h-3" />
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase border border-emerald-500/40">
                              <CheckCircle2 className="w-3 h-3" />
                              Adequate
                            </span>
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

        {/* ==================================================== */}
        {/* TAB 3: B2B WHOLESALE & DISTRIBUTION */}
        {/* ==================================================== */}
        {activeTab === 'b2b' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white">B2B Wholesale Accounts & Crate Dispatches</h3>
                <p className="text-xs text-stone-400">Supplying CrossFit gyms, luxury yoga shalas, organic cafes, and gourmet supermarkets</p>
              </div>

              <button
                onClick={() => setShowNewB2BModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-black transition-all flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New B2B Client PO</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {b2bOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-stone-900/90 border border-stone-800 rounded-3xl p-6 space-y-4 shadow-xl"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-amber-400">{order.orderNumber}</span>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-stone-800 text-stone-300">
                          {order.clientCategory.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <h4 className="text-base font-black text-white mt-1">{order.clientName}</h4>
                      <p className="text-xs text-stone-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-emerald-400" />
                        {order.outletLocation}
                      </p>
                    </div>

                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                      order.fulfillmentStatus === 'delivered' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                      order.fulfillmentStatus === 'cold_packed' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' :
                      'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}>
                      {order.fulfillmentStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="bg-stone-950 rounded-2xl p-3.5 border border-stone-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">Total Volume:</span>
                      <span className="font-black text-white">{order.crates12Pack} Crates ({order.totalBottles} Bottles)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">Net Invoice Value:</span>
                      <span className="font-black text-emerald-400 text-sm">₹{order.netPayable.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">Bottle Deposit Held:</span>
                      <span className="font-bold text-amber-400">+₹{order.bottleDepositCollected}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">Payment Terms:</span>
                      <span className="text-stone-200 capitalize font-semibold">{order.paymentTerms.replace(/_/g, ' ')}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="text-[11px] text-stone-400">
                      Challan: <span className="font-mono text-stone-300">{order.dispatchChallan}</span>
                    </div>

                    <button
                      onClick={() => setShowChallanModal(order)}
                      className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold transition-colors flex items-center gap-1 border border-stone-700"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span>View Delivery Challan</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: REVERSE LOGISTICS & BOTTLE RETURNS */}
        {/* ==================================================== */}
        {activeTab === 'returns' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white">Circular Bottle Returns & Sterilization QA</h3>
                <p className="text-xs text-stone-400">Refund ledger (₹10/bottle), sound glass inspection, high-pressure washing & thermal autoclave sterilization</p>
              </div>

              <button
                onClick={() => setShowLogReturnModal(true)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-black transition-all flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Log Bottle Return Batch</span>
              </button>
            </div>

            <div className="bg-stone-900/90 border border-stone-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950 text-[11px] font-black uppercase text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="p-4">Return Log #</th>
                      <th className="p-4">Party / Outlet</th>
                      <th className="p-4">Date</th>
                      <th className="p-4">Bottles Returned</th>
                      <th className="p-4">Refund Amount Credited</th>
                      <th className="p-4">Sterilization QA Status</th>
                      <th className="p-4">QA Inspector</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800">
                    {returns.map((ret) => (
                      <tr key={ret.id} className="hover:bg-stone-850 transition-colors">
                        <td className="p-4 font-mono font-bold text-amber-400">{ret.logNumber}</td>
                        <td className="p-4 font-bold text-white">{ret.partyName}</td>
                        <td className="p-4 text-stone-400">{ret.date}</td>
                        <td className="p-4">
                          <span className="font-black text-emerald-400 text-sm">{ret.bottles330mlReturned}</span> Bottles
                          {ret.cratesReturned > 0 && <span className="text-[10px] text-stone-500 block">({ret.cratesReturned} Crates)</span>}
                        </td>
                        <td className="p-4 font-black text-white">₹{ret.totalRefundCredited}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase border border-emerald-500/40">
                            <ShieldCheck className="w-3 h-3" />
                            {ret.condition.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-stone-400">{ret.inspectorStaff}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 5: B2B PAYMENTS & INVOICING */}
        {/* ==================================================== */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-black text-white">B2B Financial Accounts & Credit Ledger</h3>
              <p className="text-xs text-stone-400">Net-15/30 terms reconciliation, GST tax invoices, and deposit balances</p>
            </div>

            <div className="bg-stone-900/90 border border-stone-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950 text-[11px] font-black uppercase text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="p-4">Client Name</th>
                      <th className="p-4">Order #</th>
                      <th className="p-4">Gross Amount</th>
                      <th className="p-4">Wholesale Discount</th>
                      <th className="p-4">Net Payable</th>
                      <th className="p-4">Deposit Held</th>
                      <th className="p-4">Payment Terms</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800">
                    {b2bOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-stone-850 transition-colors">
                        <td className="p-4 font-bold text-white">{ord.clientName}</td>
                        <td className="p-4 font-mono text-stone-400">{ord.orderNumber}</td>
                        <td className="p-4 text-stone-300">₹{ord.grossAmount}</td>
                        <td className="p-4 text-amber-400">{ord.wholesaleDiscountPct}% (₹{Math.round(ord.grossAmount * ord.wholesaleDiscountPct / 100)})</td>
                        <td className="p-4 font-black text-emerald-400">₹{ord.netPayable}</td>
                        <td className="p-4 font-bold text-amber-400">₹{ord.bottleDepositCollected}</td>
                        <td className="p-4 capitalize text-stone-400">{ord.paymentTerms.replace(/_/g, ' ')}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                            ord.paymentStatus === 'paid'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}>
                            {ord.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 6: DIRECT GUEST ONLINE ORDERS QUEUE */}
        {/* ==================================================== */}
        {activeTab === 'guest_orders' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-black text-white">Direct Website Guest Orders Queue</h3>
              <p className="text-xs text-stone-400">Live order stream placed from the website for packaged bakery and chilled probiotic Tepache bottles</p>
            </div>

            {guestOrders.length === 0 ? (
              <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-12 text-center space-y-3">
                <ShoppingBag className="w-12 h-12 text-stone-600 mx-auto" />
                <h4 className="text-base font-bold text-white">No Direct Guest Orders Placed Yet</h4>
                <p className="text-xs text-stone-400 max-w-md mx-auto">
                  When visitors order sourdough, granola, or Tepache bottles directly from the website without signup, their dispatch tickets appear here in real time!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {guestOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="bg-stone-900/90 border border-stone-800 rounded-3xl p-6 space-y-4 shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-mono font-bold text-emerald-400">#{ord.orderNumber}</span>
                        <h4 className="text-base font-black text-white mt-1">{ord.customerName}</h4>
                        <div className="text-xs text-stone-400">{ord.customerPhone} • {ord.deliveryDate} ({ord.deliverySlot})</div>
                      </div>

                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {ord.orderStatus}
                      </span>
                    </div>

                    <div className="bg-stone-950 rounded-2xl p-3 border border-stone-800 space-y-1.5 text-xs">
                      <div className="font-bold text-stone-300">Items Ordered:</div>
                      {ord.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-stone-400 text-[11px]">
                          <span>{it.quantity}x {it.name} ({it.sizeOrWeight})</span>
                          <span className="text-white font-bold">₹{it.lineTotal}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <div>
                        <span className="text-stone-400">Hub: </span>
                        <span className="font-bold text-white">{ord.fulfillmentHub}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-stone-400">Grand Total: </span>
                        <span className="font-black text-emerald-400 text-sm">₹{ord.grandTotal}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ==================================================== */}
      {/* MODAL: NEW FERMENTATION BATCH */}
      {/* ==================================================== */}
      {showNewBatchModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowNewBatchModal(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full"
            >
              ✕
            </button>

            <h3 className="text-xl font-black text-white">Initialize New Tepache Brew Batch</h3>

            <form onSubmit={handleCreateBatch} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-300 font-bold mb-1">Select Flavor Profile *</label>
                <select
                  value={newBatchFlavor}
                  onChange={(e) => setNewBatchFlavor(e.target.value as any)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                >
                  <option value="classic_pineapple_cinnamon">Classic Pineapple & Ceylon Cinnamon</option>
                  <option value="ginger_lime_lemongrass">Zesty Ginger, Kaffir Lime & Lemongrass</option>
                  <option value="hibiscus_berry_jamaica">Ruby Wild Hibiscus & Cranberry</option>
                  <option value="passionfruit_turmeric_pepper">Tropical Passionfruit & Lakadong Turmeric</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Target Fermenter Tank *</label>
                  <input
                    type="text"
                    value={newBatchTank}
                    onChange={(e) => setNewBatchTank(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Brew Volume (Liters) *</label>
                  <input
                    type="number"
                    value={newBatchLiters}
                    onChange={(e) => setNewBatchLiters(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-300 font-bold mb-1">Wild Starter & Botanical Base *</label>
                <input
                  type="text"
                  value={newBatchWildSource}
                  onChange={(e) => setNewBatchWildSource(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-2xl text-xs transition-all shadow-lg"
                >
                  Start Wild Fermentation Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: NEW B2B ORDER */}
      {/* ==================================================== */}
      {showNewB2BModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowNewB2BModal(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full"
            >
              ✕
            </button>

            <h3 className="text-xl font-black text-white">Create B2B Wholesale Client Order</h3>

            <form onSubmit={handleCreateB2BOrder} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-300 font-bold mb-1">Client / Gym / Cafe Name *</label>
                <input
                  type="text"
                  required
                  value={b2bClientName}
                  onChange={(e) => setB2bClientName(e.target.value)}
                  placeholder="e.g. Iron & Pulse CrossFit"
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={b2bContactPerson}
                    onChange={(e) => setB2bContactPerson(e.target.value)}
                    placeholder="Coach Rohit"
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={b2bPhone}
                    onChange={(e) => setB2bPhone(e.target.value)}
                    placeholder="+91 98470 11223"
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-300 font-bold mb-1">Outlet Location / Delivery Address</label>
                <input
                  type="text"
                  value={b2bLocation}
                  onChange={(e) => setB2bLocation(e.target.value)}
                  placeholder="Marine Drive, Kochi"
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Quantity (12-Bottle Crates) *</label>
                  <input
                    type="number"
                    min="1"
                    value={b2bCrates}
                    onChange={(e) => setB2bCrates(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Payment Terms</label>
                  <select
                    value={b2bPaymentTerms}
                    onChange={(e) => setB2bPaymentTerms(e.target.value as any)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="advance_paid">Advance Paid</option>
                    <option value="net_15_days">Net 15 Days</option>
                    <option value="net_30_days">Net 30 Days</option>
                    <option value="cod">Cash On Delivery</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-2xl text-xs transition-all shadow-lg"
                >
                  Generate B2B Wholesale PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: LOG BOTTLE RETURN */}
      {/* ==================================================== */}
      {showLogReturnModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowLogReturnModal(false)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full"
            >
              ✕
            </button>

            <h3 className="text-xl font-black text-white">Log Empty Glass Bottle Returns</h3>

            <form onSubmit={handleLogReturn} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-300 font-bold mb-1">Returning Party / Outlet *</label>
                <input
                  type="text"
                  required
                  value={returnPartyName}
                  onChange={(e) => setReturnPartyName(e.target.value)}
                  placeholder="e.g. Soul Kitchen Cafe or POS Walk-in"
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-300 font-bold mb-1">330ml Sound Bottles *</label>
                  <input
                    type="number"
                    min="1"
                    value={returnBottlesCount}
                    onChange={(e) => setReturnBottlesCount(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-stone-300 font-bold mb-1">Crates Returned</label>
                  <input
                    type="number"
                    value={returnCratesCount}
                    onChange={(e) => setReturnCratesCount(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                <strong>Refund Calculation:</strong> {returnBottlesCount} bottles x ₹10 = <span className="font-black text-white">₹{(parseInt(returnBottlesCount) || 0) * 10}</span> deposit refund credited.
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-3 rounded-2xl text-xs transition-all shadow-lg"
                >
                  Confirm & Credit Deposit Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: DELIVERY CHALLAN PREVIEW */}
      {/* ==================================================== */}
      {showChallanModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowChallanModal(null)}
              className="absolute top-5 right-5 text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full"
            >
              ✕
            </button>

            <div className="text-center pb-2 border-b border-stone-800">
              <div className="text-xs font-mono text-emerald-400 font-bold">STATEWIDE COLD-CHAIN DISPATCH CHALLAN</div>
              <h3 className="text-lg font-black text-white">{showChallanModal.dispatchChallan}</h3>
            </div>

            <div className="space-y-2 text-xs text-stone-300">
              <div className="flex justify-between">
                <span className="text-stone-400">Client / Destination:</span>
                <span className="font-bold text-white">{showChallanModal.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Delivery Address:</span>
                <span>{showChallanModal.outletLocation}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Order Ref:</span>
                <span className="font-mono text-stone-200">{showChallanModal.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Crates & Bottles:</span>
                <span className="font-bold text-white">{showChallanModal.crates12Pack} Crates ({showChallanModal.totalBottles} Bottles)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Net Payable:</span>
                <span className="font-black text-emerald-400">₹{showChallanModal.netPayable}</span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-stone-800 hover:bg-stone-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 border border-stone-700"
              >
                <Printer className="w-4 h-4" />
                <span>Print Challan</span>
              </button>
              <button
                onClick={() => setShowChallanModal(null)}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black py-2.5 rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
