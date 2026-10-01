import React, { useState, useEffect } from 'react';
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
  Printer,
  ChevronRight,
  Boxes,
  Check
} from 'lucide-react';
import { DirectCartItem, DirectGuestOrder, RetailCustomerAccount } from '../../types';

interface DirectCartCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: DirectCartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onOrderPlaced?: (order: DirectGuestOrder, account: RetailCustomerAccount) => void;
  onOrderConfirmed?: (order: DirectGuestOrder, account: RetailCustomerAccount) => void;
  existingAccounts?: RetailCustomerAccount[];
  onOpenTracking?: (orderId?: string, phone?: string) => void;
}

export const KERALA_FULFILLMENT_HUBS = [
  { id: 'hub-koc', name: 'Kochi Central Hub & Central Bakery (Kakkanad HQ)', deliveryRadius: 'Kochi, Kakkanad, Fort Kochi, Aluva (Est. 45-60 Mins)' },
  { id: 'hub-tvm', name: 'Trivandrum South Coast Hub (Kowdiar & Technopark)', deliveryRadius: 'Trivandrum City, Kazhakkoottam, Kowdiar (Est. 45-60 Mins)' },
  { id: 'hub-clt', name: 'Kozhikode Malabar Hub (Beach Road & Cyberpark)', deliveryRadius: 'Kozhikode Urban, Mavoor Road, Beach (Est. 50-70 Mins)' },
  { id: 'hub-tcr', name: 'Thrissur Cultural Hub (Round South & Punkunnam)', deliveryRadius: 'Thrissur Town, Ayyanthole, Ollur (Est. 50-70 Mins)' },
];

