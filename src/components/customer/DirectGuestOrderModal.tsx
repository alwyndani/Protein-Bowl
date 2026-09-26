import React, { useState } from 'react';
import { 
  ShoppingBag, 
  X, 
  MapPin, 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  Truck, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Minus, 
  Trash2, 
  ThermometerSnowflake, 
  RotateCcw, 
  ArrowRight,
  Phone,
  Mail,
  User,
  Building,
  QrCode,
  FileText,
  Printer
} from 'lucide-react';
import { DirectGuestOrder } from '../../types';

export interface CartOrderableItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  quantity: number;
  weightOrVolume: string;
  storageType: string;
  image?: string;
  isTepacheBottle?: boolean;
}

interface DirectGuestOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItems: CartOrderableItem[];
  onOrderPlaced?: (order: DirectGuestOrder) => void;
}

export const KERALA_FULFILLMENT_HUBS = [
  { id: 'hub-koc', name: 'Kochi Central Hub & Kitchen (Kakkanad HQ)', deliveryRadius: 'Kochi, Kakkanad, Fort Kochi, Aluva (Est. 45-60 Mins)' },
  { id: 'hub-tvm', name: 'Trivandrum South Coast Hub (Kowdiar & Technopark)', deliveryRadius: 'Trivandrum City, Kazhakkoottam, Kowdiar (Est. 45-60 Mins)' },
  { id: 'hub-clt', name: 'Kozhikode Malabar Hub (Beach Road & Cyberpark)', deliveryRadius: 'Kozhikode Urban, Mavoor Road, Beach (Est. 50-70 Mins)' },
  { id: 'hub-tcr', name: 'Thrissur Cultural Hub (Round South & Punkunnam)', deliveryRadius: 'Thrissur Town, Ayyanthole, Ollur (Est. 50-70 Mins)' },
];

