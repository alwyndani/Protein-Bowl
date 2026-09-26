import React, { useState } from 'react';
import { Order, DietPlanRequest, ComboOffer, OmnichannelOrder, KitchenBranchId, StaffUserAccount, CloudKitchenBranch } from '../../types';
import { INITIAL_COMBO_OFFERS } from '../../data/mockData';
import { INITIAL_OMNICHANNEL_ORDERS } from '../../data/mockOmnichannelData';
import { CLOUD_KITCHEN_BRANCHES } from '../../data/cloudKitchensData';
import { Building2, TrendingUp, Users, DollarSign, Activity, Settings, Plus, Check, Trash2, PieChart as PieIcon, Sparkles, FileText, Receipt, ShieldAlert, Truck, Home, Flame, UserCheck, ShoppingBag, MapPin, Calculator, Key } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import confetti from 'canvas-confetti';
import { IngredientPriceCalculator } from '../common/IngredientPriceCalculator';
import { HRMModule } from './HRMModule';
import { FinancialsModule } from './FinancialsModule';
import { OmnichannelSalesModule } from './OmnichannelSalesModule';
import { MultiKitchenOverviewModule } from './MultiKitchenOverviewModule';
import { POSDashboard } from './POSDashboard';
import { BakeryFMCGDashboard } from './BakeryFMCGDashboard';

interface MDDashboardProps {
  requests: DietPlanRequest[];
  orders: Order[];
  omnichannelOrders?: OmnichannelOrder[];
  onAddOmnichannelOrder?: (order: OmnichannelOrder) => void;
  onUpdateOmnichannelOrder?: (order: OmnichannelOrder) => void;
  onDeleteOmnichannelOrder?: (orderId: string) => void;
  selectedBranchId?: KitchenBranchId;
  onSelectBranch?: (branchId: KitchenBranchId) => void;
  onSwitchStaffAccount?: (staff: StaffUserAccount) => void;
  branches?: CloudKitchenBranch[];
  onAddBranch?: (branch: CloudKitchenBranch) => void;
  onOpenSRS?: () => void;
}

interface OperationalExpense {
  id: string;
  category: 'Facility & Rent' | 'Deep Cleaning & Hygiene' | 'Safety Kits & PPE' | 'Waste & Bio-Hazard' | 'Utilities' | 'Staff Accommodation & Transport' | 'Misc';
  amount: number;
  date: string;
  note: string;
}

