import React, { useState } from 'react';
import { Order, DietPlanRequest, CustomerProfile } from '../../types';
import { LogoMark } from '../common/LogoMark';
import { X, MapPin, Clock, Info } from 'lucide-react';

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

  if (!isOpen) return null;

  const pricing = request.pricingBreakdown || {
    baseMealCost: (request.calculatedPrice || 14999) * 0.8,
    addonCost: 0,
    durationDiscount: Math.round((request.calculatedPrice || 14999) * 0.15),
    gstAmount: Math.round((request.calculatedPrice || 14999) * 0.05),
    totalPayable: request.calculatedPrice || 14999
  };

  const totalPrice = pricing.totalPayable;

  // P7D: this diet-plan checkout used to FABRICATE a paid order locally (fake gateway, fake VPA). Diet-plan payments are not
  // supported yet, so there is deliberately no payment action here: nothing can be marked paid from this screen.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-stone-200 relative my-8">
        
        {/* Header */}
        <div className="p-6 bg-emerald-950 text-white relative">
          <button
            onClick={onClose}
            aria-label="Close"
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
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

          {/* Section 3: Payment - not available for diet plans yet */}
          <div role="status" data-testid="diet-plan-payment-unavailable" className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-xs">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <strong>Online payment for diet plans is not available yet.</strong> Nothing has been charged and no order has been created. Please check back soon.
            </span>
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

          {/* Action: intentionally disabled */}
          <button
            type="submit"
            disabled
            aria-disabled="true"
            className="w-full bg-stone-300 text-stone-600 font-extrabold py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm cursor-not-allowed"
          >
            <span>Payment not available yet</span>
          </button>

        </form>
      </div>
    </div>
  );
};