export const DirectGuestOrderModal: React.FC<DirectGuestOrderModalProps> = ({
  isOpen,
  onClose,
  initialItems,
  onOrderPlaced
}) => {
  const [items, setItems] = useState<CartOrderableItem[]>(initialItems);

  // Form Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [whatsappUpdates, setWhatsappUpdates] = useState(true);

  // Delivery & Supply Specifics
  const [selectedHub, setSelectedHub] = useState(KERALA_FULFILLMENT_HUBS[0].id);
  const [fulfillmentMode, setFulfillmentMode] = useState<'express_home_delivery' | 'hub_counter_pickup'>('express_home_delivery');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');
  const [deliverySlot, setDeliverySlot] = useState<'Morning (8:00 AM - 11:00 AM)' | 'Afternoon (1:00 PM - 4:00 PM)' | 'Evening (5:00 PM - 8:00 PM)'>('Morning (8:00 AM - 11:00 AM)');
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [coldChainPackaging, setColdChainPackaging] = useState(true);
  const [orderNotes, setOrderNotes] = useState('');

  // Payment
  const [paymentMode, setPaymentMode] = useState<'upi_instant' | 'cash_on_delivery' | 'card_online'>('upi_instant');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<DirectGuestOrder | null>(null);

  if (!isOpen) return null;

  const updateQuantity = (id: string, delta: number) => {
    setItems(prev => {
      return prev
        .map(item => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartOrderableItem[];
    });
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // Calculations
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tepacheBottleCount = items
    .filter(i => i.isTepacheBottle || i.category.toLowerCase().includes('tepache'))
    .reduce((sum, item) => sum + item.quantity, 0);
  
  const bottleDepositTotal = tepacheBottleCount * 10; // ₹10 refundable glass deposit
  const packagingFee = coldChainPackaging ? 25 : 0;
  const deliveryFee = fulfillmentMode === 'hub_counter_pickup' ? 0 : (subtotal >= 499 ? 0 : 40);
  const gstAmount = Math.round(subtotal * 0.05); // 5% GST
  const grandTotal = subtotal + bottleDepositTotal + packagingFee + deliveryFee + gstAmount;

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    if (!customerName || !customerPhone) {
      alert('Please provide your name and contact phone number.');
      return;
    }

    if (fulfillmentMode === 'express_home_delivery' && (!deliveryAddress || !pincode)) {
      alert('Please fill out your delivery address and pincode.');
      return;
    }

    setIsSubmitting(true);

    const hubObj = KERALA_FULFILLMENT_HUBS.find(h => h.id === selectedHub);

    const orderNumber = `DIR-GUEST-${Math.floor(100000 + Math.random() * 900000)}`;

    const newOrder: DirectGuestOrder = {
      id: `dir-ord-${Date.now()}`,
      orderNumber,
      orderType: tepacheBottleCount > 0 && items.length === tepacheBottleCount 
        ? 'tepache_drinks' 
        : tepacheBottleCount > 0 
          ? 'mixed_wellness' 
          : 'packaged_bakery',
      customerName,
      customerPhone,
      customerEmail: customerEmail || 'guest@nutrifit.in',
      deliveryAddress: fulfillmentMode === 'express_home_delivery' ? deliveryAddress : `Counter Pickup at ${hubObj?.name}`,
      landmark,
      pincode: pincode || '682030',
      fulfillmentHub: hubObj ? hubObj.name : 'Kochi Central Hub',
      fulfillmentMode,
      deliveryDate,
      deliverySlot,
      items: items.map(i => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        category: i.category,
        quantity: i.quantity,
        unitPrice: i.price,
        lineTotal: i.price * i.quantity,
        sizeOrWeight: i.weightOrVolume,
        storageType: i.storageType
      })),
      subtotal,
      deliveryFee,
      packagingFee,
      gstAmount,
      discountAmount: 0,
      bottleDepositTotal,
      grandTotal,
      paymentMode,
      paymentStatus: paymentMode === 'cash_on_delivery' ? 'pending_cod' : 'paid',
      orderStatus: 'confirmed',
      orderNotes,
      coldChainRequired: coldChainPackaging || tepacheBottleCount > 0,
      createdAt: new Date().toISOString()
    };

    setTimeout(() => {
      setIsSubmitting(false);
      setConfirmedOrder(newOrder);
      if (onOrderPlaced) onOrderPlaced(newOrder);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-fadeIn">
      <div 
        className="bg-stone-900 border border-stone-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-stone-800 bg-stone-950/90 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-black uppercase tracking-wider mb-0.5">
                <Sparkles className="w-3 h-3" />
                Direct Guest Checkout • No Account Needed
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white">
                Packaged Nutrition & Tepache Probiotic Order
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white bg-stone-800 p-2.5 rounded-full border border-stone-700 hover:bg-stone-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ORDER SUCCESS VIEW */}
        {confirmedOrder ? (
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/40">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="text-xs font-black uppercase text-emerald-400 tracking-wider">Order Successfully Confirmed!</span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                Order #{confirmedOrder.orderNumber}
              </h2>
              <p className="text-xs sm:text-sm text-stone-300 max-w-lg mx-auto mt-2">
                Thank you <strong className="text-white">{confirmedOrder.customerName}</strong>! Your order has been allocated to <strong className="text-emerald-400">{confirmedOrder.fulfillmentHub}</strong> and is being packed under strict food hygiene standards.
              </p>
            </div>

            {/* Order Summary Receipt Box */}
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-5 text-left max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <div>
                  <span className="text-[11px] text-stone-400 uppercase font-bold">Delivery Schedule</span>
                  <div className="text-sm font-bold text-white flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    {confirmedOrder.deliveryDate} • {confirmedOrder.deliverySlot}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-stone-400 uppercase font-bold">Fulfillment Mode</span>
                  <div className="text-xs font-bold text-amber-400 mt-0.5 capitalize">
                    {confirmedOrder.fulfillmentMode.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="text-[11px] text-stone-400 uppercase font-bold">Items Ordered ({confirmedOrder.items.length})</span>
                {confirmedOrder.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-stone-900 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-400">{item.quantity}x</span>
                      <span className="text-stone-200">{item.name}</span>
                      <span className="text-[10px] text-stone-400">({item.sizeOrWeight})</span>
                    </div>
                    <span className="font-bold text-white">₹{item.lineTotal}</span>
                  </div>
                ))}
              </div>

              {/* Price Breakdown */}
              <div className="border-t border-stone-800 pt-3 space-y-1.5 text-xs text-stone-300">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{confirmedOrder.subtotal}</span>
                </div>
                {confirmedOrder.bottleDepositTotal > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Glass Bottle Refundable Deposit ({tepacheBottleCount}x ₹10):</span>
                    <span>+₹{confirmedOrder.bottleDepositTotal}</span>
                  </div>
                )}
                {confirmedOrder.packagingFee > 0 && (
                  <div className="flex justify-between text-cyan-400">
                    <span>Cold Thermal Foil & Ice-Gel Packaging:</span>
                    <span>+₹{confirmedOrder.packagingFee}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>GST (5%):</span>
                  <span>₹{confirmedOrder.gstAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery Dispatch Fee:</span>
                  <span>{confirmedOrder.deliveryFee === 0 ? <span className="text-emerald-400 font-bold">FREE</span> : `₹${confirmedOrder.deliveryFee}`}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-white border-t border-stone-800 pt-2">
                  <span>Grand Total Paid / Payable:</span>
                  <span className="text-emerald-400 text-base">₹{confirmedOrder.grandTotal}</span>
                </div>
              </div>

              {/* Dispatch & Address Info */}
              <div className="bg-stone-900/90 rounded-xl p-3 text-xs space-y-1 text-stone-300 border border-stone-800">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  Supply & Delivery Address:
                </div>
                <div className="text-stone-300 pl-5">
                  {confirmedOrder.deliveryAddress} (Pincode: {confirmedOrder.pincode})
                </div>
                <div className="text-stone-400 pl-5 text-[11px]">
                  Contact Phone: <span className="text-stone-200 font-bold">{confirmedOrder.customerPhone}</span>
                  {whatsappUpdates && <span className="text-emerald-400 ml-2">✓ Live WhatsApp Tracking Enabled</span>}
                </div>
              </div>

              {confirmedOrder.bottleDepositTotal > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                  <RotateCcw className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Circular Bottle Deposit:</strong> You have ₹{confirmedOrder.bottleDepositTotal} refundable deposit held. Return these empty glass bottles to our rider on your next order or at any NutriFit POS counter across Kerala for an instant ₹10 cash/credit refund per bottle!
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold transition-all flex items-center gap-2 border border-stone-700"
              >
                <Printer className="w-4 h-4" />
                Print / Save Receipt
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-black transition-all flex items-center gap-2 shadow-lg"
              >
                <span>Continue Browsing</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* CHECKOUT FORM VIEW */
          <form onSubmit={handlePlaceOrder} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            
            {/* Empty cart warning */}
            {items.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <ShoppingBag className="w-12 h-12 text-stone-600 mx-auto" />
                <h4 className="text-base font-bold text-white">Your selection is currently empty</h4>
                <p className="text-xs text-stone-400">Please choose breads, granola, granola bars, or Tepache drinks from the catalog.</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-stone-950 font-bold text-xs"
                >
                  Browse Catalog
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Column: Order Items & Pricing Breakdown (5 Cols) */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black uppercase text-stone-300 tracking-wider flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-emerald-400" />
                      Selected Items ({items.length})
                    </h4>
                    <span className="text-xs text-stone-400">Direct Guest Cart</span>
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {items.map(item => (
                      <div 
                        key={item.id}
                        className="bg-stone-950 border border-stone-800 rounded-2xl p-3 flex items-center justify-between gap-3 group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-white text-xs truncate group-hover:text-emerald-400 transition-colors">
                            {item.name}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-stone-400 mt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-semibold">{item.weightOrVolume}</span>
                            <span>•</span>
                            <span className="text-stone-400">{item.storageType}</span>
                          </div>
                          <div className="text-xs font-black text-emerald-400 mt-1">
                            ₹{item.price} <span className="text-[10px] text-stone-500 font-normal">/ unit</span>
                          </div>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-1.5 shrink-0 bg-stone-900 border border-stone-700/80 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, -1)}
                            className="p-1 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-black text-white px-1.5 min-w-[20px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, 1)}
                            className="p-1 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-1 rounded-lg hover:bg-red-500/20 text-stone-500 hover:text-red-400 transition-colors ml-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tepache Bottle Return Deposit Banner */}
                  {tepacheBottleCount > 0 && (
                    <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold text-amber-300">
                        <span className="flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5" />
                          Eco Bottle Deposit ({tepacheBottleCount}x Bottles)
                        </span>
                        <span>+₹{bottleDepositTotal}</span>
                      </div>
                      <p className="text-[11px] text-amber-200/80 leading-relaxed">
                        ₹10/bottle 100% refundable glass deposit included. Return sound bottles on your next delivery or at any POS counter for an instant refund.
                      </p>
                    </div>
                  )}

                  {/* Cold Thermal Packaging Option */}
                  <label className="flex items-start gap-3 p-3 rounded-2xl bg-stone-950 border border-stone-800 cursor-pointer hover:border-cyan-500/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={coldChainPackaging}
                      onChange={(e) => setColdChainPackaging(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-cyan-500 focus:ring-0 bg-stone-800 border-stone-700"
                    />
                    <div className="text-xs">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <ThermometerSnowflake className="w-3.5 h-3.5 text-cyan-400" />
                        Thermal Cool-Chain Insulation Bag (+₹25)
                      </div>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        Insulated aluminum bubble wrap & dry chill-gel pack. Essential for probiotic Tepache drinks & fresh wild sourdough bread.
                      </p>
                    </div>
                  </label>

                  {/* Order Summary Pricing Box */}
                  <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 space-y-2 text-xs text-stone-300">
                    <div className="flex justify-between">
                      <span>Items Subtotal:</span>
                      <span className="font-bold text-white">₹{subtotal}</span>
                    </div>
                    {bottleDepositTotal > 0 && (
                      <div className="flex justify-between text-amber-400">
                        <span>Refundable Bottle Deposit:</span>
                        <span>+₹{bottleDepositTotal}</span>
                      </div>
                    )}
                    {packagingFee > 0 && (
                      <div className="flex justify-between text-cyan-400">
                        <span>Thermal Chill Packaging:</span>
                        <span>+₹{packagingFee}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>GST (5%):</span>
                      <span>₹{gstAmount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delivery Dispatch:</span>
                      <span>{deliveryFee === 0 ? <span className="text-emerald-400 font-bold">FREE (Orders ₹499+)</span> : `₹${deliveryFee}`}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-white border-t border-stone-800 pt-2">
                      <span>Total Amount:</span>
                      <span className="text-emerald-400 text-lg font-black">₹{grandTotal}</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Customer Details, Supply Hub & Delivery Scheduling (7 Cols) */}
                <div className="lg:col-span-7 space-y-5">
                  
                  {/* Step 1: Customer Contact Info */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      1. Recipient Contact Info (No Signup Required)
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-300 mb-1">Full Name *</label>
                        <input
                          type="text"
                          required
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="e.g. Arjun Menon"
                          className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-stone-300 mb-1">Mobile / Phone Number *</label>
                        <input
                          type="tel"
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="+91 98470 12345"
                          className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-300 mb-1">Email Address (For Invoice)</label>
                        <input
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="arjun.menon@gmail.com"
                          className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center pt-5">
                        <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={whatsappUpdates}
                            onChange={(e) => setWhatsappUpdates(e.target.checked)}
                            className="w-4 h-4 rounded text-emerald-500 bg-stone-950 border-stone-700 focus:ring-0"
                          />
                          <span>Send real-time dispatch alerts on WhatsApp</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Supply Hub & Fulfillment Mode */}
                  <div className="space-y-3 pt-1 border-t border-stone-800">
                    <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5" />
                      2. Supply Kitchen / Hub & Dispatch Mode
                    </h4>

                    {/* Mode Selector */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setFulfillmentMode('express_home_delivery')}
                        className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                          fulfillmentMode === 'express_home_delivery'
                            ? 'bg-emerald-950/70 border-emerald-500 text-white shadow-md'
                            : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <Truck className="w-4 h-4 text-emerald-400" />
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Express Delivery</span>
                        </div>
                        <div className="font-bold text-xs text-white">Cold-Chain Home Delivery</div>
                        <div className="text-[10px] text-stone-400">Delivered directly to your door</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFulfillmentMode('hub_counter_pickup')}
                        className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                          fulfillmentMode === 'hub_counter_pickup'
                            ? 'bg-emerald-950/70 border-emerald-500 text-white shadow-md'
                            : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <Building className="w-4 h-4 text-amber-400" />
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Zero Delivery Fee</span>
                        </div>
                        <div className="font-bold text-xs text-white">Hub Counter Pickup</div>
                        <div className="text-[10px] text-stone-400">Pick up freshly packed order at outlet</div>
                      </button>
                    </div>

                    {/* Regional Hub Selector */}
                    <div>
                      <label className="block text-[11px] font-bold text-stone-300 mb-1">Select Dispatch Hub Supply Point *</label>
                      <select
                        value={selectedHub}
                        onChange={(e) => setSelectedHub(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      >
                        {KERALA_FULFILLMENT_HUBS.map(hub => (
                          <option key={hub.id} value={hub.id}>
                            {hub.name} — {hub.deliveryRadius}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Delivery Address fields if Express Delivery */}
                    {fulfillmentMode === 'express_home_delivery' && (
                      <div className="space-y-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-stone-300 mb-1">Full Delivery Address (House/Flat, Street, Area) *</label>
                          <textarea
                            required
                            rows={2}
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                            placeholder="Flat 4B, Skyview Palms, Link Road, Kakkanad"
                            className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-stone-300 mb-1">Landmark (Optional)</label>
                            <input
                              type="text"
                              value={landmark}
                              onChange={(e) => setLandmark(e.target.value)}
                              placeholder="Near Infopark Gate 1"
                              className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:border-emerald-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-stone-300 mb-1">Pincode *</label>
                            <input
                              type="text"
                              required
                              value={pincode}
                              onChange={(e) => setPincode(e.target.value)}
                              placeholder="682030"
                              className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:border-emerald-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Date & Slot Scheduling */}
                  <div className="space-y-3 pt-1 border-t border-stone-800">
                    <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      3. Preferred Delivery Date & Slot
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-stone-300 mb-1">Dispatch / Delivery Date</label>
                        <input
                          type="date"
                          value={deliveryDate}
                          onChange={(e) => setDeliveryDate(e.target.value)}
                          className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-stone-300 mb-1">Delivery Time Slot</label>
                        <select
                          value={deliverySlot}
                          onChange={(e) => setDeliverySlot(e.target.value as any)}
                          className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="Morning (8:00 AM - 11:00 AM)">Morning (8:00 AM - 11:00 AM)</option>
                          <option value="Afternoon (1:00 PM - 4:00 PM)">Afternoon (1:00 PM - 4:00 PM)</option>
                          <option value="Evening (5:00 PM - 8:00 PM)">Evening (5:00 PM - 8:00 PM)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-stone-300 mb-1">Special Rider / Logistics Note (Optional)</label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="e.g. Leave at security desk, Call before arriving"
                        className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Step 4: Payment Tender Mode */}
                  <div className="space-y-3 pt-1 border-t border-stone-800">
                    <h4 className="text-xs font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" />
                      4. Payment Mode
                    </h4>

                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setPaymentMode('upi_instant')}
                        className={`p-3 rounded-2xl border text-center transition-all ${
                          paymentMode === 'upi_instant'
                            ? 'bg-emerald-950/80 border-emerald-500 text-white font-bold'
                            : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <QrCode className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                        <span className="text-xs block">Instant UPI QR</span>
                        <span className="text-[10px] text-stone-500 block">GPay, PhonePe, Paytm</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMode('cash_on_delivery')}
                        className={`p-3 rounded-2xl border text-center transition-all ${
                          paymentMode === 'cash_on_delivery'
                            ? 'bg-emerald-950/80 border-emerald-500 text-white font-bold'
                            : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                        <span className="text-xs block">Cash on Delivery</span>
                        <span className="text-[10px] text-stone-500 block">Pay at Doorstep</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMode('card_online')}
                        className={`p-3 rounded-2xl border text-center transition-all ${
                          paymentMode === 'card_online'
                            ? 'bg-emerald-950/80 border-emerald-500 text-white font-bold'
                            : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        <CreditCard className="w-4 h-4 mx-auto mb-1 text-blue-400" />
                        <span className="text-xs block">Card / NetBanking</span>
                        <span className="text-[10px] text-stone-500 block">Secure Gateway</span>
                      </button>
                    </div>
                  </div>

                  {/* Submit Order Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-stone-950 font-black py-4 rounded-2xl text-sm transition-all shadow-xl flex items-center justify-center gap-2 hover:scale-[1.01]"
                    >
                      {isSubmitting ? (
                        <span>Allocating Hub & Dispatching Order...</span>
                      ) : (
                        <>
                          <span>Confirm & Place Order (₹{grandTotal})</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                    <p className="text-center text-[10px] text-stone-500 mt-2">
                      FSSAI Licensed • Prepared Daily Under Strict Thermal & Hygienic Protocols
                    </p>
                  </div>

                </div>

              </div>
            )}

          </form>
        )}

      </div>
    </div>
  );
};
