import React, { useState, useMemo } from 'react';
import { ALL_INVENTORY_ITEMS } from '../../data/inventoryDatabase';
import { INGREDIENT_NUTRITION_LIST } from '../../data/ingredientNutrition';
import { VendorPurchaseBill } from '../../types';
import { 
  Calculator, 
  Search, 
  Plus, 
  Edit3, 
  Check, 
  Scale, 
  Tag, 
  Trash2,
  X,
  PackageCheck,
  TrendingUp,
  Sparkles,
  Camera,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  DollarSign,
  Calendar,
  Building,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface SourcedIngredientEntry {
  id: string;
  name: string;
  category: string;
  purchasedQty: number; // e.g. 25
  unit: string; // e.g. 'kg', 'g', 'liters', 'ml', 'units'
  totalRatePaid: number; // e.g. 5000 (₹)
  baseUnitPrice: number; // Auto-calculated: totalRatePaid / purchasedQty
  supplier?: string;
  lastUpdated?: string;
  previousPrice?: number; // Historical unit price for rate comparison
  purchaseHistory?: {
    date: string;
    qty: number;
    totalPaid: number;
    unitPrice: number;
    invoiceNo: string;
    vendor: string;
  }[];
}

interface IngredientPriceCalculatorProps {
  compact?: boolean;
  onBillSavedToVendorLedger?: (bill: VendorPurchaseBill) => void;
}

export const IngredientPriceCalculator: React.FC<IngredientPriceCalculatorProps> = ({
  compact = false,
  onBillSavedToVendorLedger
}) => {
  // Master Sourced Ingredients List
  const [sourcedIngredients, setSourcedIngredients] = useState<SourcedIngredientEntry[]>(() => {
    const list: SourcedIngredientEntry[] = [];
    const nameSet = new Set<string>();

    // Seed from ALL_INVENTORY_ITEMS
    ALL_INVENTORY_ITEMS.forEach((item, index) => {
      const cleanName = item.name.trim();
      nameSet.add(cleanName.toLowerCase());
      
      const purchasedQty = item.reorderQty || 25;
      const baseUnitPrice = item.unitCost || 150;
      const totalRatePaid = Number((purchasedQty * baseUnitPrice).toFixed(2));
      const previousPrice = Number((baseUnitPrice * 0.93).toFixed(2)); // ~7% lower previously

      list.push({
        id: `ing-seed-${index}`,
        name: cleanName,
        category: item.category,
        purchasedQty,
        unit: item.unit,
        totalRatePaid,
        baseUnitPrice,
        supplier: item.supplier || 'Wholesale Sourcing Hub',
        lastUpdated: item.lastRestocked || '2026-07-23',
        previousPrice,
        purchaseHistory: [
          {
            date: '2026-06-15',
            qty: purchasedQty,
            totalPaid: Number((purchasedQty * previousPrice).toFixed(2)),
            unitPrice: previousPrice,
            invoiceNo: `INV-JUN-${100 + index}`,
            vendor: item.supplier || 'Wholesale Sourcing Hub'
          },
          {
            date: '2026-07-23',
            qty: purchasedQty,
            totalPaid: totalRatePaid,
            unitPrice: baseUnitPrice,
            invoiceNo: `INV-JUL-${200 + index}`,
            vendor: item.supplier || 'Wholesale Sourcing Hub'
          }
        ]
      });
    });

    return list.sort((a, b) => a.name.localeCompare(b.name));
  });

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Edit Modal / Inline Edit State
  const [editingItem, setEditingItem] = useState<SourcedIngredientEntry | null>(null);
  const [editQty, setEditQty] = useState<number>(10);
  const [editRate, setEditRate] = useState<number>(1500);

  // Add New Ingredient Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'Proteins',
    purchasedQty: 20,
    unit: 'kg',
    totalRatePaid: 4000,
    supplier: 'Kochi Wholesale Market'
  });

  // AI Purchase Bill Scanner Modal State
  const [showAiScannerModal, setShowAiScannerModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scannedBill, setScannedBill] = useState<{
    vendorName: string;
    invoiceNo: string;
    invoiceDate: string;
    paymentTerms: string;
    items: {
      itemName: string;
      category: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      totalPrice: number;
    }[];
  } | null>(null);

  // Sample Scanned Bills for AI Demonstration
  const sampleBills = [
    {
      title: '🥩 Kochi Fresh Meats Co. (Poultry & Meat Bill)',
      vendorName: 'Kochi Fresh Meats Co.',
      invoiceNo: 'INV-KFM-8820',
      invoiceDate: '2026-07-30',
      paymentTerms: 'Net 15 Days',
      items: [
        { itemName: 'Boneless Chicken Breast', category: 'Proteins', quantity: 50, unit: 'kg', unitPrice: 285, totalPrice: 14250 },
        { itemName: 'Mutton Curry Cut', category: 'Proteins', quantity: 20, unit: 'kg', unitPrice: 750, totalPrice: 15000 }
      ]
    },
    {
      title: '🌾 Palakkad Agro Group (Rice & Grains Bill)',
      vendorName: 'Palakkad Farmer Producer Group',
      invoiceNo: 'INV-PAG-9912',
      invoiceDate: '2026-07-29',
      paymentTerms: 'Net 30 Days',
      items: [
        { itemName: 'Kerala Matta Rice', category: 'Grains & Flours', quantity: 100, unit: 'kg', unitPrice: 52, totalPrice: 5200 },
        { itemName: 'Organic Whole Wheat Flour (Atta)', category: 'Grains & Flours', quantity: 50, unit: 'kg', unitPrice: 46, totalPrice: 2300 }
      ]
    },
    {
      title: '🥑 Nilgiri Green Produce (Fresh Vegetables Bill)',
      vendorName: 'Nilgiri Produce Co.',
      invoiceNo: 'INV-NGP-4011',
      invoiceDate: '2026-07-30',
      paymentTerms: 'Immediate Cash',
      items: [
        { itemName: 'Fresh Avocado (Hass)', category: 'Vegetables', quantity: 15, unit: 'kg', unitPrice: 220, totalPrice: 3300 },
        { itemName: 'Organic Spinach Leaves', category: 'Vegetables', quantity: 10, unit: 'kg', unitPrice: 80, totalPrice: 800 }
      ]
    }
  ];

  // Hidden file input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Trigger AI Bill Scanner Simulation
  const handleStartAiScan = (sampleBillIndex?: number) => {
    setIsScanning(true);
    setScanProgress(10);
    setScannedBill(null);

    const billTemplate = sampleBillIndex !== undefined ? sampleBills[sampleBillIndex] : sampleBills[0];

    const timer = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setIsScanning(false);
          setScannedBill({
            vendorName: billTemplate.vendorName,
            invoiceNo: billTemplate.invoiceNo,
            invoiceDate: billTemplate.invoiceDate,
            paymentTerms: billTemplate.paymentTerms,
            items: billTemplate.items.map((i) => ({ ...i }))
          });
          confetti({ particleCount: 40, spread: 60 });
          return 100;
        }
        return prev + 25;
      });
    }, 350);
  };

  // Confirm Scanned Bill & Save to Register
  const handleSaveScannedBill = () => {
    if (!scannedBill) return;

    let grandTotal = 0;

    // Update or Append Sourced Ingredients
    setSourcedIngredients((prev) => {
      const updated = [...prev];

      scannedBill.items.forEach((scannedItem) => {
        grandTotal += scannedItem.totalPrice;
        const index = updated.findIndex(
          (u) => u.name.toLowerCase().trim() === scannedItem.itemName.toLowerCase().trim()
        );

        const newHistoryRecord = {
          date: scannedBill.invoiceDate,
          qty: scannedItem.quantity,
          totalPaid: scannedItem.totalPrice,
          unitPrice: scannedItem.unitPrice,
          invoiceNo: scannedBill.invoiceNo,
          vendor: scannedBill.vendorName
        };

        if (index >= 0) {
          const oldUnitCost = updated[index].baseUnitPrice;
          updated[index] = {
            ...updated[index],
            purchasedQty: scannedItem.quantity,
            totalRatePaid: scannedItem.totalPrice,
            baseUnitPrice: scannedItem.unitPrice,
            previousPrice: oldUnitCost,
            supplier: scannedBill.vendorName,
            lastUpdated: scannedBill.invoiceDate,
            purchaseHistory: [newHistoryRecord, ...(updated[index].purchaseHistory || [])]
          };
        } else {
          updated.push({
            id: `ing-scanned-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            name: scannedItem.itemName,
            category: scannedItem.category,
            purchasedQty: scannedItem.quantity,
            unit: scannedItem.unit,
            totalRatePaid: scannedItem.totalPrice,
            baseUnitPrice: scannedItem.unitPrice,
            supplier: scannedBill.vendorName,
            lastUpdated: scannedBill.invoiceDate,
            previousPrice: scannedItem.unitPrice,
            purchaseHistory: [newHistoryRecord]
          });
        }
      });

      return updated;
    });

    // Notify Vendor Ledger callback if provided
    if (onBillSavedToVendorLedger) {
      const vendorBillObj: VendorPurchaseBill = {
        id: `bill-${Date.now()}`,
        vendorId: `vend-${scannedBill.vendorName.replace(/\s+/g, '-').toLowerCase()}`,
        vendorName: scannedBill.vendorName,
        invoiceNo: scannedBill.invoiceNo,
        invoiceDate: scannedBill.invoiceDate,
        totalAmount: grandTotal,
        amountPaid: scannedBill.paymentTerms === 'Immediate Cash' ? grandTotal : 0,
        pendingAmount: scannedBill.paymentTerms === 'Immediate Cash' ? 0 : grandTotal,
        paymentStatus: scannedBill.paymentTerms === 'Immediate Cash' ? 'Paid' : 'Pending',
        paymentTerms: scannedBill.paymentTerms,
        itemsList: scannedBill.items.map((it) => ({
          itemName: it.itemName,
          category: it.category,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice
        })),
        isAiProcessed: true
      };
      onBillSavedToVendorLedger(vendorBillObj);
    }

    setShowAiScannerModal(false);
    confetti({ particleCount: 70, spread: 90 });
    alert(`Successfully processed Bill ${scannedBill.invoiceNo} from ${scannedBill.vendorName}! Added items to Stock Register and logged to Vendor Ledger.`);
  };

  // Filtered List
  const filteredList = useMemo(() => {
    return sourcedIngredients.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (item.supplier && item.supplier.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [sourcedIngredients, searchQuery, selectedCategory]);

  const categories = ['All', 'Proteins', 'Grains & Flours', 'Dairy', 'Vegetables', 'Spices & Condiments', 'Grocery & Dry Stores', 'Packaging'];

  // Handle Save Edit
  const handleSaveEdit = () => {
    if (!editingItem || editQty <= 0 || editRate < 0) return;

    const baseUnitPrice = Number((editRate / editQty).toFixed(2));

    setSourcedIngredients((prev) =>
      prev.map((item) => {
        if (item.id === editingItem.id) {
          return {
            ...item,
            purchasedQty: editQty,
            totalRatePaid: editRate,
            previousPrice: item.baseUnitPrice,
            baseUnitPrice,
            lastUpdated: '2026-07-30'
          };
        }
        return item;
      })
    );

    setEditingItem(null);
    confetti({ particleCount: 30, spread: 50 });
  };

  // Handle Add New Ingredient Entry
  const handleAddNewIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim() || newItem.purchasedQty <= 0 || newItem.totalRatePaid < 0) return;

    const baseUnitPrice = Number((newItem.totalRatePaid / newItem.purchasedQty).toFixed(2));

    const newEntry: SourcedIngredientEntry = {
      id: `ing-custom-${Date.now()}`,
      name: newItem.name.trim(),
      category: newItem.category,
      purchasedQty: Number(newItem.purchasedQty),
      unit: newItem.unit,
      totalRatePaid: Number(newItem.totalRatePaid),
      baseUnitPrice,
      supplier: newItem.supplier || 'Procurement Direct',
      lastUpdated: '2026-07-30',
      previousPrice: baseUnitPrice,
      purchaseHistory: [
        {
          date: '2026-07-30',
          qty: Number(newItem.purchasedQty),
          totalPaid: Number(newItem.totalRatePaid),
          unitPrice: baseUnitPrice,
          invoiceNo: `INV-MANUAL-${Date.now().toString().slice(-4)}`,
          vendor: newItem.supplier || 'Procurement Direct'
        }
      ]
    };

    setSourcedIngredients([newEntry, ...sourcedIngredients]);
    setShowAddModal(false);
    confetti({ particleCount: 50, spread: 70 });

    setNewItem({
      name: '',
      category: 'Proteins',
      purchasedQty: 20,
      unit: 'kg',
      totalRatePaid: 4000,
      supplier: 'Kochi Wholesale Market'
    });
  };

  // Handle Delete Entry
  const handleDeleteEntry = (id: string) => {
    setSourcedIngredients((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className={`space-y-6 ${compact ? 'p-1' : 'p-6 bg-white rounded-3xl border border-stone-200 shadow-sm'}`}>
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900 text-white p-6 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-amber-900/50">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-950/80 px-3 py-1 rounded-full border border-amber-700/60 inline-flex items-center gap-1.5">
            <PackageCheck className="w-3.5 h-3.5" />
            <span>Stock Entry & Purchase Ledger</span>
          </span>
          <h2 className="text-xl sm:text-2xl font-black mt-2">
            Stock Entry, AI Purchase Bill Scanner & Rate Comparison
          </h2>
          <p className="text-xs text-stone-300 mt-1 max-w-2xl leading-relaxed">
            Set baseline market prices for initial dish costing. Upload scanned supplier bills using AI to auto-extract purchase line items, verify fields, and maintain historical rate trends for quarterly dish pricing updates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowAiScannerModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-4 py-2.5 rounded-2xl text-xs transition-all shadow-lg flex items-center gap-2 shrink-0 border border-emerald-400/40"
          >
            <Camera className="w-4 h-4 text-emerald-200" />
            <span>Scan Bill with AI</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-black px-4 py-2.5 rounded-2xl text-xs transition-all shadow-lg flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Manual Stock Entry</span>
          </button>
        </div>
      </div>

      {/* Rate Inflation / Dish Pricing Advisory Widget */}
      <div className="bg-amber-50/90 border border-amber-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/20 text-amber-900 rounded-xl">
            <TrendingUp className="w-5 h-5 text-amber-800" />
          </div>
          <div>
            <h4 className="font-extrabold text-amber-950">Quarterly Sourcing Rate Trend Analysis</h4>
            <p className="text-stone-600 text-[11px] mt-0.5">
              Proteins & Poultry unit rates increased <strong>+6.8%</strong> this quarter. Average dish raw material cost rose by <strong>+₹12.40/portion</strong>.
            </p>
          </div>
        </div>

        <span className="text-[10px] font-extrabold text-amber-900 bg-amber-200/80 px-3 py-1.5 rounded-xl whitespace-nowrap self-start sm:self-auto border border-amber-300">
          Recommended Quarterly Dish Price Revision: +5% to +8%
        </span>
      </div>

      {/* Controls Bar: Search & Category Pills */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search raw ingredient, category, or supplier..."
            className="w-full bg-white border border-stone-300 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-stone-900 outline-none focus:border-amber-700"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all border ${
                selectedCategory === cat
                  ? 'bg-amber-900 text-amber-100 border-amber-900 shadow-xs'
                  : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Ingredient Master Price & Quantity Table */}
      <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-900 text-stone-200 font-bold uppercase text-[10px] sticky top-0 z-10">
              <tr>
                <th className="p-3.5">Raw Ingredient</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5 text-center">Purchased Qty</th>
                <th className="p-3.5 text-center">Total Paid (₹)</th>
                <th className="p-3.5 text-center">Base Unit Price (₹/Unit)</th>
                <th className="p-3.5 text-center">Quarterly Rate Comparison</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium text-stone-800">
              {filteredList.map((item) => {
                const isEditingThis = editingItem?.id === item.id;
                const prevPrice = item.previousPrice || (item.baseUnitPrice * 0.95);
                const priceDiff = item.baseUnitPrice - prevPrice;
                const diffPct = prevPrice > 0 ? ((priceDiff / prevPrice) * 100).toFixed(1) : '0.0';

                return (
                  <tr key={item.id} className="hover:bg-amber-50/40 transition-colors">
                    {/* Name & Supplier */}
                    <td className="p-3.5">
                      <div className="font-extrabold text-stone-900 text-sm">{item.name}</div>
                      <div className="text-[11px] text-stone-500">
                        Supplier: <strong className="text-stone-700">{item.supplier || 'Market Sourcing'}</strong> • Updated: {item.lastUpdated}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="p-3.5">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                        {item.category}
                      </span>
                    </td>

                    {/* Purchased Quantity */}
                    <td className="p-3.5 text-center font-bold text-stone-900">
                      {isEditingThis ? (
                        <div className="flex items-center justify-center gap-1 max-w-[120px] mx-auto">
                          <input
                            type="number"
                            value={editQty}
                            onChange={(e) => setEditQty(Number(e.target.value))}
                            className="w-16 p-1 bg-white border border-amber-600 rounded-lg text-xs font-black text-center outline-none"
                          />
                          <span className="text-xs text-stone-600 font-bold">{item.unit}</span>
                        </div>
                      ) : (
                        <span className="bg-stone-100 px-3 py-1 rounded-xl text-stone-800 font-extrabold">
                          {item.purchasedQty} {item.unit}
                        </span>
                      )}
                    </td>

                    {/* Total Purchased Rate Paid */}
                    <td className="p-3.5 text-center font-extrabold text-stone-900">
                      {isEditingThis ? (
                        <div className="flex items-center justify-center gap-1 max-w-[120px] mx-auto">
                          <span className="text-stone-500 font-bold">₹</span>
                          <input
                            type="number"
                            value={editRate}
                            onChange={(e) => setEditRate(Number(e.target.value))}
                            className="w-20 p-1 bg-white border border-amber-600 rounded-lg text-xs font-black text-center outline-none"
                          />
                        </div>
                      ) : (
                        <span className="text-amber-950 text-sm font-black">
                          ₹{item.totalRatePaid.toLocaleString('en-IN')}
                        </span>
                      )}
                    </td>

                    {/* Auto Calculated Base Price */}
                    <td className="p-3.5 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-xl font-black text-sm">
                          ₹{isEditingThis && editQty > 0 ? (editRate / editQty).toFixed(2) : item.baseUnitPrice.toFixed(2)} / {item.unit}
                        </span>
                        <span className="text-[9px] text-stone-400 mt-0.5 font-mono">
                          (Initial Market Rate)
                        </span>
                      </div>
                    </td>

                    {/* Rate Comparison Over Time */}
                    <td className="p-3.5 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          priceDiff > 0
                            ? 'bg-rose-100 text-rose-900 border border-rose-200'
                            : priceDiff < 0
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            : 'bg-stone-100 text-stone-700'
                        }`}>
                          {priceDiff > 0 ? `▲ +${diffPct}% (₹${prevPrice.toFixed(0)} ➔ ₹${item.baseUnitPrice.toFixed(0)})` :
                           priceDiff < 0 ? `▼ ${diffPct}% (₹${prevPrice.toFixed(0)} ➔ ₹${item.baseUnitPrice.toFixed(0)})` :
                           `Stable (₹${item.baseUnitPrice.toFixed(0)})`}
                        </span>
                        <span className="text-[9px] text-stone-400 mt-0.5">
                          {item.purchaseHistory && item.purchaseHistory.length > 1 ? `${item.purchaseHistory.length} Purchase Logs` : 'Initial Baseline'}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-right">
                      {isEditingThis ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={handleSaveEdit}
                            className="px-3 py-1.5 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 transition-colors flex items-center gap-1 shadow-xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save Rate</span>
                          </button>
                          <button
                            onClick={() => setEditingItem(null)}
                            className="px-2.5 py-1.5 bg-stone-200 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setEditQty(item.purchasedQty);
                              setEditRate(item.totalRatePaid);
                            }}
                            className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-950 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 border border-amber-300"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Base Rate</span>
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(item.id)}
                            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI BILL SCANNER MODAL */}
      {showAiScannerModal && (
        <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full space-y-6 shadow-2xl border border-stone-200 my-8">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-md flex items-center gap-1 w-fit mb-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  AI Vision Purchase Invoice Reader
                </span>
                <h3 className="text-xl font-black text-stone-900">Upload & Scan Purchase Bill with AI</h3>
              </div>
              <button
                onClick={() => setShowAiScannerModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Select Sample Bill or Upload Box */}
            {!scannedBill && !isScanning && (
              <div className="space-y-4 text-xs">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={() => handleStartAiScan(0)}
                  accept="image/*,application/pdf"
                  className="hidden"
                />
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-stone-300 bg-stone-50 hover:bg-stone-100/80 transition-all rounded-2xl p-6 text-center cursor-pointer space-y-2"
                >
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h4 className="font-black text-stone-900 text-sm">Drag & Drop Scanned Invoice Image or PDF</h4>
                  <p className="text-stone-500 text-xs">Supports JPG, PNG, WEBP, or PDF bill documents</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="mt-2 bg-emerald-800 text-white font-extrabold px-5 py-2 rounded-xl text-xs hover:bg-emerald-900 transition-all shadow-sm"
                  >
                    Select Invoice File to Scan
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-extrabold text-stone-500 uppercase">Or Test with Sample Supplier Bills:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {sampleBills.map((sb, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleStartAiScan(idx)}
                        className="p-3 bg-white border border-stone-200 hover:border-emerald-600 rounded-2xl text-left transition-all hover:shadow-md space-y-1 group"
                      >
                        <h5 className="font-extrabold text-stone-900 group-hover:text-emerald-800">{sb.title}</h5>
                        <p className="text-[10px] text-stone-500">Invoice: {sb.invoiceNo}</p>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded inline-block">
                          {sb.items.length} Line Items
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Scanning Progress Screen */}
            {isScanning && (
              <div className="py-12 text-center space-y-4">
                <div className="relative w-20 h-20 mx-auto">
                  <RefreshCw className="w-20 h-20 text-emerald-600 animate-spin opacity-20" />
                  <Sparkles className="w-8 h-8 text-emerald-600 absolute inset-0 m-auto animate-pulse" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-stone-900">AI Scanning Scanned Purchase Bill...</h4>
                  <p className="text-xs text-stone-500 mt-1">Extracting Vendor Name, GSTIN, Line Items, Purchased Quantities, & Unit Prices</p>
                </div>

                {/* Progress Bar */}
                <div className="max-w-md mx-auto bg-stone-100 rounded-full h-3 overflow-hidden border border-stone-200">
                  <div
                    className="bg-emerald-600 h-full transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  ></div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-800">{scanProgress}% Processed</span>
              </div>
            )}

            {/* AI Detected Results Verification & Correction Table */}
            {scannedBill && !isScanning && (
              <div className="space-y-4 text-xs">
                
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="font-extrabold text-emerald-950">AI Extraction Completed Successfully</h4>
                      <p className="text-emerald-800 text-[11px]">Please verify detected fields below. You can edit any incorrectly recognized cells before saving.</p>
                    </div>
                  </div>

                  <button
                    onClick={() => { setScannedBill(null); setIsScanning(false); }}
                    className="text-[11px] font-bold text-stone-600 underline hover:text-stone-900"
                  >
                    Scan Another Bill
                  </button>
                </div>

                {/* Vendor Header Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 p-3.5 rounded-2xl border border-stone-200 font-bold">
                  <div>
                    <span className="text-[10px] text-stone-400 uppercase block">Vendor Name</span>
                    <input
                      type="text"
                      value={scannedBill.vendorName}
                      onChange={(e) => setScannedBill({ ...scannedBill, vendorName: e.target.value })}
                      className="bg-white border border-stone-300 rounded-lg px-2 py-1 text-stone-900 text-xs font-bold w-full"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-stone-400 uppercase block">Invoice #</span>
                    <input
                      type="text"
                      value={scannedBill.invoiceNo}
                      onChange={(e) => setScannedBill({ ...scannedBill, invoiceNo: e.target.value })}
                      className="bg-white border border-stone-300 rounded-lg px-2 py-1 text-stone-900 text-xs font-bold w-full"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-stone-400 uppercase block">Invoice Date</span>
                    <input
                      type="date"
                      value={scannedBill.invoiceDate}
                      onChange={(e) => setScannedBill({ ...scannedBill, invoiceDate: e.target.value })}
                      className="bg-white border border-stone-300 rounded-lg px-2 py-1 text-stone-900 text-xs font-bold w-full"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-stone-400 uppercase block">Payment Terms</span>
                    <input
                      type="text"
                      value={scannedBill.paymentTerms}
                      onChange={(e) => setScannedBill({ ...scannedBill, paymentTerms: e.target.value })}
                      className="bg-white border border-stone-300 rounded-lg px-2 py-1 text-stone-900 text-xs font-bold w-full"
                    />
                  </div>
                </div>

                {/* Detected Items Table */}
                <div className="border border-stone-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-900 text-stone-200 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-3">Detected Item</th>
                        <th className="p-3">Category</th>
                        <th className="p-3 text-center">Purchased Qty</th>
                        <th className="p-3 text-center">Unit Rate (₹)</th>
                        <th className="p-3 text-right">Total Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 bg-white">
                      {scannedBill.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-stone-50">
                          <td className="p-3 font-extrabold text-stone-900">
                            <input
                              type="text"
                              value={it.itemName}
                              onChange={(e) => {
                                const newItems = [...scannedBill.items];
                                newItems[idx].itemName = e.target.value;
                                setScannedBill({ ...scannedBill, items: newItems });
                              }}
                              className="bg-stone-50 border border-stone-200 rounded px-2 py-1 w-full font-extrabold text-stone-900"
                            />
                          </td>

                          <td className="p-3">
                            <input
                              type="text"
                              value={it.category}
                              onChange={(e) => {
                                const newItems = [...scannedBill.items];
                                newItems[idx].category = e.target.value;
                                setScannedBill({ ...scannedBill, items: newItems });
                              }}
                              className="bg-stone-50 border border-stone-200 rounded px-2 py-1 text-xs text-stone-700"
                            />
                          </td>

                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                value={it.quantity}
                                onChange={(e) => {
                                  const newItems = [...scannedBill.items];
                                  const q = Number(e.target.value);
                                  newItems[idx].quantity = q;
                                  newItems[idx].totalPrice = q * newItems[idx].unitPrice;
                                  setScannedBill({ ...scannedBill, items: newItems });
                                }}
                                className="w-16 bg-stone-50 border border-stone-200 rounded px-1.5 py-1 text-center font-bold"
                              />
                              <span className="text-[11px] text-stone-500 font-bold">{it.unit}</span>
                            </div>
                          </td>

                          <td className="p-3 text-center">
                            <input
                              type="number"
                              value={it.unitPrice}
                              onChange={(e) => {
                                const newItems = [...scannedBill.items];
                                const r = Number(e.target.value);
                                newItems[idx].unitPrice = r;
                                newItems[idx].totalPrice = newItems[idx].quantity * r;
                                setScannedBill({ ...scannedBill, items: newItems });
                              }}
                              className="w-20 bg-stone-50 border border-stone-200 rounded px-1.5 py-1 text-center font-bold"
                            />
                          </td>

                          <td className="p-3 text-right font-black text-emerald-900">
                            ₹{it.totalPrice.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Grand Total & Save Button */}
                <div className="pt-3 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-stone-600 font-bold">
                    Bill Grand Total: <span className="text-lg font-black text-emerald-900 ml-1">
                      ₹{scannedBill.items.reduce((sum, i) => sum + i.totalPrice, 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAiScannerModal(false)}
                      className="px-4 py-2.5 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveScannedBill}
                      className="px-6 py-2.5 bg-emerald-800 text-white font-extrabold rounded-xl text-xs hover:bg-emerald-900 shadow-md flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                      <span>Confirm & Save to Stock Register & Vendor Ledger</span>
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      )}

      {/* ADD NEW SOURCED INGREDIENT ENTRY MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-xl font-black text-stone-900">Add Stock Entry / Base Market Rate</h3>
                <p className="text-xs text-stone-500">System computes base unit rate (₹/unit) for dish costing calculations.</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewIngredient} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-stone-700 mb-1">Ingredient Name</label>
                <input
                  type="text"
                  required
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="e.g. Cold Pressed Sesame Oil, Organic Quinoa"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-stone-900 outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 mb-1">Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-stone-900 outline-none focus:ring-2 focus:ring-amber-600 cursor-pointer"
                  >
                    {categories.filter((c) => c !== 'All').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Measurement Unit</label>
                  <select
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-stone-900 outline-none focus:ring-2 focus:ring-amber-600 cursor-pointer"
                  >
                    <option value="kg">Kilograms (kg)</option>
                    <option value="g">Grams (g)</option>
                    <option value="liters">Liters (liters)</option>
                    <option value="ml">Milliliters (ml)</option>
                    <option value="units">Units / Pieces (units)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 mb-1">Quantity Purchased</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="any"
                    value={newItem.purchasedQty}
                    onChange={(e) => setNewItem({ ...newItem, purchasedQty: Number(e.target.value) })}
                    placeholder="e.g. 25"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-stone-900 outline-none focus:ring-2 focus:ring-amber-600"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Total Purchased Price Paid (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={newItem.totalRatePaid}
                    onChange={(e) => setNewItem({ ...newItem, totalRatePaid: Number(e.target.value) })}
                    placeholder="e.g. 5000"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-stone-900 outline-none focus:ring-2 focus:ring-amber-600"
                  />
                </div>
              </div>

              {/* Calculated Preview Box */}
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-800">Calculated Base Unit Price</span>
                  <div className="text-xl font-black text-amber-950">
                    ₹{newItem.purchasedQty > 0 ? (newItem.totalRatePaid / newItem.purchasedQty).toFixed(2) : '0.00'} / {newItem.unit}
                  </div>
                </div>
                <div className="text-[11px] text-stone-500 font-mono text-right">
                  ₹{newItem.totalRatePaid} ÷ {newItem.purchasedQty} {newItem.unit}
                </div>
              </div>

              <div>
                <label className="block text-stone-700 mb-1">Supplier / Market Name</label>
                <input
                  type="text"
                  value={newItem.supplier}
                  onChange={(e) => setNewItem({ ...newItem, supplier: e.target.value })}
                  placeholder="e.g. Kochi Wholesale Market"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-stone-900 outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-amber-950 text-white rounded-xl text-xs font-extrabold hover:bg-stone-900 shadow-md"
                >
                  Save Entry to Stock Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

// Re-export alias
export const DishPriceCalculator = IngredientPriceCalculator;