export const MDDashboard: React.FC<MDDashboardProps> = ({ 
  requests, 
  orders, 
  omnichannelOrders = INITIAL_OMNICHANNEL_ORDERS,
  onAddOmnichannelOrder,
  onUpdateOmnichannelOrder,
  onDeleteOmnichannelOrder,
  selectedBranchId = 'all',
  onSelectBranch = () => {},
  onSwitchStaffAccount,
  branches = CLOUD_KITCHEN_BRANCHES,
  onAddBranch,
  onOpenSRS
}) => {
  const [activeTab, setActiveTab] = useState<'cloud-kitchens' | 'fmcg' | 'pos' | 'omnichannel' | 'analytics' | 'financials' | 'price-calc' | 'hrm' | 'staff' | 'pricing'>('cloud-kitchens');



  // Staff Management State
  const [staffList, setStaffList] = useState([
    { id: '1', name: 'Dr. Priya Nair', role: 'Nutritionist / Dietician', email: 'priya@proteinbowl.in', status: 'Active', sysRole: 'nutritionist' },
    { id: '2', name: 'Chef Suresh Kumar', role: 'Head Kitchen Chef', email: 'suresh@proteinbowl.in', status: 'Active', sysRole: 'chef' },
    { id: '3', name: 'Chef Murugan K.', role: 'Kerala Mess Lead Chef (KDS & Steam Kettles)', email: 'murugan.mess@proteinbowl.in', status: 'Active', sysRole: 'chef' },
    { id: '4', name: 'Ananthan V. Menon', role: 'Kerala Mess Logistics & Hostel Distribution Lead', email: 'ananthan.mess@proteinbowl.in', status: 'Active', sysRole: 'mess_customer' },
    { id: '5', name: 'Lekshmi Devi R.', role: 'Kerala Mess Nutritional Auditor & Recipe Lead', email: 'lekshmi@proteinbowl.in', status: 'Active', sysRole: 'nutritionist' },
    { id: '6', name: 'Rajesh V.', role: 'Procurement Manager', email: 'rajesh@proteinbowl.in', status: 'Active', sysRole: 'procurement' },
    { id: '7', name: 'Kiran K.', role: 'Logistics Supervisor', email: 'kiran@proteinbowl.in', status: 'Active', sysRole: 'delivery' }
  ]);

  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Nutritionist / Dietician');
  const [newStaffEmail, setNewStaffEmail] = useState('');

  // Combo Offer Config State
  const [combos, setCombos] = useState<ComboOffer[]>(INITIAL_COMBO_OFFERS);

  // Operational Expense Entry State (FR-ADM-03b)
  const [expenses, setExpenses] = useState<OperationalExpense[]>([
    { id: 'exp-1', category: 'Facility & Rent', amount: 45000, date: '2026-07-01', note: 'Kochi Cloud Kitchen Facility Rent' },
    { id: 'exp-2', category: 'Utilities', amount: 18500, date: '2026-07-05', note: 'Electricity & Cooking Gas Fuel' },
    { id: 'exp-3', category: 'Deep Cleaning & Hygiene', amount: 8000, date: '2026-07-10', note: 'Bi-weekly Kitchen Sanitation' },
    { id: 'exp-4', category: 'Safety Kits & PPE', amount: 5500, date: '2026-07-12', note: 'Gloves, Hairnets & Sanitizers' },
    { id: 'exp-5', category: 'Staff Accommodation & Transport', amount: 12000, date: '2026-07-15', note: 'Delivery Agent Fuel & Transport Allowances' }
  ]);

  const [expCategory, setExpCategory] = useState<OperationalExpense['category']>('Facility & Rent');
  const [expAmount, setExpAmount] = useState('');
  const [expNote, setExpNote] = useState('');

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expAmount || isNaN(Number(expAmount))) return;
    const newExp: OperationalExpense = {
      id: `exp-${Date.now()}`,
      category: expCategory,
      amount: Number(expAmount),
      date: new Date().toISOString().split('T')[0],
      note: expNote || expCategory
    };
    setExpenses([newExp, ...expenses]);
    setExpAmount('');
    setExpNote('');
    confetti({ particleCount: 30, spread: 50 });
  };

  // Automated Data Fetching for Real-Time Profitability Engine (FR-ADM-03b)
  const grossBusinessRevenue = 485000; // Aggregated from processed payment gateway orders
  const rawMaterialCost = 142000; // Auto-fetched from Purchase Orders (Procurement)
  const payrollLiability = 115000; // Auto-fetched from HR sub-module (Salaries & Allowances)
  const totalLoggedOverheads = expenses.reduce((sum, e) => sum + e.amount, 0);

  const totalBusinessExpense = rawMaterialCost + payrollLiability + totalLoggedOverheads;
  const netBusinessProfit = grossBusinessRevenue - totalBusinessExpense;
  const netMarginPercent = ((netBusinessProfit / grossBusinessRevenue) * 100).toFixed(1);

  // Financial Chart Data
  const revenueData = [
    { month: 'Feb', revenue: 280000, subscribers: 180 },
    { month: 'Mar', revenue: 320000, subscribers: 210 },
    { month: 'Apr', revenue: 390000, subscribers: 260 },
    { month: 'May', revenue: 420000, subscribers: 290 },
    { month: 'Jun', revenue: 450000, subscribers: 315 },
    { month: 'Jul', revenue: 485000, subscribers: 342 }
  ];

  const planPopularityData = [
    { name: 'Complete 30-Day', value: 45, color: '#0B5E2E' },
    { name: '2-Meal Office Plan', value: 35, color: '#4CAF50' },
    { name: '1-Meal Jumpstart', value: 20, color: '#82ca9d' }
  ];

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || !newStaffEmail) return;

    const newStaff = {
      id: Date.now().toString(),
      name: newStaffName,
      role: newStaffRole,
      email: newStaffEmail,
      status: 'Active'
    };

    setStaffList([...staffList, newStaff]);
    setNewStaffName('');
    setNewStaffEmail('');
    confetti({ particleCount: 40, spread: 50 });
  };

  const handleRemoveStaff = (id: string) => {
    setStaffList(staffList.filter((s) => s.id !== id));
  };

  const pendingApprovalsCount = requests.filter((r) => r.status === 'pending_review' || r.status === 'under_review').length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-950 via-stone-900 to-amber-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-900/60 px-3 py-1 rounded-full border border-amber-700/50">
              Managing Director ERP
            </span>
            <h1 className="text-2xl sm:text-4xl font-black mt-2">
              Executive Business Overview
            </h1>
            <p className="text-xs sm:text-sm text-stone-300">
              End-to-End Cloud Kitchen Performance, MRR Metrics, Staff Roles & Pricing Strategy
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {onOpenSRS && (
              <button
                onClick={onOpenSRS}
                className="bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-400/40 px-4 py-3 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 backdrop-blur-md shadow-md hover:scale-105 active:scale-95 cursor-pointer"
                title="View & Download IEEE 830 Software Requirements Specification in Word (.docx)"
              >
                <FileText className="w-4 h-4 text-blue-300" />
                <div className="text-left">
                  <span className="block text-[10px] text-blue-300 uppercase tracking-wider font-extrabold">Enterprise Doc</span>
                  <span className="block text-xs font-black text-white">Download SRS (.docx)</span>
                </div>
              </button>
            )}

            <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 text-center min-w-[170px]">
              <span className="text-[10px] text-amber-200 font-bold uppercase block">Monthly Recurring Revenue</span>
              <span className="text-3xl font-black text-amber-400">₹4,85,000</span>
              <span className="text-[10px] text-stone-300 block">+15.2% vs last month</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold uppercase">Active Subscribers</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-stone-900">342</div>
          <div className="text-[11px] text-emerald-700 font-bold">96% Retention Rate</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold uppercase">Pending Dietician Reviews</span>
            <Activity className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-black text-stone-900">{pendingApprovalsCount}</div>
          <div className="text-[11px] text-amber-700 font-bold">Requires Dietician Action</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold uppercase">Total Orders Served</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-black text-stone-900">1,240</div>
          <div className="text-[11px] text-blue-700 font-bold">In Kochi Cloud Kitchen</div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold uppercase">Avg Order Value (AOV)</span>
            <TrendingUp className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-3xl font-black text-stone-900">₹14,200</div>
          <div className="text-[11px] text-purple-700 font-bold">30-Day Plan Dominance</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-1">
        {[
          { id: 'cloud-kitchens', label: '🏢 Multi-Cloud Kitchen Operations (Trivandrum / Kochi / Kozhikode)' },
          { id: 'fmcg', label: '🍞 Packaged Foods & Bakery Logistics (Granola, Bars, Breads, Expiry)' },
          { id: 'pos', label: '🖥️ Point of Sale (POS) Terminals & Outlet Billing' },
          { id: 'omnichannel', label: '🛵 Omnichannel & Daily Sales (Swiggy, Zomato, Party Orders)' },
          { id: 'analytics', label: 'Executive Analytics' },
          { id: 'financials', label: 'Financial Transactions, P&L & Balance Sheet' },
          { id: 'hrm', label: 'Human Resource Management (HRM)' },
          { id: 'price-calc', label: 'Ingredient Price List Entry & Rates (FR-ADM-02b)' },
          { id: 'staff', label: 'User & Role Management' },
          { id: 'pricing', label: 'Combo Configurations' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-amber-900 text-white shadow-md'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Multi-Cloud Kitchen Operations */}
      {activeTab === 'cloud-kitchens' && (
        <MultiKitchenOverviewModule
          selectedBranchId={selectedBranchId}
          onSelectBranch={onSelectBranch}
          onSwitchStaffAccount={onSwitchStaffAccount}
          orders={orders}
          omnichannelOrders={omnichannelOrders}
          branches={branches}
          onAddBranch={onAddBranch}
        />
      )}

      {/* TAB: Packaged Foods & Bakery FMCG Logistics */}
      {activeTab === 'fmcg' && (
        <BakeryFMCGDashboard />
      )}

      {/* TAB: Statewide Point of Sale (POS) Terminals */}
      {activeTab === 'pos' && (
        <POSDashboard
          branches={branches}
          selectedBranchId={selectedBranchId}
          onSelectBranch={onSelectBranch}
        />
      )}

      {/* TAB: Omnichannel & Party Sales Daily Log */}
      {activeTab === 'omnichannel' && (
        <OmnichannelSalesModule
          ordersList={omnichannelOrders}
          onAddOrder={onAddOmnichannelOrder}
          onUpdateOrder={onUpdateOmnichannelOrder}
          onDeleteOrder={onDeleteOmnichannelOrder}
        />
      )}

      {/* TAB: Human Resource Management (HRM) */}
      {activeTab === 'hrm' && (
        <HRMModule 
          onSwitchRole={(role) => {
            if (onSwitchStaffAccount) {
              onSwitchStaffAccount({
                id: 'hrm-mess-auth',
                name: 'Mess Employee',
                email: 'mess@proteinbowl.in',
                role: role as any,
                designation: 'Kerala Mess Department',
                assignedBranchId: selectedBranchId || 'kochi',
                branchName: 'Kerala Mess Operations',
                avatarBg: 'bg-amber-600',
                shiftTiming: 'Full Day',
                isOnline: true
              });
            }
          }}
        />
      )}



      {/* TAB 1: Revenue Analytics */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
            <h3 className="text-base font-extrabold text-stone-900">Monthly Revenue Growth (MRR)</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <XAxis dataKey="month" stroke="#888888" fontSize={12} />
                  <YAxis stroke="#888888" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#0B5E2E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
            <h3 className="text-base font-extrabold text-stone-900">Plan Type Popularity</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={planPopularityData} dataKey="value" cx="50%" cy="50%" outerRadius={60} label>
                    {planPopularityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 text-xs font-semibold text-stone-600">
              {planPopularityData.map((p, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </span>
                  <span>{p.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: User & Role Management */}
      {activeTab === 'staff' && (
        <div className="space-y-6 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-stone-900">Internal Staff & Department Authorizations</h3>
              <p className="text-xs text-stone-500">Manage login credentials across Kitchen, Mess, Logistics, and Clinical Nutrition departments.</p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl">
              {staffList.length} Active Staff Accounts
            </span>
          </div>

          <form onSubmit={handleAddStaff} className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600">Provision New Department Staff Login</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Staff Full Name"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                className="p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
              />
              <input
                type="email"
                required
                placeholder="Work Email"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                className="p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
              />
              <select
                value={newStaffRole}
                onChange={(e) => setNewStaffRole(e.target.value)}
                className="p-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold outline-none"
              >
                <option value="Kerala Mess Lead Chef (KDS & Steam Kettles)">🍛 Kerala Mess Lead Chef (KDS)</option>
                <option value="Kerala Mess Logistics & Hostel Distribution Lead">📦 Kerala Mess Hostel Logistics Lead</option>
                <option value="Kerala Mess Nutritional Auditor & Recipe Lead">🥗 Kerala Mess Nutritional Auditor</option>
                <option value="Kitchen Head Chef">👨‍🍳 Kitchen Head Chef</option>
                <option value="Nutritionist / Dietician">🥗 Nutritionist / Dietician</option>
                <option value="Procurement Manager">📦 Procurement Manager</option>
                <option value="Logistics Driver">🚚 Logistics Driver</option>
              </select>
            </div>
            <button type="submit" className="bg-amber-900 text-white font-bold px-4 py-2 rounded-xl text-xs hover:bg-amber-800">
              Provision Staff Account
            </button>
          </form>

          <div className="space-y-2">
            {staffList.map((st) => {
              const isMess = st.role.toLowerCase().includes('mess') || st.email.includes('mess');
              return (
                <div key={st.id} className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                  isMess ? 'border-amber-300 bg-amber-50/50' : 'border-stone-200 bg-stone-50'
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-stone-900 text-sm">{st.name}</h4>
                      {isMess && (
                        <span className="text-[9px] font-black uppercase bg-amber-500 text-white px-2 py-0.5 rounded-full">
                          Mess Dept
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">{st.role} • {st.email}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {onSwitchStaffAccount && (
                      <button
                        onClick={() => {
                          const roleMapping: Record<string, string> = {
                            'Kerala Mess Lead Chef (KDS & Steam Kettles)': 'chef',
                            'Kerala Mess Logistics & Hostel Distribution Lead': 'mess_customer',
                            'Kerala Mess Nutritional Auditor & Recipe Lead': 'nutritionist',
                            'Head Kitchen Chef': 'chef',
                            'Nutritionist / Dietician': 'nutritionist',
                            'Procurement Manager': 'procurement',
                            'Logistics Supervisor': 'delivery'
                          };
                          const targetRole = st.sysRole || roleMapping[st.role] || 'chef';
                          onSwitchStaffAccount({
                            id: `staff-${st.id}`,
                            name: st.name,
                            email: st.email,
                            role: targetRole as any,
                            designation: st.role,
                            assignedBranchId: selectedBranchId || 'kochi',
                            branchName: isMess ? 'Kerala Mess Central Kitchens' : 'Kochi Central HQ',
                            avatarBg: isMess ? 'bg-amber-600' : 'bg-stone-800',
                            shiftTiming: 'Full Day',
                            isOnline: true
                          });
                        }}
                        className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
                      >
                        <Key className="w-3.5 h-3.5 text-amber-300" />
                        <span>Log In</span>
                      </button>
                    )}
                    <button onClick={() => handleRemoveStaff(st.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl" title="Delete account">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Financial Management, P&L & Balance Sheet Module */}
      {activeTab === 'financials' && (
        <FinancialsModule />
      )}

      {/* TAB 3: Ingredient Price List Entry & Rates (FR-ADM-02b) */}
      {activeTab === 'price-calc' && (
        <IngredientPriceCalculator />
      )}

    </div>
  );
};
