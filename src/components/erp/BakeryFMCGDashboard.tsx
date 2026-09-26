import React, { useState } from 'react';
import { 
  PackagedProductItem, 
  BakeryProductionBatch, 
  RetailShopDestination, 
  FMCGDispatchChallan, 
  FMCGReturnTicket, 
  FMCGPaymentRecord, 
  FMCGExpiryAlert,
  PackagedProductCategory,
  DestinationChannelType,
  BatchProductionStatus
} from '../../types';
import { 
  FMCG_PACKAGED_PRODUCTS, 
  INITIAL_BAKERY_BATCHES, 
  INITIAL_RETAIL_DESTINATIONS, 
  INITIAL_DISPATCH_CHALLANS, 
  INITIAL_RETURN_TICKETS, 
  INITIAL_PAYMENT_RECORDS, 
  INITIAL_EXPIRY_ALERTS 
} from '../../data/mockBakeryFMCGData';
import { 
  Sparkles, 
  Package, 
  Truck, 
  Printer, 
  AlertTriangle, 
  DollarSign, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Search, 
  Filter, 
  Building2, 
  Store, 
  Dumbbell, 
  Coffee, 
  RefreshCw, 
  FileText, 
  Barcode, 
  ShieldCheck, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  ChevronRight, 
  X, 
  Check, 
  AlertOctagon, 
  Percent, 
  Layers, 
  Leaf, 
  Flame,
  Info,
  Sliders,
  Send,
  CreditCard,
  MapPin,
  Phone,
  UserCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface BakeryFMCGDashboardProps {
  onSwitchRole?: (role: string) => void;
}

export const BakeryFMCGDashboard: React.FC<BakeryFMCGDashboardProps> = ({ onSwitchRole }) => {
  // Main State
  const [activeTab, setActiveTab] = useState<'batches' | 'logistics' | 'labels' | 'shop_ledger' | 'expiry_returns' | 'payments'>('batches');
  
  // Data State
  const [products] = useState<PackagedProductItem[]>(FMCG_PACKAGED_PRODUCTS);
  const [batches, setBatches] = useState<BakeryProductionBatch[]>(INITIAL_BAKERY_BATCHES);
  const [shops, setShops] = useState<RetailShopDestination[]>(INITIAL_RETAIL_DESTINATIONS);
  const [challans, setChallans] = useState<FMCGDispatchChallan[]>(INITIAL_DISPATCH_CHALLANS);
  const [returns, setReturns] = useState<FMCGReturnTicket[]>(INITIAL_RETURN_TICKETS);
  const [payments, setPayments] = useState<FMCGPaymentRecord[]>(INITIAL_PAYMENT_RECORDS);
  const [expiryAlerts, setExpiryAlerts] = useState<FMCGExpiryAlert[]>(INITIAL_EXPIRY_ALERTS);

  // Search & Filter State
  const [batchCategoryFilter, setBatchCategoryFilter] = useState<string>('all');
  const [shopChannelFilter, setShopChannelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals State
  const [newBatchModalOpen, setNewBatchModalOpen] = useState(false);
  const [newDispatchModalOpen, setNewDispatchModalOpen] = useState(false);
  const [newReturnModalOpen, setNewReturnModalOpen] = useState(false);
  const [newPaymentModalOpen, setNewPaymentModalOpen] = useState(false);
  const [newShopModalOpen, setNewShopModalOpen] = useState(false);
  
  // Batch Label Printing State
  const [selectedBatchForLabel, setSelectedBatchForLabel] = useState<BakeryProductionBatch>(batches[0]);
  const [labelPrintCopies, setLabelPrintCopies] = useState<number>(24);
  const [labelFormat, setLabelFormat] = useState<'4x2_thermal' | 'a4_sheet' | 'box_shipping' | 'pos_80mm'>('4x2_thermal');

  // Form State: New Batch
  const [batchForm, setBatchForm] = useState({
    productId: FMCG_PACKAGED_PRODUCTS[0].id,
    plannedQuantity: 500,
    productionFacility: 'Central Bakery Unit, Kochi Hub',
    leadBakerChef: 'Chef Kavitha Nair (Master Baker)',
    mfgDate: new Date().toISOString().split('T')[0],
    mfgTime: '06:00',
    notes: 'Standard morning production run'
  });

  // Form State: New Dispatch
  const [dispatchForm, setDispatchForm] = useState({
    shopId: INITIAL_RETAIL_DESTINATIONS[0].id,
    batchId: INITIAL_BAKERY_BATCHES[0].id,
    quantity: 100,
    vehicleNumber: 'KL-07-CC-4412 (Cold Van)',
    driverName: 'Suresh Kumar G.',
    driverPhone: '+91 98460 77123',
    transitTemperature: 'Ambient 21°C Controlled',
    paymentTerms: 'Net 30 Days'
  });

  // Form State: New Return Ticket
  const [returnForm, setReturnForm] = useState({
    shopId: INITIAL_RETAIL_DESTINATIONS[0].id,
    productId: FMCG_PACKAGED_PRODUCTS[0].id,
    batchNumber: 'BATCH-GB-2026-0815-A',
    quantityReturned: 10,
    reason: 'expired_shelf_life' as any,
    reasonDescription: 'Unsold stock retrieved after reaching expiry date.',
    dispositionAction: 'safe_bio_compost' as any,
    verifiedBy: 'Suresh Kumar (Logistics Inspector)'
  });

  // Form State: New Payment
  const [paymentForm, setPaymentForm] = useState({
    shopId: INITIAL_RETAIL_DESTINATIONS[3].id, // Lulu Hypermarket
    amount: 50000,
    paymentMode: 'neft_bank_transfer' as any,
    transactionRef: 'NEFT-HDFC-' + Math.floor(100000000 + Math.random() * 900000000),
    notes: 'Payment towards B2B invoice settlement.'
  });

  // Form State: New Shop
  const [shopForm, setShopForm] = useState({
    code: 'SHP-NEW-' + Math.floor(100 + Math.random() * 900),
    name: '',
    channelType: 'supermarket' as DestinationChannelType,
    outletType: 'External Retail Partner' as any,
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    city: 'Kochi',
    state: 'Kerala',
    pincode: '682001',
    paymentTerms: 'Net 30 Days' as any,
    creditLimit: 200000,
    discountMarginPct: 20
  });

  // Derived Calculations & Summary Stats
  const totalActiveProducts = products.filter(p => p.active).length;
  const totalUnitsInProduction = batches
    .filter(b => b.status === 'in_production' || b.status === 'baking_curing')
    .reduce((sum, b) => sum + b.plannedQuantity, 0);
  
  const totalUnitsSuppliedToday = challans
    .filter(c => c.dispatchDate === new Date().toISOString().split('T')[0] || c.dispatchDate === '2026-08-15')
    .reduce((sum, c) => sum + c.totalQuantity, 0);

  const totalOutstandingReceivables = shops.reduce((sum, s) => sum + s.outstandingBalance, 0);
  const totalReturnsValueCalculated = returns.reduce((sum, r) => sum + r.totalCreditAmount, 0);
  const criticalExpiryCount = expiryAlerts.filter(a => a.riskLevel === 'critical_expired' || a.riskLevel === 'high_expiring_soon').length;

  // Handler: Create Batch
  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find(p => p.id === batchForm.productId) || products[0];
    const mfgDateObj = new Date(batchForm.mfgDate);
    const expDateObj = new Date(mfgDateObj);
    expDateObj.setDate(expDateObj.getDate() + product.shelfLifeDays);
    const expDateStr = expDateObj.toISOString().split('T')[0];

    const categoryPrefix = 
      product.category === 'granola_bars' ? 'GB' :
      product.category === 'granola_pouches' ? 'GP' :
      product.category === 'protein_bars' ? 'PB' :
      product.category === 'artisan_breads' ? 'AB' :
      product.category === 'healthy_cookies' ? 'CK' : 'CB';

    const newBatch: BakeryProductionBatch = {
      id: 'batch-fmcg-' + Date.now(),
      batchNumber: `BATCH-${categoryPrefix}-${batchForm.mfgDate.replace(/-/g, '')}-${String.fromCharCode(65 + (batches.length % 26))}`,
      productId: product.id,
      productName: product.name,
      category: product.category,
      plannedQuantity: Number(batchForm.plannedQuantity),
      actualYield: Number(batchForm.plannedQuantity),
      wastageOrRejects: 0,
      productionFacility: batchForm.productionFacility,
      leadBakerChef: batchForm.leadBakerChef,
      mfgDate: batchForm.mfgDate,
      mfgTime: batchForm.mfgTime,
      expDate: expDateStr,
      shelfLifeDays: product.shelfLifeDays,
      status: 'in_production',
      qcPassed: false,
      costPerUnit: product.costToProduce,
      totalBatchCost: product.costToProduce * Number(batchForm.plannedQuantity),
      labelsPrintedCount: 0,
      createdAt: `${batchForm.mfgDate} ${batchForm.mfgTime}`,
      notes: batchForm.notes
    };

    setBatches([newBatch, ...batches]);
    setSelectedBatchForLabel(newBatch);
    setNewBatchModalOpen(false);
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
  };

  // Handler: Advance Batch Stage
  const handleAdvanceBatchStatus = (batchId: string, currentStatus: BatchProductionStatus) => {
    const nextStatusMap: Record<BatchProductionStatus, BatchProductionStatus> = {
      planned: 'in_production',
      in_production: 'baking_curing',
      baking_curing: 'quality_passed',
      quality_passed: 'packed_labeled',
      packed_labeled: 'dispatched_completed',
      dispatched_completed: 'dispatched_completed'
    };

    const nextStatus = nextStatusMap[currentStatus];
    setBatches(prev => prev.map(b => {
      if (b.id === batchId) {
        return {
          ...b,
          status: nextStatus,
          qcPassed: nextStatus === 'quality_passed' || nextStatus === 'packed_labeled' || nextStatus === 'dispatched_completed' ? true : b.qcPassed,
          qcSignoffBy: nextStatus === 'quality_passed' ? 'Dr. Priya Nair (QC Lead)' : b.qcSignoffBy
        };
      }
      return b;
    }));
  };

  // Handler: Create Dispatch Challan
  const handleCreateDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    const shop = shops.find(s => s.id === dispatchForm.shopId) || shops[0];
    const batch = batches.find(b => b.id === dispatchForm.batchId) || batches[0];
    const product = products.find(p => p.id === batch.productId) || products[0];
    const qty = Number(dispatchForm.quantity);
    const lineTotal = product.wholesalePrice * qty;

    const newChallan: FMCGDispatchChallan = {
      id: 'disp-fmcg-' + Date.now(),
      challanNumber: `DC-${new Date().toISOString().split('T')[0]}-${String(challans.length + 1).padStart(2, '0')}`,
      shopId: shop.id,
      shopName: shop.name,
      channelType: shop.channelType,
      dispatchDate: new Date().toISOString().split('T')[0],
      dispatchTime: new Date().toTimeString().slice(0, 5),
      deliveryExpectedDate: new Date().toISOString().split('T')[0],
      vehicleNumber: dispatchForm.vehicleNumber,
      driverName: dispatchForm.driverName,
      driverPhone: dispatchForm.driverPhone,
      transitTemperature: dispatchForm.transitTemperature,
      items: [
        {
          id: 'dli-' + Date.now(),
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          category: product.category,
          quantitySupplied: qty,
          unitWholesaleRate: product.wholesalePrice,
          unitMrp: product.mrp,
          lineTotal: lineTotal,
          mfgDate: batch.mfgDate,
          expDate: batch.expDate
        }
      ],
      totalQuantity: qty,
      totalValue: lineTotal,
      status: 'in_transit',
      paymentTerms: dispatchForm.paymentTerms || shop.paymentTerms,
      invoiceGenerated: true
    };

    // Update shop supplied stats
    setShops(prev => prev.map(s => {
      if (s.id === shop.id) {
        return {
          ...s,
          totalSuppliedUnits: s.totalSuppliedUnits + qty,
          currentShelfStockUnits: s.currentShelfStockUnits + qty,
          totalGrossSuppliedValue: s.totalGrossSuppliedValue + lineTotal,
          outstandingBalance: s.outstandingBalance + lineTotal
        };
      }
      return s;
    }));

    setChallans([newChallan, ...challans]);
    setNewDispatchModalOpen(false);
    confetti({ particleCount: 40, spread: 70, origin: { y: 0.6 } });
  };

  // Handler: Mark Challan Delivered
  const handleAcknowledgeDelivery = (challanId: string) => {
    setChallans(prev => prev.map(c => {
      if (c.id === challanId) {
        return {
          ...c,
          status: 'delivered_acknowledged',
          acknowledgedBy: 'Store Supervisor Verified',
          acknowledgementTimestamp: new Date().toLocaleString(),
          receiverNotes: 'All units received in sound condition. Seals intact.'
        };
      }
      return c;
    }));
  };

  // Handler: Create Return Ticket
  const handleCreateReturn = (e: React.FormEvent) => {
    e.preventDefault();
    const shop = shops.find(s => s.id === returnForm.shopId) || shops[0];
    const product = products.find(p => p.id === returnForm.productId) || products[0];
    const qty = Number(returnForm.quantityReturned);
    const creditAmount = product.wholesalePrice * qty;

    const newReturn: FMCGReturnTicket = {
      id: 'ret-fmcg-' + Date.now(),
      returnRef: `RET-${new Date().toISOString().split('T')[0]}-${String(returns.length + 1).padStart(2, '0')}`,
      shopId: shop.id,
      shopName: shop.name,
      batchNumber: returnForm.batchNumber,
      productId: product.id,
      productName: product.name,
      category: product.category,
      quantityReturned: qty,
      unitRate: product.wholesalePrice,
      totalCreditAmount: creditAmount,
      mfgDate: '2026-08-01',
      expDate: '2026-08-14',
      daysExpiredOrRemaining: returnForm.reason === 'expired_shelf_life' ? 1 : 0,
      reason: returnForm.reason,
      reasonDescription: returnForm.reasonDescription,
      dispositionAction: returnForm.dispositionAction,
      verifiedBy: returnForm.verifiedBy,
      returnDate: new Date().toISOString().split('T')[0],
      creditNoteIssued: true,
      creditNoteNumber: `CN-2026-08-${String(returns.length + 45).padStart(3, '0')}`,
      status: 'credit_approved'
    };

    // Update shop balance (Credit note deduction)
    setShops(prev => prev.map(s => {
      if (s.id === shop.id) {
        return {
          ...s,
          totalReturnedUnits: s.totalReturnedUnits + qty,
          currentShelfStockUnits: Math.max(0, s.currentShelfStockUnits - qty),
          totalReturnsValue: s.totalReturnsValue + creditAmount,
          outstandingBalance: Math.max(0, s.outstandingBalance - creditAmount)
        };
      }
      return s;
    }));

    setReturns([newReturn, ...returns]);
    setNewReturnModalOpen(false);
  };

  // Handler: Record Payment
  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const shop = shops.find(s => s.id === paymentForm.shopId) || shops[0];
    const amount = Number(paymentForm.amount);

    const newPayment: FMCGPaymentRecord = {
      id: 'pay-fmcg-' + Date.now(),
      receiptNumber: `REC-FMCG-2026-${String(payments.length + 101)}`,
      shopId: shop.id,
      shopName: shop.name,
      paymentDate: new Date().toISOString().split('T')[0],
      amount: amount,
      paymentMode: paymentForm.paymentMode,
      transactionRef: paymentForm.transactionRef,
      invoiceRefs: [`INV-FMCG-${shop.code}-2026`],
      recordedBy: 'Finance Ops Lead',
      notes: paymentForm.notes
    };

    setShops(prev => prev.map(s => {
      if (s.id === shop.id) {
        return {
          ...s,
          totalPaidAmount: s.totalPaidAmount + amount,
          outstandingBalance: Math.max(0, s.outstandingBalance - amount)
        };
      }
      return s;
    }));

    setPayments([newPayment, ...payments]);
    setNewPaymentModalOpen(false);
    confetti({ particleCount: 35, spread: 60, origin: { y: 0.6 } });
  };

  // Handler: Add New Shop
  const handleAddShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopForm.name) return;

    const newShop: RetailShopDestination = {
      id: 'dest-' + Date.now(),
      code: shopForm.code,
      name: shopForm.name,
      channelType: shopForm.channelType,
      outletType: shopForm.outletType,
      contactPerson: shopForm.contactPerson || 'Store Manager',
      phone: shopForm.phone || '+91 98460 00000',
      email: shopForm.email || 'store@partner.in',
      address: shopForm.address || 'Commercial Center',
      city: shopForm.city,
      state: shopForm.state,
      pincode: shopForm.pincode,
      paymentTerms: shopForm.paymentTerms,
      creditLimit: Number(shopForm.creditLimit),
      discountMarginPct: Number(shopForm.discountMarginPct),
      totalSuppliedUnits: 0,
      totalSoldUnits: 0,
      totalReturnedUnits: 0,
      currentShelfStockUnits: 0,
      totalGrossSuppliedValue: 0,
      totalReturnsValue: 0,
      totalPaidAmount: 0,
      outstandingBalance: 0,
      status: 'active'
    };

    setShops([...shops, newShop]);
    setNewShopModalOpen(false);
  };

  // Handler: Execute Print Batch Labels
  const handleExecuteLabelPrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const product = products.find(p => p.id === selectedBatchForLabel.productId) || products[0];

    const labelHtml = Array.from({ length: labelPrintCopies }).map((_, index) => `
      <div class="label-card">
        <div class="label-header">
          <div class="brand-name">DIETPRO BAKERY & PACKAGED FOODS</div>
          <div class="fssai">Lic. No. ${product.fssaiLicNumber}</div>
        </div>

        <div class="product-title">${product.name}</div>
        <div class="net-wt">Net Wt: <strong>${product.netWeight}</strong> | <span>${product.servingSize}</span></div>

        <div class="macro-grid">
          <div class="macro-item"><span class="m-val">${product.nutritionPer100g.calories}</span><span class="m-lbl">kcal/100g</span></div>
          <div class="macro-item"><span class="m-val">${product.nutritionPer100g.protein}g</span><span class="m-lbl">Protein</span></div>
          <div class="macro-item"><span class="m-val">${product.nutritionPer100g.carbs}g</span><span class="m-lbl">Carbs</span></div>
          <div class="macro-item"><span class="m-val">${product.nutritionPer100g.fat}g</span><span class="m-lbl">Fat</span></div>
          <div class="macro-item"><span class="m-val">${product.nutritionPer100g.fiber}g</span><span class="m-lbl">Fiber</span></div>
        </div>

        <div class="ingredients-box">
          <strong>Ingredients:</strong> ${product.keyIngredients.join(', ')}.<br/>
          <span class="allergen"><strong>Allergens:</strong> ${product.allergenWarning}</span>
        </div>

        <div class="batch-footer">
          <div class="batch-meta">
            <div>BATCH: <strong>${selectedBatchForLabel.batchNumber}</strong></div>
            <div>MFG DATE: <strong>${selectedBatchForLabel.mfgDate}</strong></div>
            <div class="exp-highlight">BEST BEFORE: <strong>${selectedBatchForLabel.expDate}</strong></div>
            <div class="mrp">MRP: <strong>₹${product.mrp}.00</strong> (Incl. of all taxes)</div>
          </div>
          <div class="barcode-box">
            <div class="barcode-visual">||| | |||| | ||| |||| |</div>
            <div class="barcode-text">${product.barcode}</div>
          </div>
        </div>

        <div class="storage-note">
          Storage: ${product.storageCondition}. Mfd by: NutriFit Cloud Kitchens Kerala Pvt Ltd.
        </div>
      </div>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Batch Retail Labels - ${selectedBatchForLabel.batchNumber}</title>
        <style>
          @page { size: auto; margin: 6mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #fff; color: #111; }
          .labels-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
          .label-card { border: 2px solid #000; border-radius: 6px; padding: 10px; page-break-inside: avoid; font-size: 11px; box-sizing: border-box; }
          .label-header { display: flex; justify-content: space-between; border-bottom: 1.5px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
          .brand-name { font-weight: 900; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; }
          .fssai { font-size: 9px; font-weight: bold; }
          .product-title { font-size: 13px; font-weight: 900; margin-bottom: 4px; line-height: 1.2; }
          .net-wt { font-size: 10px; margin-bottom: 6px; color: #333; }
          .macro-grid { display: grid; grid-template-columns: repeat(5, 1fr); background: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; text-align: center; padding: 4px 2px; margin-bottom: 6px; }
          .macro-item { display: flex; flex-direction: column; }
          .m-val { font-weight: 800; font-size: 10px; }
          .m-lbl { font-size: 8px; color: #555; text-transform: uppercase; }
          .ingredients-box { font-size: 9px; line-height: 1.3; margin-bottom: 6px; border-bottom: 1px dashed #bbb; padding-bottom: 4px; }
          .allergen { color: #b91c1c; }
          .batch-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 4px; }
          .batch-meta { font-size: 9px; line-height: 1.35; }
          .exp-highlight { font-weight: 900; color: #000; }
          .mrp { font-size: 10px; margin-top: 2px; }
          .barcode-box { text-align: right; }
          .barcode-visual { font-family: monospace; font-size: 14px; letter-spacing: 2px; font-weight: bold; }
          .barcode-text { font-family: monospace; font-size: 9px; }
          .storage-note { font-size: 8px; color: #555; text-align: center; border-top: 0.5px solid #ccc; padding-top: 3px; }
        </style>
      </head>
      <body>
        <div class="labels-container">
          ${labelHtml}
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();

    // Increment labels printed
    setBatches(prev => prev.map(b => b.id === selectedBatchForLabel.id ? { ...b, labelsPrintedCount: b.labelsPrintedCount + labelPrintCopies } : b));
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-20">
      {/* Top Banner / Breadcrumb */}
      <div className="bg-stone-900 border-b border-stone-800 py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-500/30">
                  FMCG & Bakery Division
                </span>
                <span className="text-xs text-stone-400">Central Kitchen & Distribution Hub</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Packaged Foods, Bakery Production & Shop Distribution
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setNewBatchModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>New Production Batch</span>
            </button>
            <button
              onClick={() => setNewDispatchModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Truck className="w-4 h-4" />
              <span>Create Dispatch Run</span>
            </button>
            <button
              onClick={() => setNewReturnModalOpen(true)}
              className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/30 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Log Expiry Return</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Overview Telemetry */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-stone-400 text-xs">
              <span>Active Products</span>
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-white">{totalActiveProducts} SKUs</div>
              <div className="text-[11px] text-stone-400 mt-0.5">Granola, Bars, Breads, Cakes</div>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-stone-400 text-xs">
              <span>In Production Today</span>
              <Flame className="w-4 h-4 text-orange-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-orange-400">{totalUnitsInProduction} Units</div>
              <div className="text-[11px] text-stone-400 mt-0.5">{batches.filter(b => b.status === 'in_production').length} Active Kitchen Batches</div>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-stone-400 text-xs">
              <span>Dispatched Today</span>
              <Truck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-emerald-400">{totalUnitsSuppliedToday} Units</div>
              <div className="text-[11px] text-stone-400 mt-0.5">To {shops.length} Outlets & Supermarkets</div>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-stone-400 text-xs">
              <span>B2B Receivables</span>
              <DollarSign className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-blue-400">₹{totalOutstandingReceivables.toLocaleString()}</div>
              <div className="text-[11px] text-stone-400 mt-0.5">Net after return credit notes</div>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between text-stone-400 text-xs">
              <span>Expiry Risk Radar</span>
              <AlertOctagon className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-rose-400">{criticalExpiryCount} Alerts</div>
              <div className="text-[11px] text-stone-400 mt-0.5">₹{totalReturnsValueCalculated.toLocaleString()} Total returns processed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex items-center gap-1 border-b border-stone-800 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveTab('batches')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'batches'
                ? 'bg-stone-900 text-amber-400 border-t-2 border-amber-500 border-x border-stone-800'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Production Batches ({batches.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('logistics')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'logistics'
                ? 'bg-stone-900 text-amber-400 border-t-2 border-amber-500 border-x border-stone-800'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Transportation & Dispatches ({challans.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('labels')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'labels'
                ? 'bg-stone-900 text-amber-400 border-t-2 border-amber-500 border-x border-stone-800'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <Barcode className="w-4 h-4" />
            <span>Batch Labels & Barcodes</span>
          </button>

          <button
            onClick={() => setActiveTab('shop_ledger')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'shop_ledger'
                ? 'bg-stone-900 text-amber-400 border-t-2 border-amber-500 border-x border-stone-800'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Shop-wise Ledger ({shops.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('expiry_returns')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'expiry_returns'
                ? 'bg-stone-900 text-amber-400 border-t-2 border-amber-500 border-x border-stone-800'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Expiry Monitoring & Returns ({returns.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'payments'
                ? 'bg-stone-900 text-amber-400 border-t-2 border-amber-500 border-x border-stone-800'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>B2B Payments & Invoices</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        
        {/* TAB 1: PRODUCTION BATCHES */}
        {activeTab === 'batches' && (
          <div className="space-y-6">
            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-stone-900/80 border border-stone-800 p-4 rounded-2xl">
              <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <span className="text-xs font-bold text-stone-400">Filter Category:</span>
                {[
                  { id: 'all', label: 'All Products' },
                  { id: 'granola_bars', label: 'Granola Bars' },
                  { id: 'granola_pouches', label: 'Granola Pouches' },
                  { id: 'protein_bars', label: 'Protein Bars' },
                  { id: 'artisan_breads', label: 'Artisan Breads' },
                  { id: 'healthy_cookies', label: 'Cookies' },
                  { id: 'protein_cakes_brownies', label: 'Cakes & Brownies' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setBatchCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      batchCategoryFilter === cat.id
                        ? 'bg-amber-500 text-stone-950 font-black'
                        : 'bg-stone-950 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="text-xs text-stone-400">
                Showing {batches.filter(b => batchCategoryFilter === 'all' || b.category === batchCategoryFilter).length} batches
              </div>
            </div>

            {/* Batches Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {batches
                .filter(b => batchCategoryFilter === 'all' || b.category === batchCategoryFilter)
                .map(batch => {
                  const product = products.find(p => p.id === batch.productId) || products[0];
                  
                  const statusColors: Record<BatchProductionStatus, { bg: string; text: string; label: string }> = {
                    planned: { bg: 'bg-stone-800 text-stone-300', text: 'text-stone-300', label: 'Planned' },
                    in_production: { bg: 'bg-amber-950 text-amber-300 border-amber-500/40', text: 'text-amber-400', label: 'In Production' },
                    baking_curing: { bg: 'bg-orange-950 text-orange-300 border-orange-500/40', text: 'text-orange-400', label: 'Baking / Cooling' },
                    quality_passed: { bg: 'bg-teal-950 text-teal-300 border-teal-500/40', text: 'text-teal-400', label: 'QC Passed' },
                    packed_labeled: { bg: 'bg-emerald-950 text-emerald-300 border-emerald-500/40', text: 'text-emerald-400', label: 'Packed & Labeled' },
                    dispatched_completed: { bg: 'bg-purple-950 text-purple-300 border-purple-500/40', text: 'text-purple-400', label: 'Dispatched to Outlets' }
                  };

                  return (
                    <div key={batch.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-5 flex flex-col justify-between hover:border-amber-500/50 transition-all">
                      <div>
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs font-black text-amber-400 tracking-wider">
                              {batch.batchNumber}
                            </span>
                            <h3 className="font-bold text-white text-base mt-0.5 leading-snug">
                              {batch.productName}
                            </h3>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusColors[batch.status].bg}`}>
                            {statusColors[batch.status].label}
                          </span>
                        </div>

                        {/* Batch Key Metrics */}
                        <div className="grid grid-cols-2 gap-2 mt-4 bg-stone-950/60 p-3 rounded-xl border border-stone-800/80 text-xs">
                          <div>
                            <span className="text-stone-400 block text-[10px]">Planned Yield</span>
                            <span className="font-black text-white text-sm">{batch.plannedQuantity} Units</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[10px]">Shelf Life</span>
                            <span className="font-bold text-amber-300">{batch.shelfLifeDays} Days</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[10px]">MFG Date</span>
                            <span className="font-semibold text-stone-200">{batch.mfgDate} ({batch.mfgTime})</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[10px]">Expiry (EXP)</span>
                            <span className="font-bold text-rose-300">{batch.expDate}</span>
                          </div>
                        </div>

                        {/* Recipe & Facility Meta */}
                        <div className="mt-3 text-xs text-stone-400 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-stone-400" />
                            <span>{batch.productionFacility}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-stone-400" />
                            <span>Lead: <strong className="text-stone-200">{batch.leadBakerChef}</strong></span>
                          </div>
                          {batch.qcSignoffBy && (
                            <div className="flex items-center gap-1.5 text-emerald-400">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>QC Signed: {batch.qcSignoffBy}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Controls */}
                      <div className="mt-5 pt-4 border-t border-stone-800 flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            setSelectedBatchForLabel(batch);
                            setActiveTab('labels');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-amber-400" />
                          <span>Print Labels ({batch.labelsPrintedCount})</span>
                        </button>

                        {batch.status !== 'dispatched_completed' && (
                          <button
                            onClick={() => handleAdvanceBatchStatus(batch.id, batch.status)}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black flex items-center gap-1"
                          >
                            <span>Next Stage</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* TAB 2: TRANSPORTATION & LOGISTICS DISPATCHES */}
        {activeTab === 'logistics' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-stone-900 border border-stone-800 p-4 rounded-2xl">
              <div>
                <h3 className="font-bold text-white text-base">Multi-Outlet & Retail Shop Delivery Challans</h3>
                <p className="text-xs text-stone-400">Daily logistics routes to our state-wide outlets, partner supermarkets, and gym counters.</p>
              </div>
              <button
                onClick={() => setNewDispatchModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>New Dispatch Run</span>
              </button>
            </div>

            <div className="space-y-4">
              {challans.map(challan => {
                const isDelivered = challan.status === 'delivered_acknowledged';
                return (
                  <div key={challan.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-5 hover:border-emerald-500/40 transition-all">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-800">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${isDelivered ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : 'bg-amber-950 text-amber-400 border border-amber-500/30'}`}>
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-emerald-400">{challan.challanNumber}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isDelivered ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/60 text-amber-300 animate-pulse'
                            }`}>
                              {isDelivered ? 'Delivered & Signed' : 'In Transit'}
                            </span>
                          </div>
                          <h4 className="font-bold text-white text-base mt-0.5">{challan.shopName}</h4>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-right">
                          <span className="text-stone-400 block text-[10px]">Dispatch Time</span>
                          <span className="font-bold text-stone-200">{challan.dispatchDate} at {challan.dispatchTime}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-stone-400 block text-[10px]">Supplied Value</span>
                          <span className="font-black text-emerald-400 text-sm">₹{challan.totalValue.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Logistics Line Items Table */}
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-stone-400 border-b border-stone-800 text-[11px]">
                          <tr>
                            <th className="pb-2">Product Item</th>
                            <th className="pb-2">Batch No</th>
                            <th className="pb-2">MFG / EXP</th>
                            <th className="pb-2 text-right">Quantity</th>
                            <th className="pb-2 text-right">Wholesale Rate</th>
                            <th className="pb-2 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-800/60">
                          {challan.items.map(item => (
                            <tr key={item.id} className="text-stone-200">
                              <td className="py-2.5 font-medium">{item.productName}</td>
                              <td className="py-2.5 font-mono text-amber-400">{item.batchNumber}</td>
                              <td className="py-2.5 text-stone-400">{item.mfgDate} → <strong className="text-rose-300">{item.expDate}</strong></td>
                              <td className="py-2.5 text-right font-black text-white">{item.quantitySupplied} Units</td>
                              <td className="py-2.5 text-right font-semibold">₹{item.unitWholesaleRate}</td>
                              <td className="py-2.5 text-right font-bold text-emerald-400">₹{item.lineTotal.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer Logistics & Driver Info */}
                    <div className="mt-4 pt-3 border-t border-stone-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-400">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span>🚐 Vehicle: <strong className="text-stone-200">{challan.vehicleNumber}</strong></span>
                        <span>👤 Driver: <strong className="text-stone-200">{challan.driverName}</strong> ({challan.driverPhone})</span>
                        <span>🌡️ Temp: <strong className="text-cyan-300">{challan.transitTemperature}</strong></span>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isDelivered && (
                          <button
                            onClick={() => handleAcknowledgeDelivery(challan.id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirm Delivery & Receiver Sign</span>
                          </button>
                        )}
                        {challan.acknowledgedBy && (
                          <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            Signed by: {challan.acknowledgedBy}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: BATCH LABELS & BARCODE PRINTING */}
        {activeTab === 'labels' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Control Panel */}
              <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-white text-base">FMCG Retail Packaging Labels</h3>
                  <p className="text-xs text-stone-400">Print standard adhesive packaging stickers with Barcode, FSSAI, MRP, MFG and Expiry dates.</p>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-300 block mb-1.5">Select Production Batch:</label>
                  <select
                    value={selectedBatchForLabel.id}
                    onChange={(e) => {
                      const found = batches.find(b => b.id === e.target.value);
                      if (found) setSelectedBatchForLabel(found);
                    }}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-hidden focus:border-amber-500"
                  >
                    {batches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} – {b.productName} ({b.plannedQuantity} Units)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-300 block mb-1.5">Label Format & Paper Type:</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { id: '4x2_thermal', label: '4" × 2" Thermal Roll' },
                      { id: 'a4_sheet', label: 'A4 Sheet (8 Labels)' },
                      { id: 'box_shipping', label: '4" × 6" Shipping Box' },
                      { id: 'pos_80mm', label: '80mm POS Sticker' }
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setLabelFormat(f.id as any)}
                        className={`p-2.5 rounded-xl border text-left font-semibold ${
                          labelFormat === f.id
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                            : 'bg-stone-950 border-stone-800 text-stone-400 hover:bg-stone-800'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-300 block mb-1.5">Number of Sticker Copies:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={labelPrintCopies}
                      onChange={(e) => setLabelPrintCopies(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-hidden focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setLabelPrintCopies(selectedBatchForLabel.plannedQuantity)}
                      className="px-3 py-2 rounded-xl bg-stone-800 text-stone-300 hover:text-white text-xs font-bold whitespace-nowrap"
                    >
                      Exact Batch ({selectedBatchForLabel.plannedQuantity})
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-stone-800">
                  <button
                    onClick={handleExecuteLabelPrint}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 py-3 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print {labelPrintCopies} Labels Now</span>
                  </button>
                </div>
              </div>

              {/* Right Live Sticker Preview */}
              <div className="lg:col-span-2 bg-stone-900 border border-stone-800 rounded-2xl p-6 flex flex-col items-center justify-center">
                <div className="text-xs font-bold text-stone-400 mb-4 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>High-Contrast Retail Packaging Label Preview</span>
                </div>

                {(() => {
                  const product = products.find(p => p.id === selectedBatchForLabel.productId) || products[0];
                  return (
                    <div className="w-full max-w-md bg-white text-black p-5 rounded-lg border-2 border-black shadow-2xl font-sans text-xs">
                      {/* Brand & FSSAI Header */}
                      <div className="flex justify-between items-center border-b-2 border-black pb-1.5 mb-2">
                        <div className="font-black text-xs tracking-wider uppercase">DIETPRO BAKERY & FMCG</div>
                        <div className="text-[10px] font-bold">Lic. No. {product.fssaiLicNumber}</div>
                      </div>

                      {/* Product Name */}
                      <h2 className="text-sm font-black leading-tight">{product.name}</h2>
                      <div className="text-[11px] text-stone-700 font-bold mt-0.5">
                        Net Weight: <strong>{product.netWeight}</strong> | {product.servingSize}
                      </div>

                      {/* Nutrition Strip */}
                      <div className="grid grid-cols-5 bg-stone-100 border border-stone-400 rounded text-center p-1.5 my-2.5 text-[10px]">
                        <div>
                          <div className="font-black">{product.nutritionPer100g.calories}</div>
                          <div className="text-[8px] text-stone-600 uppercase">kcal/100g</div>
                        </div>
                        <div>
                          <div className="font-black">{product.nutritionPer100g.protein}g</div>
                          <div className="text-[8px] text-stone-600 uppercase">Protein</div>
                        </div>
                        <div>
                          <div className="font-black">{product.nutritionPer100g.carbs}g</div>
                          <div className="text-[8px] text-stone-600 uppercase">Carbs</div>
                        </div>
                        <div>
                          <div className="font-black">{product.nutritionPer100g.fat}g</div>
                          <div className="text-[8px] text-stone-600 uppercase">Fat</div>
                        </div>
                        <div>
                          <div className="font-black">{product.nutritionPer100g.fiber}g</div>
                          <div className="text-[8px] text-stone-600 uppercase">Fiber</div>
                        </div>
                      </div>

                      {/* Ingredients */}
                      <div className="text-[10px] leading-tight text-stone-800 border-b border-dashed border-stone-400 pb-2 mb-2">
                        <strong>Ingredients:</strong> {product.keyIngredients.join(', ')}.<br/>
                        <span className="text-red-700 font-semibold">Allergens: {product.allergenWarning}</span>
                      </div>

                      {/* Batch Meta & Barcode */}
                      <div className="flex justify-between items-end text-[10px] leading-tight">
                        <div>
                          <div>BATCH: <strong>{selectedBatchForLabel.batchNumber}</strong></div>
                          <div>MFG DATE: <strong>{selectedBatchForLabel.mfgDate}</strong></div>
                          <div className="font-black text-black">BEST BEFORE: <strong>{selectedBatchForLabel.expDate}</strong></div>
                          <div className="font-bold text-xs mt-1">MRP: ₹{product.mrp}.00 <span className="text-[9px] font-normal">(Incl. taxes)</span></div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono text-sm tracking-widest font-black">||| | |||| | ||| |||| |</div>
                          <div className="font-mono text-[9px]">{product.barcode}</div>
                        </div>
                      </div>

                      <div className="mt-2 pt-1 border-t border-stone-300 text-[8px] text-stone-500 text-center">
                        Storage: {product.storageCondition}. Mfd by: NutriFit Cloud Kitchens Kerala Pvt Ltd.
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SHOP-WISE SUPPLY VS RETURNED LEDGER */}
        {activeTab === 'shop_ledger' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-stone-900 border border-stone-800 p-4 rounded-2xl">
              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
                <span className="text-xs font-bold text-stone-400">Filter Channel:</span>
                {[
                  { id: 'all', label: 'All Channels' },
                  { id: 'our_outlet', label: 'Our Outlets' },
                  { id: 'supermarket', label: 'Supermarkets' },
                  { id: 'gym_fitness', label: 'Gyms & Fitness' },
                  { id: 'cafe_store', label: 'Cafes' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setShopChannelFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      shopChannelFilter === f.id
                        ? 'bg-amber-500 text-stone-950 font-black'
                        : 'bg-stone-950 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setNewShopModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Enroll New Retail Partner / Shop</span>
              </button>
            </div>

            {/* Shop Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shops
                .filter(s => shopChannelFilter === 'all' || s.channelType === shopChannelFilter)
                .map(shop => {
                  const returnRatePct = shop.totalSuppliedUnits > 0 
                    ? ((shop.totalReturnedUnits / shop.totalSuppliedUnits) * 100).toFixed(1)
                    : '0.0';

                  const channelIcon = 
                    shop.channelType === 'our_outlet' ? <Store className="w-4 h-4 text-emerald-400" /> :
                    shop.channelType === 'supermarket' ? <Building2 className="w-4 h-4 text-blue-400" /> :
                    shop.channelType === 'gym_fitness' ? <Dumbbell className="w-4 h-4 text-orange-400" /> :
                    <Coffee className="w-4 h-4 text-amber-400" />;

                  return (
                    <div key={shop.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4 hover:border-stone-700 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800">
                            {channelIcon}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-amber-400">{shop.code}</span>
                              <span className="text-[10px] text-stone-400 px-2 py-0.5 rounded bg-stone-950 border border-stone-800">
                                {shop.outletType}
                              </span>
                            </div>
                            <h3 className="font-bold text-white text-base mt-0.5">{shop.name}</h3>
                            <p className="text-xs text-stone-400">{shop.address}, {shop.city}</p>
                          </div>
                        </div>

                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                          {shop.paymentTerms}
                        </span>
                      </div>

                      {/* Stock & Quantities Grid */}
                      <div className="grid grid-cols-4 gap-2 bg-stone-950 p-3 rounded-xl text-xs text-center border border-stone-800/80">
                        <div>
                          <span className="text-stone-400 block text-[10px]">Supplied</span>
                          <span className="font-bold text-white">{shop.totalSuppliedUnits}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 block text-[10px]">Sold</span>
                          <span className="font-bold text-emerald-400">{shop.totalSoldUnits}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 block text-[10px]">Returned</span>
                          <span className="font-bold text-rose-400">{shop.totalReturnedUnits} <span className="text-[9px]">({returnRatePct}%)</span></span>
                        </div>
                        <div>
                          <span className="text-stone-400 block text-[10px]">Shelf Stock</span>
                          <span className="font-black text-amber-400">{shop.currentShelfStockUnits}</span>
                        </div>
                      </div>

                      {/* Financials & Balance */}
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-stone-800">
                        <div>
                          <span className="text-stone-400 block text-[10px]">Total Supplied Value</span>
                          <span className="font-semibold text-stone-200">₹{shop.totalGrossSuppliedValue.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 block text-[10px]">Returns Credit</span>
                          <span className="font-semibold text-rose-300">-₹{shop.totalReturnsValue.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 block text-[10px]">Paid</span>
                          <span className="font-semibold text-emerald-400">₹{shop.totalPaidAmount.toLocaleString()}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-stone-400 block text-[10px]">Outstanding</span>
                          <span className="font-black text-blue-400 text-sm">₹{shop.outstandingBalance.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Quick Contact & Action */}
                      <div className="flex items-center justify-between text-xs text-stone-400 pt-2">
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-stone-400" />
                          <span>{shop.contactPerson} ({shop.phone})</span>
                        </div>

                        <button
                          onClick={() => {
                            setPaymentForm(prev => ({ ...prev, shopId: shop.id, amount: shop.outstandingBalance }));
                            setNewPaymentModalOpen(true);
                          }}
                          className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
                        >
                          <span>Record Payment</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* TAB 5: EXPIRY RADAR & RETURNS AUDITING */}
        {activeTab === 'expiry_returns' && (
          <div className="space-y-6">
            {/* Live Expiry Radar Alert Strip */}
            <div className="bg-rose-950/40 border border-rose-500/40 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <AlertOctagon className="w-5 h-5 animate-pulse" />
                  <span>Automated Expiry Health Monitor & Shelf-Life Radar</span>
                </div>
                <span className="text-xs text-rose-300 font-semibold">{expiryAlerts.length} Active Shelf Alerts</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {expiryAlerts.map(alert => {
                  const isCritical = alert.riskLevel === 'critical_expired' || alert.daysRemaining <= 1;
                  return (
                    <div key={alert.id} className="bg-stone-900/90 border border-stone-800 p-3.5 rounded-xl text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          isCritical ? 'bg-rose-950 text-rose-300 border border-rose-500/40' : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                        }`}>
                          {alert.daysRemaining <= 0 ? 'EXPIRED' : `${alert.daysRemaining} Days Left`}
                        </span>
                        <span className="font-mono text-[10px] text-stone-400">{alert.batchNumber}</span>
                      </div>

                      <div>
                        <h4 className="font-bold text-white leading-tight">{alert.productName}</h4>
                        <p className="text-[11px] text-stone-400 mt-0.5">At: <strong>{alert.shopName}</strong></p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-stone-800 text-[11px]">
                        <span className="text-stone-400">{alert.unitsOnShelf} Units on Shelf</span>
                        <span className="font-bold text-amber-400 uppercase text-[10px]">Action: {alert.recommendedAction.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Return Tickets Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-stone-900 border border-stone-800 p-4 rounded-2xl">
              <div>
                <h3 className="font-bold text-white text-base">Unsold & Expiry Return Tickets & Credit Notes</h3>
                <p className="text-xs text-stone-400">Track returns due to shelf-life expiry, packaging seal damage, and audited bio-compost disposal.</p>
              </div>
              <button
                onClick={() => setNewReturnModalOpen(true)}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Log New Return Ticket</span>
              </button>
            </div>

            {/* Return Tickets List */}
            <div className="space-y-3">
              {returns.map(ret => {
                const reasonLabels: Record<string, string> = {
                  expired_shelf_life: 'Shelf Life Expiry Passed',
                  near_expiry_unsold: 'Near-Expiry Preventive Recall',
                  transit_damage: 'Transit / Vehicle Damage',
                  packaging_seal_defect: 'Packaging Seal Puncture'
                };

                return (
                  <div key={ret.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-rose-500/30 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-400">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-rose-400">{ret.returnRef}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-950 text-stone-300 border border-stone-800">
                            {ret.creditNoteNumber || 'Credit Pending'}
                          </span>
                        </div>
                        <h4 className="font-bold text-white text-sm mt-0.5">{ret.productName}</h4>
                        <p className="text-xs text-stone-400">From: <strong className="text-stone-200">{ret.shopName}</strong> | Batch: <span className="font-mono text-amber-400">{ret.batchNumber}</span></p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-left md:text-right">
                      <div>
                        <span className="text-stone-400 block text-[10px]">Reason</span>
                        <span className="font-semibold text-amber-300">{reasonLabels[ret.reason] || ret.reason}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px]">Quantity Returned</span>
                        <span className="font-black text-rose-400">{ret.quantityReturned} Units</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px]">Credit Note Value</span>
                        <span className="font-black text-emerald-400">₹{ret.totalCreditAmount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px]">Disposition Action</span>
                        <span className="font-bold text-stone-300 uppercase text-[10px]">{ret.dispositionAction.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 6: B2B PAYMENTS & INVOICES */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-stone-900 border border-stone-800 p-4 rounded-2xl">
              <div>
                <h3 className="font-bold text-white text-base">B2B Wholesale Invoicing & Payment Receipts</h3>
                <p className="text-xs text-stone-400">Track collections, bank NEFT transfers, UPI receipts, and credit note deductions per shop.</p>
              </div>
              <button
                onClick={() => setNewPaymentModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Record New Payment Receipt</span>
              </button>
            </div>

            <div className="space-y-3">
              {payments.map(pay => (
                <div key={pay.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-950 border border-emerald-500/30 text-emerald-400">
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-emerald-400">{pay.receiptNumber}</span>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-stone-950 text-stone-300 border border-stone-800">
                          {pay.paymentMode.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-sm mt-0.5">{pay.shopName}</h4>
                      <p className="text-xs text-stone-400">Ref: <span className="font-mono text-stone-300">{pay.transactionRef}</span> | Date: {pay.paymentDate}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs text-right">
                    <div>
                      <span className="text-stone-400 block text-[10px]">Recorded By</span>
                      <span className="font-medium text-stone-200">{pay.recordedBy}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px]">Amount Received</span>
                      <span className="font-black text-emerald-400 text-lg">₹{pay.amount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: CREATE NEW BATCH */}
      {/* ======================================================== */}
      {newBatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-400" />
                <span>Launch New Bakery & FMCG Batch</span>
              </h3>
              <button onClick={() => setNewBatchModalOpen(false)} className="text-stone-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBatch} className="space-y-3 text-xs">
              <div>
                <label className="text-stone-300 font-bold block mb-1">Product SKU:</label>
                <select
                  value={batchForm.productId}
                  onChange={(e) => setBatchForm({ ...batchForm, productId: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-hidden focus:border-amber-500"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.category.replace(/_/g, ' ')}) – Shelf Life: {p.shelfLifeDays} Days
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Planned Quantity (Units):</label>
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    required
                    value={batchForm.plannedQuantity}
                    onChange={(e) => setBatchForm({ ...batchForm, plannedQuantity: parseInt(e.target.value) || 0 })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-hidden focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Manufacturing Date:</label>
                  <input
                    type="date"
                    required
                    value={batchForm.mfgDate}
                    onChange={(e) => setBatchForm({ ...batchForm, mfgDate: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Production Facility:</label>
                  <input
                    type="text"
                    required
                    value={batchForm.productionFacility}
                    onChange={(e) => setBatchForm({ ...batchForm, productionFacility: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Lead Baker Chef:</label>
                  <input
                    type="text"
                    required
                    value={batchForm.leadBakerChef}
                    onChange={(e) => setBatchForm({ ...batchForm, leadBakerChef: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-stone-300 font-bold block mb-1">Batch Notes & Formulation:</label>
                <textarea
                  rows={2}
                  value={batchForm.notes}
                  onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-stone-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewBatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black shadow-lg"
                >
                  Start Batch Production
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREATE DISPATCH CHALLAN */}
      {/* ======================================================== */}
      {newDispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <span>Create Multi-Outlet Delivery Challan</span>
              </h3>
              <button onClick={() => setNewDispatchModalOpen(false)} className="text-stone-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDispatch} className="space-y-3 text-xs">
              <div>
                <label className="text-stone-300 font-bold block mb-1">Destination Outlet / Partner Shop:</label>
                <select
                  value={dispatchForm.shopId}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, shopId: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-hidden focus:border-emerald-500"
                >
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.outletType}) – {s.paymentTerms}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-stone-300 font-bold block mb-1">Select Active Batch to Supply:</label>
                <select
                  value={dispatchForm.batchId}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, batchId: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-hidden focus:border-emerald-500"
                >
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.batchNumber} – {b.productName} (EXP: {b.expDate})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Quantity to Supply (Units):</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={dispatchForm.quantity}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Transit Temperature:</label>
                  <input
                    type="text"
                    value={dispatchForm.transitTemperature}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, transitTemperature: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Vehicle Number:</label>
                  <input
                    type="text"
                    required
                    value={dispatchForm.vehicleNumber}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, vehicleNumber: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Driver Name & Phone:</label>
                  <input
                    type="text"
                    required
                    value={dispatchForm.driverName}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, driverName: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-stone-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewDispatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg"
                >
                  Dispatch Challan Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: LOG RETURN TICKET */}
      {/* ======================================================== */}
      {newReturnModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span>Log Expiry / Damaged Stock Return</span>
              </h3>
              <button onClick={() => setNewReturnModalOpen(false)} className="text-stone-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReturn} className="space-y-3 text-xs">
              <div>
                <label className="text-stone-300 font-bold block mb-1">Returning Shop / Outlet:</label>
                <select
                  value={returnForm.shopId}
                  onChange={(e) => setReturnForm({ ...returnForm, shopId: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-hidden focus:border-rose-500"
                >
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-stone-300 font-bold block mb-1">Product Item:</label>
                <select
                  value={returnForm.productId}
                  onChange={(e) => setReturnForm({ ...returnForm, productId: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-hidden focus:border-rose-500"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Batch Number on Pack:</label>
                  <input
                    type="text"
                    required
                    value={returnForm.batchNumber}
                    onChange={(e) => setReturnForm({ ...returnForm, batchNumber: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-hidden focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Quantity Returned (Units):</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={returnForm.quantityReturned}
                    onChange={(e) => setReturnForm({ ...returnForm, quantityReturned: parseInt(e.target.value) || 0 })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-hidden focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Return Reason:</label>
                  <select
                    value={returnForm.reason}
                    onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value as any })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-rose-500"
                  >
                    <option value="expired_shelf_life">Shelf Life Expiry Passed</option>
                    <option value="near_expiry_unsold">Near-Expiry Preventive Recall</option>
                    <option value="transit_damage">Transit / Vehicle Damage</option>
                    <option value="packaging_seal_defect">Packaging Seal Defect</option>
                  </select>
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Disposition Action:</label>
                  <select
                    value={returnForm.dispositionAction}
                    onChange={(e) => setReturnForm({ ...returnForm, dispositionAction: e.target.value as any })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-rose-500"
                  >
                    <option value="safe_bio_compost">Safe Organic Bio-Compost</option>
                    <option value="salvage_discount">Salvage / Markdown Sale</option>
                    <option value="vendor_claim">Vendor Packaging Claim</option>
                    <option value="destruction_record">Destruction Record</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewReturnModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg"
                >
                  Issue Credit Note & Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: RECORD PAYMENT */}
      {/* ======================================================== */}
      {newPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Record B2B Payment Collection</span>
              </h3>
              <button onClick={() => setNewPaymentModalOpen(false)} className="text-stone-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="text-stone-300 font-bold block mb-1">Paying Retail Partner / Outlet:</label>
                <select
                  value={paymentForm.shopId}
                  onChange={(e) => setPaymentForm({ ...paymentForm, shopId: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-hidden focus:border-emerald-500"
                >
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Due: ₹{s.outstandingBalance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Amount Received (₹):</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseInt(e.target.value) || 0 })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold text-base focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Payment Mode:</label>
                  <select
                    value={paymentForm.paymentMode}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value as any })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value="neft_bank_transfer">NEFT / RTGS Bank Transfer</option>
                    <option value="upi">UPI / QR Payment</option>
                    <option value="cheque">Account Payee Cheque</option>
                    <option value="cash">Direct Cash on Delivery</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-stone-300 font-bold block mb-1">Bank Reference / UTR Number:</label>
                <input
                  type="text"
                  required
                  value={paymentForm.transactionRef}
                  onChange={(e) => setPaymentForm({ ...paymentForm, transactionRef: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-stone-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg"
                >
                  Record Receipt & Clear Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ENROLL NEW SHOP */}
      {/* ======================================================== */}
      {newShopModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-400" />
                <span>Enroll New Retail Partner / Outlet</span>
              </h3>
              <button onClick={() => setNewShopModalOpen(false)} className="text-stone-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddShop} className="space-y-3 text-xs">
              <div>
                <label className="text-stone-300 font-bold block mb-1">Store / Shop Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nature's Basket Indiranagar"
                  value={shopForm.name}
                  onChange={(e) => setShopForm({ ...shopForm, name: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Channel Type:</label>
                  <select
                    value={shopForm.channelType}
                    onChange={(e) => setShopForm({ ...shopForm, channelType: e.target.value as any })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="supermarket">Supermarket / Hypermarket</option>
                    <option value="our_outlet">Our Own Outlet</option>
                    <option value="gym_fitness">Gym / Fitness Kiosk</option>
                    <option value="cafe_store">Artisan Cafe / Store</option>
                  </select>
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Payment Terms:</label>
                  <select
                    value={shopForm.paymentTerms}
                    onChange={(e) => setShopForm({ ...shopForm, paymentTerms: e.target.value as any })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="Net 30 Days">Net 30 Days</option>
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Weekly Consignment">Weekly Consignment</option>
                    <option value="Immediate COD">Immediate COD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Contact Person:</label>
                  <input
                    type="text"
                    required
                    placeholder="Manager Name"
                    value={shopForm.contactPerson}
                    onChange={(e) => setShopForm({ ...shopForm, contactPerson: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Phone Number:</label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98..."
                    value={shopForm.phone}
                    onChange={(e) => setShopForm({ ...shopForm, phone: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-stone-300 font-bold block mb-1">City:</label>
                  <input
                    type="text"
                    required
                    value={shopForm.city}
                    onChange={(e) => setShopForm({ ...shopForm, city: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-stone-300 font-bold block mb-1">Address:</label>
                  <input
                    type="text"
                    required
                    value={shopForm.address}
                    onChange={(e) => setShopForm({ ...shopForm, address: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-stone-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewShopModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-800 text-stone-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black shadow-lg"
                >
                  Save & Enroll Partner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
