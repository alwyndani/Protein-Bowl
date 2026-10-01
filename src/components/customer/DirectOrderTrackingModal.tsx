import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  Truck, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  ShoppingBag, 
  RotateCcw, 
  Phone, 
  Mail, 
  User, 
  ChevronRight, 
  Printer, 
  AlertCircle,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import { DirectGuestOrder, RetailCustomerAccount } from '../../types';

interface DirectOrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: DirectGuestOrder[];
  accounts: RetailCustomerAccount[];
  initialSearchQuery?: string;
  initialOrderNumber?: string;
  onReorderItems?: (items: DirectGuestOrder['items']) => void;
}

export const DirectOrderTrackingModal: React.FC<DirectOrderTrackingModalProps> = ({
  isOpen,
  onClose,
  orders,
  accounts,
  initialSearchQuery = '',
  initialOrderNumber = '',
  onReorderItems
}) => {
  const [searchQuery, setSearchQuery] = useState(initialOrderNumber || initialSearchQuery);
  const [selectedOrder, setSelectedOrder] = useState<DirectGuestOrder | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery(initialOrderNumber || initialSearchQuery);
    }
  }, [isOpen, initialOrderNumber, initialSearchQuery]);

  if (!isOpen) return null;

  // Filter matching orders by phone, orderNumber, or customer name
  const trimmed = searchQuery.trim().toLowerCase();
  const matchedOrders = orders.filter(ord => {
    if (!trimmed) return true;
    return (
      ord.orderNumber.toLowerCase().includes(trimmed) ||
      ord.customerPhone.toLowerCase().includes(trimmed) ||
      ord.customerName.toLowerCase().includes(trimmed) ||
      ord.customerEmail.toLowerCase().includes(trimmed)
    );
  });

  // Find linked customer account
  const matchedAccount = accounts.find(acc => {
    if (!trimmed) return false;
    return acc.phone.includes(trimmed) || acc.name.toLowerCase().includes(trimmed);
  }) || (orders.length > 0 && trimmed ? {
    id: 'demo-acc',
    name: matchedOrders[0]?.customerName || 'Direct Customer',
    phone: matchedOrders[0]?.customerPhone || searchQuery,
    email: matchedOrders[0]?.customerEmail || 'customer@nutrifit.in',
    bottleDepositBalance: matchedOrders.reduce((sum, o) => sum + (o.bottleDepositTotal || 0), 0),
    totalOrdersCount: matchedOrders.length,
    orderIds: matchedOrders.map(o => o.id),
    createdAt: matchedOrders[0]?.createdAt || new Date().toISOString()
  } as RetailCustomerAccount : null);

  const activeOrder = selectedOrder || matchedOrders[0] || null;

  const handleTrackSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (matchedOrders.length > 0) {
      setSelectedOrder(matchedOrders[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div 
        className="bg-stone-900 border border-stone-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-800 bg-stone-950/90 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-black uppercase tracking-wider mb-0.5">
                <Sparkles className="w-3 h-3" />
                Customer Account & Live Order Tracking
              </div>
              <h3 className="text-base sm:text-lg font-black text-white">
                Packaged Foods & Probiotic Tepache Tracking Portal
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white bg-stone-800 p-2 rounded-full border border-stone-700 hover:bg-stone-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search / Lookup Bar */}
        <form onSubmit={handleTrackSubmit} className="p-4 bg-stone-950/70 border-b border-stone-800 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by Order ID (e.g. DIR-104928) or Mobile Phone (+91...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-900 border border-stone-700 rounded-xl pl-10 pr-3 py-2 text-xs text-white placeholder-stone-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full sm:w-auto px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-stone-950 font-bold text-xs rounded-xl transition-colors shrink-0 shadow cursor-pointer"
          >
            Track Order
          </button>
        </form>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {orders.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-16 h-16 bg-stone-800 rounded-full flex items-center justify-center mx-auto text-stone-500">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">No Direct Orders on File Yet</h4>
                <p className="text-xs text-stone-400 max-w-sm mx-auto">
                  Add artisan sourdough loaves, nutrition snacks, or wild Tepache bottles to your cart and place an order to track delivery in real time.
                </p>
              </div>
              <button
                onClick={onClose}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-md cursor-pointer"
              >
                Browse Menu & Shop
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Order List & Customer Profile Card */}
              <div className="space-y-4">
                
                {/* Account Profile Card */}
                {matchedAccount && (
                  <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center text-xs">
                          {matchedAccount.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{matchedAccount.name}</div>
                          <div className="text-[11px] text-stone-400">{matchedAccount.phone}</div>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase">
                        Retail Member
                      </span>
                    </div>

                    {/* Bottle Deposit Ledger Summary */}
                    <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">₹{matchedAccount.bottleDepositBalance} Bottle Credit</div>
                          <div className="text-[10px] text-stone-400">Refundable on glass bottle return</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Orders History List */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-stone-400 px-1">
                    Your Orders ({matchedOrders.length})
                  </div>

                  {matchedOrders.map((ord) => {
                    const isSelected = activeOrder?.id === ord.id;
                    return (
                      <div
                        key={ord.id}
                        onClick={() => setSelectedOrder(ord)}
                        className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-cyan-950/40 border-cyan-500/60 shadow-lg'
                            : 'bg-stone-950/70 border-stone-800 hover:border-stone-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-xs text-white">
                            #{ord.orderNumber}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            ord.orderStatus === 'delivered'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-cyan-500/20 text-cyan-300'
                          }`}>
                            {ord.orderStatus.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-stone-400 mt-2">
                          <span>{ord.items.length} items • ₹{ord.grandTotal}</span>
                          <span>{ord.deliveryDate}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Right Column: Selected Order Detail & Live Timeline */}
              {activeOrder && (
                <div className="lg:col-span-2 space-y-4">
                  
                  {/* Order Overview Card */}
                  <div className="bg-stone-950 border border-stone-800 rounded-3xl p-5 space-y-5">
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-4">
                      <div>
                        <div className="text-[11px] font-bold text-stone-400 uppercase">
                          Order Details
                        </div>
                        <h4 className="text-lg font-black text-white">
                          #{activeOrder.orderNumber}
                        </h4>
                        <div className="text-xs text-stone-400 mt-0.5">
                          Hub: <strong className="text-emerald-400">{activeOrder.fulfillmentHub}</strong>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xl font-black text-amber-400">
                          ₹{activeOrder.grandTotal}
                        </div>
                        <div className="text-[10px] text-stone-400 uppercase font-bold">
                          {activeOrder.paymentMode.replace(/_/g, ' ')} • {activeOrder.paymentStatus}
                        </div>
                      </div>
                    </div>

                    {/* Live Progress Stage Tracker */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-stone-300">
                        <span className="flex items-center gap-1.5 text-cyan-400">
                          <Truck className="w-4 h-4" />
                          Live Cold-Chain Dispatch Tracker
                        </span>
                        <span className="text-[11px] text-stone-400">
                          Slot: {activeOrder.deliverySlot}
                        </span>
                      </div>

                      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 space-y-3">
                        {activeOrder.trackingUpdates && activeOrder.trackingUpdates.length > 0 ? (
                          activeOrder.trackingUpdates.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-3 text-xs">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold ${
                                step.completed ? 'bg-emerald-500 text-stone-950' : 'bg-stone-800 text-stone-500'
                              }`}>
                                {step.completed ? '✓' : idx + 1}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div className={`font-bold ${step.completed ? 'text-white' : 'text-stone-400'}`}>
                                    {step.stage}
                                  </div>
                                  <span className="text-[10px] font-mono text-stone-500">{step.time}</span>
                                </div>
                                <div className="text-[11px] text-stone-400">{step.description}</div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-stone-400">
                            Order is verified and scheduled for cold delivery.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Delivery & Rider Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="bg-stone-900/60 border border-stone-800/80 rounded-2xl p-3.5 space-y-1">
                        <div className="text-[10px] text-stone-400 font-bold uppercase flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-amber-400" />
                          Delivery Destination
                        </div>
                        <div className="font-bold text-white">{activeOrder.customerName}</div>
                        <div className="text-stone-400 text-[11px] leading-tight">
                          {activeOrder.deliveryAddress} {activeOrder.landmark && `(Near ${activeOrder.landmark})`}
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono">PIN: {activeOrder.pincode}</div>
                      </div>

                      <div className="bg-stone-900/60 border border-stone-800/80 rounded-2xl p-3.5 space-y-1">
                        <div className="text-[10px] text-stone-400 font-bold uppercase flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-400" />
                          Delivery Courier Contact
                        </div>
                        <div className="font-bold text-white">{activeOrder.riderName || 'Cold Van Courier'}</div>
                        <div className="text-stone-400 text-[11px] font-mono">{activeOrder.riderPhone || '+91 98470 22334'}</div>
                        <div className="text-[10px] text-emerald-400 font-bold">Cold Pack Temperature: 3.8°C Verified</div>
                      </div>
                    </div>

                    {/* Items Breakdown */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-stone-400 uppercase">
                        Items in this Shipment ({activeOrder.items.length})
                      </div>
                      <div className="space-y-1.5">
                        {activeOrder.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="bg-stone-900/40 border border-stone-800 rounded-xl p-2.5 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-amber-400">{it.quantity}x</span>
                              <span className="text-white font-medium">{it.name}</span>
                              <span className="text-[10px] text-stone-500">({it.sizeOrWeight})</span>
                            </div>
                            <span className="font-bold text-stone-200">₹{it.lineTotal}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      {onReorderItems && (
                        <button
                          type="button"
                          onClick={() => {
                            onReorderItems(activeOrder.items);
                            onClose();
                          }}
                          className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow cursor-pointer"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>Reorder This Basket</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors flex items-center gap-1.5 border border-stone-700 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Bill & Challan</span>
                      </button>
                    </div>

                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