export const DirectCartCheckoutModal: React.FC<DirectCartCheckoutModalProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderPlaced,
  onOrderConfirmed,
  existingAccounts = [],
  onOpenTracking
}) => {
  const [step, setStep] = useState<'cart' | 'details' | 'payment' | 'success'>('cart');

  // Customer & Account Details
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [whatsappUpdates, setWhatsappUpdates] = useState(true);
  const [createAccount, setCreateAccount] = useState(true);
  const [matchedAccount, setMatchedAccount] = useState<RetailCustomerAccount | null>(null);

  // Delivery & Supply Specifics
  const [selectedHub, setSelectedHub] = useState(KERALA_FULFILLMENT_HUBS[0].id);
  const [fulfillmentMode, setFulfillmentMode] = useState<'express_home_delivery' | 'hub_counter_pickup'>('express_home_delivery');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('682030');
  const [deliverySlot, setDeliverySlot] = useState<string>('Morning (8:00 AM - 11:00 AM)');
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
  const [createdAccount, setCreatedAccount] = useState<RetailCustomerAccount | null>(null);

  // Auto-detect existing account when phone changes
  useEffect(() => {
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      const match = existingAccounts.find(acc => acc.phone.replace(/\D/g, '').includes(cleanPhone));
      if (match) {
        setMatchedAccount(match);
        if (!customerName) setCustomerName(match.name);
        if (!customerEmail) setCustomerEmail(match.email);
        if (!deliveryAddress && match.defaultAddress) setDeliveryAddress(match.defaultAddress);
        if (match.landmark && !landmark) setLandmark(match.landmark);
        if (match.pincode && !pincode) setPincode(match.pincode);
        if (match.hubPreference) setSelectedHub(match.hubPreference);
      } else {
        setMatchedAccount(null);
      }
    } else {
      setMatchedAccount(null);
    }
  }, [customerPhone, existingAccounts]);

  // Reset steps when closed
  useEffect(() => {
    if (!isOpen) {
      if (step === 'success') {
        setStep('cart');
        setConfirmedOrder(null);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Price & Deposit Calculations
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tepacheBottleCount = cartItems
    .filter(i => i.isTepacheBottle || i.category.toLowerCase().includes('tepache') || i.name.toLowerCase().includes('tepache'))
    .reduce((sum, item) => sum + item.quantity, 0);
  
  const bottleDepositTotal = tepacheBottleCount * 10; // ₹10 refundable deposit per glass bottle
  const packagingFee = coldChainPackaging ? 25 : 0;
  const deliveryFee = fulfillmentMode === 'hub_counter_pickup' ? 0 : (subtotal >= 499 ? 0 : 40);
  const gstAmount = Math.round(subtotal * 0.05); // 5% GST on packaged goods
  const grandTotal = subtotal + bottleDepositTotal + packagingFee + deliveryFee + gstAmount;

  const handleProceedToDetails = () => {
    if (cartItems.length === 0) return;
    setStep('details');
  };

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerPhone || customerPhone.trim().length < 8) {
      alert('Please enter a valid phone number for delivery coordination.');
      return;
    }
    if (!customerName.trim()) {
      alert('Please enter your name.');
      return;
    }
    if (fulfillmentMode === 'express_home_delivery' && (!deliveryAddress.trim() || !pincode.trim())) {
      alert('Please provide your complete delivery address and pincode.');
      return;
    }
    setStep('payment');
  };

  const handlePlaceFinalOrder = () => {
    setIsSubmitting(true);

    const hubObj = KERALA_FULFILLMENT_HUBS.find(h => h.id === selectedHub) || KERALA_FULFILLMENT_HUBS[0];
    const orderNumber = `DIR-${Math.floor(100000 + Math.random() * 900000)}`;

    const newOrder: DirectGuestOrder = {
      id: `dir-ord-${Date.now()}`,
      orderNumber,
      orderType: tepacheBottleCount > 0 && cartItems.length === tepacheBottleCount 
        ? 'tepache_drinks' 
        : tepacheBottleCount > 0 
          ? 'mixed_wellness' 
          : 'packaged_bakery',
      customerName,
      customerPhone,
      customerEmail: customerEmail || `${customerPhone}@nutrifit.in`,
      deliveryAddress: fulfillmentMode === 'express_home_delivery' ? deliveryAddress : `Counter Pickup at ${hubObj.name}`,
      landmark,
      pincode: pincode || '682030',
      fulfillmentHub: hubObj.name,
      fulfillmentMode,
      deliveryDate,
      deliverySlot,
      items: cartItems.map(i => ({
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
      riderName: 'Cold Courier Rider Suresh M.',
      riderPhone: '+91 98470 22334',
      trackingUpdates: [
        {
          stage: 'Order Confirmed',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          description: 'Payment verified & order assigned to Kerala Fulfillment Hub.',
          completed: true
        },
        {
          stage: 'Central Bakery / Cold Store Picked',
          time: 'In Progress',
          description: 'Small batch sourdough & chilled live probiotic bottles picked.',
          completed: true
        },
        {
          stage: 'Thermal Insulated Cold Packing',
          time: 'Scheduled',
          description: 'Packed in food-grade thermal cooler box with reusable gel chill pack.',
          completed: false
        },
        {
          stage: 'Dispatched for Delivery',
          time: 'Scheduled for Slot',
          description: `Cold van dispatch to ${deliveryAddress || hubObj.name}.`,
          completed: false
        }
      ],
      createdAt: new Date().toISOString()
    };

    // Construct or update customer account
    const accountId = matchedAccount ? matchedAccount.id : `retail-cust-${Date.now()}`;
    const newAccount: RetailCustomerAccount = {
      id: accountId,
      phone: customerPhone,
      name: customerName,
      email: customerEmail || `${customerPhone}@nutrifit.in`,
      defaultAddress: deliveryAddress,
      landmark,
      pincode,
      hubPreference: selectedHub,
      bottleDepositBalance: (matchedAccount?.bottleDepositBalance || 0) + bottleDepositTotal,
      totalOrdersCount: (matchedAccount?.totalOrdersCount || 0) + 1,
      orderIds: [...(matchedAccount?.orderIds || []), newOrder.id],
      createdAt: matchedAccount?.createdAt || new Date().toISOString()
    };

    setTimeout(() => {
      setIsSubmitting(false);
      setConfirmedOrder(newOrder);
      setCreatedAccount(newAccount);
      setStep('success');
      const callback = onOrderPlaced || onOrderConfirmed;
      if (callback) {
        callback(newOrder, newAccount);
      }
      onClearCart();
    }, 700);
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
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider mb-0.5">
                <Sparkles className="w-3 h-3" />
                Direct Packaged Nutrition & Tepache Cart
              </div>
              <h3 className="text-base sm:text-lg font-black text-white">
                {step === 'cart' && `Your Nutrition Cart (${cartItems.reduce((s, i) => s + i.quantity, 0)} items)`}
                {step === 'details' && 'Delivery Details & Customer Account'}
                {step === 'payment' && 'Payment & Order Verification'}
                {step === 'success' && 'Order Placed & Tracking Live!'}
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

        {/* Multi-step Breadcrumbs (if not success) */}
        {step !== 'success' && (
          <div className="bg-stone-950/60 px-6 py-2.5 border-b border-stone-800/80 flex items-center justify-between text-xs font-bold text-stone-400">
            <button 
              onClick={() => setStep('cart')}
              className={`flex items-center gap-1.5 ${step === 'cart' ? 'text-amber-400 font-black' : 'hover:text-stone-200'}`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'cart' ? 'bg-amber-500 text-stone-950' : 'bg-stone-800'}`}>1</span>
              <span>1. Cart Items</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-600" />
            <button 
              onClick={() => cartItems.length > 0 && setStep('details')}
              disabled={cartItems.length === 0}
              className={`flex items-center gap-1.5 ${step === 'details' ? 'text-amber-400 font-black' : 'hover:text-stone-200'}`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'details' ? 'bg-amber-500 text-stone-950' : 'bg-stone-800'}`}>2</span>
              <span>2. Delivery & Account</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-stone-600" />
            <span className={`flex items-center gap-1.5 ${step === 'payment' ? 'text-amber-400 font-black' : 'text-stone-500'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'payment' ? 'bg-amber-500 text-stone-950' : 'bg-stone-800'}`}>3</span>
              <span>3. Payment</span>
            </span>
          </div>
        )}

        {/* ======================================================= */}
        {/* STEP 1: CART ITEMS & SUMMARY */}
        {/* ======================================================= */}
        {step === 'cart' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {cartItems.length === 0 ? (
              <div className="py-16 text-center space-y-4">
                <div className="w-16 h-16 bg-stone-800 rounded-full flex items-center justify-center mx-auto text-stone-500">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-lg font-bold text-white">Your Cart is Currently Empty</h4>
                  <p className="text-xs text-stone-400 max-w-sm mx-auto">
                    Browse our freshly baked artisan breads, organic granolas, protein bars, or chilled sparkling Tepache elixirs below and click "+ Add to Cart".
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-md"
                >
                  Explore Packaged Foods & Tepache
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Items List */}
                <div className="lg:col-span-2 space-y-3">
                  <div className="flex items-center justify-between text-xs text-stone-400 pb-1">
                    <span>Products Selected ({cartItems.length})</span>
                    <button
                      onClick={onClearCart}
                      className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 font-bold"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear Cart
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {cartItems.map((item) => (
                      <div
                        key={item.id}
                        className="bg-stone-950/80 border border-stone-800 rounded-2xl p-3.5 flex items-center justify-between gap-3 hover:border-stone-700 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center shrink-0 text-lg">
                            {item.isTepacheBottle || item.name.includes('Tepache') ? '🍍' : 
                             item.name.includes('Bread') || item.name.includes('Sourdough') ? '🍞' :
                             item.name.includes('Granola') ? '🥣' :
                             item.name.includes('Bar') ? '⚡' : '🍪'}
                          </div>
                          <div>
                            <h4 className="text-xs sm:text-sm font-bold text-white leading-tight">
                              {item.name}
                            </h4>
                            <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                              <span>{item.weightOrVolume}</span>
                              <span>•</span>
                              <span className="text-amber-400">₹{item.price} each</span>
                              {item.isTepacheBottle && (
                                <span className="text-[10px] text-teal-300 bg-teal-950/80 px-1.5 py-0.2 rounded border border-teal-500/30">
                                  +₹10 Glass Dep.
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Quantity Controls */}
                          <div className="flex items-center bg-stone-900 border border-stone-700 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.id, -1)}
                              className="p-1 text-stone-400 hover:text-white rounded hover:bg-stone-800 transition-colors"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center font-bold text-xs text-white">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.id, 1)}
                              className="p-1 text-stone-400 hover:text-white rounded hover:bg-stone-800 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="text-right min-w-[60px]">
                            <div className="text-xs sm:text-sm font-black text-white">
                              ₹{item.price * item.quantity}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.id)}
                            className="text-stone-500 hover:text-red-400 p-1 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Cold Chain Packaging Notice */}
                  {tepacheBottleCount > 0 && (
                    <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-3 text-xs text-emerald-200 flex items-start gap-2.5">
                      <ThermometerSnowflake className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-white">Active Cold-Chain Dispatch: </strong>
                        Contains {tepacheBottleCount}x live probiotic Tepache bottles. Your order will be packed in food-grade thermal insulation with reusable ice gel packs to preserve live cultures.
                      </div>
                    </div>
                  )}

                  {/* Glass Bottle Deposit Notice */}
                  {tepacheBottleCount > 0 && (
                    <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-200 flex items-start gap-2.5">
                      <RotateCcw className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-white">Circular Bottle Deposit (₹{bottleDepositTotal}): </strong>
                        ₹10 per bottle refundable glass deposit is added. You can return empty bottles to the delivery rider on your next order or at any NutriFit POS counter for an instant full cash/ledger refund!
                      </div>
                    </div>
                  )}
                </div>

                {/* Price Breakdown Card */}
                <div className="bg-stone-950 border border-stone-800 rounded-2xl p-5 space-y-4 h-fit">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-300 border-b border-stone-800 pb-2">
                    Bill Summary
                  </h4>

                  <div className="space-y-2 text-xs text-stone-300">
                    <div className="flex justify-between">
                      <span>Item Subtotal:</span>
                      <span className="font-bold text-white">₹{subtotal}</span>
                    </div>

                    {bottleDepositTotal > 0 && (
                      <div className="flex justify-between text-amber-300">
                        <span className="flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" />
                          Refundable Glass Deposit ({tepacheBottleCount} btls):
                        </span>
                        <span className="font-bold">+₹{bottleDepositTotal}</span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="flex items-center gap-1">
                        <ThermometerSnowflake className="w-3 h-3 text-cyan-400" />
                        Thermal Cold Packaging:
                      </span>
                      <span className="font-bold text-stone-200">
                        {coldChainPackaging ? '+₹25' : '₹0'}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3 h-3 text-purple-400" />
                        Express Hub Delivery:
                      </span>
                      <span className="font-bold text-stone-200">
                        {deliveryFee === 0 ? (
                          <span className="text-emerald-400 uppercase font-black text-[10px]">FREE (Over ₹499)</span>
                        ) : (
                          `+₹${deliveryFee}`
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span>GST (5%):</span>
                      <span className="font-bold text-stone-300">+₹{gstAmount}</span>
                    </div>

                    <div className="border-t border-stone-800 pt-3 flex justify-between items-baseline">
                      <div>
                        <div className="text-xs text-stone-400 font-bold uppercase">Grand Total</div>
                        <div className="text-[10px] text-stone-500">Incl. all taxes & deposits</div>
                      </div>
                      <div className="text-2xl font-black text-amber-400">
                        ₹{grandTotal}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleProceedToDetails}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-black py-3.5 rounded-xl text-xs sm:text-sm transition-all shadow-xl flex items-center justify-center gap-2 hover:scale-[1.02]"
                  >
                    <span>Proceed to Delivery & Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="text-[10px] text-center text-stone-500 flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>FSSAI Certified • Contactless Thermal Dispatched</span>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ======================================================= */}
        {/* STEP 2: DELIVERY DETAILS & CUSTOMER ACCOUNT */}
        {/* ======================================================= */}
        {step === 'details' && (
          <form onSubmit={handleProceedToPayment} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            
            {/* Account Auto-Detection Banner */}
            {matchedAccount ? (
              <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-emerald-200">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-black text-white text-sm">Welcome back, {matchedAccount.name}!</div>
                    <div className="text-[11px] text-emerald-300">
                      Linked Retail Account • {matchedAccount.totalOrdersCount} previous orders • ₹{matchedAccount.bottleDepositBalance} Bottle Deposit Credit Available
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] shrink-0 uppercase border border-emerald-500/40">
                  Account Synced
                </span>
              </div>
            ) : (
              <div className="bg-stone-950/80 border border-stone-800 rounded-2xl p-3.5 flex items-center justify-between text-xs text-stone-300">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Enter your phone number to auto-fill your saved address or create a 1-click tracking account.</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Phone Number */}
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  Contact Mobile Number *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="+91 98470 12345"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  Full Customer Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Menon"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  Email Address (For Tax Invoice PDF)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    placeholder="rahul@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Fulfillment Hub */}
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  Kerala Fulfillment Kitchen Hub *
                </label>
                <select
                  value={selectedHub}
                  onChange={(e) => setSelectedHub(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  {KERALA_FULFILLMENT_HUBS.map(hub => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name}
                    </option>
                  ))}
                </select>
              </div>

            </div>

            {/* Delivery Mode Tabs */}
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5">
                Fulfillment Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFulfillmentMode('express_home_delivery')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    fulfillmentMode === 'express_home_delivery'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-md'
                      : 'bg-stone-950 text-stone-400 border-stone-800 hover:text-white'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  <span>Express Cold Home Delivery</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFulfillmentMode('hub_counter_pickup')}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    fulfillmentMode === 'hub_counter_pickup'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-md'
                      : 'bg-stone-950 text-stone-400 border-stone-800 hover:text-white'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  <span>Hub Counter Pickup (Zero Fee)</span>
                </button>
              </div>
            </div>

            {/* Address fields (if home delivery) */}
            {fulfillmentMode === 'express_home_delivery' && (
              <div className="space-y-3 bg-stone-950/80 border border-stone-800 rounded-2xl p-4">
                <div>
                  <label className="block text-xs font-bold text-stone-300 mb-1">
                    Complete Street Address / Apartment *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Flat 4B, Olive Courtyard, Infopark Expressway, Kakkanad"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-300 mb-1">
                      Prominent Landmark
                    </label>
                    <input
                      type="text"
                      placeholder="Near Infopark South Gate"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-300 mb-1">
                      Kerala Pincode *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="682030"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Delivery Date & Time Slot */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  Preferred Delivery Date
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  Preferred Time Slot
                </label>
                <select
                  value={deliverySlot}
                  onChange={(e) => setDeliverySlot(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="Morning (8:00 AM - 11:00 AM)">Morning (8:00 AM - 11:00 AM)</option>
                  <option value="Afternoon (1:00 PM - 4:00 PM)">Afternoon (1:00 PM - 4:00 PM)</option>
                  <option value="Evening (5:00 PM - 8:00 PM)">Evening (5:00 PM - 8:00 PM)</option>
                </select>
              </div>
            </div>

            {/* Account Creation & WhatsApp Options */}
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 space-y-2 text-xs">
              <label className="flex items-center gap-2 text-stone-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createAccount}
                  onChange={(e) => setCreateAccount(e.target.checked)}
                  className="rounded border-stone-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="font-bold text-amber-300">
                  ✨ Create/Sync my Customer Account for 1-Click Order Tracking & Bottle Deposit Refunds
                </span>
              </label>

              <label className="flex items-center gap-2 text-stone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsappUpdates}
                  onChange={(e) => setWhatsappUpdates(e.target.checked)}
                  className="rounded border-stone-700 text-amber-500 focus:ring-amber-500"
                />
                <span>Send dispatch & courier tracking link on WhatsApp</span>
              </label>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep('cart')}
                className="px-4 py-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold transition-all"
              >
                ← Back to Cart
              </button>

              <button
                type="submit"
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black py-3.5 rounded-xl text-xs sm:text-sm transition-all shadow-xl flex items-center justify-center gap-2 hover:scale-[1.02]"
              >
                <span>Continue to Payment (₹{grandTotal})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </form>
        )}

        {/* ======================================================= */}
        {/* STEP 3: PAYMENT & FINAL VERIFICATION */}
        {/* ======================================================= */}
        {step === 'payment' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            
            {/* Delivery Snapshot */}
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-300">
              <div>
                <div className="text-stone-400 uppercase font-bold text-[10px]">Delivering To</div>
                <div className="font-bold text-white text-sm">{customerName} ({customerPhone})</div>
                <div className="text-stone-400 mt-0.5">{deliveryAddress || 'Hub Counter Pickup'}</div>
              </div>
              <div className="text-right sm:border-l sm:border-stone-800 sm:pl-4">
                <div className="text-stone-400 uppercase font-bold text-[10px]">Scheduled Slot</div>
                <div className="font-bold text-amber-400">{deliveryDate}</div>
                <div className="text-stone-400 text-[11px]">{deliverySlot}</div>
              </div>
            </div>

            {/* Payment Modes */}
            <div className="space-y-3">
              <label className="block text-xs font-black uppercase text-stone-300 tracking-wider">
                Select Payment Mode
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* UPI */}
                <button
                  type="button"
                  onClick={() => setPaymentMode('upi_instant')}
                  className={`p-4 rounded-2xl border text-left transition-all space-y-1.5 ${
                    paymentMode === 'upi_instant'
                      ? 'bg-amber-500/15 border-amber-500/80 shadow-lg text-white'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <QrCode className="w-5 h-5 text-amber-400" />
                    {paymentMode === 'upi_instant' && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="font-black text-xs text-white">UPI Instant (GPay / PhonePe)</div>
                  <div className="text-[10px] text-stone-400">Zero surcharge instant confirmation</div>
                </button>

                {/* COD */}
                <button
                  type="button"
                  onClick={() => setPaymentMode('cash_on_delivery')}
                  className={`p-4 rounded-2xl border text-left transition-all space-y-1.5 ${
                    paymentMode === 'cash_on_delivery'
                      ? 'bg-amber-500/15 border-amber-500/80 shadow-lg text-white'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Truck className="w-5 h-5 text-emerald-400" />
                    {paymentMode === 'cash_on_delivery' && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="font-black text-xs text-white">Cash / UPI on Delivery</div>
                  <div className="text-[10px] text-stone-400">Pay rider upon delivery verification</div>
                </button>

                {/* Card / NetBanking */}
                <button
                  type="button"
                  onClick={() => setPaymentMode('card_online')}
                  className={`p-4 rounded-2xl border text-left transition-all space-y-1.5 ${
                    paymentMode === 'card_online'
                      ? 'bg-amber-500/15 border-amber-500/80 shadow-lg text-white'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <CreditCard className="w-5 h-5 text-purple-400" />
                    {paymentMode === 'card_online' && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="font-black text-xs text-white">Cards & Net Banking</div>
                  <div className="text-[10px] text-stone-400">All major Indian cards & banks</div>
                </button>

              </div>
            </div>

            {/* UPI QR Preview Box */}
            {paymentMode === 'upi_instant' && (
              <div className="bg-stone-950 border border-stone-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <div className="p-3 bg-white rounded-xl shrink-0 shadow-md">
                  <QrCode className="w-20 h-20 text-stone-950" />
                </div>
                <div className="space-y-1 text-xs">
                  <div className="font-black text-white text-sm">Scan to Pay with Any UPI App</div>
                  <div className="text-stone-400 text-[11px]">UPI ID: <span className="font-mono text-amber-300 font-bold">nutrifit.bakery@icici</span></div>
                  <div className="text-emerald-400 font-bold">Amount to Pay: ₹{grandTotal}</div>
                  <div className="text-[10px] text-stone-500">Supports Google Pay, PhonePe, Paytm, BHIM, Cred, and Amazon Pay.</div>
                </div>
              </div>
            )}

            {/* Order Note */}
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1">
                Kitchen / Rider Instructions (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Leave package with building security guard / ring bell twice"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-600 focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Bottom Final Place Order */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep('details')}
                className="px-4 py-3.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold transition-all"
              >
                ← Back
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handlePlaceFinalOrder}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black py-4 rounded-xl text-sm transition-all shadow-xl flex items-center justify-center gap-2 hover:scale-[1.02] disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">🌀</span> Confirming Dispatch...
                  </span>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Confirm Order & Pay ₹{grandTotal}</span>
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* ======================================================= */}
        {/* STEP 4: SUCCESS & LIVE TRACKING */}
        {/* ======================================================= */}
        {step === 'success' && confirmedOrder && (
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-center">
            
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/40 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-wider mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Order Confirmed & Live on ERP
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white">
                Order #{confirmedOrder.orderNumber}
              </h2>
              <p className="text-xs sm:text-sm text-stone-300 max-w-lg mx-auto mt-2">
                Thank you <strong className="text-white">{confirmedOrder.customerName}</strong>! Your order has been registered under your retail account (<span className="text-amber-400 font-mono">{confirmedOrder.customerPhone}</span>) and is being prepared at <strong className="text-emerald-400">{confirmedOrder.fulfillmentHub}</strong>.
              </p>
            </div>

            {/* Live Tracking Progress Bar */}
            <div className="bg-stone-950 border border-stone-800 rounded-3xl p-5 text-left max-w-xl mx-auto space-y-4">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-400">
                  <Truck className="w-4 h-4" />
                  Live Cold Delivery Timeline
                </div>
                <span className="text-[10px] font-bold text-stone-400">
                  Expected: {confirmedOrder.deliveryDate} ({confirmedOrder.deliverySlot})
                </span>
              </div>

              <div className="space-y-3 text-xs">
                {confirmedOrder.trackingUpdates?.map((up, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 ${
                      up.completed ? 'bg-emerald-500 text-stone-950' : 'bg-stone-800 text-stone-500'
                    }`}>
                      {up.completed ? '✓' : idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className={`font-bold ${up.completed ? 'text-white' : 'text-stone-400'}`}>
                          {up.stage}
                        </div>
                        <span className="text-[10px] text-stone-500 font-mono">{up.time}</span>
                      </div>
                      <p className="text-[11px] text-stone-400 mt-0.5">{up.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Receipt Summary Box */}
            <div className="bg-stone-950/80 border border-stone-800 rounded-2xl p-4 text-left max-w-xl mx-auto space-y-2 text-xs">
              <div className="flex items-center justify-between text-stone-400 text-[11px] border-b border-stone-800 pb-2">
                <span>Payment Mode: <strong className="text-white capitalize">{confirmedOrder.paymentMode.replace(/_/g, ' ')}</strong></span>
                <span>Grand Total: <strong className="text-emerald-400 text-sm">₹{confirmedOrder.grandTotal}</strong></span>
              </div>

              <div className="space-y-1 pt-1">
                {confirmedOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-stone-300 text-[11px]">
                    <span>{item.quantity}x {item.name} ({item.sizeOrWeight})</span>
                    <span className="font-bold text-white">₹{item.lineTotal}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 max-w-xl mx-auto">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenTracking) onOpenTracking(confirmedOrder.orderNumber, confirmedOrder.customerPhone);
                }}
                className="w-full sm:w-auto flex-1 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-6 py-3 rounded-xl text-xs transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Truck className="w-4 h-4" />
                <span>Track in Customer Portal</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-stone-700"
              >
                <Printer className="w-4 h-4" />
                <span>Print Invoice</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-white text-xs font-bold transition-colors border border-stone-800"
              >
                Done
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
