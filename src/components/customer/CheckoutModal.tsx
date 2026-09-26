import React, { useState } from 'react';
import { Order, DietPlanRequest, CustomerProfile } from '../../types';
import { LogoMark } from '../common/LogoMark';
import { X, MapPin, Clock, CreditCard, ShieldCheck, CheckCircle2, Sparkles, Building, Lock } from 'lucide-react';
import confetti from 'canvas-confetti';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: DietPlanRequest;
  profile: CustomerProfile;
  onOrderSuccess: (order: Order) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  request,
  profile,
  onOrderSuccess
}) => {
  const [address, setAddress] = useState({
    street: 'Flat 402, Green Valley Heights, Panampilly Nagar Ave',
    city: 'Kochi, Kerala',
    pincode: '682036',
    landmark: 'Near Avenue Center'
  });

  const [deliverySlot, setDeliverySlot] = useState<string>('Afternoon (Lunch)');

  const [startDate, setStartDate] = useState('2026-07-26');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [upiId, setUpiId] = useState('anjali@okaxis');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const pricing = request.pricingBreakdown || {
    baseMealCost: (request.calculatedPrice || 14999) * 0.8,
    addonCost: 0,
    durationDiscount: Math.round((request.calculatedPrice || 14999) * 0.15),
    gstAmount: Math.round((request.calculatedPrice || 14999) * 0.05),
    totalPayable: request.calculatedPrice || 14999
  };

  const totalPrice = pricing.totalPayable;

  const handlePayAndConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });

      const createdOrder: Order = {
        id: `PB-ORD-${Math.floor(1000 + Math.random() * 9000)}`,
        customerId: profile.id,
        customerName: profile.name,
        planId: request.id,
        planTitle: `${request.durationDays}-Day Custom ${request.goal.replace('_', ' ')} Plan`,
        planType: request.planType,
        durationDays: request.durationDays,
        startDate,
        deliveryAddress: address,
        deliverySlot,
        paymentStatus: 'paid',
        orderStatus: 'confirmed',
        totalAmount: totalPrice,
        fssaiLicense: 'KITCHEN LIC NO. 11322007000341',
        batchNumber: `PB-BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`,
        createdAt: new Date().toISOString().split('T')[0]
      };

      onOrderSuccess(createdOrder);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-stone-200 relative my-8">
        
        {/* Header */}
        <div className="p-6 bg-emerald-950 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white hover:bg-emerald-900 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <LogoMark size="sm" variant="white" showTagline={true} />
          
          <div className="mt-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">Subscription Checkout</span>
              <h3 className="text-xl font-extrabold text-white">
                {request.durationDays}-Day Customized Meal Subscription
              </h3>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-300">₹{totalPrice.toLocaleString()}</span>
              <span className="text-[10px] text-stone-300 block">Incl. 5% GST</span>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handlePayAndConfirm} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {/* Section 1: Delivery Address */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span>1. Delivery Address (Kochi & Surrounding Zones)</span>
            </h4>

            <div className="space-y-2">
              <input
                type="text"
                required
                value={address.street}
                onChange={(e) => setAddress({ ...address, street: e.target.value })}
                placeholder="Street Address & Flat / House No."
                className="w-full text-xs font-semibold bg-stone-50 border border-stone-300 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  placeholder="City"
                  className="w-full text-xs font-semibold bg-stone-50 border border-stone-300 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  required
                  value={address.pincode}
                  onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                  placeholder="Pincode"
                  className="w-full text-xs font-semibold bg-stone-50 border border-stone-300 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Delivery Slot & Start Date */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>2. Delivery Schedule & Preferred Time Slot</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">Subscription Start Date</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs font-bold bg-stone-50 border border-stone-300 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">Daily Delivery Window Slot</label>
                <select
                  value={deliverySlot}
                  onChange={(e) => setDeliverySlot(e.target.value)}
                  className="w-full text-xs font-bold bg-stone-50 border border-stone-300 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Morning (Breakfast)">Morning (Breakfast Slot: 07:00 AM - 08:30 AM)</option>
                  <option value="Afternoon (Lunch)">Afternoon (Lunch Slot: 12:00 PM - 01:30 PM)</option>
                  <option value="4:00 PM (Snacks/Salads)">4:00 PM (Snacks & Fresh Salads Slot)</option>
                  <option value="Dinner">Dinner (Evening Dinner Slot: 07:00 PM - 08:30 PM)</option>
                  <option value="11:00 PM (Late-Night)">11:00 PM (Late-Night Protein Slot)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Payment Method */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <span>3. Secure Payment Gateway</span>
            </h4>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'upi', label: 'UPI / Google Pay / PhonePe' },
                { id: 'card', label: 'Credit / Debit Card' },
                { id: 'netbanking', label: 'NetBanking' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                    paymentMethod === m.id
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-stone-50 text-stone-700 border-stone-300 hover:bg-stone-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {paymentMethod === 'upi' && (
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">Virtual Payment Address (VPA)</label>
                <input
                  type="text"
                  required
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. username@upi"
                  className="w-full text-xs font-bold bg-stone-50 border border-stone-300 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>

          {/* Order Bill Summary driven by MD Cost Engine */}
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 text-xs space-y-1.5 text-stone-700">
            <div className="font-extrabold text-emerald-950 uppercase text-[10px] tracking-wider mb-1">MD Cost Engine Itemized Bill</div>
            <div className="flex justify-between">
              <span>Base Subscription ({request.durationDays} Days Plan)</span>
              <span className="font-bold">₹{pricing.baseMealCost.toLocaleString()}</span>
            </div>
            {pricing.addonCost > 0 && (
              <div className="flex justify-between">
                <span>Snack / Salad Add-on Slots</span>
                <span className="font-bold">₹{pricing.addonCost.toLocaleString()}</span>
              </div>
            )}
            {pricing.durationDiscount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Duration Package Discount</span>
                <span className="font-bold">-₹{pricing.durationDiscount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Temperature Controlled Delivery</span>
              <span className="font-bold text-emerald-700">FREE</span>
            </div>
            <div className="flex justify-between">
              <span>GST (5% Cloud Kitchen Food Services)</span>
              <span className="font-bold">₹{pricing.gstAmount.toLocaleString()}</span>
            </div>
            <div className="border-t border-emerald-200 pt-2 flex justify-between text-sm font-black text-emerald-950">
              <span>Total Amount Payable</span>
              <span>₹{totalPrice.toLocaleString()}</span>
            </div>
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={isProcessing}
            className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white font-extrabold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm"
          >
            {isProcessing ? (
              <span>Processing Payment Gateway...</span>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Pay ₹{totalPrice.toLocaleString()} & Confirm Order</span>
              </>
            )}
          </button>

          <p className="text-[10px] text-stone-400 text-center flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>256-bit SSL Encrypted • Certified Kitchen License #11322007000341</span>
          </p>

        </form>
      </div>
    </div>
  );
};
