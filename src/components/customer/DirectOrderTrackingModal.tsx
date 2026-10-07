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
import { OrderService } from '../../services/orderService';

interface DirectOrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders?: DirectGuestOrder[];
  accounts?: RetailCustomerAccount[];
  initialSearchQuery?: string;
  initialOrderNumber?: string;
  onReorderItems?: (items: DirectGuestOrder['items']) => void;
}

export const DirectOrderTrackingModal: React.FC<DirectOrderTrackingModalProps> = ({
  isOpen,
  onClose,
  orders: localOrders = [],
  accounts = [],
  initialSearchQuery = '',
  initialOrderNumber = '',
  onReorderItems
}) => {
  const [searchQuery, setSearchQuery] = useState(initialOrderNumber || initialSearchQuery);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [apiOrders, setApiOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch authenticated customer orders from backend API
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(initialOrderNumber || initialSearchQuery);
      fetchRealOrders();
    }
  }, [isOpen, initialOrderNumber, initialSearchQuery]);

  const fetchRealOrders = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const realOrders = await OrderService.getMyOrders();
      if (Array.isArray(realOrders) && realOrders.length > 0) {
        setApiOrders(realOrders);
      } else {
        setApiOrders([]);
      }
    } catch (err: any) {
      console.warn('Could not fetch real customer orders from backend:', err?.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Combine real backend orders with local props
  const allOrders = [...apiOrders, ...localOrders];

  const trimmed = searchQuery.trim().toLowerCase();
  const matchedOrders = allOrders.filter(ord => {
    if (!trimmed) return true;
    const orderNo = ord.orderNumber || ord.id || '';
    const phone = ord.customerPhone || ord.deliveryAddressSnapshot?.phone || '';
    const name = ord.customerName || ord.deliveryAddressSnapshot?.recipientName || '';
    return (
      orderNo.toLowerCase().includes(trimmed) ||
      phone.toLowerCase().includes(trimmed) ||
      name.toLowerCase().includes(trimmed)
    );
  });

  const activeOrder = selectedOrder || matchedOrders[0] || null;

  const handleTrackSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setErrorMsg('');
    try {
      const tracked = await OrderService.trackOrder(searchQuery.trim());
      if (tracked) {
        setSelectedOrder(tracked);
        setApiOrders(prev => {
          if (prev.some(o => o.id === tracked.id)) return prev;
          return [tracked, ...prev];
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Order not found');
    } finally {
      setIsLoading(false);
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
              placeholder="Search by Order ID (e.g. PB-104928) or Mobile Phone"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-900 border border-stone-700 rounded-xl pl-10 pr-3 py-2 text-xs text-white placeholder-stone-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full sm:w-auto px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-stone-950 font-bold text-xs rounded-xl transition-colors shrink-0 shadow cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Searching...' : 'Track Order'}
          </button>
        </form>

        {errorMsg && (
          <div className="mx-4 mt-3 p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {allOrders.length === 0 && !isLoading ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-16 h-16 bg-stone-800 rounded-full flex items-center justify-center mx-auto text-stone-500">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">No Orders Found</h4>
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
              
              {/* Left Column: Order List */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-stone-400 px-1">
                    Your Real Orders ({matchedOrders.length})
                  </div>

                  {matchedOrders.map((ord) => {
                    const isSelected = activeOrder?.id === ord.id;
                    const orderNo = ord.orderNumber || ord.id;
                    const total = ord.netAmount || ord.grandTotal || ord.totalAmount || 0;
                    const status = ord.status || ord.orderStatus || 'PENDING';
                    const itemsCount = ord.items?.length || 0;
                    const dateStr = ord.createdAt ? new Date(ord.createdAt).toLocaleDateString() : 'Today';

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
                            #{orderNo}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            status === 'DELIVERED' || status === 'delivered'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-cyan-500/20 text-cyan-300'
                          }`}>
                            {status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-stone-400 mt-2">
                          <span>{itemsCount} items • ₹{total}</span>
                          <span>{dateStr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Selected Order Detail */}
              {activeOrder && (
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-stone-950 border border-stone-800 rounded-3xl p-5 space-y-5">
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-4">
                      <div>
                        <div className="text-[11px] font-bold text-stone-400 uppercase">
                          Order Details
                        </div>
                        <h4 className="text-lg font-black text-white">
                          #{activeOrder.orderNumber || activeOrder.id}
                        </h4>
                        <div className="text-xs text-stone-400 mt-0.5">
                          Status: <strong className="text-emerald-400 uppercase">{activeOrder.status || activeOrder.orderStatus || 'PENDING'}</strong>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xl font-black text-amber-400">
                          ₹{activeOrder.netAmount || activeOrder.grandTotal || activeOrder.totalAmount || 0}
                        </div>
                        <div className="text-[10px] text-stone-400 uppercase font-bold">
                          {activeOrder.paymentMethod || activeOrder.paymentMode || 'ONLINE'} • {activeOrder.paymentStatus || 'PENDING'}
                        </div>
                      </div>
                    </div>

                    {/* Order Status */}
                    <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 space-y-2">
                      <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>Persisted Order Status</span>
                      </div>
                      <div className="text-sm font-black text-white uppercase">
                        {activeOrder.status || activeOrder.orderStatus || 'PENDING'}
                      </div>
                      <p className="text-xs text-stone-400">
                        Payment Status: <strong className="text-amber-300">{activeOrder.paymentStatus || 'PENDING'}</strong>
                      </p>
                    </div>

                    {/* Items Breakdown */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-stone-400 uppercase">
                        Items Snapshot ({activeOrder.items?.length || 0})
                      </div>
                      <div className="space-y-1.5">
                        {activeOrder.items?.map((it: any, idx: number) => (
                          <div
                            key={idx}
                            className="bg-stone-900/40 border border-stone-800 rounded-xl p-2.5 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-amber-400">{it.quantity}x</span>
                              <span className="text-white font-medium">{it.itemTitle || it.title || it.name}</span>
                              {it.variantName && <span className="text-[10px] text-stone-500">({it.variantName})</span>}
                            </div>
                            <span className="font-bold text-stone-200">₹{it.totalPrice || it.lineTotal || (it.unitPrice * it.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors flex items-center gap-1.5 border border-stone-700 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Bill</span>
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
