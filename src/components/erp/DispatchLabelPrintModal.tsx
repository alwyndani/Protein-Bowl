import React, { useState, useRef, useEffect } from 'react';
import { 
  Printer, 
  X, 
  Check, 
  ShieldCheck, 
  MapPin, 
  Phone, 
  Clock, 
  Layers, 
  Copy, 
  ExternalLink, 
  Flame, 
  QrCode, 
  Sliders, 
  CheckCircle2, 
  FileText, 
  Maximize2, 
  UserCheck, 
  Sparkles, 
  AlertCircle 
} from 'lucide-react';
import confetti from 'canvas-confetti';

export interface DispatchLabelItem {
  id: string;
  orderRef: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: {
    street: string;
    city: string;
    pincode: string;
    landmark?: string;
  };
  timeSlot: string;
  dishName: string;
  portionSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  prepTimestamp: string;
  dietaryNote?: string;
  fssaiLicense: string;
  branchName?: string;
  batchNumber?: string;
}

export type LabelTypeMode = 'both' | 'dispatch_only' | 'nutrition_only';
export type PaperFormat = 'a4_sheet' | 'thermal_4x2' | 'thermal_4x6' | 'pos_80mm';

interface DispatchLabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOrders: DispatchLabelItem[];
  allAvailableOrders?: DispatchLabelItem[];
  onToggleOrderSelection?: (orderId: string) => void;
  onSelectAllInSlot?: () => void;
  onClearSelection?: () => void;
  initialLabelMode?: LabelTypeMode;
}

