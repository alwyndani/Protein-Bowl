import React, { useState, useMemo } from 'react';
import { 
  InventoryItem, 
  Order, 
  VendorMasterItem, 
  AgreedVendorItem,
  VendorPurchaseBill, 
  KitchenAssetItem, 
  AssetPurchaseHistory,
  KitchenYieldWastageRecord,
  KitchenBranchId
} from '../../types';
import { ALL_INVENTORY_ITEMS } from '../../data/inventoryDatabase';
import { IngredientPriceCalculator } from '../common/IngredientPriceCalculator';
import { 
  Package, 
  AlertTriangle, 
  Plus, 
  CheckCircle2, 
  Search, 
  Building,
  FileText,
  Clock,
  Calculator,
  Printer,
  Check,
  X,
  CreditCard,
  History,
  Box,
  UserPlus,
  Scale,
  ShieldCheck,
  Calendar,
  Layers,
  Edit3,
  TrendingDown
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ProcurementDashboardProps {
  orders?: Order[];
  selectedBranchId?: KitchenBranchId;
  onSelectBranch?: (branchId: KitchenBranchId) => void;
}

export const ProcurementDashboard: React.FC<ProcurementDashboardProps> = ({ 
  orders = [],
  selectedBranchId = 'all',
  onSelectBranch
}) => {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'inventory' | 'stock-entry' | 'vendors' | 'variance' | 'assets-consumables'>('inventory');
  
  // Master Warehouse Inventory State
  const [inventory, setInventory] = useState<InventoryItem[]>(ALL_INVENTORY_ITEMS);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState<boolean>(false);

  // Today's date reference
  const currentDateStr = '30.07.2026';
  const projectionRangeStr = '30.07.2026 - 01.08.2026';

  // Add Custom Raw Ingredient Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'Proteins',
    currentStock: 10,
    unit: 'kg',
    minThreshold: 5,
    reorderQty: 25,
    unitCost: 150,
    supplier: 'Kochi Wholesale Market'
  });

  // Calculate 3-Day Needed Quantity & 3-Day Balance for each warehouse inventory item
  const warehouseStockWith3DayDemand = useMemo(() => {
    return inventory.map((inv) => {
      let dailyNeeded = 0;

      if (inv.unit === 'kg' || inv.unit === 'liters') {
        dailyNeeded = Number((inv.minThreshold * 0.75).toFixed(1));
      } else {
        dailyNeeded = Math.round(inv.minThreshold * 0.8);
      }

      // Specific demand adjustments for key items
      if (inv.name.includes('Chicken')) dailyNeeded = 18;
      if (inv.name.includes('Rice')) dailyNeeded = 14;
      if (inv.name.includes('Paneer')) dailyNeeded = 9;
      if (inv.name.includes('Egg')) dailyNeeded = 60;
      if (inv.name.includes('Fish') || inv.name.includes('Salmon')) dailyNeeded = 6;

      const needed3Days = Number((dailyNeeded * 3).toFixed(1));
      const balance3Days = Number((inv.currentStock - needed3Days).toFixed(1));
      const isDeficit = balance3Days < 0;
      const isLow3Days = balance3Days <= inv.minThreshold;

      // Check if perishable
      const isPerishable = ['Proteins', 'Dairy', 'Vegetables'].some((c) => inv.category.includes(c)) ||
                          inv.name.toLowerCase().includes('chicken') ||
                          inv.name.toLowerCase().includes('fish') ||
                          inv.name.toLowerCase().includes('milk') ||
                          inv.name.toLowerCase().includes('paneer');

      return {
        ...inv,
        dailyNeeded,
        needed3Days,
        balance3Days,
        isDeficit,
        isLow3Days,
        isPerishable
      };
    });
  }, [inventory]);

  // Add Custom Raw Material
  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    const newInv: InventoryItem = {
      id: `inv-cust-${Date.now()}`,
      name: newItem.name.trim(),
      category: newItem.category as any,
      currentStock: Number(newItem.currentStock),
      unit: newItem.unit,
      minThreshold: Number(newItem.minThreshold),
      reorderQty: Number(newItem.reorderQty),
      unitCost: Number(newItem.unitCost),
      lastRestocked: currentDateStr,
      supplier: newItem.supplier
    };

    setInventory([newInv, ...inventory]);
    setShowAddModal(false);
    confetti({ particleCount: 50, spread: 70 });
    setNewItem({
      name: '',
      category: 'Proteins',
      currentStock: 10,
      unit: 'kg',
      minThreshold: 5,
      reorderQty: 25,
      unitCost: 150,
      supplier: 'Kochi Wholesale Market'
    });
  };

  // Filtered Warehouse Stock List
  const filteredWarehouseStock = useMemo(() => {
    return warehouseStockWith3DayDemand.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.supplier.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesLowStock = !filterLowStockOnly || item.isDeficit || item.currentStock <= item.minThreshold;
      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [warehouseStockWith3DayDemand, searchQuery, selectedCategory, filterLowStockOnly]);

  const categories = ['All', 'Proteins', 'Grains & Flours', 'Dairy', 'Vegetables', 'Spices & Condiments', 'Packaging'];

  // ==========================================
  // VENDOR MASTER & PURCHASE ORDERS STATE
  // ==========================================
  const [vendors, setVendors] = useState<VendorMasterItem[]>([
    {
      id: 'vend-001',
      name: 'Kochi Fresh Meats Co.',
      category: 'Proteins & Poultry',
      contactPerson: 'Abdul Rahman',
      phone: '+91 98950 11223',
      email: 'orders@kochifreshmeats.in',
      address: 'Door No. 12/450, Market Road, Ernakulam North, Kochi, Kerala 682018',
      paymentTerms: 'Net 15 Days',
      loginUsername: 'kochifreshmeats_vendor',
      status: 'Active Supplier',
      leadTimeHours: 24,
      itemsSupplied: ['Boneless Chicken Breast', 'Mutton Curry Cut', 'Eggs (Tray of 30)'],
      agreedItems: [
        { itemName: 'Boneless Chicken Breast', category: 'Proteins', agreedRate: 285, unit: 'kg', contractType: 'Rate Contract' },
        { itemName: 'Mutton Curry Cut', category: 'Proteins', agreedRate: 750, unit: 'kg', contractType: 'Rate Contract' },
        { itemName: 'Eggs (Tray of 30)', category: 'Proteins', agreedRate: 180, unit: 'units', contractType: 'Market Variable' }
      ],
      bankDetails: {
        accountNo: '918020033441122',
        bankName: 'HDFC Bank Ernakulam',
        ifsc: 'HDFC0001234',
        upiId: 'kochifreshmeats@hdfcbank'
      }
    },
    {
      id: 'vend-002',
      name: 'Palakkad Farmer Producer Group',
      category: 'Grains & Kerala Flours',
      contactPerson: 'Suresh Kumar',
      phone: '+91 94470 55443',
      email: 'sales@palakkadagropark.org',
      address: 'Plot 45, Agro Industrial Zone, Kanjikode, Palakkad, Kerala 678621',
      paymentTerms: 'Net 30 Days',
      loginUsername: 'palakkad_grains',
      status: 'Active Supplier',
      leadTimeHours: 48,
      itemsSupplied: ['Kerala Matta Rice', 'Organic Whole Wheat Flour (Atta)', 'Puttu Podi (Steamed Ground Rice)'],
      agreedItems: [
        { itemName: 'Kerala Matta Rice', category: 'Grains & Flours', agreedRate: 52, unit: 'kg', contractType: 'Rate Contract' },
        { itemName: 'Organic Whole Wheat Flour (Atta)', category: 'Grains & Flours', agreedRate: 46, unit: 'kg', contractType: 'Rate Contract' }
      ],
      bankDetails: {
        accountNo: '048401000998877',
        bankName: 'State Bank of India Palakkad',
        ifsc: 'SBIN0004567',
        upiId: 'palakkadagropark@sbi'
      }
    },
    {
      id: 'vend-003',
      name: 'Milma Dairy Co-op',
      category: 'Dairy & Milk Products',
      contactPerson: 'Mini Varghese',
      phone: '0484 2556677',
      email: 'supply@milmakochi.com',
      address: 'Milma Dairy Complex, Edappally - Pookkattupady Rd, Kalamassery, Kochi, Kerala 683104',
      paymentTerms: 'Immediate Cash',
      loginUsername: 'milma_dairy_kochi',
      status: 'Active Supplier',
      leadTimeHours: 12,
      itemsSupplied: ['Paneer Cubes', 'Hung Greek Yogurt', 'Desi Ghee'],
      agreedItems: [
        { itemName: 'Paneer Cubes', category: 'Dairy', agreedRate: 340, unit: 'kg', contractType: 'Rate Contract' },
        { itemName: 'Hung Greek Yogurt', category: 'Dairy', agreedRate: 120, unit: 'kg', contractType: 'Rate Contract' }
      ],
      bankDetails: {
        accountNo: '501002233445566',
        bankName: 'South Indian Bank Edappally',
        ifsc: 'SIBL0000112',
        upiId: 'milma.kochi@sib'
      }
    },
    {
      id: 'vend-004',
      name: 'GreenPack Eco Solutions',
      category: 'Non-Food Packaging & Consumables',
      contactPerson: 'Rohan Nair',
      phone: '+91 97440 88990',
      email: 'info@greenpackeco.in',
      address: 'Building B, CSEZ Special Economic Zone, Kakkanad, Kochi, Kerala 682037',
      paymentTerms: 'Net 15 Days',
      loginUsername: 'greenpack_eco',
      status: 'Active Supplier',
      leadTimeHours: 48,
      itemsSupplied: ['Biodegradable Meal Containers', 'Thermal Label Paper Rolls (3x2 inch)', 'Food Grade Cling Film'],
      agreedItems: [
        { itemName: 'Biodegradable Meal Containers', category: 'Packaging', agreedRate: 8, unit: 'boxes', contractType: 'Rate Contract' },
        { itemName: 'Thermal Label Paper Rolls (3x2 inch)', category: 'Packaging', agreedRate: 150, unit: 'rolls', contractType: 'Rate Contract' }
      ],
      bankDetails: {
        accountNo: '112233445566778',
        bankName: 'ICICI Bank Kakkanad',
        ifsc: 'ICIC0008899',
        upiId: 'greenpackeco@icici'
      }
    }
  ]);

  // Selected Vendor
  const [selectedVendorId, setSelectedVendorId] = useState<string>('vend-001');

  // Active Vendor Object
  const activeVendor = useMemo(() => {
    return vendors.find((v) => v.id === selectedVendorId) || vendors[0];
  }, [vendors, selectedVendorId]);

  // Vendor Bills State
  const [vendorBills, setVendorBills] = useState<VendorPurchaseBill[]>([
    {
      id: 'bill-101',
      vendorId: 'vend-001',
      vendorName: 'Kochi Fresh Meats Co.',
      invoiceNo: 'INV-KFM-8820',
      invoiceDate: '2026-07-28',
      totalAmount: 14250,
      amountPaid: 14250,
      pendingAmount: 0,
      paymentStatus: 'Paid',
      paymentTerms: 'Net 15 Days',
      itemsList: [
        { itemName: 'Boneless Chicken Breast', category: 'Proteins', quantity: 50, unit: 'kg', unitPrice: 285, totalPrice: 14250 }
      ],
      isAiProcessed: true
    },
    {
      id: 'bill-102',
      vendorId: 'vend-002',
      vendorName: 'Palakkad Farmer Producer Group',
      invoiceNo: 'INV-PAG-9912',
      invoiceDate: '2026-07-29',
      totalAmount: 7500,
      amountPaid: 0,
      pendingAmount: 7500,
      paymentStatus: 'Pending',
      paymentTerms: 'Net 30 Days',
      itemsList: [
        { itemName: 'Kerala Matta Rice', category: 'Grains & Flours', quantity: 100, unit: 'kg', unitPrice: 52, totalPrice: 5200 },
        { itemName: 'Organic Whole Wheat Flour (Atta)', category: 'Grains & Flours', quantity: 50, unit: 'kg', unitPrice: 46, totalPrice: 2300 }
      ],
      isAiProcessed: true
    }
  ]);

  // Add New Vendor Modal State
  const [showAddVendorModal, setShowAddVendorModal] = useState<boolean>(false);
  const [newVendorForm, setNewVendorForm] = useState({
    name: '',
    category: 'Proteins & Poultry',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    paymentTerms: 'Net 15 Days' as VendorMasterItem['paymentTerms'],
    bankAccountNo: '',
    bankName: '',
    bankIfsc: '',
    bankUpi: '',
    agreedItemsList: [
      { itemName: '', category: 'Proteins', agreedRate: 100, unit: 'kg', contractType: 'Rate Contract' as const }
    ]
  });

  const handleAddAgreedItemRow = () => {
    setNewVendorForm((prev) => ({
      ...prev,
      agreedItemsList: [
        ...prev.agreedItemsList,
        { itemName: '', category: 'Proteins', agreedRate: 100, unit: 'kg', contractType: 'Rate Contract' }
      ]
    }));
  };

  const handleAddNewVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorForm.name.trim()) return;

    const validAgreed = newVendorForm.agreedItemsList.filter((it) => it.itemName.trim().length > 0);
    const itemsSuppliedList = validAgreed.map((i) => i.itemName.trim());

    const vendorObj: VendorMasterItem = {
      id: `vend-${Date.now()}`,
      name: newVendorForm.name.trim(),
      category: newVendorForm.category,
      contactPerson: newVendorForm.contactPerson || 'Store Manager',
      phone: newVendorForm.phone || '+91 98000 00000',
      email: newVendorForm.email || 'orders@vendor.com',
      address: newVendorForm.address || 'Kochi Industrial Zone, Kerala',
      paymentTerms: newVendorForm.paymentTerms,
      loginUsername: `${newVendorForm.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_vendor`,
      status: 'Active Supplier',
      leadTimeHours: 24,
      itemsSupplied: itemsSuppliedList.length > 0 ? itemsSuppliedList : ['General Materials'],
      agreedItems: validAgreed.length > 0 ? validAgreed : undefined,
      bankDetails: {
        accountNo: newVendorForm.bankAccountNo || '918000112233',
        bankName: newVendorForm.bankName || 'HDFC Bank Ernakulam',
        ifsc: newVendorForm.bankIfsc || 'HDFC0001234',
        upiId: newVendorForm.bankUpi || `${newVendorForm.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@upi`
      }
    };

    setVendors([vendorObj, ...vendors]);
    setSelectedVendorId(vendorObj.id);
    setShowAddVendorModal(false);
    confetti({ particleCount: 40, spread: 60 });
    setNewVendorForm({
      name: '',
      category: 'Proteins & Poultry',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      paymentTerms: 'Net 15 Days',
      bankAccountNo: '',
      bankName: '',
      bankIfsc: '',
      bankUpi: '',
      agreedItemsList: [{ itemName: '', category: 'Proteins', agreedRate: 100, unit: 'kg', contractType: 'Rate Contract' }]
    });
  };

  // PO Selection & Quantities State for Active Vendor
  const allVendorSupplyItems = useMemo(() => {
    if (!activeVendor) return [];

    // Find linked materials or agreed items
    const setMap = new Map<string, { itemName: string; category: string; defaultQty: number; unit: string; unitRate: number; isPerishable: boolean; max3DayDemand: number }>();

    // 1. Check agreed items
    if (activeVendor.agreedItems && activeVendor.agreedItems.length > 0) {
      activeVendor.agreedItems.forEach((ag) => {
        const invMatch = warehouseStockWith3DayDemand.find((inv) => inv.name.toLowerCase() === ag.itemName.toLowerCase());
        const max3Day = invMatch ? invMatch.needed3Days : 25;
        const isPerishable = invMatch ? invMatch.isPerishable : ['Proteins', 'Dairy', 'Vegetables'].some((c) => ag.category?.includes(c) || false);

        setMap.set(ag.itemName, {
          itemName: ag.itemName,
          category: ag.category || 'General',
          defaultQty: max3Day,
          unit: ag.unit,
          unitRate: ag.agreedRate,
          isPerishable,
          max3DayDemand: max3Day
        });
      });
    }

    // 2. Check itemsSupplied list or warehouse matches
    warehouseStockWith3DayDemand.forEach((inv) => {
      const match = activeVendor.itemsSupplied.some((supp) => supp.toLowerCase().includes(inv.name.toLowerCase()) || inv.name.toLowerCase().includes(supp.toLowerCase())) ||
                    inv.supplier.toLowerCase().includes(activeVendor.name.toLowerCase());
      if (match && !setMap.has(inv.name)) {
        setMap.set(inv.name, {
          itemName: inv.name,
          category: inv.category,
          defaultQty: inv.needed3Days || inv.reorderQty,
          unit: inv.unit,
          unitRate: inv.unitCost,
          isPerishable: inv.isPerishable,
          max3DayDemand: inv.needed3Days || 25
        });
      }
    });

    return Array.from(setMap.values());
  }, [activeVendor, warehouseStockWith3DayDemand]);

  // User PO Item Selection State
  const [poSelectedItems, setPoSelectedItems] = useState<{ [itemName: string]: { checked: boolean; orderQty: number } }>({});

  // Sync selection when vendor changes
  React.useEffect(() => {
    const initialSelection: { [itemName: string]: { checked: boolean; orderQty: number } } = {};
    allVendorSupplyItems.forEach((it) => {
      initialSelection[it.itemName] = {
        checked: true, // Default select all for convenience
        orderQty: it.defaultQty
      };
    });
    setPoSelectedItems(initialSelection);
  }, [selectedVendorId, allVendorSupplyItems]);

  const togglePoItemCheck = (itemName: string) => {
    setPoSelectedItems((prev) => ({
      ...prev,
      [itemName]: {
        ...prev[itemName],
        checked: !prev[itemName]?.checked
      }
    }));
  };

  const updatePoItemQty = (itemName: string, newQty: number, isPerishable: boolean, max3DayDemand: number) => {
    // Enforce 3-Day limit for perishable items if user enters higher
    let finalQty = Math.max(0.5, newQty);
    if (isPerishable && finalQty > max3DayDemand) {
      finalQty = max3DayDemand; // Cap at 3-day max demand for perishables
    }

    setPoSelectedItems((prev) => ({
      ...prev,
      [itemName]: {
        ...prev[itemName],
        orderQty: Number(finalQty.toFixed(1))
      }
    }));
  };

  // Active PO Modal View State
  const [showPoModal, setShowPoModal] = useState<boolean>(false);

  // Selected items list for PO preview
  const activeSelectedPoItemsList = useMemo(() => {
    return allVendorSupplyItems
      .filter((it) => poSelectedItems[it.itemName]?.checked)
      .map((it) => ({
        ...it,
        orderQty: poSelectedItems[it.itemName]?.orderQty || it.defaultQty,
        lineTotal: (poSelectedItems[it.itemName]?.orderQty || it.defaultQty) * it.unitRate
      }));
  }, [allVendorSupplyItems, poSelectedItems]);

  const activePoGrandTotal = useMemo(() => {
    return activeSelectedPoItemsList.reduce((sum, i) => sum + i.lineTotal, 0);
  }, [activeSelectedPoItemsList]);

  // Print PO Document Handler
  const handlePrintPo = () => {
    window.print();
  };

  // Mark Bill Paid
  const handleMarkBillPaid = (billId: string) => {
    setVendorBills((prev) =>
      prev.map((b) => {
        if (b.id === billId) {
          return {
            ...b,
            amountPaid: b.totalAmount,
            pendingAmount: 0,
            paymentStatus: 'Paid'
          };
        }
        return b;
      })
    );
    confetti({ particleCount: 30, spread: 50 });
  };

  // ==========================================
  // KITCHEN YIELD & WASTAGE STATE
  // ==========================================
  const [wastageLogs, setWastageLogs] = useState<KitchenYieldWastageRecord[]>([
    {
      id: 'wast-001',
      date: '30.07.2026',
      recipeDishName: 'Kerala Matta Rice Biriyani Meal',
      ingredientName: 'Kerala Matta Rice',
      purchasedQtyUsed: 10,
      unit: 'kg',
      expectedPortions: 100, // Standard 100g/portion
      actualPortionsProduced: 90, // Stock finished at 90 biriyanis!
      yieldVariancePortions: -10,
      yieldVariancePct: -10.0,
      wastageCostLoss: 280,
      rootCause: 'Physical End-of-Day Weigh Audit before PO: Measured 0.5kg physical balance instead of 1.0kg expected',
      recordedBy: 'Chef Saji Kumaran'
    },
    {
      id: 'wast-002',
      date: '29.07.2026',
      recipeDishName: 'Air-Fried Lemon Garlic Chicken',
      ingredientName: 'Boneless Chicken Breast',
      purchasedQtyUsed: 15,
      unit: 'kg',
      expectedPortions: 100,
      actualPortionsProduced: 96,
      yieldVariancePortions: -4,
      yieldVariancePct: -4.0,
      wastageCostLoss: 570,
      rootCause: 'Physical Weight Audit: Excess trimming of fat & skin during raw prep',
      recordedBy: 'Chef Anoop'
    }
  ]);

  // Physical Weighing Audit Form State
  const [physicalAuditForm, setPhysicalAuditForm] = useState({
    recipeDishName: 'Kerala Matta Rice Biriyani Meal',
    ingredientName: 'Kerala Matta Rice',
    initialPurchasedKg: 10.0,
    unit: 'kg',
    standardPortionGrams: 100, // 100g raw per portion
    portionsCookedToday: 90, // 90 biriyani cooked
    physicallyWeighedBalanceKg: 0.5, // User enters measured weight at end of day
    unitCost: 52,
    auditNotes: 'End-of-day physical weighing before issuing new PO'
  });

  // Calculate live audit stats
  const calculatedAuditStats = useMemo(() => {
    const stdKgPerPortion = physicalAuditForm.standardPortionGrams / 1000; // e.g. 0.1 kg
    const totalExpectedPortions = Math.round(physicalAuditForm.initialPurchasedKg / stdKgPerPortion); // e.g. 100 biriyanis
    const rawUsedForCooked = physicalAuditForm.portionsCookedToday * stdKgPerPortion; // e.g. 90 * 0.1 = 9.0 kg
    const expectedRemainingBalanceKg = Number((physicalAuditForm.initialPurchasedKg - rawUsedForCooked).toFixed(2)); // e.g. 1.0 kg

    const actualMeasuredKg = Number(physicalAuditForm.physicallyWeighedBalanceKg); // e.g. 0.5 kg
    const suitablePortionsRemaining = Math.floor(actualMeasuredKg / stdKgPerPortion); // 0.5 / 0.1 = 5 biriyanis!

    const shortageKg = Number((expectedRemainingBalanceKg - actualMeasuredKg).toFixed(2)); // 1.0 - 0.5 = 0.5 kg loss
    const shortagePortions = Math.round(shortageKg / stdKgPerPortion); // 5 biriyanis lost
    const wastageCostLoss = Math.max(0, Math.round(shortageKg * physicalAuditForm.unitCost));

    return {
      stdKgPerPortion,
      totalExpectedPortions,
      expectedRemainingBalanceKg,
      actualMeasuredKg,
      suitablePortionsRemaining,
      shortageKg,
      shortagePortions,
      wastageCostLoss
    };
  }, [physicalAuditForm]);

  // Submit Physical Weight Audit
  const handleSubmitPhysicalAudit = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Update actual stock in warehouse inventory
    setInventory((prev) =>
      prev.map((item) => {
        if (item.name.toLowerCase().includes(physicalAuditForm.ingredientName.toLowerCase())) {
          return {
            ...item,
            currentStock: calculatedAuditStats.actualMeasuredKg,
            lastRestocked: currentDateStr
          };
        }
        return item;
      })
    );

    // 2. Log wastage record
    const newRecord: KitchenYieldWastageRecord = {
      id: `wast-${Date.now()}`,
      date: currentDateStr,
      recipeDishName: physicalAuditForm.recipeDishName,
      ingredientName: physicalAuditForm.ingredientName,
      purchasedQtyUsed: physicalAuditForm.initialPurchasedKg,
      unit: physicalAuditForm.unit,
      expectedPortions: calculatedAuditStats.totalExpectedPortions,
      actualPortionsProduced: physicalAuditForm.portionsCookedToday + calculatedAuditStats.suitablePortionsRemaining,
      yieldVariancePortions: -calculatedAuditStats.shortagePortions,
      yieldVariancePct: Number(((-calculatedAuditStats.shortagePortions / calculatedAuditStats.totalExpectedPortions) * 100).toFixed(1)),
      wastageCostLoss: calculatedAuditStats.wastageCostLoss,
      rootCause: `Physical End-of-Day Weighing Audit: ${physicalAuditForm.auditNotes}`,
      recordedBy: 'Kitchen Store Supervisor'
    };

    setWastageLogs([newRecord, ...wastageLogs]);
    confetti({ particleCount: 50, spread: 70 });
    alert(`Physical weight audit saved! Current stock for ${physicalAuditForm.ingredientName} updated to ${calculatedAuditStats.actualMeasuredKg} kg in Warehouse.`);
  };

  // ==========================================
  // CAPITAL ASSETS & CONSUMABLES INVENTORY STATE
  // ==========================================
  const [assetsList, setAssetsList] = useState<KitchenAssetItem[]>([
    {
      id: 'ast-001',
      name: 'Stainless Steel Prep Work Tables (304 Grade)',
      category: 'Furniture & Desk',
      quantity: 4,
      unit: 'units',
      unitCost: 18500,
      totalCost: 74000,
      purchaseDate: '10.05.2026',
      supplier: 'Kochi Kitchen Equipment & Steel Tech',
      location: 'Main Prep Kitchen Zone A',
      warrantyPeriod: '3 Years Warranty',
      serialNumber: 'SS-TBL-2026-004',
      condition: 'Excellent',
      purchaseHistory: [
        { id: 'ph-01', date: '10.05.2026', quantity: 4, unitCost: 18500, totalCost: 74000, supplier: 'Kochi Kitchen Equipment & Steel Tech', invoiceNo: 'INV-KKE-302' }
      ]
    },
    {
      id: 'ast-002',
      name: 'High-Speed Thermal Order Label Printers (3-inch)',
      category: 'Capital Equipment',
      quantity: 2,
      unit: 'units',
      unitCost: 8500,
      totalCost: 17000,
      purchaseDate: '01.06.2026',
      supplier: 'Kochi Kitchen Equipment & Steel Tech',
      location: 'Dispatch & Packaging Counter',
      warrantyPeriod: '1 Year Warranty',
      serialNumber: 'PRN-TH-8820',
      condition: 'Good',
      purchaseHistory: [
        { id: 'ph-02', date: '01.06.2026', quantity: 2, unitCost: 8500, totalCost: 17000, supplier: 'Kochi Kitchen Equipment & Steel Tech', invoiceNo: 'INV-KKE-411' }
      ]
    },
    {
      id: 'ast-003',
      name: 'Commercial LPG Gas Cylinders (19kg Commercial)',
      category: 'Non-Food Consumable',
      quantity: 16,
      unit: 'cylinders',
      unitCost: 1850,
      totalCost: 29600,
      purchaseDate: '25.07.2026',
      supplier: 'Kochi Gas Agency & Energy',
      location: 'Main Cooking Station & Yard',
      warrantyPeriod: 'Safety Tested Active',
      condition: 'Active',
      notes: '4 in active use, 12 standby refill stock',
      purchaseHistory: [
        { id: 'ph-03a', date: '10.07.2026', quantity: 10, unitCost: 1850, totalCost: 18500, supplier: 'Kochi Gas Agency & Energy', invoiceNo: 'INV-GAS-102', notes: 'Initial July Stock Batch' },
        { id: 'ph-03b', date: '25.07.2026', quantity: 6, unitCost: 1850, totalCost: 11100, supplier: 'Kochi Gas Agency & Energy', invoiceNo: 'INV-GAS-188', notes: 'Mid-Month Refill Sourcing' }
      ]
    },
    {
      id: 'ast-004',
      name: 'Biodegradable Meal Packaging Containers (3-Compartment)',
      category: 'Non-Food Consumable',
      quantity: 800,
      unit: 'boxes',
      unitCost: 8,
      totalCost: 6400,
      purchaseDate: '28.07.2026',
      supplier: 'GreenPack Eco Solutions',
      location: 'Packaging Store Room',
      warrantyPeriod: 'Food Grade Certified',
      condition: 'Excellent',
      purchaseHistory: [
        { id: 'ph-04a', date: '05.07.2026', quantity: 300, unitCost: 8, totalCost: 2400, supplier: 'GreenPack Eco Solutions', invoiceNo: 'INV-GP-201' },
        { id: 'ph-04b', date: '28.07.2026', quantity: 500, unitCost: 8, totalCost: 4000, supplier: 'GreenPack Eco Solutions', invoiceNo: 'INV-GP-388' }
      ]
    },
    {
      id: 'ast-005',
      name: 'Thermal Paper Sticker Rolls (3x2 inch for Order Labels)',
      category: 'Non-Food Consumable',
      quantity: 35,
      unit: 'rolls',
      unitCost: 150,
      totalCost: 5250,
      purchaseDate: '28.07.2026',
      supplier: 'GreenPack Eco Solutions',
      location: 'Dispatch Office',
      warrantyPeriod: 'Moisture Resistant',
      condition: 'Excellent',
      purchaseHistory: [
        { id: 'ph-05a', date: '12.07.2026', quantity: 15, unitCost: 150, totalCost: 2250, supplier: 'GreenPack Eco Solutions', invoiceNo: 'INV-GP-244' },
        { id: 'ph-05b', date: '28.07.2026', quantity: 20, unitCost: 150, totalCost: 3000, supplier: 'GreenPack Eco Solutions', invoiceNo: 'INV-GP-389' }
      ]
    }
  ]);

  // Selected Asset for Viewing Purchase History Modal
  const [selectedAssetForHistory, setSelectedAssetForHistory] = useState<KitchenAssetItem | null>(null);

  // Add Asset / Consumable Modal State
  const [showAddAssetModal, setShowAddAssetModal] = useState<boolean>(false);
  const [newAssetForm, setNewAssetForm] = useState({
    name: '',
    category: 'Capital Equipment' as KitchenAssetItem['category'],
    quantity: 1,
    unit: 'units',
    unitCost: 5000,
    supplier: 'Kochi Kitchen Equipment & Steel Tech',
    location: 'Main Kitchen',
    warrantyPeriod: '1 Year Warranty',
    notes: ''
  });

  // Log New Purchase Modal State for Existing Consumable
  const [showLogPurchaseModal, setShowLogPurchaseModal] = useState<boolean>(false);
  const [logPurchaseForm, setLogPurchaseForm] = useState({
    assetId: '',
    purchaseDate: currentDateStr,
    addedQuantity: 10,
    unitCost: 1850,
    invoiceNo: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
    notes: 'Restock Batch Purchase'
  });

  const handleOpenLogPurchase = (asset: KitchenAssetItem) => {
    setLogPurchaseForm({
      assetId: asset.id,
      purchaseDate: currentDateStr,
      addedQuantity: asset.category === 'Non-Food Consumable' ? 10 : 1,
      unitCost: asset.unitCost,
      invoiceNo: `INV-RESTOCK-${Math.floor(100 + Math.random() * 900)}`,
      notes: 'New Sourcing Log'
    });
    setShowLogPurchaseModal(true);
  };

  const handleSaveLogPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const targetAsset = assetsList.find((a) => a.id === logPurchaseForm.assetId);
    if (!targetAsset) return;

    const newHist: AssetPurchaseHistory = {
      id: `ph-${Date.now()}`,
      date: logPurchaseForm.purchaseDate,
      quantity: Number(logPurchaseForm.addedQuantity),
      unitCost: Number(logPurchaseForm.unitCost),
      totalCost: Number(logPurchaseForm.addedQuantity * logPurchaseForm.unitCost),
      supplier: targetAsset.supplier,
      invoiceNo: logPurchaseForm.invoiceNo,
      notes: logPurchaseForm.notes
    };

    setAssetsList((prev) =>
      prev.map((a) => {
        if (a.id === targetAsset.id) {
          const updatedQty = a.quantity + Number(logPurchaseForm.addedQuantity);
          const updatedTotalCost = a.totalCost + newHist.totalCost;
          return {
            ...a,
            quantity: updatedQty,
            unitCost: Number(logPurchaseForm.unitCost),
            totalCost: updatedTotalCost,
            purchaseDate: logPurchaseForm.purchaseDate,
            purchaseHistory: [newHist, ...(a.purchaseHistory || [])]
          };
        }
        return a;
      })
    );

    setShowLogPurchaseModal(false);
    if (selectedAssetForHistory && selectedAssetForHistory.id === targetAsset.id) {
      setSelectedAssetForHistory((prev) => prev ? {
        ...prev,
        quantity: prev.quantity + Number(logPurchaseForm.addedQuantity),
        purchaseHistory: [newHist, ...(prev.purchaseHistory || [])]
      } : null);
    }

    confetti({ particleCount: 40, spread: 60 });
    alert(`Added ${logPurchaseForm.addedQuantity} ${targetAsset.unit} to purchase history log for ${targetAsset.name}. Current stock updated to ${targetAsset.quantity + Number(logPurchaseForm.addedQuantity)}.`);
  };

  const handleAddAssetItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetForm.name.trim()) return;

    const totalCost = Number(newAssetForm.quantity * newAssetForm.unitCost);
    const initialHist: AssetPurchaseHistory = {
      id: `ph-init-${Date.now()}`,
      date: currentDateStr,
      quantity: Number(newAssetForm.quantity),
      unitCost: Number(newAssetForm.unitCost),
      totalCost,
      supplier: newAssetForm.supplier,
      invoiceNo: `INV-INIT-${Math.floor(100 + Math.random() * 900)}`,
      notes: 'Initial Sourcing Entry'
    };

    const assetObj: KitchenAssetItem = {
      id: `ast-${Date.now()}`,
      name: newAssetForm.name.trim(),
      category: newAssetForm.category,
      quantity: Number(newAssetForm.quantity),
      unit: newAssetForm.unit,
      unitCost: Number(newAssetForm.unitCost),
      totalCost,
      purchaseDate: currentDateStr,
      supplier: newAssetForm.supplier,
      location: newAssetForm.location,
      warrantyPeriod: newAssetForm.warrantyPeriod,
      condition: 'Excellent',
      notes: newAssetForm.notes,
      purchaseHistory: [initialHist]
    };

    setAssetsList([assetObj, ...assetsList]);
    setShowAddAssetModal(false);
    confetti({ particleCount: 50, spread: 70 });
    setNewAssetForm({
      name: '',
      category: 'Capital Equipment',
      quantity: 1,
      unit: 'units',
      unitCost: 5000,
      supplier: 'Kochi Kitchen Equipment & Steel Tech',
      location: 'Main Kitchen',
      warrantyPeriod: '1 Year Warranty',
      notes: ''
    });
  };

  // Low stock count
  const lowStockCount = warehouseStockWith3DayDemand.filter((i) => i.isDeficit || i.currentStock <= i.minThreshold).length;
  const stockHealthPct = Math.round(((inventory.length - lowStockCount) / inventory.length) * 100);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-stone-900 to-blue-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-emerald-800/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              <Package className="w-3.5 h-3.5" />
              <span>Full Kitchen Inventory & Procurement ERP</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
              Procurement & Warehouse Material Operations
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 max-w-2xl leading-relaxed">
              Warehouse stock ledger with 3-day projected demand ({projectionRangeStr}), low stock alerts, stock entry with AI bill scanner, vendor logins, rate contract PO generator, pre-PO physical weighing yield audit, and non-food asset purchase logs.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 shrink-0">
            <div className="text-center pr-4 border-r border-white/20">
              <span className="text-[10px] text-emerald-200 font-bold uppercase block">Stock Health</span>
              <span className="text-3xl font-black text-emerald-400">{stockHealthPct}%</span>
            </div>
            <div className="text-center pl-2">
              <span className="text-[10px] text-amber-200 font-bold uppercase block">Low / Deficit Alert</span>
              <span className="text-2xl font-black text-amber-400">{lowStockCount} Items</span>
            </div>
          </div>
        </div>
      </div>

      {/* Module Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none w-full">
          {[
            { id: 'inventory', label: `Warehouse Stock (${inventory.length})`, icon: Package },
            { id: 'stock-entry', label: '📦 Stock Entry & AI Bill Scanner', icon: Calculator },
            { id: 'vendors', label: `Vendors & Purchase Orders (${vendors.length})`, icon: Building },
            { id: 'variance', label: 'Kitchen Yield & Physical Weight Audit', icon: Scale },
            { id: 'assets-consumables', label: `Kitchen Assets & Consumables (${assetsList.length})`, icon: Box },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 whitespace-nowrap ${
                  active
                    ? 'bg-emerald-800 text-white shadow-md'
                    : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==========================================
          TAB 1: WAREHOUSE STOCK (3-Day Availability Ledger & Low Stock Alerts Only)
         ========================================== */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-stone-900 flex items-center gap-2">
                  <span>Warehouse Stock & 3-Day Availability Ledger</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Showing current stock on <strong>{currentDateStr}</strong>, projected 3-day requirement ({projectionRangeStr}), and deficit warnings.
                </p>
              </div>

              <button
                onClick={() => setShowAddModal(true)}
                className="bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs transition-all flex items-center gap-2 shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add Raw Ingredient</span>
              </button>
            </div>

            {/* Search & Category Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-stone-100">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search raw ingredient or supplier..."
                  className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-10 pr-4 py-2 text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                      selectedCategory === cat
                        ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                        : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}

                <button
                  onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${
                    filterLowStockOnly
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Low / Deficit Only</span>
                </button>
              </div>
            </div>

            {/* Warehouse Stock Grid */}
            <div className="space-y-3">
              {filteredWarehouseStock.map((inv) => {
                return (
                  <div
                    key={inv.id}
                    className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                      inv.isDeficit
                        ? 'bg-rose-50/90 border-rose-300'
                        : inv.isLow3Days
                        ? 'bg-amber-50/90 border-amber-300'
                        : 'bg-stone-50/80 border-stone-200 hover:bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                          {inv.category}
                        </span>
                        {inv.isPerishable && (
                          <span className="text-[10px] font-extrabold uppercase bg-purple-100 text-purple-900 px-2 py-0.5 rounded-md">
                            🥩 Perishable (Max 3-Day Limit)
                          </span>
                        )}
                        {inv.isDeficit ? (
                          <span className="text-[10px] font-extrabold uppercase bg-rose-200 text-rose-950 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-700" />
                            3-Day Deficit Alert!
                          </span>
                        ) : inv.isLow3Days ? (
                          <span className="text-[10px] font-extrabold uppercase bg-amber-200 text-amber-950 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-800" />
                            Low Safety Margin Alert
                          </span>
                        ) : null}
                      </div>

                      <h4 className="font-extrabold text-stone-900 text-base mt-1">{inv.name}</h4>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Approved Supplier: <span className="font-medium text-stone-700">{inv.supplier}</span> • Unit Rate: <span className="font-bold text-stone-800">₹{inv.unitCost} / {inv.unit}</span>
                      </p>
                    </div>

                    {/* Stock Numbers Display */}
                    <div className="grid grid-cols-3 gap-6 text-center md:text-right bg-white/80 p-3.5 rounded-2xl border border-stone-200 shrink-0">
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">Current Stock</span>
                        <strong className="text-base font-black text-stone-900">{inv.currentStock} {inv.unit}</strong>
                      </div>

                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">3-Day Demand</span>
                        <strong className="text-base font-black text-amber-950">{inv.needed3Days} {inv.unit}</strong>
                      </div>

                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase block">3-Day Balance</span>
                        <strong className={`text-base font-black ${inv.isDeficit ? 'text-rose-700' : 'text-emerald-800'}`}>
                          {inv.balance3Days > 0 ? `+${inv.balance3Days}` : inv.balance3Days} {inv.unit}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

      {/* ==========================================
          TAB 2: STOCK ENTRY & AI BILL SCANNER
         ========================================== */}
      {activeTab === 'stock-entry' && (
        <IngredientPriceCalculator
          onBillSavedToVendorLedger={(bill) => setVendorBills((prev) => [bill, ...prev])}
        />
      )}

      {/* ==========================================
          TAB 3: VENDORS & PURCHASE ORDERS (Item Selection, Perishable 3-Day Limit & Printable PO)
         ========================================== */}
      {activeTab === 'vendors' && (
        <div className="space-y-6 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-stone-900">Approved Vendor Network & Rate Contract PO Terminal</h3>
              <p className="text-xs text-stone-500">Manage vendor profiles, addresses, bank A/C details, rate contracts, custom itemized POs with 3-day perishable caps, and printable orders.</p>
            </div>

            <button
              onClick={() => setShowAddVendorModal(true)}
              className="bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs transition-all flex items-center gap-2 shadow-sm shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register New Vendor</span>
            </button>
          </div>

          {/* Vendor Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {vendors.map((v) => {
              const isSelected = v.id === selectedVendorId;

              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVendorId(v.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-2 flex flex-col justify-between ${
                    isSelected
                      ? 'bg-emerald-50/90 border-emerald-700 shadow-sm ring-2 ring-emerald-600/20'
                      : 'bg-stone-50/80 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded">
                        {v.category}
                      </span>
                      <span className="text-[10px] font-extrabold text-stone-500 bg-stone-200 px-2 py-0.5 rounded">
                        {v.paymentTerms}
                      </span>
                    </div>

                    <h4 className="font-extrabold text-stone-900 text-base mt-2">{v.name}</h4>
                    <p className="text-xs text-stone-600 font-bold mt-0.5">{v.contactPerson} ({v.phone})</p>
                    <p className="text-[10px] text-stone-500 line-clamp-1">{v.address}</p>
                  </div>

                  <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-xs font-bold text-stone-700">
                    <span>Agreed: {v.agreedItems?.length || v.itemsSupplied.length} Items</span>
                    <span className="text-emerald-800 font-extrabold flex items-center gap-1">
                      {isSelected ? '★ Active PO' : 'Select →'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Vendor PO Terminal */}
          {activeVendor && (
            <div className="bg-stone-50 border border-stone-200 p-6 rounded-3xl space-y-6 mt-6">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
                <div>
                  <span className="text-[10px] font-black uppercase text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-md border border-blue-200">
                    Custom Item Purchase Order Engine
                  </span>
                  <h3 className="text-xl font-black text-stone-900 mt-1">{activeVendor.name}</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Email: <strong>{activeVendor.email}</strong> • Phone: <strong>{activeVendor.phone}</strong> • Terms: <strong>{activeVendor.paymentTerms}</strong>
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Address: {activeVendor.address}
                  </p>
                  {activeVendor.bankDetails && (
                    <p className="text-xs text-emerald-900 font-bold mt-1 bg-emerald-100/70 px-2.5 py-1 rounded-lg w-fit">
                      🏦 Bank A/C: {activeVendor.bankDetails.accountNo} ({activeVendor.bankDetails.bankName}) • IFSC: {activeVendor.bankDetails.ifsc} • UPI: {activeVendor.bankDetails.upiId}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setShowPoModal(true)}
                  disabled={activeSelectedPoItemsList.length === 0}
                  className="bg-blue-900 hover:bg-blue-950 disabled:bg-stone-300 text-white font-black px-5 py-3 rounded-2xl text-xs transition-all shadow-md flex items-center gap-2 shrink-0"
                >
                  <FileText className="w-4 h-4 text-blue-300" />
                  <span>Generate Printable PO ({activeSelectedPoItemsList.length} Items Selected)</span>
                </button>
              </div>

              {/* Checkbox Item Selector & Editable Quantity Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-stone-900 text-sm flex items-center gap-2">
                    <Box className="w-4 h-4 text-emerald-700" />
                    <span>Select Items to Include in Purchase Order & Customize Order Quantities</span>
                  </h4>
                  <span className="text-[10px] font-bold text-purple-900 bg-purple-100 px-2.5 py-1 rounded-full">
                    ⚠️ Perishable items restricted to Max 3-Day stock demand
                  </span>
                </div>

                <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-stone-900 text-stone-200 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-3 w-10 text-center">Select</th>
                        <th className="p-3">Item Description</th>
                        <th className="p-3">Category / Tag</th>
                        <th className="p-3 text-center">Agreed Rate Contract</th>
                        <th className="p-3 text-center">Ordered Quantity</th>
                        <th className="p-3 text-right">Line Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 font-medium text-stone-800">
                      {allVendorSupplyItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-4 text-center text-stone-400 font-bold">
                            No items assigned to this vendor yet. Register items in vendor agreement.
                          </td>
                        </tr>
                      ) : (
                        allVendorSupplyItems.map((item) => {
                          const isChecked = poSelectedItems[item.itemName]?.checked ?? true;
                          const currentQty = poSelectedItems[item.itemName]?.orderQty ?? item.defaultQty;
                          const lineTotal = currentQty * item.unitRate;

                          return (
                            <tr key={item.itemName} className={`hover:bg-stone-50 ${isChecked ? 'bg-emerald-50/30' : 'opacity-60'}`}>
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePoItemCheck(item.itemName)}
                                  className="w-4 h-4 text-emerald-800 rounded border-stone-300 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>
                              <td className="p-3 font-extrabold text-stone-900">
                                {item.itemName}
                                {item.isPerishable && (
                                  <span className="ml-2 text-[9px] font-extrabold bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded border border-purple-200">
                                    🥩 Perishable (Max 3-Day Cap: {item.max3DayDemand} {item.unit})
                                  </span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                  {item.category}
                                </span>
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-emerald-900">
                                ₹{item.unitRate} / {item.unit}
                              </td>
                              <td className="p-3 text-center">
                                {isChecked ? (
                                  <div className="flex items-center justify-center gap-1 max-w-[140px] mx-auto">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0.5"
                                      max={item.isPerishable ? item.max3DayDemand : 500}
                                      value={currentQty}
                                      onChange={(e) => updatePoItemQty(item.itemName, Number(e.target.value), item.isPerishable, item.max3DayDemand)}
                                      className="w-20 p-1 bg-white border border-stone-300 rounded-lg text-center font-black text-stone-900 focus:border-emerald-600 outline-none"
                                    />
                                    <span className="text-stone-500 font-bold text-[11px]">{item.unit}</span>
                                  </div>
                                ) : (
                                  <span className="text-stone-400 italic">Unselected</span>
                                )}
                              </td>
                              <td className="p-3 text-right font-black text-stone-900">
                                {isChecked ? `₹${lineTotal.toLocaleString('en-IN')}` : '₹0'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-200">
                  <span className="text-xs font-bold text-stone-600">
                    Total Items Selected for Purchase Order: <strong className="text-stone-900">{activeSelectedPoItemsList.length} Items</strong>
                  </span>
                  <div className="text-right">
                    <span className="text-[10px] text-stone-400 uppercase font-bold block">Estimated Purchase Value</span>
                    <span className="text-xl font-black text-emerald-900">₹{activePoGrandTotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>
      )}

      {/* ==========================================
          TAB 4: KITCHEN YIELD & PHYSICAL WEIGHING AUDIT (End-of-Day Pre-PO Workflow)
         ========================================== */}
      {activeTab === 'variance' && (
        <div className="space-y-6 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm text-xs">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-md flex items-center gap-1 w-fit mb-1">
                <Scale className="w-3.5 h-3.5 text-amber-700" />
                End-of-Day Physical Weight & Pre-PO Stock Audit
              </span>
              <h3 className="text-xl font-black text-stone-900">Physical Stock Weighing & Automatic Yield Shortfall Calculator</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Before issuing a new Purchase Order (PO), physically weigh remaining raw stock at the end of the day. System calculates recipe-based suitable portions remaining, computes unexplained wastage/shortfall loss, and updates warehouse stock.
              </p>
            </div>
          </div>

          {/* Interactive Physical Weighing Calculator Form */}
          <div className="bg-stone-50 p-6 rounded-3xl border border-stone-200 space-y-6">
            <h4 className="font-black text-stone-900 text-sm flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-800" />
              <span>Weigh & Update Raw Stock Before New PO Sourcing</span>
            </h4>

            <form onSubmit={handleSubmitPhysicalAudit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-stone-700 font-bold mb-1">Dish / Recipe Name</label>
                  <input
                    type="text"
                    value={physicalAuditForm.recipeDishName}
                    onChange={(e) => setPhysicalAuditForm({ ...physicalAuditForm, recipeDishName: e.target.value })}
                    className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-stone-900 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Raw Ingredient Name</label>
                  <input
                    type="text"
                    value={physicalAuditForm.ingredientName}
                    onChange={(e) => setPhysicalAuditForm({ ...physicalAuditForm, ingredientName: e.target.value })}
                    className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-stone-900 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Purchased Stock Batch (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={physicalAuditForm.initialPurchasedKg}
                    onChange={(e) => setPhysicalAuditForm({ ...physicalAuditForm, initialPurchasedKg: Number(e.target.value) })}
                    className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-stone-900 font-bold text-center"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-bold mb-1">Portions Cooked Today</label>
                  <input
                    type="number"
                    value={physicalAuditForm.portionsCookedToday}
                    onChange={(e) => setPhysicalAuditForm({ ...physicalAuditForm, portionsCookedToday: Number(e.target.value) })}
                    className="w-full bg-white border border-stone-300 rounded-xl px-3 py-2 text-stone-900 font-bold text-center"
                  />
                </div>
              </div>

              {/* Physical Weighing Entry Highlight Box */}
              <div className="bg-amber-100/80 border-2 border-amber-300 p-5 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase text-amber-950 tracking-wider block">Physical Measurement Input</span>
                    <h5 className="font-extrabold text-amber-950 text-sm">Enter Physically Measured Weight Remaining As Of Today</h5>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-600 font-bold text-xs">Measured Balance Weight:</span>
                    <input
                      type="number"
                      step="0.05"
                      required
                      value={physicalAuditForm.physicallyWeighedBalanceKg}
                      onChange={(e) => setPhysicalAuditForm({ ...physicalAuditForm, physicallyWeighedBalanceKg: Number(e.target.value) })}
                      className="w-28 p-2 bg-white border-2 border-amber-600 rounded-xl text-center font-black text-amber-950 text-base outline-none shadow-xs"
                    />
                    <span className="text-amber-900 font-bold text-sm">kg</span>
                  </div>
                </div>

                {/* Live Auto-Calculated Math Preview */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-amber-200">
                  <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-stone-500 font-bold uppercase block">Expected Remaining</span>
                    <strong className="text-stone-900 font-black">{calculatedAuditStats.expectedRemainingBalanceKg} kg</strong>
                    <span className="text-[9px] text-stone-400 block">(100 biriyani capacity - 90 cooked)</span>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-stone-500 font-bold uppercase block">Recipe Capacity Remaining</span>
                    <strong className="text-emerald-900 font-black text-sm">{calculatedAuditStats.suitablePortionsRemaining} Portions Only</strong>
                    <span className="text-[9px] text-emerald-700 block">(0.5kg suitable for 5 biriyanis)</span>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-rose-800 font-bold uppercase block">Unexplained Wastage Shortfall</span>
                    <strong className="text-rose-700 font-black text-sm">-{calculatedAuditStats.shortageKg} kg ({calculatedAuditStats.shortagePortions} Portions)</strong>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200">
                    <span className="text-[10px] text-rose-800 font-bold uppercase block">Wastage Cost Impact</span>
                    <strong className="text-rose-700 font-black text-sm">₹{calculatedAuditStats.wastageCostLoss} Loss</strong>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <input
                  type="text"
                  value={physicalAuditForm.auditNotes}
                  onChange={(e) => setPhysicalAuditForm({ ...physicalAuditForm, auditNotes: e.target.value })}
                  placeholder="Audit reason / observations..."
                  className="w-full sm:w-2/3 bg-white border border-stone-300 rounded-xl px-3 py-2 text-stone-800 text-xs font-medium"
                />

                <button
                  type="submit"
                  className="bg-amber-800 hover:bg-amber-900 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs shadow-md shrink-0 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Update Stock & Save Physical Audit</span>
                </button>
              </div>
            </form>
          </div>

          {/* Historical Yield Audit Table */}
          <div className="space-y-3">
            <h4 className="font-black text-stone-900 text-sm">Physical Stock Audit & Yield Variance Logs</h4>
            <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white">
              <table className="w-full text-left">
                <thead className="bg-stone-900 text-stone-200 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Audit Date</th>
                    <th className="p-3">Recipe / Ingredient</th>
                    <th className="p-3 text-center">Expected vs Actual Yield</th>
                    <th className="p-3 text-center">Variance %</th>
                    <th className="p-3 text-center">Cost Loss (₹)</th>
                    <th className="p-3">Audit Root Cause</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {wastageLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-stone-50">
                      <td className="p-3 font-bold text-stone-700">{log.date}</td>
                      <td className="p-3">
                        <div className="font-extrabold text-stone-900">{log.recipeDishName}</div>
                        <div className="text-[11px] text-stone-500">{log.ingredientName} ({log.purchasedQtyUsed} {log.unit})</div>
                      </td>
                      <td className="p-3 text-center font-bold text-stone-800">
                        {log.expectedPortions} expected ➔ {log.actualPortionsProduced} actual
                      </td>
                      <td className="p-3 text-center font-black text-rose-700">
                        {log.yieldVariancePct}%
                      </td>
                      <td className="p-3 text-center font-black text-stone-900">
                        ₹{log.wastageCostLoss}
                      </td>
                      <td className="p-3 text-stone-600 italic">
                        {log.rootCause}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ==========================================
          TAB 5: KITCHEN ASSETS & CONSUMABLES (Detailed View & Previous Purchase History Logs)
         ========================================== */}
      {activeTab === 'assets-consumables' && (
        <div className="space-y-6 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm text-xs">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-md">
                Capital Equipment & Non-Food Operating Consumables
              </span>
              <h3 className="text-xl font-black text-stone-900 mt-1">Non-Food Kitchen Inventory, Warranty & Previous Purchase History</h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Track quantity in stock, location, warranty period, supplier details, and click on items like LPG cylinders or paper rolls to view previous purchase dates and costs.
              </p>
            </div>

            <button
              onClick={() => setShowAddAssetModal(true)}
              className="bg-purple-900 hover:bg-purple-950 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs transition-all shadow-sm flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Asset / Consumable</span>
            </button>
          </div>

          {/* Detailed Assets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assetsList.map((ast) => {
              const histCount = ast.purchaseHistory?.length || 1;

              return (
                <div key={ast.id} className="p-4 rounded-2xl border border-stone-200 bg-stone-50/80 space-y-3 flex flex-col justify-between hover:bg-stone-50 transition-all">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase bg-purple-100 text-purple-900 px-2 py-0.5 rounded border border-purple-200">
                        {ast.category}
                      </span>
                      <span className="text-[10px] font-bold text-stone-500">
                        Last Purchased: {ast.purchaseDate}
                      </span>
                    </div>

                    <h4 className="font-extrabold text-stone-900 text-base mt-2">{ast.name}</h4>
                    <p className="text-stone-500 mt-0.5">Location: <strong className="text-stone-700">{ast.location}</strong></p>
                    <p className="text-stone-500">Supplier: <strong className="text-stone-700">{ast.supplier}</strong></p>
                  </div>

                  <div className="pt-2 border-t border-stone-200 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-stone-500 font-bold">Current Quantity in Stock:</span>
                      <strong className="text-stone-900 font-black text-sm">{ast.quantity} {ast.unit}</strong>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-stone-500 font-bold">Unit Price:</span>
                      <strong className="text-stone-800 font-bold">₹{ast.unitCost} / {ast.unit}</strong>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="text-stone-500 font-bold">Total Investment:</span>
                      <strong className="text-emerald-800 font-black">₹{ast.totalCost.toLocaleString('en-IN')}</strong>
                    </div>

                    {ast.warrantyPeriod && (
                      <span className="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded block text-center">
                        🛡️ {ast.warrantyPeriod}
                      </span>
                    )}

                    {/* Action Buttons: History & Log Purchase */}
                    <div className="pt-2 flex items-center gap-2">
                      <button
                        onClick={() => setSelectedAssetForHistory(ast)}
                        className="flex-1 bg-stone-200 hover:bg-stone-300 text-stone-800 font-extrabold py-1.5 px-2 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1"
                      >
                        <History className="w-3.5 h-3.5 text-stone-600" />
                        <span>Previous Purchases ({histCount})</span>
                      </button>

                      <button
                        onClick={() => handleOpenLogPurchase(ast)}
                        className="bg-purple-900 hover:bg-purple-950 text-white font-extrabold py-1.5 px-3 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Log Purchase</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* ==========================================
          MODALS & DIALOGS
         ========================================== */}

      {/* ADD RAW INGREDIENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-xl font-black text-stone-900">Add New Raw Material to Warehouse</h3>
              <button onClick={() => setShowAddModal(false)} className="text-stone-400 hover:text-stone-700 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={handleAddCustomItem} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-stone-700 mb-1">Ingredient Name</label>
                <input
                  type="text"
                  required
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="e.g. Organic Chia Seeds, Extra Virgin Olive Oil"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 mb-1">Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  >
                    <option value="Proteins">Proteins</option>
                    <option value="Grains & Flours">Grains & Flours</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Vegetables">Vegetables</option>
                    <option value="Spices & Condiments">Spices & Condiments</option>
                    <option value="Packaging">Packaging</option>
                  </select>
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Unit</label>
                  <select
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="liters">liters</option>
                    <option value="ml">ml</option>
                    <option value="units">units</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-700 mb-1">Initial Stock</label>
                  <input
                    type="number"
                    required
                    value={newItem.currentStock}
                    onChange={(e) => setNewItem({ ...newItem, currentStock: Number(e.target.value) })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Min Threshold</label>
                  <input
                    type="number"
                    required
                    value={newItem.minThreshold}
                    onChange={(e) => setNewItem({ ...newItem, minThreshold: Number(e.target.value) })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Unit Cost (₹)</label>
                  <input
                    type="number"
                    required
                    value={newItem.unitCost}
                    onChange={(e) => setNewItem({ ...newItem, unitCost: Number(e.target.value) })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-700 mb-1">Supplier Name</label>
                <input
                  type="text"
                  required
                  value={newItem.supplier}
                  onChange={(e) => setNewItem({ ...newItem, supplier: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-100">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 shadow-md">Save Material</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REGISTER NEW VENDOR MODAL */}
      {showAddVendorModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-6 shadow-2xl border border-stone-200 my-8">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-xl font-black text-stone-900">Register New Supplier / Vendor Account</h3>
              <button onClick={() => setShowAddVendorModal(false)} className="text-stone-400 hover:text-stone-700 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={handleAddNewVendor} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 mb-1">Vendor Company Name</label>
                  <input
                    type="text"
                    required
                    value={newVendorForm.name}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, name: e.target.value })}
                    placeholder="e.g. Malabar Spice Traders"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Category</label>
                  <select
                    value={newVendorForm.category}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, category: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  >
                    <option value="Proteins & Poultry">Proteins & Poultry</option>
                    <option value="Grains & Kerala Flours">Grains & Kerala Flours</option>
                    <option value="Dairy & Milk Products">Dairy & Milk Products</option>
                    <option value="Vegetables & Farm Produce">Vegetables & Farm Produce</option>
                    <option value="Non-Food Packaging & Consumables">Non-Food Packaging & Consumables</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={newVendorForm.contactPerson}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, contactPerson: e.target.value })}
                    placeholder="e.g. Rajesh Nair"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={newVendorForm.phone}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Payment Terms</label>
                  <select
                    value={newVendorForm.paymentTerms}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, paymentTerms: e.target.value as any })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  >
                    <option value="Immediate Cash">Immediate Cash</option>
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Net 30 Days">Net 30 Days</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-700 mb-1">Complete Postal Address</label>
                <textarea
                  rows={2}
                  value={newVendorForm.address}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, address: e.target.value })}
                  placeholder="Door No, Street, Industrial Area, City, Pin Code"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2 text-stone-900"
                />
              </div>

              {/* Bank Account Details */}
              <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 space-y-2">
                <span className="text-[10px] font-black uppercase text-emerald-800">Bank Account & Settlement Details</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] text-stone-600 mb-0.5">Account No</label>
                    <input
                      type="text"
                      value={newVendorForm.bankAccountNo}
                      onChange={(e) => setNewVendorForm({ ...newVendorForm, bankAccountNo: e.target.value })}
                      placeholder="9180200..."
                      className="w-full bg-white border border-stone-200 rounded-lg p-1.5 text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-600 mb-0.5">Bank Name</label>
                    <input
                      type="text"
                      value={newVendorForm.bankName}
                      onChange={(e) => setNewVendorForm({ ...newVendorForm, bankName: e.target.value })}
                      placeholder="HDFC Ernakulam"
                      className="w-full bg-white border border-stone-200 rounded-lg p-1.5 text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-600 mb-0.5">IFSC Code</label>
                    <input
                      type="text"
                      value={newVendorForm.bankIfsc}
                      onChange={(e) => setNewVendorForm({ ...newVendorForm, bankIfsc: e.target.value })}
                      placeholder="HDFC0001234"
                      className="w-full bg-white border border-stone-200 rounded-lg p-1.5 text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-stone-600 mb-0.5">UPI ID</label>
                    <input
                      type="text"
                      value={newVendorForm.bankUpi}
                      onChange={(e) => setNewVendorForm({ ...newVendorForm, bankUpi: e.target.value })}
                      placeholder="vendor@upi"
                      className="w-full bg-white border border-stone-200 rounded-lg p-1.5 text-stone-900"
                    />
                  </div>
                </div>
              </div>

              {/* Items in Agreement & Rate Contract */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-stone-800">Items Agreed & Agreed Rate Contract Price</span>
                  <button
                    type="button"
                    onClick={handleAddAgreedItemRow}
                    className="text-[10px] bg-emerald-100 text-emerald-900 font-bold px-2 py-1 rounded-lg"
                  >
                    + Add Item Row
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {newVendorForm.agreedItemsList.map((ag, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 bg-stone-50 p-2 rounded-xl border border-stone-200 text-[11px]">
                      <input
                        type="text"
                        placeholder="Item Name (e.g. Rice)"
                        value={ag.itemName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewVendorForm((prev) => {
                            const updated = [...prev.agreedItemsList];
                            updated[idx].itemName = val;
                            return { ...prev, agreedItemsList: updated };
                          });
                        }}
                        className="col-span-5 bg-white border border-stone-200 rounded-lg p-1.5 font-bold"
                      />

                      <input
                        type="number"
                        placeholder="Agreed ₹"
                        value={ag.agreedRate}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setNewVendorForm((prev) => {
                            const updated = [...prev.agreedItemsList];
                            updated[idx].agreedRate = val;
                            return { ...prev, agreedItemsList: updated };
                          });
                        }}
                        className="col-span-3 bg-white border border-stone-200 rounded-lg p-1.5 font-bold text-center"
                      />

                      <select
                        value={ag.unit}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewVendorForm((prev) => {
                            const updated = [...prev.agreedItemsList];
                            updated[idx].unit = val;
                            return { ...prev, agreedItemsList: updated };
                          });
                        }}
                        className="col-span-2 bg-white border border-stone-200 rounded-lg p-1"
                      >
                        <option value="kg">kg</option>
                        <option value="liters">liters</option>
                        <option value="units">units</option>
                        <option value="boxes">boxes</option>
                        <option value="cylinders">cylinders</option>
                      </select>

                      <select
                        value={ag.contractType}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setNewVendorForm((prev) => {
                            const updated = [...prev.agreedItemsList];
                            updated[idx].contractType = val;
                            return { ...prev, agreedItemsList: updated };
                          });
                        }}
                        className="col-span-2 bg-white border border-stone-200 rounded-lg p-1"
                      >
                        <option value="Rate Contract">Fixed Rate</option>
                        <option value="Market Variable">Variable</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-100">
                <button type="button" onClick={() => setShowAddVendorModal(false)} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 shadow-md">Create Vendor Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINTABLE PURCHASE ORDER MODAL */}
      {showPoModal && activeVendor && (
        <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-3xl w-full space-y-6 shadow-2xl border border-stone-200 my-8">
            
            {/* Action Bar for Modal */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-4 print:hidden">
              <div>
                <span className="text-[10px] font-black uppercase text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                  Official Printable Purchase Order
                </span>
                <h3 className="text-xl font-black text-stone-900 mt-1">Purchase Order Preview</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintPo}
                  className="bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow-sm flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print PO Document</span>
                </button>
                <button onClick={() => setShowPoModal(false)} className="text-stone-400 hover:text-stone-700 text-lg font-bold">✕</button>
              </div>
            </div>

            {/* Printable Document Box */}
            <div id="printable-po-document" className="p-6 bg-white border border-stone-300 rounded-2xl space-y-6 text-xs font-sans">
              
              {/* Document Header */}
              <div className="flex items-start justify-between border-b-2 border-stone-900 pb-4">
                <div>
                  <h2 className="text-xl font-black text-stone-900 tracking-tight">NourishFit Cloud Kitchens & Meals</h2>
                  <p className="text-[11px] text-stone-600">Central Sourcing Hub & Cloud Kitchen Division</p>
                  <p className="text-[10px] text-stone-500">Kakkanad IT Zone, Kochi, Kerala 682030 • GSTIN: 32AABCN9921K1Z3</p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-blue-900 block uppercase">PURCHASE ORDER</span>
                  <p className="font-mono font-bold text-stone-900">PO #{`PO-2026-${Math.floor(1000 + Math.random() * 9000)}`}</p>
                  <p className="text-stone-600">Date: <strong>{currentDateStr}</strong></p>
                </div>
              </div>

              {/* Vendor & Delivery Addresses */}
              <div className="grid grid-cols-2 gap-6 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <div>
                  <span className="text-[10px] text-stone-400 uppercase block font-bold">VENDOR DETAILS</span>
                  <p className="font-extrabold text-stone-900 text-sm">{activeVendor.name}</p>
                  <p className="text-stone-600">Attn: {activeVendor.contactPerson} ({activeVendor.phone})</p>
                  <p className="text-stone-600">{activeVendor.address}</p>
                  <p className="text-stone-600 font-mono mt-1">Email: {activeVendor.email}</p>
                </div>

                <div>
                  <span className="text-[10px] text-stone-400 uppercase block font-bold">DELIVERY & PAYMENT TERMS</span>
                  <p className="text-stone-700">Delivery Address: <strong>NourishFit Central Kitchen, Kakkanad, Kochi</strong></p>
                  <p className="text-stone-700">Payment Terms: <strong>{activeVendor.paymentTerms}</strong></p>
                  {activeVendor.bankDetails && (
                    <p className="text-stone-700 font-mono text-[10px] mt-1">
                      Bank A/C: {activeVendor.bankDetails.accountNo} ({activeVendor.bankDetails.bankName})
                    </p>
                  )}
                </div>
              </div>

              {/* Order Items Table */}
              <div className="border border-stone-300 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-stone-900 text-stone-100 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-2.5">S.No</th>
                      <th className="p-2.5">Item Description</th>
                      <th className="p-2.5 text-center">Ordered Qty</th>
                      <th className="p-2.5 text-center">Agreed Unit Rate (₹)</th>
                      <th className="p-2.5 text-right">Total Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 font-medium text-stone-800">
                    {activeSelectedPoItemsList.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 text-center font-bold text-stone-500">{idx + 1}</td>
                        <td className="p-2.5 font-extrabold text-stone-900">
                          {it.itemName}
                          {it.isPerishable && <span className="ml-2 text-[9px] text-purple-800 font-bold">(Perishable 3-Day Stock)</span>}
                        </td>
                        <td className="p-2.5 text-center font-extrabold text-stone-900">{it.orderQty} {it.unit}</td>
                        <td className="p-2.5 text-center">₹{it.unitRate}</td>
                        <td className="p-2.5 text-right font-black text-stone-900">₹{it.lineTotal.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Grand Total & Signatures */}
              <div className="flex items-start justify-between pt-2">
                <div className="space-y-1 text-[11px] text-stone-600">
                  <p>1. Deliver material in food-grade sealed condition.</p>
                  <p>2. Invoice must reference PO number above.</p>
                </div>

                <div className="text-right">
                  <span className="text-stone-500 font-bold block text-[11px]">GRAND TOTAL AMOUNT</span>
                  <span className="text-2xl font-black text-emerald-950">₹{activePoGrandTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="pt-8 grid grid-cols-2 gap-8 text-center border-t border-stone-200">
                <div>
                  <div className="h-10 border-b border-dashed border-stone-400"></div>
                  <span className="text-[10px] font-bold text-stone-500 uppercase mt-1 block">Prepared By: Purchase Manager</span>
                </div>
                <div>
                  <div className="h-10 border-b border-dashed border-stone-400"></div>
                  <span className="text-[10px] font-bold text-stone-500 uppercase mt-1 block">Authorized Signature & Stamp</span>
                </div>
              </div>

            </div>

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-200 print:hidden">
              <button onClick={() => setShowPoModal(false)} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold">Close Preview</button>
              <button
                onClick={() => {
                  confetti({ particleCount: 50, spread: 70 });
                  alert(`Purchase Order dispatched to vendor ${activeVendor.name} (${activeVendor.email})! You can now print and carry for physical purchase.`);
                  setShowPoModal(false);
                }}
                className="bg-blue-900 hover:bg-blue-950 text-white font-extrabold px-6 py-2.5 rounded-2xl text-xs shadow-md"
              >
                Confirm & Dispatch PO
              </button>
            </div>

          </div>
        </div>
      )}

      {/* PREVIOUS PURCHASE HISTORY TIMELINE MODAL */}
      {selectedAssetForHistory && (
        <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                  Consumables Purchase History Log
                </span>
                <h3 className="text-xl font-black text-stone-900 mt-1">{selectedAssetForHistory.name}</h3>
              </div>
              <button onClick={() => setSelectedAssetForHistory(null)} className="text-stone-400 hover:text-stone-700 text-lg font-bold">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-stone-400 uppercase font-bold block">Current Total Stock</span>
                  <strong className="text-stone-900 font-black text-base">{selectedAssetForHistory.quantity} {selectedAssetForHistory.unit}</strong>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-stone-400 uppercase font-bold block">Supplier</span>
                  <strong className="text-stone-800 font-bold">{selectedAssetForHistory.supplier}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-extrabold text-stone-900 text-xs">Previous Purchase Logs Timeline:</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {(selectedAssetForHistory.purchaseHistory || []).map((ph, idx) => (
                    <div key={ph.id || idx} className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-stone-900">{ph.date}</span>
                          {ph.invoiceNo && <span className="text-[10px] font-mono text-purple-800 bg-purple-50 px-1.5 py-0.5 rounded">{ph.invoiceNo}</span>}
                        </div>
                        <p className="text-stone-500 text-[11px] mt-0.5">Purchased: <strong className="text-stone-800">{ph.quantity} {selectedAssetForHistory.unit}</strong> @ ₹{ph.unitCost}/unit</p>
                      </div>

                      <div className="text-right">
                        <span className="font-black text-emerald-900 text-sm">₹{ph.totalCost.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
                <button
                  onClick={() => {
                    handleOpenLogPurchase(selectedAssetForHistory);
                  }}
                  className="bg-purple-900 hover:bg-purple-950 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log New Purchase Batch</span>
                </button>

                <button onClick={() => setSelectedAssetForHistory(null)} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOG NEW PURCHASE MODAL */}
      {showLogPurchaseModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-lg font-black text-stone-900">Log New Consumables / Asset Purchase</h3>
              <button onClick={() => setShowLogPurchaseModal(false)} className="text-stone-400 hover:text-stone-700 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveLogPurchase} className="space-y-4 text-xs font-bold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 mb-1">Purchase Date</label>
                  <input
                    type="text"
                    required
                    value={logPurchaseForm.purchaseDate}
                    onChange={(e) => setLogPurchaseForm({ ...logPurchaseForm, purchaseDate: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Quantity Purchased</label>
                  <input
                    type="number"
                    required
                    value={logPurchaseForm.addedQuantity}
                    onChange={(e) => setLogPurchaseForm({ ...logPurchaseForm, addedQuantity: Number(e.target.value) })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 mb-1">Unit Cost (₹)</label>
                  <input
                    type="number"
                    required
                    value={logPurchaseForm.unitCost}
                    onChange={(e) => setLogPurchaseForm({ ...logPurchaseForm, unitCost: Number(e.target.value) })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value={logPurchaseForm.invoiceNo}
                    onChange={(e) => setLogPurchaseForm({ ...logPurchaseForm, invoiceNo: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-100">
                <button type="button" onClick={() => setShowLogPurchaseModal(false)} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-purple-900 text-white rounded-xl text-xs font-bold hover:bg-purple-950 shadow-md">Add Purchase Log</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ASSET / CONSUMABLE MODAL */}
      {showAddAssetModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-xl font-black text-stone-900">Add Kitchen Asset or Consumable</h3>
              <button onClick={() => setShowAddAssetModal(false)} className="text-stone-400 hover:text-stone-700 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={handleAddAssetItem} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-stone-700 mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={newAssetForm.name}
                  onChange={(e) => setNewAssetForm({ ...newAssetForm, name: e.target.value })}
                  placeholder="e.g. Stainless Steel Work Desk, Thermal Paper Rolls"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 mb-1">Category</label>
                  <select
                    value={newAssetForm.category}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, category: e.target.value as any })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  >
                    <option value="Capital Equipment">Capital Equipment</option>
                    <option value="Non-Food Consumable">Non-Food Consumable</option>
                    <option value="Furniture & Desk">Furniture & Desk</option>
                    <option value="Kitchen Hardware & Utensils">Kitchen Hardware & Utensils</option>
                  </select>
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Measurement Unit</label>
                  <input
                    type="text"
                    value={newAssetForm.unit}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, unit: e.target.value })}
                    placeholder="units, rolls, cylinders, boxes"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    required
                    value={newAssetForm.quantity}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, quantity: Number(e.target.value) })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Unit Cost (₹)</label>
                  <input
                    type="number"
                    required
                    value={newAssetForm.unitCost}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, unitCost: Number(e.target.value) })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-700 mb-1">Supplier Name</label>
                <input
                  type="text"
                  required
                  value={newAssetForm.supplier}
                  onChange={(e) => setNewAssetForm({ ...newAssetForm, supplier: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-100">
                <button type="button" onClick={() => setShowAddAssetModal(false)} className="px-4 py-2 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-purple-900 text-white rounded-xl text-xs font-bold hover:bg-purple-950 shadow-md">Save Asset / Consumable</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
