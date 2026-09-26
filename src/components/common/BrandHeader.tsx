import React, { useState } from 'react';
import { LogoMark } from './LogoMark';
import { UserRole, CustomerProfile, KitchenBranchId, CloudKitchenBranch } from '../../types';
import {
  User,
  ShieldAlert,
  ChefHat,
  Package,
  Truck,
  Stethoscope,
  Dumbbell,
  Building2,
  Menu as MenuIcon,
  X,
  ShoppingBag,
  Activity,
  Sparkles,
  LogOut,
  ChevronDown,
  MapPin,
  Calculator,
  FlaskConical,
  Utensils,
  Layers,
  Briefcase,
  FileText,
  ArrowLeft
} from 'lucide-react';

interface BrandHeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  activeCustomerTab: string;
  onSelectCustomerTab: (tab: string) => void;
  currentUser: CustomerProfile | null;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  activeOrdersCount?: number;
  hideRoleDemo?: boolean;
  selectedBranchId?: KitchenBranchId;
  onSelectBranch?: (branchId: KitchenBranchId) => void;
  branches?: CloudKitchenBranch[];
  cartItemsCount?: number;
  cartTotal?: number;
  onOpenCart?: () => void;
  onOpenDirectTracking?: () => void;
  onOpenEmployeeLogin?: () => void;
  onOpenSRS?: () => void;
  onOpenKeralaMessPortal?: () => void;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({
  currentRole,
  onRoleChange,
  activeCustomerTab,
  onSelectCustomerTab,
  currentUser,
  onOpenAuthModal,
  onLogout,
  activeOrdersCount = 1,
  hideRoleDemo = false,
  selectedBranchId = 'all',
  onSelectBranch,
  branches,
  cartItemsCount = 0,
  cartTotal = 0,
  onOpenCart,
  onOpenDirectTracking,
  onOpenEmployeeLogin,
  onOpenSRS,
  onOpenKeralaMessPortal
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const isCustomerRole = currentRole === 'customer' || currentRole === 'mess_customer';

  const roleLabels: Record<UserRole, { title: string; icon: React.ReactNode; color: string }> = {
    customer: { title: 'Customer Portal', icon: <User className="w-4 h-4" />, color: 'bg-emerald-100 text-emerald-800' },
    mess_customer: { title: '🍛 Kerala Mess', icon: <Utensils className="w-4 h-4" />, color: 'bg-amber-100 text-amber-800' },
    swiggy_zomato: { title: '⚡ Swiggy/Zomato', icon: <Layers className="w-4 h-4" />, color: 'bg-orange-100 text-orange-800' },
    md: { title: 'MD Dashboard', icon: <Building2 className="w-4 h-4" />, color: 'bg-amber-100 text-amber-800' },
    pos: { title: 'POS Billing', icon: <Calculator className="w-4 h-4" />, color: 'bg-indigo-100 text-indigo-800' },
    nutritionist: { title: 'Dietician', icon: <Stethoscope className="w-4 h-4" />, color: 'bg-teal-100 text-teal-800' },
    trainer: { title: 'Trainer', icon: <Dumbbell className="w-4 h-4" />, color: 'bg-emerald-100 text-emerald-800' },
    chef: { title: 'Chef ERP', icon: <ChefHat className="w-4 h-4" />, color: 'bg-orange-100 text-orange-800' },
    procurement: { title: 'Procurement', icon: <Package className="w-4 h-4" />, color: 'bg-blue-100 text-blue-800' },
    delivery: { title: 'Delivery', icon: <Truck className="w-4 h-4" />, color: 'bg-purple-100 text-purple-800' },
    bakery_fmcg: { title: 'FMCG Foods', icon: <Package className="w-4 h-4" />, color: 'bg-amber-100 text-amber-800' },
    tepache_erp: { title: 'Tepache ERP', icon: <FlaskConical className="w-4 h-4" />, color: 'bg-emerald-100 text-emerald-800' },
  };

  return (
    <header className="sticky top-0 z-40 bg-stone-950/90 backdrop-blur-xl border-b border-stone-800/80 text-white shadow-2xl transition-all">
      {/* Role Switcher Toolbar - Visually Separated Developer Sandbox */}
      {!hideRoleDemo && !isCustomerRole && (
        <div className="bg-stone-900 border-b border-amber-500/30 text-stone-300 text-xs py-1 px-4 shadow-inner">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-black text-amber-400 text-[11px] uppercase tracking-wider bg-amber-950/80 px-2.5 py-0.5 rounded-md border border-amber-500/40">
                <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
                Role Demo Sandbox (Simulated)
              </span>
              <span className="text-stone-400 text-[11px] hidden sm:inline">Simulate role views for dev testing without granting backend RBAC credentials</span>
            </div>

            {/* Quick Role Selector Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
              {(['customer', 'mess_customer', 'swiggy_zomato', 'chef', 'md', 'nutritionist', 'trainer', 'delivery', 'pos', 'bakery_fmcg'] as UserRole[]).map((r) => {
                const active = currentRole === r;
                return (
                  <button
                    key={r}
                    onClick={() => onRoleChange(r)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold transition-all flex items-center gap-1 whitespace-nowrap ${active
                      ? 'bg-amber-400 text-stone-950 font-black shadow-xs'
                      : 'text-stone-300 hover:text-white hover:bg-stone-800 border border-stone-800'
                      }`}
                  >
                    {roleLabels[r].icon}
                    <span>{roleLabels[r].title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Header Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <div onClick={() => { onRoleChange('customer'); onSelectCustomerTab('home'); }} className="cursor-pointer shrink-0">
          <LogoMark size="md" variant="white" />
        </div>

        {/* CUSTOMER TOP-LEVEL PORTAL SELECTOR (ONLY TWO PORTAL CHOICES: Customer Portal | Kerala Mess) */}
        {isCustomerRole && (
          <div className="hidden md:flex items-center bg-stone-900/90 border border-stone-800 rounded-2xl p-1 gap-1 shadow-inner">
            <button
              onClick={() => {
                onRoleChange('customer');
                onSelectCustomerTab(currentUser ? 'dashboard' : 'home');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                currentRole === 'customer'
                  ? 'bg-emerald-500 text-stone-950 font-black shadow-md'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Customer Portal</span>
            </button>

            <button
              onClick={() => {
                if (onOpenKeralaMessPortal) {
                  onOpenKeralaMessPortal();
                } else {
                  onRoleChange('mess_customer');
                }
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                currentRole === 'mess_customer'
                  ? 'bg-amber-500 text-stone-950 font-black shadow-md'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800'
              }`}
            >
              <Utensils className="w-4 h-4" />
              <span>Kerala Mess</span>
            </button>
          </div>
        )}

        {/* ERP Role Badge Banner & Kitchen Branch Selector if inside ERP */}
        {!isCustomerRole && (
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-3 bg-stone-900 border border-stone-800 rounded-2xl px-4 py-2">
              <span className={`p-1.5 rounded-lg ${roleLabels[currentRole].color}`}>
                {roleLabels[currentRole].icon}
              </span>
              <div>
                <div className="text-[10px] font-black text-stone-400 uppercase tracking-wider">Internal Staff ERP Portal</div>
                <div className="text-xs font-bold text-emerald-400">{roleLabels[currentRole].title}</div>
              </div>
            </div>

            {/* Branch Switcher Pill */}
            {onSelectBranch && (
              <div className="flex items-center gap-2 bg-stone-900 border border-stone-800 rounded-2xl px-3 py-1.5">
                <MapPin className="w-4 h-4 text-amber-400" />
                <select
                  value={selectedBranchId}
                  onChange={(e) => onSelectBranch(e.target.value)}
                  className="bg-transparent text-xs font-bold text-amber-300 focus:outline-hidden cursor-pointer"
                  title="Operating Cloud Kitchen Branch"
                >
                  <option value="all" className="bg-stone-900 text-white">🏢 Statewide (All Kitchens)</option>
                  {branches && branches.length > 0 ? (
                    branches.map(b => (
                      <option key={b.id} value={b.id} className="bg-stone-900 text-white">
                        📍 {b.name} ({b.city})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="trivandrum" className="bg-stone-900 text-white">📍 Trivandrum Kitchen</option>
                      <option value="kochi" className="bg-stone-900 text-white">📍 Kochi Central HQ</option>
                      <option value="kozhikode" className="bg-stone-900 text-white">📍 Kozhikode Hub</option>
                    </>
                  )}
                </select>
              </div>
            )}

            {/* Exit ERP Portal Button */}
            <button
              onClick={() => { onRoleChange('customer'); onSelectCustomerTab('home'); }}
              className="flex items-center gap-1.5 bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-white border border-stone-800 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              title="Return to Customer Portal Landing"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
              <span>Customer Portal</span>
            </button>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Direct Packaged & Tepache Track Orders Button (Set false to true to retrieve) */}
          {true /* set to true to retrieve */ && onOpenDirectTracking && (
            <button
              onClick={onOpenDirectTracking}
              className="hidden lg:flex items-center gap-1.5 bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-white border border-stone-800 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              title="Track Direct Packaged Goods & Probiotic Orders"
            >
              <Truck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Track Orders</span>
            </button>
          )}

          {/* Direct Cart Button with Item Counter & Total (Set false to true to retrieve) */}
          {true /* set to true to retrieve */ && onOpenCart && (
            <button
              onClick={onOpenCart}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-md ${cartItemsCount > 0
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-stone-950 scale-105 shadow-amber-500/20'
                : 'bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800'
                }`}
              title="View Direct Nutrition Cart"
            >
              <div className="relative">
                <ShoppingBag className={`w-4 h-4 ${cartItemsCount > 0 ? 'text-stone-950' : 'text-amber-400'}`} />
                {cartItemsCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-stone-950 text-amber-400 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-amber-400">
                    {cartItemsCount}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline">
                {cartItemsCount > 0 ? `Cart (₹${cartTotal})` : 'Cart'}
              </span>
            </button>
          )}



          {/* Active Subscription Quick Badge */}
          {isCustomerRole && currentUser && activeOrdersCount > 0 && (
            <button
              onClick={() => onSelectCustomerTab('dashboard')}
              className="hidden sm:flex items-center gap-2 bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-900 transition-colors"
            >
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
              <span>1 Active Plan</span>
            </button>
          )}

          {/* User Account Button or Sign In & Staff Portal Buttons */}
          {currentUser ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectCustomerTab('dashboard')}
                className="flex items-center gap-2 bg-stone-900 hover:bg-stone-800 text-stone-200 border border-stone-800 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-500 text-stone-950 font-black flex items-center justify-center text-xs">
                  {currentUser?.name ? currentUser.name.charAt(0) : 'U'}
                </div>
                <span className="hidden sm:inline text-xs font-bold text-white">{currentUser?.name || 'User'}</span>
              </button>
              <button
                onClick={onLogout}
                title="Sign Out"
                className="p-2 text-stone-400 hover:text-red-400 rounded-xl hover:bg-stone-900 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenAuthModal}
                className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 px-3.5 py-2 rounded-xl text-xs font-black shadow-md transition-all flex items-center gap-1.5"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Sign In / Sign Up</span>
                <span className="sm:hidden">Login</span>
              </button>

              {!isCustomerRole && onOpenEmployeeLogin && (
                <button
                  onClick={onOpenEmployeeLogin}
                  className="hidden md:flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                  title="Employee & Kerala Mess Portal Sign-in"
                >
                  <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                  <span>Staff Login</span>
                </button>
              )}

              {onOpenSRS && (
                <button
                  onClick={onOpenSRS}
                  className="hidden lg:flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs"
                  title="Open and Download Software Requirements Specification (Word .docx)"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>SRS (Word)</span>
                </button>
              )}
            </div>
          )}

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl border border-stone-800 text-stone-300 hover:bg-stone-900"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-stone-900 border-b border-stone-800 px-4 pt-3 pb-6 space-y-3 text-white">
          {isCustomerRole ? (
            <div className="space-y-3">
              {/* Mobile Top-Level Portal Choices */}
              <div className="grid grid-cols-2 gap-2 pb-2 border-b border-stone-800">
                <button
                  onClick={() => {
                    onRoleChange('customer');
                    onSelectCustomerTab(currentUser ? 'dashboard' : 'home');
                    setMobileMenuOpen(false);
                  }}
                  className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border ${
                    currentRole === 'customer'
                      ? 'bg-emerald-500 text-stone-950 border-emerald-500 font-black'
                      : 'bg-stone-950 text-stone-300 border-stone-800'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>Customer Portal</span>
                </button>

                <button
                  onClick={() => {
                    if (onOpenKeralaMessPortal) {
                      onOpenKeralaMessPortal();
                    } else {
                      onRoleChange('mess_customer');
                    }
                    setMobileMenuOpen(false);
                  }}
                  className={`p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border ${
                    currentRole === 'mess_customer'
                      ? 'bg-amber-500 text-stone-950 border-amber-500 font-black'
                      : 'bg-stone-950 text-stone-300 border-stone-800'
                  }`}
                >
                  <Utensils className="w-4 h-4" />
                  <span>Kerala Mess</span>
                </button>
              </div>

              <button
                onClick={() => { onSelectCustomerTab('home'); setMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  activeCustomerTab === 'home' ? 'bg-emerald-500 text-stone-950 font-black' : 'bg-stone-950 text-stone-300 border border-stone-800'
                }`}
              >
                <Utensils className="w-4 h-4 text-emerald-400" />
                <span>Home</span>
              </button>

              <button
                onClick={() => { onSelectCustomerTab('menu'); setMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  activeCustomerTab === 'menu' ? 'bg-emerald-500 text-stone-950 font-black' : 'bg-stone-950 text-stone-300 border border-stone-800'
                }`}
              >
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <span>Products / Meals Menu</span>
              </button>

              <button
                onClick={() => { onSelectCustomerTab('plan_builder'); setMobileMenuOpen(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  activeCustomerTab === 'plan_builder' ? 'bg-emerald-500 text-stone-950 font-black' : 'bg-stone-950 text-stone-300 border border-stone-800'
                }`}
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Diet Plan Builder</span>
              </button>

              {onOpenDirectTracking && (
                <button
                  onClick={() => { onOpenDirectTracking(); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold bg-stone-950 text-stone-300 flex items-center gap-2 border border-stone-800"
                >
                  <Truck className="w-4 h-4 text-cyan-400" />
                  <span>Track Orders</span>
                </button>
              )}

              {onOpenCart && (
                <button
                  onClick={() => { onOpenCart(); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold bg-stone-950 text-stone-300 flex items-center gap-2 border border-stone-800"
                >
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                  <span>Cart ({cartItemsCount} items)</span>
                </button>
              )}

              {currentUser ? (
                <button
                  onClick={() => { onSelectCustomerTab('dashboard'); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center gap-2"
                >
                  <User className="w-4 h-4 text-emerald-400" />
                  <span>My Account & Dashboard</span>
                </button>
              ) : (
                <button
                  onClick={() => { onOpenAuthModal(); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-black bg-emerald-500 text-stone-950 flex items-center gap-2"
                >
                  <User className="w-4 h-4" />
                  <span>Customer Sign In / Sign Up</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {onOpenEmployeeLogin && (
                <div className="pb-2 border-b border-stone-800">
                  <button
                    onClick={() => {
                      onOpenEmployeeLogin();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full bg-amber-500 text-stone-950 font-black p-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md"
                  >
                    <Briefcase className="w-4 h-4" />
                    <span>Staff Login</span>
                  </button>
                </div>
              )}

              {onOpenSRS && (
                <div className="pb-2 border-b border-stone-800">
                  <button
                    onClick={() => {
                      onOpenSRS();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black p-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md"
                  >
                    <FileText className="w-4 h-4" />
                    <span>📄 View & Download SRS (Word Document)</span>
                  </button>
                </div>
              )}

              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-stone-400 mb-2 pt-2">Switch ERP Perspective</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['customer', 'mess_customer', 'chef', 'swiggy_zomato', 'md', 'nutritionist', 'trainer', 'delivery', 'pos', 'bakery_fmcg'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        onRoleChange(r);
                        setMobileMenuOpen(false);
                      }}
                      className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border text-left ${currentRole === r
                        ? 'bg-emerald-500 text-stone-950 border-emerald-500'
                        : 'bg-stone-950 text-stone-300 border-stone-800'
                        }`}
                    >
                      {roleLabels[r].icon}
                      <span>{roleLabels[r].title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
};
