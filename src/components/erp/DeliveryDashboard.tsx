import React, { useState, useMemo } from 'react';
import { Order, KitchenBranchId } from '../../types';
import { Truck, MapPin, CheckCircle2, Clock, Navigation, Phone, Search, Printer, CheckSquare, Square } from 'lucide-react';
import confetti from 'canvas-confetti';
import { DispatchLabelPrintModal, DispatchLabelItem, LabelTypeMode } from './DispatchLabelPrintModal';

interface DeliveryDashboardProps {
  orders: Order[];
  onUpdateOrderStatus: (orderId: string, status: Order['orderStatus']) => void;
  selectedBranchId?: KitchenBranchId;
  onSelectBranch?: (branchId: KitchenBranchId) => void;
}

export const DeliveryDashboard: React.FC<DeliveryDashboardProps> = ({ 
  orders, 
  onUpdateOrderStatus,
  selectedBranchId = 'all',
  onSelectBranch
}) => {
  const [selectedSlot, setSelectedSlot] = useState<string>('All Slots');
  const [searchZone, setSearchZone] = useState<string>('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printModalMode, setPrintModalMode] = useState<LabelTypeMode>('dispatch_only');

  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      const matchesSlot = selectedSlot === 'All Slots' || ord.deliverySlot.includes(selectedSlot);
      const matchesSearch = 
        ord.customerName.toLowerCase().includes(searchZone.toLowerCase()) ||
        ord.deliveryAddress.street.toLowerCase().includes(searchZone.toLowerCase()) ||
        ord.deliveryAddress.city.toLowerCase().includes(searchZone.toLowerCase()) ||
        ord.id.toLowerCase().includes(searchZone.toLowerCase());
      return matchesSlot && matchesSearch;
    });
  }, [orders, selectedSlot, searchZone]);

  // Convert Order to DispatchLabelItem
  const dispatchLabelItems: DispatchLabelItem[] = useMemo(() => {
    return orders.map((o) => ({
      id: o.id,
      orderRef: o.id,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      deliveryAddress: o.deliveryAddress,
      timeSlot: o.deliverySlot,
      dishName: o.planTitle,
      portionSize: 'Standard Diet Meal Box',
      calories: 450,
      protein: 42,
      carbs: 22,
      fat: 14,
      fiber: 6,
      prepTimestamp: '24-JUL-2026, 06:45 AM',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341',
      batchNumber: o.batchNumber,
      dietaryNote: o.dietaryPreference
    }));
  }, [orders]);

  const selectedDispatchItems = useMemo(() => {
    if (selectedOrderIds.length === 0) return dispatchLabelItems;
    return dispatchLabelItems.filter((item) => selectedOrderIds.includes(item.id));
  }, [dispatchLabelItems, selectedOrderIds]);

  const handleToggleSelection = (id: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedOrderIds(filteredOrders.map(o => o.id));
  };

  const handleClearSelection = () => {
    setSelectedOrderIds([]);
  };

  const handleOpenPrint = (mode: LabelTypeMode, singleOrder?: Order) => {
    setPrintModalMode(mode);
    if (singleOrder) {
      setSelectedOrderIds([singleOrder.id]);
    }
    setShowPrintModal(true);
  };

  const handleMarkDelivered = (orderId: string) => {
    confetti({ particleCount: 50, spread: 60 });
    onUpdateOrderStatus(orderId, 'delivered');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-950 via-stone-900 to-emerald-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 bg-emerald-900/60 px-3 py-1 rounded-full border border-emerald-700/50">
              Logistics & Route Planning
            </span>
            <h1 className="text-2xl sm:text-4xl font-black mt-2">
              Kochi Dispatch & Last-Mile Delivery
            </h1>
            <p className="text-xs sm:text-sm text-stone-300">
              Zone-wise route optimization, temperature-controlled delivery status, and batch dispatch label generator.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleOpenPrint('dispatch_only')}
              className="bg-white hover:bg-stone-100 text-emerald-950 font-black px-4 py-3 rounded-2xl text-xs flex items-center gap-2 shadow-lg transition-all"
            >
              <Printer className="w-4 h-4 text-emerald-700" />
              <span>Print Dispatch Labels ({selectedOrderIds.length > 0 ? selectedOrderIds.length : filteredOrders.length})</span>
            </button>

            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/20 text-center">
              <span className="text-[10px] text-emerald-200 font-bold uppercase block">Today's Deliveries</span>
              <span className="text-2xl font-black text-white">{orders.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          {['All Slots', '7:00 AM - 8:30 AM', '12:00 PM - 1:30 PM', '7:00 PM - 8:30 PM'].map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSlot(s)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                selectedSlot === s ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-stone-400" />
          <input
            type="text"
            placeholder="Search customer address or zone..."
            value={searchZone}
            onChange={(e) => setSearchZone(e.target.value)}
            className="w-full bg-stone-50 border border-stone-300 rounded-xl pl-8 pr-3 py-2 text-xs font-bold outline-none"
          />
        </div>
      </div>

      {/* Quick Selection Bar */}
      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            className="bg-white hover:bg-emerald-100 text-emerald-950 font-black px-3 py-1.5 rounded-xl border border-emerald-300 flex items-center gap-1.5"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-800" />
            <span>Select All ({filteredOrders.length})</span>
          </button>
          <button
            onClick={handleClearSelection}
            className="text-stone-600 hover:text-stone-900 font-bold px-2 py-1"
          >
            Clear Selection
          </button>
          <span className="text-stone-700 font-extrabold ml-2">
            <strong>{selectedOrderIds.length}</strong> selected for batch label printing
          </span>
        </div>

        <button
          onClick={() => handleOpenPrint('both')}
          className="bg-emerald-900 hover:bg-emerald-950 text-white font-black px-3 py-1.5 rounded-xl flex items-center gap-1.5"
        >
          <Printer className="w-3.5 h-3.5 text-emerald-300" />
          <span>Print Both Labels</span>
        </button>
      </div>

      {/* Orders List for Delivery Personnel */}
      <div className="space-y-4">
        {filteredOrders.map((ord) => {
          const isSelected = selectedOrderIds.includes(ord.id);
          return (
            <div 
              key={ord.id} 
              className={`bg-white rounded-3xl p-6 border transition-all shadow-sm space-y-4 ${
                isSelected ? 'border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-400' : 'border-stone-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelection(ord.id)}
                    className="w-5 h-5 rounded text-emerald-800 focus:ring-emerald-800 cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">{ord.id}</span>
                      <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-md">
                        {ord.deliverySlot}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-stone-900 text-base mt-1">{ord.customerName}</h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenPrint('dispatch_only', ord)}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl text-xs flex items-center gap-1"
                  >
                    <Printer className="w-3.5 h-3.5 text-stone-600" />
                    <span>Print Label</span>
                  </button>

                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase ${
                    ord.orderStatus === 'delivered'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {ord.orderStatus.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                  <div className="font-bold text-stone-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" /> Delivery Address
                  </div>
                  <p className="text-stone-600 font-medium">{ord.deliveryAddress.street}, {ord.deliveryAddress.city} - {ord.deliveryAddress.pincode}</p>
                  <p className="text-stone-400 text-[10px]">Landmark: {ord.deliveryAddress.landmark}</p>
                  <p className="text-stone-600 font-bold mt-1">Phone: {ord.customerPhone}</p>
                </div>

                <div className="space-y-1 bg-stone-50 p-3 rounded-2xl border border-stone-200">
                  <div className="font-bold text-stone-800 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-emerald-600" /> Package & Batch Metadata
                  </div>
                  <p className="text-stone-600">Plan: {ord.planTitle}</p>
                  <p className="text-stone-400 text-[10px]">Batch No: {ord.batchNumber}</p>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                {ord.orderStatus !== 'delivered' && (
                  <>
                    <button
                      onClick={() => onUpdateOrderStatus(ord.id, 'out_for_delivery')}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded-xl text-xs transition-colors"
                    >
                      Set Out for Delivery
                    </button>
                    <button
                      onClick={() => handleMarkDelivered(ord.id)}
                      className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold rounded-xl text-xs transition-colors flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mark Delivered ✓</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* DEDICATED LABEL PRINTING TERMINAL MODAL */}
      <DispatchLabelPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        selectedOrders={selectedDispatchItems}
        allAvailableOrders={dispatchLabelItems}
        onToggleOrderSelection={handleToggleSelection}
        onSelectAllInSlot={handleSelectAll}
        onClearSelection={handleClearSelection}
        initialLabelMode={printModalMode}
      />

    </div>
  );
};