export const DispatchLabelPrintModal: React.FC<DispatchLabelPrintModalProps> = ({
  isOpen,
  onClose,
  selectedOrders,
  allAvailableOrders = [],
  onToggleOrderSelection,
  onSelectAllInSlot,
  onClearSelection,
  initialLabelMode = 'both'
}) => {
  const [labelMode, setLabelMode] = useState<LabelTypeMode>(initialLabelMode);
  const [paperFormat, setPaperFormat] = useState<PaperFormat>('a4_sheet');
  const [copiesCount, setCopiesCount] = useState<number>(1);
  const [includeBarcode, setIncludeBarcode] = useState<boolean>(true);
  const [includeFssai, setIncludeFssai] = useState<boolean>(true);
  const [includeMacros, setIncludeMacros] = useState<boolean>(true);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printSuccess, setPrintSuccess] = useState<boolean>(false);

  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Sync mode if changed from parent
  useEffect(() => {
    if (isOpen) {
      setLabelMode(initialLabelMode);
      setPrintSuccess(false);
    }
  }, [isOpen, initialLabelMode]);

  if (!isOpen) return null;

  // Calculate unique customer count
  const uniqueCustomers = Array.from(new Set(selectedOrders.map((o) => o.customerName)));
  const totalStickersToPrint = selectedOrders.length * (labelMode === 'both' ? 2 : 1) * copiesCount;

  // Generate printable standalone HTML
  const generatePrintHTML = () => {
    const isA4 = paperFormat === 'a4_sheet';
    const isThermal4x2 = paperFormat === 'thermal_4x2';
    const isThermal4x6 = paperFormat === 'thermal_4x6';
    const isPOS80mm = paperFormat === 'pos_80mm';

    let pageStyle = '';
    if (isA4) {
      pageStyle = '@page { size: A4 portrait; margin: 8mm; }';
    } else if (isThermal4x2) {
      pageStyle = '@page { size: 100mm 50mm; margin: 2mm; }';
    } else if (isThermal4x6) {
      pageStyle = '@page { size: 100mm 150mm; margin: 3mm; }';
    } else if (isPOS80mm) {
      pageStyle = '@page { size: 80mm auto; margin: 2mm; }';
    }

    const labelsHTML = selectedOrders.flatMap((ord) => {
      const items = [];
      for (let c = 0; c < copiesCount; c++) {
        // Label 1: Nutrition Container Sticker
        if (labelMode === 'both' || labelMode === 'nutrition_only') {
          items.push(`
            <div class="sticker-card nutrition-sticker ${isThermal4x2 ? 'thermal-page' : ''}">
              <div class="sticker-header-green">
                <span>🛡️ HYGIENIC KITCHEN CERTIFIED</span>
                ${includeFssai ? `<span>${ord.fssaiLicense || 'FSSAI LIC. 11322007000341'}</span>` : ''}
              </div>
              <div class="sticker-body">
                <div class="sticker-label-tag">MEAL CONTAINER NUTRITION STICKER</div>
                <div class="dish-title">${ord.dishName}</div>
                <div class="meta-row">
                  <span><strong>Serving:</strong> ${ord.portionSize}</span>
                  <span class="calorie-badge">${ord.calories} kcal</span>
                </div>
                ${includeMacros ? `
                  <div class="macro-grid">
                    <div class="macro-box"><span class="macro-lbl">PROTEIN</span><span class="macro-val">${ord.protein}g</span></div>
                    <div class="macro-box"><span class="macro-lbl">CARBS</span><span class="macro-val">${ord.carbs}g</span></div>
                    <div class="macro-box"><span class="macro-lbl">FAT</span><span class="macro-val">${ord.fat}g</span></div>
                    <div class="macro-box"><span class="macro-lbl">FIBER</span><span class="macro-val">${ord.fiber}g</span></div>
                  </div>
                ` : ''}
                <div class="footer-row">
                  <span>Prepared: <strong>${ord.prepTimestamp}</strong></span>
                  <span class="consume-tag">Consume in 3 hrs</span>
                </div>
                <div class="sub-footer">
                  <span>Customer: <strong>${ord.customerName}</strong> (${ord.orderRef})</span>
                  <span>${ord.timeSlot}</span>
                </div>
              </div>
            </div>
          `);
        }

        // Label 2: Customer Dispatch & Delivery Sticker
        if (labelMode === 'both' || labelMode === 'dispatch_only') {
          items.push(`
            <div class="sticker-card dispatch-sticker ${isThermal4x2 ? 'thermal-page' : ''}">
              <div class="sticker-header-orange">
                <span>📍 CUSTOMER DISPATCH & ROUTE STICKER</span>
                <span>${ord.timeSlot}</span>
              </div>
              <div class="sticker-body">
                <div class="customer-name">${ord.customerName}</div>
                <div class="customer-phone">📞 ${ord.customerPhone}</div>
                
                <div class="address-box">
                  <div class="street-address">${ord.deliveryAddress.street}</div>
                  <div class="city-pin">${ord.deliveryAddress.city} - <strong>${ord.deliveryAddress.pincode}</strong></div>
                  ${ord.deliveryAddress.landmark ? `<div class="landmark">Landmark: ${ord.deliveryAddress.landmark}</div>` : ''}
                </div>

                <div class="dispatch-meta">
                  <div><strong>Order:</strong> ${ord.orderRef}</div>
                  <div><strong>Dish:</strong> ${ord.dishName.slice(0, 32)}...</div>
                </div>

                ${includeBarcode ? `
                  <div class="barcode-area">
                    <div class="barcode-lines">||| | |||| || ||||| |||| || ||| |||| ||</div>
                    <div class="barcode-text">* ${ord.orderRef} * ${ord.deliveryAddress.pincode} *</div>
                  </div>
                ` : ''}
              </div>
            </div>
          `);
        }
      }
      return items;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Print Dispatch & Nutrition Labels</title>
        <style>
          ${pageStyle}
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: ${isA4 ? '6mm' : '0'};
            background: #fff;
            color: #111;
          }
          .labels-container {
            display: ${isA4 ? 'grid' : 'flex'};
            ${isA4 ? 'grid-template-columns: repeat(2, 1fr); gap: 6mm;' : 'flex-direction: column; gap: 4mm;'}
          }
          .sticker-card {
            border: 2px solid #222;
            border-radius: 8px;
            overflow: hidden;
            background: #fff;
            page-break-inside: avoid;
            break-inside: avoid;
            margin-bottom: ${isThermal4x2 || isThermal4x6 ? '0' : '3mm'};
            ${isThermal4x2 ? 'page-break-after: always; break-after: page; height: 46mm;' : ''}
          }
          .nutrition-sticker {
            border-color: #064e3b;
          }
          .dispatch-sticker {
            border-color: #7c2d12;
          }
          .sticker-header-green {
            background: #064e3b !important;
            color: #fff !important;
            padding: 4px 8px;
            font-size: 9px;
            font-weight: 800;
            display: flex;
            justify-content: space-between;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .sticker-header-orange {
            background: #7c2d12 !important;
            color: #fff !important;
            padding: 4px 8px;
            font-size: 9px;
            font-weight: 800;
            display: flex;
            justify-content: space-between;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .sticker-body {
            padding: 8px 10px;
          }
          .sticker-label-tag {
            font-size: 8px;
            color: #666;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .dish-title {
            font-size: 13px;
            font-weight: 900;
            color: #000;
            margin-top: 2px;
            line-height: 1.2;
          }
          .customer-name {
            font-size: 15px;
            font-weight: 900;
            color: #000;
            text-transform: uppercase;
            margin-top: 2px;
          }
          .customer-phone {
            font-size: 11px;
            font-weight: 800;
            color: #7c2d12;
            margin-top: 1px;
          }
          .address-box {
            margin-top: 6px;
            padding: 6px;
            background: #f8fafc !important;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font-size: 11px;
            line-height: 1.35;
          }
          .street-address {
            font-weight: 700;
            color: #0f172a;
          }
          .city-pin {
            color: #334155;
            margin-top: 2px;
          }
          .landmark {
            font-size: 10px;
            color: #64748b;
            margin-top: 2px;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            margin-top: 4px;
          }
          .calorie-badge {
            background: #ecfdf5 !important;
            border: 1px solid #a7f3d0;
            color: #065f46 !important;
            font-weight: 900;
            padding: 2px 6px;
            border-radius: 4px;
          }
          .macro-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
            margin-top: 6px;
            text-align: center;
          }
          .macro-box {
            background: #f1f5f9 !important;
            border: 1px solid #e2e8f0;
            padding: 4px 2px;
            border-radius: 4px;
          }
          .macro-lbl {
            display: block;
            font-size: 7.5px;
            color: #64748b;
            font-weight: 800;
          }
          .macro-val {
            font-size: 11px;
            font-weight: 900;
            color: #0f172a;
          }
          .footer-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 9.5px;
            margin-top: 6px;
            padding-top: 4px;
            border-top: 1px dashed #cbd5e1;
          }
          .sub-footer {
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: #475569;
            margin-top: 4px;
          }
          .consume-tag {
            background: #fef3c7 !important;
            border: 1px solid #fde68a;
            color: #78350f !important;
            font-weight: 800;
            padding: 1px 5px;
            border-radius: 3px;
          }
          .dispatch-meta {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #334155;
            margin-top: 6px;
            padding-top: 4px;
            border-top: 1px solid #e2e8f0;
          }
          .barcode-area {
            margin-top: 6px;
            text-align: center;
            padding-top: 4px;
            border-top: 1px dashed #cbd5e1;
          }
          .barcode-lines {
            font-family: monospace;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 2px;
            color: #000;
          }
          .barcode-text {
            font-family: monospace;
            font-size: 8px;
            color: #475569;
            margin-top: 1px;
          }
        </style>
      </head>
      <body>
        <div class="labels-container">
          ${labelsHTML}
        </div>
      </body>
      </html>
    `;
  };

  // Dedicated Print Execution via Hidden Iframe (Guarantees clean label print without web shell)
  const handleExecutePrint = () => {
    if (selectedOrders.length === 0) return;

    setIsPrinting(true);
    const htmlContent = generatePrintHTML();

    try {
      // Create or reuse hidden iframe
      let iframe = document.getElementById('dispatch-label-print-frame') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'dispatch-label-print-frame';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setIsPrinting(false);
          setPrintSuccess(true);
          confetti({ particleCount: 60, spread: 60 });
        }, 400);
      } else {
        // Fallback: window.print() or open popup
        handleOpenInNewWindow();
        setIsPrinting(false);
      }
    } catch (err) {
      console.warn('Iframe print error, using direct popup fallback:', err);
      handleOpenInNewWindow();
      setIsPrinting(false);
    }
  };

  // Safe Fallback: Open pure label sheet in new browser window
  const handleOpenInNewWindow = () => {
    const htmlContent = generatePrintHTML();
    const printWin = window.open('', '_blank', 'width=850,height=950');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(htmlContent);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden animate-fadeIn">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl border border-stone-200 text-stone-900 overflow-hidden">
        
        {/* =================================================================== */}
        {/* MODAL HEADER: Title, Stats & Close Button                           */}
        {/* =================================================================== */}
        <div className="p-4 sm:p-6 border-b border-stone-200 flex flex-wrap items-center justify-between gap-4 bg-stone-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-950 text-orange-400 flex items-center justify-center font-black shadow-md">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-stone-900">
                  Selective Dispatch & Nutrition Label Printing Engine
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-950 px-2.5 py-0.5 rounded-md border border-orange-300">
                  Ready to Print
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Print labels only without app headers or dashboard layout. Selected <strong>{selectedOrders.length} orders</strong> for <strong>{uniqueCustomers.length} distinct customer(s)</strong> ({totalStickersToPrint} total sticker units).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenInNewWindow}
              title="Open Printable Labels in Standalone Window"
              className="p-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-xs font-bold flex items-center gap-1.5 shadow-2xs"
            >
              <ExternalLink className="w-4 h-4 text-stone-600" />
              <span className="hidden sm:inline">Open Standalone</span>
            </button>

            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-stone-200 hover:bg-stone-300 flex items-center justify-center text-stone-600 font-bold transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* CONFIGURATION TOOLBAR: Label Type, Paper Size & Toggle Features     */}
        {/* =================================================================== */}
        <div className="p-4 border-b border-stone-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* Label Type Selector (The Core User Request: "print only the label at once") */}
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-stone-600 uppercase text-[10px]">Sticker Type:</span>
            <div className="inline-flex rounded-xl bg-stone-100 p-1 border border-stone-200 font-bold">
              <button
                onClick={() => setLabelMode('dispatch_only')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  labelMode === 'dispatch_only'
                    ? 'bg-orange-950 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-950'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>📍 Only Customer Address & Route</span>
              </button>

              <button
                onClick={() => setLabelMode('nutrition_only')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  labelMode === 'nutrition_only'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-950'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>🥗 Only Food Nutrition & Macros</span>
              </button>

              <button
                onClick={() => setLabelMode('both')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  labelMode === 'both'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-700 hover:text-stone-950'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>📦 Both Paired Stickers (2x per Meal)</span>
              </button>
            </div>
          </div>

          {/* Paper Format & Printer Type */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-stone-600 uppercase text-[10px]">Paper / Roll:</span>
            <select
              value={paperFormat}
              onChange={(e) => setPaperFormat(e.target.value as PaperFormat)}
              className="bg-stone-50 border border-stone-300 rounded-xl px-3 py-1.5 font-bold text-stone-800 text-xs focus:outline-hidden focus:border-orange-900"
            >
              <option value="a4_sheet">📄 A4 Multi-Sticker Sheet (2x4 Grid)</option>
              <option value="thermal_4x2">🖨️ Thermal Roll 4" x 2" (100mm x 50mm)</option>
              <option value="thermal_4x6">🏷️ Thermal Roll 4" x 6" (100mm x 150mm)</option>
              <option value="pos_80mm">🧾 POS Receipt 80mm Roll</option>
            </select>

            <div className="flex items-center gap-1.5 bg-stone-50 px-2.5 py-1.5 rounded-xl border border-stone-200">
              <span className="text-[10px] font-bold text-stone-500">Copies:</span>
              <select
                value={copiesCount}
                onChange={(e) => setCopiesCount(Number(e.target.value))}
                className="bg-transparent font-black text-stone-900 text-xs outline-none"
              >
                <option value={1}>1x Copy</option>
                <option value={2}>2x Copies</option>
                <option value={3}>3x Copies</option>
              </select>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-stone-700 font-bold text-[11px]">
              <input
                type="checkbox"
                checked={includeBarcode}
                onChange={(e) => setIncludeBarcode(e.target.checked)}
                className="rounded text-orange-950 focus:ring-orange-950 w-3.5 h-3.5"
              />
              <span>Barcode / QR</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-stone-700 font-bold text-[11px]">
              <input
                type="checkbox"
                checked={includeFssai}
                onChange={(e) => setIncludeFssai(e.target.checked)}
                className="rounded text-emerald-800 focus:ring-emerald-800 w-3.5 h-3.5"
              />
              <span>FSSAI Lic</span>
            </label>
          </div>
        </div>

        {/* =================================================================== */}
        {/* MAIN BODY: Selective Customer Filter Bar & Live Label Preview       */}
        {/* =================================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-stone-100/70 space-y-4" ref={previewContainerRef}>
          
          {/* Customer Selection Pill Bar */}
          {allAvailableOrders.length > 0 && onToggleOrderSelection && (
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-orange-900" />
                  <span className="font-extrabold text-stone-900">
                    Included Customer Orders ({selectedOrders.length} of {allAvailableOrders.length} selected):
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {onSelectAllInSlot && (
                    <button
                      onClick={onSelectAllInSlot}
                      className="text-[11px] font-bold text-orange-950 hover:underline"
                    >
                      Select All ({allAvailableOrders.length})
                    </button>
                  )}
                  {onClearSelection && (
                    <button
                      onClick={onClearSelection}
                      className="text-[11px] font-bold text-stone-500 hover:text-stone-900"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>

              {/* Order Chips for Selective Toggling */}
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {allAvailableOrders.map((ord) => {
                  const isSelected = selectedOrders.some((s) => s.id === ord.id);
                  return (
                    <button
                      key={ord.id}
                      onClick={() => onToggleOrderSelection(ord.id)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-orange-950 text-white border-orange-950 shadow-2xs'
                          : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${isSelected ? 'bg-orange-400 text-stone-950 font-black' : 'bg-stone-200 text-stone-600'}`}>
                        {isSelected ? '✓' : '+'}
                      </span>
                      <span>{ord.customerName}</span>
                      <span className="text-[10px] opacity-75 font-mono">({ord.orderRef})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PRINT STATUS ALERT IF SUCCESS */}
          {printSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex items-center justify-between text-xs text-emerald-900 font-bold animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Printing job initiated successfully! Stickers are formatting on printer.</span>
              </div>
              <button
                onClick={() => setPrintSuccess(false)}
                className="text-emerald-700 hover:underline font-extrabold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* EMPTY SELECTION WARNING */}
          {selectedOrders.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-stone-300 space-y-3">
              <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-black text-stone-900">No Orders Selected for Printing</h4>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Please select one or more customer orders using the chips above or the checkboxes in the dispatch list to generate printable stickers.
              </p>
              {onSelectAllInSlot && (
                <button
                  onClick={onSelectAllInSlot}
                  className="px-5 py-2.5 rounded-xl bg-orange-950 text-white font-black text-xs hover:bg-orange-900 transition-all shadow-md"
                >
                  Select All Available Orders ({allAvailableOrders.length})
                </button>
              )}
            </div>
          ) : (
            /* =============================================================== */
            /* REAL-TIME PREVIEW OF SELECTED STICKERS                          */
            /* =============================================================== */
            <div className={`grid gap-4 ${paperFormat === 'a4_sheet' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-md mx-auto'}`}>
              {selectedOrders.map((ord, idx) => (
                <React.Fragment key={`${ord.id}-${idx}`}>
                  
                  {/* LABEL 1: NUTRITION CONTAINER STICKER */}
                  {(labelMode === 'both' || labelMode === 'nutrition_only') && (
                    <div className="bg-white rounded-2xl border-2 border-emerald-800 shadow-sm overflow-hidden text-stone-900 font-sans">
                      {/* Kitchen License Banner */}
                      <div className="bg-emerald-950 text-emerald-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Hygienic Kitchen Certified</span>
                        </span>
                        {includeFssai && <span>{ord.fssaiLicense || 'FSSAI 11322007000341'}</span>}
                      </div>

                      {/* Dish Details */}
                      <div className="p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-[9px] font-extrabold uppercase text-emerald-800 tracking-wider">
                          <span>MEAL CONTAINER NUTRITION STICKER</span>
                          <span className="bg-emerald-100 px-2 py-0.5 rounded text-emerald-950">{ord.timeSlot}</span>
                        </div>

                        <h4 className="text-sm font-black text-stone-900 leading-snug">{ord.dishName}</h4>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="font-extrabold text-stone-700">Portion: {ord.portionSize}</span>
                          <span className="font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                            {ord.calories} kcal
                          </span>
                        </div>

                        {/* Macro Grid */}
                        {includeMacros && (
                          <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                            <div className="bg-stone-50 p-1.5 rounded-lg border border-stone-200">
                              <span className="text-[8px] text-stone-500 font-bold block uppercase">Protein</span>
                              <span className="font-black text-emerald-800 text-xs">{ord.protein}g</span>
                            </div>
                            <div className="bg-stone-50 p-1.5 rounded-lg border border-stone-200">
                              <span className="text-[8px] text-stone-500 font-bold block uppercase">Carbs</span>
                              <span className="font-black text-amber-800 text-xs">{ord.carbs}g</span>
                            </div>
                            <div className="bg-stone-50 p-1.5 rounded-lg border border-stone-200">
                              <span className="text-[8px] text-stone-500 font-bold block uppercase">Fat</span>
                              <span className="font-black text-blue-800 text-xs">{ord.fat}g</span>
                            </div>
                            <div className="bg-stone-50 p-1.5 rounded-lg border border-stone-200">
                              <span className="text-[8px] text-stone-500 font-bold block uppercase">Fiber</span>
                              <span className="font-black text-teal-800 text-xs">{ord.fiber}g</span>
                            </div>
                          </div>
                        )}

                        {/* Prepared Timestamp & Consume Warning */}
                        <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-600 font-mono">
                          <span>Prep: <strong>{ord.prepTimestamp}</strong></span>
                          <span className="text-amber-950 font-black bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                            Consume within 3 hours
                          </span>
                        </div>

                        {/* Customer Identification */}
                        <div className="text-[10px] text-stone-500 flex items-center justify-between pt-1 border-t border-stone-100">
                          <span>Customer: <strong className="text-stone-800">{ord.customerName}</strong></span>
                          <span className="font-mono">{ord.orderRef}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* LABEL 2: CUSTOMER DISPATCH & DELIVERY ADDRESS STICKER */}
                  {(labelMode === 'both' || labelMode === 'dispatch_only') && (
                    <div className="bg-white rounded-2xl border-2 border-orange-900 shadow-sm overflow-hidden text-stone-900 font-sans flex flex-col justify-between">
                      {/* Slot Header */}
                      <div className="bg-orange-950 text-orange-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-orange-400" />
                          <span>CUSTOMER DISPATCH STICKER</span>
                        </span>
                        <span>{ord.timeSlot}</span>
                      </div>

                      {/* Customer Details & Address */}
                      <div className="p-3.5 space-y-2 flex-1">
                        <div>
                          <h4 className="text-base font-black text-stone-900 uppercase tracking-tight">{ord.customerName}</h4>
                          <div className="flex items-center gap-1 text-xs font-extrabold text-orange-950 mt-0.5">
                            <Phone className="w-3.5 h-3.5 text-orange-700" />
                            <span>{ord.customerPhone}</span>
                          </div>
                        </div>

                        {/* Delivery Address Box */}
                        <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 text-xs space-y-0.5 text-stone-800">
                          <div className="font-bold text-stone-900">{ord.deliveryAddress.street}</div>
                          <div>{ord.deliveryAddress.city} - <strong className="font-black text-stone-900">{ord.deliveryAddress.pincode}</strong></div>
                          {ord.deliveryAddress.landmark && (
                            <div className="text-[10px] text-stone-500">Landmark: {ord.deliveryAddress.landmark}</div>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-stone-600 pt-1 border-t border-stone-100">
                          <span><strong>Order:</strong> {ord.orderRef}</span>
                          <span><strong>Meal:</strong> {ord.dishName.slice(0, 24)}...</span>
                        </div>

                        {/* Simulated Logistics Barcode & Route Code */}
                        {includeBarcode && (
                          <div className="pt-2 border-t border-dashed border-stone-200 text-center font-mono">
                            <div className="text-xs tracking-widest font-black text-stone-950">
                              ||| | |||| || ||||| |||| || ||| |||| ||
                            </div>
                            <div className="text-[9px] text-stone-500">
                              * {ord.orderRef} * {ord.deliveryAddress.pincode} *
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </React.Fragment>
              ))}
            </div>
          )}

        </div>

        {/* =================================================================== */}
        {/* MODAL FOOTER: Print Action Buttons                                  */}
        {/* =================================================================== */}
        <div className="p-4 sm:p-6 border-t border-stone-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-stone-600">
            <span className="font-bold">Summary:</span> {selectedOrders.length} order(s) selected • {totalStickersToPrint} sticker label(s) total ({labelMode.replace('_', ' ')})
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-stone-300 text-stone-700 font-bold hover:bg-stone-100 text-xs"
            >
              Close
            </button>

            <button
              onClick={handleExecutePrint}
              disabled={selectedOrders.length === 0 || isPrinting}
              className="flex-1 sm:flex-none px-8 py-3 rounded-2xl bg-orange-950 hover:bg-orange-900 text-white font-black text-xs shadow-lg shadow-orange-950/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Printer className="w-4 h-4 text-orange-400" />
              <span>
                {isPrinting ? 'Printing Labels...' : `Print Only Labels (${totalStickersToPrint} Stickers)`}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
