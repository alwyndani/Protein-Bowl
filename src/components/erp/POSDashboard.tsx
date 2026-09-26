import React, { useState, useMemo } from 'react';
import { 
  POSItem, 
  POSCartItem, 
  POSTransaction, 
  POSCashDrawerShift, 
  CloudKitchenBranch,
  KitchenBranchId,
  StaffUserAccount
} from '../../types';
import { INITIAL_POS_ITEMS, INITIAL_POS_TRANSACTIONS, INITIAL_POS_SHIFTS } from '../../data/mockPOSData';
import { CLOUD_KITCHEN_BRANCHES } from '../../data/cloudKitchensData';
import { 
  Calculator, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  ShoppingBag, 
  Utensils, 
  Clock, 
  CheckCircle2, 
  Printer, 
  QrCode, 
  CreditCard, 
  DollarSign, 
  Layers, 
  Building2, 
  MapPin, 
  PauseCircle, 
  PlayCircle, 
  RotateCcw, 
  Sparkles, 
  FileText, 
  ArrowRight, 
  Check, 
  X, 
  Flame, 
  AlertCircle, 
  Smartphone, 
  Calendar, 
  Sliders, 
  Receipt,
  User,
  Phone,
  ShieldCheck,
  TrendingUp,
  Tag,
  Zap,
  Coffee
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface POSDashboardProps {
  branches?: CloudKitchenBranch[];
  selectedBranchId?: KitchenBranchId;
  onSelectBranch?: (branchId: KitchenBranchId) => void;
  currentUser?: StaffUserAccount;
}

export const POSDashboard: React.FC<POSDashboardProps> = ({
  branches = CLOUD_KITCHEN_BRANCHES,
  selectedBranchId = 'all',
  onSelectBranch = (_branchId: KitchenBranchId) => {},
  currentUser
}) => {
  // Navigation tabs within POS module
  const [activeTab, setActiveTab] = useState<'terminal' | 'ledger' | 'drawer' | 'multi-outlet'>('terminal');

  // Multi-outlet active selection for POS (can be a specific outlet or 'all')
  const [activeOutletId, setActiveOutletId] = useState<string>(
    selectedBranchId !== 'all' ? selectedBranchId : (branches[0]?.id || 'kochi')
  );

  // Master Lists State
  const [menuItems, setMenuItems] = useState<POSItem[]>(INITIAL_POS_ITEMS);
  const [transactions, setTransactions] = useState<POSTransaction[]>(INITIAL_POS_TRANSACTIONS);
  const [shifts, setShifts] = useState<POSCashDrawerShift[]>(INITIAL_POS_SHIFTS);
  const [heldOrders, setHeldOrders] = useState<{ id: string; name: string; time: string; items: POSCartItem[] }[]>([]);

  // Current Active Outlet Object
  const currentOutlet = useMemo(() => {
    return branches.find(b => b.id === activeOutletId) || branches[0] || {
      id: 'kochi',
      name: 'NutriFit Cloud Kitchen – Kochi Central HQ',
      city: 'Kochi',
      address: 'Plot 12, Seaport-Airport Road, Kakkanad, Kochi',
      fssaiNumber: 'FSSAI-KOC-11322004000452',
      phone: '+91 484 298 7120'
    };
  }, [branches, activeOutletId]);

  // Terminal Billing State
  const [cart, setCart] = useState<POSCartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderType, setOrderType] = useState<'takeaway' | 'dine_in' | 'counter_express'>('takeaway');
  const [customerName, setCustomerName] = useState<string>('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState<string>('+91 98470 11223');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [applyPackagingCharge, setApplyPackagingCharge] = useState<boolean>(true);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [orderNotes, setOrderNotes] = useState<string>('');

  // Payment Tender State
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'card' | 'split'>('upi');
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitUpi, setSplitUpi] = useState<number>(0);
  const [showUpiQrModal, setShowUpiQrModal] = useState<boolean>(false);
  const [showReceiptModal, setShowReceiptModal] = useState<POSTransaction | null>(null);
  const [kotNotification, setKotNotification] = useState<string | null>(null);

  // Cash Drawer Register State
  const currentShift = shifts.find(s => s.outletId === activeOutletId && s.status === 'open') || shifts[0];
  const [cashDropAmount, setCashDropAmount] = useState<string>('');
  const [showCloseShiftModal, setShowCloseShiftModal] = useState<boolean>(false);
  const [countedCash, setCountedCash] = useState<string>('');

  // Ledger Filter State
  const [ledgerOutletFilter, setLedgerOutletFilter] = useState<string>('all');
  const [ledgerDateFilter, setLedgerDateFilter] = useState<string>('all');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');

  // Filtered Menu Items
  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map(m => m.category)));
    return ['All', ...cats];
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat = selectedCategory === 'All' || item.category === selectedCategory;
      const matchQuery = !searchQuery || 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.barcode && item.barcode.includes(searchQuery));
      return matchCat && matchQuery;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Cart Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  }, [cart]);

  const packagingFee = useMemo(() => {
    if (!applyPackagingCharge || orderType === 'dine_in' || cart.length === 0) return 0;
    return 20; // standard eco meal box packaging
  }, [applyPackagingCharge, orderType, cart]);

  const taxGst = useMemo(() => {
    return Math.round((subtotal * 0.05) * 100) / 100; // 5% GST
  }, [subtotal]);

  const grandTotal = useMemo(() => {
    const total = subtotal + packagingFee + taxGst - discountAmount;
    return Math.max(0, Math.round(total * 100) / 100);
  }, [subtotal, packagingFee, taxGst, discountAmount]);

  const changeDue = useMemo(() => {
    if (paymentMode === 'cash' && cashTendered > grandTotal) {
      return Math.round((cashTendered - grandTotal) * 100) / 100;
    }
    return 0;
  }, [paymentMode, cashTendered, grandTotal]);

  // Add Item to Cart
  const handleAddToCart = (item: POSItem) => {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === item.id);
      if (existing) {
        return prev.map(ci => ci.item.id === item.id 
          ? { ...ci, quantity: ci.quantity + 1, lineTotal: (ci.quantity + 1) * ci.unitPrice }
          : ci
        );
      }
      return [...prev, {
        item,
        quantity: 1,
        unitPrice: item.price,
        lineTotal: item.price
      }];
    });
  };

  // Modify Quantity
  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      return prev.map(ci => {
        if (ci.item.id !== itemId) return ci;
        const newQty = ci.quantity + delta;
        if (newQty <= 0) return null;
        return {
          ...ci,
          quantity: newQty,
          lineTotal: newQty * ci.unitPrice
        };
      }).filter(Boolean) as POSCartItem[];
    });
  };

  // Remove Item
  const handleRemoveFromCart = (itemId: string) => {
    setCart(prev => prev.filter(ci => ci.item.id !== itemId));
  };

  // Hold Current Cart
  const handleHoldCart = () => {
    if (cart.length === 0) return;
    const holdId = `HOLD-${Math.floor(100 + Math.random() * 900)}`;
    setHeldOrders(prev => [
      ...prev,
      {
        id: holdId,
        name: customerName || 'Held Customer',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        items: [...cart]
      }
    ]);
    setCart([]);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('+91 98470 11223');
  };

  // Recall Held Cart
  const handleRecallCart = (holdId: string) => {
    const found = heldOrders.find(h => h.id === holdId);
    if (!found) return;
    setCart(found.items);
    setCustomerName(found.name);
    setHeldOrders(prev => prev.filter(h => h.id !== holdId));
  };

  // Fire KOT to Kitchen
  const handleFireKOT = () => {
    if (cart.length === 0) return;
    const kotNo = `KOT-${Math.floor(10 + Math.random() * 90)}`;
    setKotNotification(`🔥 ${kotNo} successfully sent to ${currentOutlet.name} Kitchen Display System!`);
    setTimeout(() => setKotNotification(null), 4000);
  };

  // Complete & Punch Transaction
  const handlePunchOrder = () => {
    if (cart.length === 0) return;

    const receiptNo = `POS-${activeOutletId.toUpperCase().slice(0, 3)}-${Math.floor(10000 + Math.random() * 90000)}`;
    const kotNo = `KOT-${Math.floor(10 + Math.random() * 90)}`;

    const newTx: POSTransaction = {
      id: `pos-tx-${Date.now()}`,
      receiptNumber: receiptNo,
      kotNumber: kotNo,
      outletId: activeOutletId,
      outletName: currentOutlet.name,
      orderType,
      customerName: customerName || 'Walk-in Guest',
      customerPhone: customerPhone || '+91 98470 11223',
      tableNumber: orderType === 'dine_in' ? (tableNumber || 'Table 1') : undefined,
      items: [...cart],
      subtotal,
      taxGst,
      discount: discountAmount,
      packagingCharge: packagingFee,
      totalAmount: grandTotal,
      paymentMode,
      paymentDetails: {
        cashTendered: paymentMode === 'cash' ? (cashTendered || grandTotal) : undefined,
        changeReturned: paymentMode === 'cash' ? changeDue : undefined,
        upiRef: paymentMode === 'upi' ? `UPI-OK${Math.floor(100000 + Math.random() * 900000)}` : undefined,
        cardLast4: paymentMode === 'card' ? '8812' : undefined,
        splitCashAmount: paymentMode === 'split' ? splitCash : undefined,
        splitUpiAmount: paymentMode === 'split' ? splitUpi : undefined
      },
      status: 'completed',
      cashierName: currentUser?.name || 'POS Lead Cashier',
      cashierId: currentUser?.id || 'staff-pos-1',
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
      notes: orderNotes || undefined
    };

    // Update transactions list
    setTransactions(prev => [newTx, ...prev]);

    // Update shift drawer cash
    setShifts(prev => prev.map(s => {
      if (s.outletId !== activeOutletId || s.status !== 'open') return s;
      return {
        ...s,
        cashSalesTotal: s.cashSalesTotal + (paymentMode === 'cash' ? grandTotal : paymentMode === 'split' ? splitCash : 0),
        upiSalesTotal: s.upiSalesTotal + (paymentMode === 'upi' ? grandTotal : paymentMode === 'split' ? splitUpi : 0),
        cardSalesTotal: s.cardSalesTotal + (paymentMode === 'card' ? grandTotal : 0),
        expectedCashInDrawer: s.expectedCashInDrawer + (paymentMode === 'cash' ? grandTotal : paymentMode === 'split' ? splitCash : 0)
      };
    }));

    // Trigger celebration & open receipt modal
    confetti({ particleCount: 50, spread: 60 });
    setShowReceiptModal(newTx);

    // Reset cart
    setCart([]);
    setDiscountAmount(0);
    setCashTendered(0);
    setOrderNotes('');
    setCustomerName('Walk-in Customer');
  };

  // Perform Cash Drop
  const handleCashDrop = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(cashDropAmount);
    if (!amount || amount <= 0) return;

    setShifts(prev => prev.map(s => {
      if (s.outletId !== activeOutletId || s.status !== 'open') return s;
      return {
        ...s,
        cashDropOut: s.cashDropOut + amount,
        expectedCashInDrawer: s.expectedCashInDrawer - amount
      };
    }));
    setCashDropAmount('');
    alert(`₹${amount} safely dropped into Outlet Drop Safe with MD Audit log.`);
  };

  // Close Shift & Generate Z-Report
  const handleCloseShift = () => {
    const counted = Number(countedCash) || currentShift.expectedCashInDrawer;
    const diff = counted - currentShift.expectedCashInDrawer;

    setShifts(prev => prev.map(s => {
      if (s.id !== currentShift.id) return s;
      return {
        ...s,
        status: 'closed',
        shiftEndTime: new Date().toISOString().replace('T', ' ').slice(0, 16),
        actualCashCounted: counted,
        cashDifference: diff
      };
    }));
    setShowCloseShiftModal(false);
    alert(`Shift for ${currentOutlet.name} closed successfully! Z-Report generated.`);
  };

  // Filtered Transactions for Ledger
  const filteredLedgerTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchOutlet = ledgerOutletFilter === 'all' || t.outletId === ledgerOutletFilter;
      const matchSearch = !ledgerSearch || 
        t.receiptNumber.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        t.customerName.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        t.customerPhone.includes(ledgerSearch);
      return matchOutlet && matchSearch;
    });
  }, [transactions, ledgerOutletFilter, ledgerSearch]);

  return (
    <div className="space-y-6">
      {/* KOT Notification Toast */}
      {kotNotification && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-950 text-emerald-200 border border-emerald-500 rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3 animate-bounce">
          <Zap className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-sm">{kotNotification}</span>
        </div>
      )}

      {/* POS Top Control Bar & Multi-Outlet Selector */}
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-xl text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-white">
                  Statewide Cloud Kitchen Point of Sale (POS)
                </h1>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Live Billing Active
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Fast Counter Billing, Table KOT, Unified QR Payments & Shift Cash Drawer across all Kerala Outlets
              </p>
            </div>
          </div>

          {/* Outlet Switcher & Cashier Profile */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Active Outlet Selector */}
            <div className="flex items-center gap-2 bg-stone-950 border border-stone-700 rounded-2xl px-3.5 py-2">
              <MapPin className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-[9px] font-black uppercase tracking-wider text-stone-400">Current Outlet Terminal</div>
                <select
                  value={activeOutletId}
                  onChange={(e) => {
                    setActiveOutletId(e.target.value);
                    onSelectBranch(e.target.value as KitchenBranchId);
                  }}
                  className="bg-transparent text-xs font-bold text-amber-300 focus:outline-hidden cursor-pointer"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id} className="bg-stone-900 text-white">
                      📍 {b.name} ({b.city})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cashier Badge */}
            <div className="flex items-center gap-2.5 bg-stone-950/70 border border-stone-800 rounded-2xl px-3.5 py-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                POS
              </div>
              <div className="text-left">
                <div className="text-[10px] font-black text-stone-400 uppercase">Cashier on Shift</div>
                <div className="text-xs font-bold text-stone-200">{currentUser?.name || 'Anjana Ramesh (POS Lead)'}</div>
              </div>
            </div>

            {/* Printer & KDS Status */}
            <div className="hidden sm:flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl px-3 py-2 text-emerald-400 text-xs font-medium">
              <Printer className="w-4 h-4" />
              <span>80mm Thermal Ready</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-stone-800/80">
          {[
            { id: 'terminal', label: '🛒 Live Billing & KOT Terminal', icon: <Calculator className="w-4 h-4" /> },
            { id: 'ledger', label: '📋 Daily Sales & Receipts Ledger', icon: <FileText className="w-4 h-4" /> },
            { id: 'drawer', label: '💵 Cash Drawer & Shift Tally', icon: <DollarSign className="w-4 h-4" /> },
            { id: 'multi-outlet', label: '🏢 Statewide Multi-Outlet Matrix', icon: <Building2 className="w-4 h-4" /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-xs transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-stone-800/60 text-stone-300 hover:bg-stone-800 hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIVE BILLING & COUNTER POS TERMINAL                               */}
      {/* ========================================================================= */}
      {activeTab === 'terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT 7 COLS: Menu Catalog & Categories */}
          <div className="lg:col-span-7 space-y-4">
            {/* Category Filter Chips & Search */}
            <div className="bg-white rounded-3xl p-4 border border-stone-200 shadow-sm space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search dish by name, SKU (e.g. BOWL-CHK) or Barcode scan..."
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-2xl text-sm font-medium focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategory === cat
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 max-h-[640px] overflow-y-auto pr-1">
              {filteredMenuItems.map(item => {
                const inCart = cart.find(ci => ci.item.id === item.id);
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center ${
                            item.isVeg ? 'border-emerald-600' : 'border-rose-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              item.isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                            }`} />
                          </span>
                          <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider">{item.sku}</span>
                        </div>
                        <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          ₹{item.price}
                        </span>
                      </div>

                      <h4 className="font-bold text-stone-900 text-xs mt-2 line-clamp-2 leading-tight">
                        {item.name}
                      </h4>

                      {/* Macros Tag */}
                      <div className="flex items-center gap-2 text-[10px] font-bold text-stone-500 mt-2 bg-stone-50 p-1.5 rounded-lg">
                        <span className="text-emerald-700">{item.proteinG}g Protein</span>
                        <span>•</span>
                        <span>{item.calories} kcal</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between">
                      <span className="text-[10px] text-stone-400 font-medium">⚡ {item.prepTimeMins}m prep</span>
                      
                      {inCart ? (
                        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-xl p-0.5">
                          <button
                            onClick={() => handleUpdateQuantity(item.id, -1)}
                            className="w-6 h-6 rounded-lg bg-white text-indigo-700 font-black text-xs flex items-center justify-center shadow-xs"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-black text-xs text-indigo-900 px-1">{inCart.quantity}</span>
                          <button
                            onClick={() => handleUpdateQuantity(item.id, 1)}
                            className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-xs"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddToCart(item)}
                          className="flex items-center gap-1 bg-stone-900 hover:bg-indigo-600 text-white px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT 5 COLS: Dynamic Cart & Live Billing Panel */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-md space-y-4">
              {/* Order Type Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-2xl">
                {[
                  { id: 'takeaway', label: '🛍️ Takeaway' },
                  { id: 'dine_in', label: '🍽️ Dine-In' },
                  { id: 'counter_express', label: '⚡ Express' }
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => setOrderType(type.id as any)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${
                      orderType === type.id
                        ? 'bg-white text-stone-900 shadow-sm'
                        : 'text-stone-500 hover:text-stone-900'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              {/* Customer & Table Info */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">Customer Mobile</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+91 Mobile Number"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-800 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">
                    {orderType === 'dine_in' ? 'Table No / Token' : 'Customer Name'}
                  </label>
                  <input
                    type="text"
                    value={orderType === 'dine_in' ? tableNumber : customerName}
                    onChange={(e) => orderType === 'dine_in' ? setTableNumber(e.target.value) : setCustomerName(e.target.value)}
                    placeholder={orderType === 'dine_in' ? 'e.g. Table T-04' : 'Name'}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-800 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Running Cart Items List */}
              <div className="border-t border-b border-stone-100 py-2.5 max-h-[220px] overflow-y-auto space-y-2">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-stone-400">
                    <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-bold">Cart is empty</p>
                    <p className="text-[11px]">Select items from menu or scan barcode</p>
                  </div>
                ) : (
                  cart.map(ci => (
                    <div key={ci.item.id} className="flex items-center justify-between gap-2 p-2 bg-stone-50 rounded-xl text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-stone-900 truncate">{ci.item.name}</div>
                        <div className="text-[10px] text-stone-500">₹{ci.unitPrice} × {ci.quantity}</div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleUpdateQuantity(ci.item.id, -1)}
                          className="w-5 h-5 rounded bg-white text-stone-700 font-black flex items-center justify-center border border-stone-200"
                        >
                          -
                        </button>
                        <span className="font-black text-xs px-1">{ci.quantity}</span>
                        <button
                          onClick={() => handleUpdateQuantity(ci.item.id, 1)}
                          className="w-5 h-5 rounded bg-white text-stone-700 font-black flex items-center justify-center border border-stone-200"
                        >
                          +
                        </button>
                      </div>

                      <div className="font-black text-stone-900 min-w-[50px] text-right">
                        ₹{ci.lineTotal}
                      </div>

                      <button
                        onClick={() => handleRemoveFromCart(ci.item.id)}
                        className="text-stone-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Bill Financials Breakdown */}
              <div className="space-y-1.5 text-xs text-stone-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-bold text-stone-800">₹{subtotal.toFixed(2)}</span>
                </div>
                {orderType !== 'dine_in' && (
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyPackagingCharge}
                        onChange={(e) => setApplyPackagingCharge(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>Eco Meal Box Packaging</span>
                    </label>
                    <span className="font-bold text-stone-800">₹{packagingFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>GST (5% CGST+SGST)</span>
                  <span className="font-bold text-stone-800">₹{taxGst.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Loyalty / Special Discount</span>
                    <span className="font-bold">-₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-stone-900 pt-2 border-t border-stone-200">
                  <span>Total Bill Amount</span>
                  <span className="text-base text-indigo-700">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Mode Selection */}
              <div className="space-y-2 pt-2 border-t border-stone-100">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Payment Tender Mode</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'upi', label: '📱 UPI QR', icon: <QrCode className="w-3.5 h-3.5" /> },
                    { id: 'cash', label: '💵 Cash', icon: <DollarSign className="w-3.5 h-3.5" /> },
                    { id: 'card', label: '💳 Card', icon: <CreditCard className="w-3.5 h-3.5" /> },
                    { id: 'split', label: '🔀 Split', icon: <Layers className="w-3.5 h-3.5" /> }
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setPaymentMode(m.id as any)}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl text-[11px] font-bold transition-all ${
                        paymentMode === m.id
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      {m.icon}
                      <span className="mt-1">{m.label}</span>
                    </button>
                  ))}
                </div>

                {/* Cash Tender Calculation Field */}
                {paymentMode === 'cash' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900">Cash Received:</span>
                      <input
                        type="number"
                        value={cashTendered || ''}
                        onChange={(e) => setCashTendered(Number(e.target.value))}
                        placeholder={`Exact ₹${grandTotal}`}
                        className="w-28 px-2 py-1 bg-white border border-amber-300 rounded-lg font-black text-right text-stone-900"
                      />
                    </div>
                    {/* Fast Presets */}
                    <div className="flex items-center gap-1">
                      {[grandTotal, 200, 500, 1000, 2000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setCashTendered(val)}
                          className="px-2 py-0.5 bg-white hover:bg-amber-100 border border-amber-200 rounded text-[10px] font-bold text-stone-800"
                        >
                          ₹{val}
                        </button>
                      ))}
                    </div>
                    {changeDue > 0 && (
                      <div className="flex justify-between font-black text-emerald-800 pt-1 border-t border-amber-200">
                        <span>Change to Return:</span>
                        <span className="text-sm">₹{changeDue.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* UPI QR Instant Preview button */}
                {paymentMode === 'upi' && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-indigo-600" />
                      <div>
                        <div className="font-bold text-indigo-900">Unified Dynamic UPI QR</div>
                        <div className="text-[10px] text-indigo-700">VPA: nutrifit.{activeOutletId}@okhdfc</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowUpiQrModal(true)}
                      className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg font-bold text-[10px]"
                    >
                      Show QR
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons: KOT, Hold, Punch */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={handlePunchOrder}
                  disabled={cart.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                >
                  <Receipt className="w-5 h-5" />
                  <span>Punch Order & Print Thermal Tax Receipt (₹{grandTotal})</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleFireKOT}
                    disabled={cart.length === 0}
                    className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Fire KOT to Kitchen</span>
                  </button>

                  <button
                    onClick={handleHoldCart}
                    disabled={cart.length === 0}
                    className="bg-stone-800 hover:bg-stone-900 disabled:opacity-50 text-white py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <PauseCircle className="w-4 h-4" />
                    <span>Hold Current Bill</span>
                  </button>
                </div>
              </div>

              {/* Held Orders List */}
              {heldOrders.length > 0 && (
                <div className="mt-3 pt-3 border-t border-stone-200">
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                    Held Orders ({heldOrders.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {heldOrders.map(h => (
                      <button
                        key={h.id}
                        onClick={() => handleRecallCart(h.id)}
                        className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold flex items-center gap-1 border border-amber-300"
                      >
                        <PlayCircle className="w-3 h-3 text-amber-700" />
                        <span>{h.name} ({h.time})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DAILY SALES & RECEIPTS LEDGER                                     */}
      {/* ========================================================================= */}
      {activeTab === 'ledger' && (
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-md space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-stone-900">POS Daily Sales & Receipt Records</h3>
              <p className="text-xs text-stone-500">Itemized audit logs for counter walk-ins and takeaway orders across all state outlets</p>
            </div>

            {/* Ledger Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={ledgerOutletFilter}
                onChange={(e) => setLedgerOutletFilter(e.target.value)}
                className="px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800"
              >
                <option value="all">🏢 All State Outlets</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>📍 {b.name}</option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Receipt / Customer / Phone..."
                  className="pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-100/80 text-stone-600 font-bold border-b border-stone-200">
                  <th className="py-3 px-3">Receipt / KOT</th>
                  <th className="py-3 px-3">Outlet Location</th>
                  <th className="py-3 px-3">Order Type</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Items Ordered</th>
                  <th className="py-3 px-3">Payment</th>
                  <th className="py-3 px-3 text-right">Total Amount</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredLedgerTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-stone-50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-black text-indigo-700">{tx.receiptNumber}</div>
                      <div className="text-[10px] text-stone-400 font-mono">{tx.kotNumber} • {tx.timestamp}</div>
                    </td>
                    <td className="py-3 px-3 font-medium text-stone-800">
                      <div className="truncate max-w-[140px]">{tx.outletName}</div>
                      <div className="text-[10px] text-stone-400 font-mono">Cashier: {tx.cashierName}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="capitalize font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md">
                        {tx.orderType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-stone-900">{tx.customerName}</div>
                      <div className="text-[10px] text-stone-500">{tx.customerPhone}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-stone-700 font-medium max-w-[200px] truncate">
                        {tx.items.map(i => `${i.quantity}x ${i.item.name}`).join(', ')}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        tx.paymentMode === 'upi' ? 'bg-indigo-100 text-indigo-800' :
                        tx.paymentMode === 'cash' ? 'bg-amber-100 text-amber-800' :
                        tx.paymentMode === 'card' ? 'bg-purple-100 text-purple-800' :
                        'bg-teal-100 text-teal-800'
                      }`}>
                        {tx.paymentMode}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-black text-stone-900 text-sm">
                      ₹{tx.totalAmount}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setShowReceiptModal(tx)}
                        className="p-1.5 rounded-lg bg-stone-100 hover:bg-indigo-50 text-indigo-700 hover:border-indigo-300 border border-stone-200 transition-all inline-flex items-center gap-1 text-[11px] font-bold"
                        title="View & Print Tax Receipt"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CASH DRAWER & SHIFT RECONCILIATION                                */}
      {/* ========================================================================= */}
      {activeTab === 'drawer' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Shift Cash Summary Cards */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Active Shift Register</div>
                  <h3 className="text-lg font-black text-stone-900">{currentOutlet.name}</h3>
                  <p className="text-xs text-stone-500">Shift Started: {currentShift.shiftStartTime} by {currentShift.cashierName}</p>
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-3 py-1 rounded-full border border-emerald-300">
                  Drawer Status: OPEN
                </span>
              </div>

              {/* Tally Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                  <div className="text-[10px] font-bold text-stone-500 uppercase">Opening Float</div>
                  <div className="text-lg font-black text-stone-900 mt-0.5">₹{currentShift.openingCashFloat}</div>
                </div>
                <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200">
                  <div className="text-[10px] font-bold text-amber-700 uppercase">Cash Sales</div>
                  <div className="text-lg font-black text-amber-900 mt-0.5">₹{currentShift.cashSalesTotal}</div>
                </div>
                <div className="bg-indigo-50 p-3.5 rounded-2xl border border-indigo-200">
                  <div className="text-[10px] font-bold text-indigo-700 uppercase">UPI Digital</div>
                  <div className="text-lg font-black text-indigo-900 mt-0.5">₹{currentShift.upiSalesTotal}</div>
                </div>
                <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase">Expected in Drawer</div>
                  <div className="text-lg font-black text-emerald-900 mt-0.5">₹{currentShift.expectedCashInDrawer}</div>
                </div>
              </div>

              {/* Total Shift Collections */}
              <div className="p-4 bg-stone-900 text-white rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xs text-stone-400">Total Shift Revenue (Cash + UPI + Card)</div>
                  <div className="text-2xl font-black text-emerald-400">
                    ₹{(currentShift.cashSalesTotal + currentShift.upiSalesTotal + currentShift.cardSalesTotal).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => setShowCloseShiftModal(true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all"
                >
                  Close Shift & Print Z-Report
                </button>
              </div>
            </div>
          </div>

          {/* Cash Drop & Safe Transfer Form */}
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-md space-y-4">
              <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Mid-Day Safe Cash Drop
              </h4>
              <p className="text-xs text-stone-500">
                Deposit surplus drawer cash into the encrypted cloud kitchen safe to maintain insurance threshold.
              </p>

              <form onSubmit={handleCashDrop} className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase">Drop Amount (₹)</label>
                  <input
                    type="number"
                    value={cashDropAmount}
                    onChange={(e) => setCashDropAmount(e.target.value)}
                    placeholder="e.g. 3000"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!cashDropAmount}
                  className="w-full bg-stone-900 hover:bg-indigo-600 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold text-xs transition-all"
                >
                  Confirm Cash Drop to Safe
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: STATEWIDE MULTI-OUTLET POS PERFORMANCE MATRIX                      */}
      {/* ========================================================================= */}
      {activeTab === 'multi-outlet' && (
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-md space-y-6">
          <div>
            <h3 className="text-lg font-black text-stone-900">Statewide Multi-Outlet POS Matrix</h3>
            <p className="text-xs text-stone-500">Consolidated live metrics for all retail and takeaway terminals operating in Kerala</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {branches.map(b => {
              const outletTxs = transactions.filter(t => t.outletId === b.id);
              const totalSales = outletTxs.reduce((sum, t) => sum + t.totalAmount, 0);
              const avgTicket = outletTxs.length > 0 ? Math.round(totalSales / outletTxs.length) : 0;

              return (
                <div key={b.id} className="bg-stone-50 rounded-2xl p-4 border border-stone-200 hover:border-indigo-300 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {b.city}
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold">● Active POS</span>
                  </div>

                  <h4 className="font-bold text-stone-900 text-sm mt-2">{b.name}</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">{b.address}</p>

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-stone-200">
                    <div>
                      <div className="text-[10px] text-stone-400 uppercase font-bold">Today Walk-in Sales</div>
                      <div className="text-base font-black text-stone-900">₹{totalSales.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-stone-400 uppercase font-bold">Avg Ticket Size</div>
                      <div className="text-base font-black text-indigo-700">₹{avgTicket}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActiveOutletId(b.id);
                      setActiveTab('terminal');
                      onSelectBranch(b.id as KitchenBranchId);
                    }}
                    className="w-full mt-3 bg-stone-900 hover:bg-indigo-600 text-white py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Launch Counter Terminal</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: THERMAL TAX RECEIPT PREVIEW (80mm STANDARD)                     */}
      {/* ========================================================================= */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 border border-stone-200 text-stone-900">
            {/* 80mm Receipt Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-stone-300">
              <div className="font-black text-base tracking-tight">NUTRIFIT CLOUD KITCHENS</div>
              <div className="text-[11px] font-bold text-stone-600">{showReceiptModal.outletName}</div>
              <div className="text-[10px] text-stone-500">{currentOutlet.address}</div>
              <div className="text-[10px] text-stone-500 font-mono">FSSAI: {currentOutlet.fssaiNumber}</div>
              <div className="text-[10px] text-stone-500 font-mono">GSTIN: 32AABCN9481Q1Z8</div>
            </div>

            {/* Receipt Meta */}
            <div className="text-[11px] space-y-0.5 text-stone-600 font-mono">
              <div className="flex justify-between">
                <span>Receipt: <strong className="text-stone-900">{showReceiptModal.receiptNumber}</strong></span>
                <span>KOT: <strong className="text-stone-900">{showReceiptModal.kotNumber}</strong></span>
              </div>
              <div className="flex justify-between">
                <span>Date: {showReceiptModal.timestamp}</span>
                <span>Type: <strong className="uppercase">{showReceiptModal.orderType}</strong></span>
              </div>
              <div className="flex justify-between">
                <span>Cashier: {showReceiptModal.cashierName}</span>
                {showReceiptModal.tableNumber && <span>{showReceiptModal.tableNumber}</span>}
              </div>
              <div>Customer: {showReceiptModal.customerName} ({showReceiptModal.customerPhone})</div>
            </div>

            {/* Itemized Table */}
            <div className="border-t border-b border-dashed border-stone-300 py-2.5 text-xs font-mono">
              <div className="flex justify-between font-bold border-b border-stone-200 pb-1 mb-1.5 text-[11px]">
                <span>ITEM</span>
                <span>QTY × RATE</span>
                <span>AMT</span>
              </div>
              {showReceiptModal.items.map((it, idx) => (
                <div key={idx} className="flex justify-between py-0.5 text-[11px]">
                  <span className="truncate max-w-[140px] font-medium">{it.item.name}</span>
                  <span className="text-stone-500">{it.quantity} × {it.unitPrice}</span>
                  <span className="font-bold">₹{it.lineTotal}</span>
                </div>
              ))}
            </div>

            {/* Totals Breakdown */}
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{showReceiptModal.subtotal.toFixed(2)}</span>
              </div>
              {showReceiptModal.packagingCharge > 0 && (
                <div className="flex justify-between">
                  <span>Eco Packaging:</span>
                  <span>₹{showReceiptModal.packagingCharge.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>GST (5% CGST+SGST):</span>
                <span>₹{showReceiptModal.taxGst.toFixed(2)}</span>
              </div>
              {showReceiptModal.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount:</span>
                  <span>-₹{showReceiptModal.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black pt-1.5 border-t border-dashed border-stone-300">
                <span>NET TOTAL:</span>
                <span>₹{showReceiptModal.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-stone-600 pt-1">
                <span>Payment Mode:</span>
                <span className="font-black uppercase">{showReceiptModal.paymentMode}</span>
              </div>
            </div>

            {/* Footer QR & Message */}
            <div className="text-center pt-2 border-t border-dashed border-stone-300 space-y-1 text-[10px] text-stone-500">
              <p className="font-bold text-stone-800">Scan QR for WhatsApp E-Bill & Nutrition Macros</p>
              <p>Thank you for choosing Healthy Living! Eat Clean, Stay Fit.</p>
            </div>

            {/* Modal Controls */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" />
                Print Receipt
              </button>
              <button
                onClick={() => setShowReceiptModal(null)}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DYNAMIC UPI QR POPUP                                            */}
      {/* ========================================================================= */}
      {showUpiQrModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xs w-full p-6 text-center shadow-2xl space-y-4 border border-stone-200">
            <h4 className="font-black text-stone-900 text-base">Scan to Pay via UPI</h4>
            <p className="text-xs text-stone-500">Use any UPI app (GPay, PhonePe, Paytm, CRED)</p>

            <div className="bg-stone-100 p-4 rounded-2xl inline-block border border-stone-300">
              {/* Simulated QR Visual */}
              <div className="w-48 h-48 bg-stone-900 rounded-xl flex flex-col items-center justify-center text-white p-3 space-y-2">
                <QrCode className="w-28 h-28 text-white" />
                <span className="text-[10px] font-mono tracking-widest text-emerald-400 font-bold">
                  ₹{grandTotal} • {currentOutlet.city.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="text-xs font-mono text-stone-700 font-bold">
              VPA: nutrifit.{activeOutletId}@okhdfc
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowUpiQrModal(false);
                  handlePunchOrder();
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-xs shadow-md"
              >
                Payment Received (Confirm)
              </button>
              <button
                onClick={() => setShowUpiQrModal(false)}
                className="px-3 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CLOSE SHIFT & Z-REPORT                                          */}
      {/* ========================================================================= */}
      {showCloseShiftModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-stone-200">
            <h4 className="font-black text-stone-900 text-base">Day-End Shift Closeout & Z-Report</h4>
            <p className="text-xs text-stone-500">Count the physical currency in drawer and reconcile with system register</p>

            <div className="space-y-2 text-xs bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <div className="flex justify-between">
                <span>Opening Cash Float:</span>
                <span className="font-bold">₹{currentShift.openingCashFloat}</span>
              </div>
              <div className="flex justify-between">
                <span>Cash Sales Today:</span>
                <span className="font-bold">₹{currentShift.cashSalesTotal}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>Mid-Day Cash Drops:</span>
                <span className="font-bold">-₹{currentShift.cashDropOut}</span>
              </div>
              <div className="flex justify-between font-black text-stone-900 pt-2 border-t border-stone-200 text-sm">
                <span>Expected Drawer Cash:</span>
                <span className="text-emerald-700">₹{currentShift.expectedCashInDrawer}</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Physical Cash Counted (₹)</label>
              <input
                type="number"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                placeholder={`e.g. ${currentShift.expectedCashInDrawer}`}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl font-black text-sm"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleCloseShift}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl font-bold text-xs shadow-md"
              >
                Sign-off & Print Z-Report
              </button>
              <button
                onClick={() => setShowCloseShiftModal(false)}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
