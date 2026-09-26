import React, { useState, useMemo } from 'react';
import { 
  OmnichannelOrder, 
  ExternalChannelType, 
  ChannelOrderItem, 
  PartyEventDetails,
  RecipeItem 
} from '../../types';
import { ALL_RECIPES } from '../../data/recipeDatabase';
import { 
  ShoppingBag, 
  Truck, 
  Users, 
  Calendar, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Printer, 
  Download, 
  FileText, 
  Sparkles, 
  Layers, 
  Phone, 
  MapPin, 
  User, 
  Percent, 
  Coffee, 
  Utensils, 
  Flame, 
  ArrowUpRight, 
  ArrowDownRight, 
  ChevronRight, 
  Check, 
  X, 
  RefreshCw,
  PieChart as PieIcon,
  Tag,
  PackageCheck,
  Maximize2,
  Minimize2,
  Columns,
  Sliders
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import confetti from 'canvas-confetti';

interface OmnichannelSalesModuleProps {
  ordersList: OmnichannelOrder[];
  onAddOrder?: (newOrder: OmnichannelOrder) => void;
  onUpdateOrder?: (updatedOrder: OmnichannelOrder) => void;
  onDeleteOrder?: (orderId: string) => void;
}

export const OmnichannelSalesModule: React.FC<OmnichannelSalesModuleProps> = ({
  ordersList,
  onAddOrder,
  onUpdateOrder,
  onDeleteOrder
}) => {
  // Local state for orders
  const [orders, setOrders] = useState<OmnichannelOrder[]>(ordersList);

  // Filters
  const [activeChannelTab, setActiveChannelTab] = useState<'all' | ExternalChannelType>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'today' | 'yesterday' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>('2026-08-15');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'party_pipeline'>('cards');

  // Modals
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<OmnichannelOrder | null>(null);
  const [showSettlementModal, setShowSettlementModal] = useState<boolean>(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [modalSize, setModalSize] = useState<'standard' | 'wide' | 'fullscreen'>('wide');

  // Form State for Adding / Editing Order
  const [formChannel, setFormChannel] = useState<ExternalChannelType>('swiggy');
  const [formChannelOrderId, setFormChannelOrderId] = useState<string>('');
  const [formOrderDate, setFormOrderDate] = useState<string>('2026-08-15');
  const [formOrderTime, setFormOrderTime] = useState<string>('13:00');
  const [formCustomerName, setFormCustomerName] = useState<string>('');
  const [formCustomerPhone, setFormCustomerPhone] = useState<string>('');
  const [formDeliveryAddress, setFormDeliveryAddress] = useState<string>('');
  const [formLandmarkPincode, setFormLandmarkPincode] = useState<string>('');
  const [formRiderName, setFormRiderName] = useState<string>('');
  const [formRiderPhone, setFormRiderPhone] = useState<string>('');
  const [formVehicleNo, setFormVehicleNo] = useState<string>('');

  // Items State in Form
  const [formItems, setFormItems] = useState<ChannelOrderItem[]>([
    {
      id: 'itm-new-1',
      dishName: 'Lemon Garlic Herb Chicken Grill',
      category: 'Choice of Chicken – Air Fried',
      portionSize: 'Single Bowl (350g)',
      standardWebsitePrice: 280,
      unitPrice: 330, // Default with channel markup
      quantity: 1,
      lineTotal: 330,
      specialInstructions: ''
    }
  ]);

  // Pricing Adjustments in Form
  const [formPackagingCharge, setFormPackagingCharge] = useState<number>(30);
  const [formDeliveryCharge, setFormDeliveryCharge] = useState<number>(0);
  const [formGstAmount, setFormGstAmount] = useState<number>(18);
  const [formDiscountAmount, setFormDiscountAmount] = useState<number>(0);
  const [formCommissionPct, setFormCommissionPct] = useState<number>(20);
  const [formPaymentMethod, setFormPaymentMethod] = useState<OmnichannelOrder['paymentMethod']>('Swiggy Pay');
  const [formPaymentStatus, setFormPaymentStatus] = useState<OmnichannelOrder['paymentStatus']>('paid_online');
  const [formKitchenStatus, setFormKitchenStatus] = useState<OmnichannelOrder['kitchenStatus']>('received');
  const [formInternalNotes, setFormInternalNotes] = useState<string>('');

  // Party Order Specific Form State
  const [formPartyOccasion, setFormPartyOccasion] = useState<string>('Corporate Wellness Lunch');
  const [formPartyGuestCount, setFormPartyGuestCount] = useState<number>(30);
  const [formPartyEventDate, setFormPartyEventDate] = useState<string>('2026-08-15');
  const [formPartyEventTimeSlot, setFormPartyEventTimeSlot] = useState<string>('01:00 PM - 03:00 PM');
  const [formPartyVenueAddress, setFormPartyVenueAddress] = useState<string>('');
  const [formPartyContactPerson, setFormPartyContactPerson] = useState<string>('');
  const [formPartyContactPhone, setFormPartyContactPhone] = useState<string>('');
  const [formPartyCateringStyle, setFormPartyCateringStyle] = useState<PartyEventDetails['cateringStyle']>('Individual Bento Boxes');
  const [formPartySetupRequired, setFormPartySetupRequired] = useState<boolean>(true);
  const [formPartyVegCount, setFormPartyVegCount] = useState<number>(10);
  const [formPartyNonVegCount, setFormPartyNonVegCount] = useState<number>(20);
  const [formPartyVeganCount, setFormPartyVeganCount] = useState<number>(0);
  const [formPartyAdvancePaid, setFormPartyAdvancePaid] = useState<number>(5000);
  const [formPartySpecialNotes, setFormPartySpecialNotes] = useState<string>('');

  // Auto-generate Channel Order ID when channel changes
  const handleChannelChange = (newChannel: ExternalChannelType) => {
    setFormChannel(newChannel);
    const rand = Math.floor(1000 + Math.random() * 9000);
    if (newChannel === 'swiggy') {
      setFormChannelOrderId(`SWIG-${rand}-A`);
      setFormCommissionPct(20);
      setFormPaymentMethod('Swiggy Pay');
      setFormPackagingCharge(40);
    } else if (newChannel === 'zomato') {
      setFormChannelOrderId(`ZOM-${rand}-K`);
      setFormCommissionPct(18);
      setFormPaymentMethod('Zomato Pay');
      setFormPackagingCharge(30);
    } else if (newChannel === 'party_order') {
      setFormChannelOrderId(`PTY-${formOrderDate.replace(/-/g, '')}-${rand.toString().substring(0, 3)}`);
      setFormCommissionPct(0);
      setFormPaymentMethod('Bank Transfer / NEFT');
      setFormPackagingCharge(600);
    } else if (newChannel === 'walk_in_pos') {
      setFormChannelOrderId(`POS-2026-${rand.toString().substring(0, 3)}`);
      setFormCommissionPct(0);
      setFormPaymentMethod('UPI / GPay / PhonePe');
      setFormPackagingCharge(20);
    } else if (newChannel === 'direct_phone_whatsapp') {
      setFormChannelOrderId(`WA-2026-${rand.toString().substring(0, 3)}`);
      setFormCommissionPct(0);
      setFormPaymentMethod('UPI / GPay / PhonePe');
      setFormPackagingCharge(30);
    }
  };

  // Open modal for new order
  const handleOpenNewOrderModal = (presetChannel?: ExternalChannelType) => {
    const targetChannel = presetChannel || 'swiggy';
    setEditingOrderId(null);
    handleChannelChange(targetChannel);
    setFormOrderDate('2026-08-15');
    setFormOrderTime(new Date().toTimeString().substring(0, 5));
    setFormCustomerName('');
    setFormCustomerPhone('');
    setFormDeliveryAddress('');
    setFormLandmarkPincode('');
    setFormRiderName('');
    setFormRiderPhone('');
    setFormVehicleNo('');
    
    // Set default window mode to wide for maximum readability & adjustment
    setModalSize('wide');

    if (targetChannel === 'party_order') {
      setFormPartyOccasion('Corporate Wellness Lunch');
      setFormPartyGuestCount(30);
      setFormPartyEventDate('2026-08-15');
      setFormPartyEventTimeSlot('01:00 PM - 03:00 PM');
      setFormPartyVenueAddress('');
      setFormPartyContactPerson('');
      setFormPartyContactPhone('');
      setFormPartyCateringStyle('Individual Bento Boxes');
      setFormPartySetupRequired(true);
      setFormPartyVegCount(10);
      setFormPartyNonVegCount(20);
      setFormPartyVeganCount(0);
      setFormPartyAdvancePaid(5000);
      setFormPartySpecialNotes('');
    }

    const defaultQty = targetChannel === 'party_order' ? 30 : 1;
    const defaultPrice = targetChannel === 'swiggy' ? 330 : targetChannel === 'zomato' ? 325 : targetChannel === 'party_order' ? 240 : 280;

    setFormItems([
      {
        id: `itm-${Date.now()}`,
        dishName: 'Lemon Garlic Herb Chicken Grill',
        category: 'Choice of Chicken – Air Fried',
        portionSize: targetChannel === 'party_order' ? 'Bulk Catering Portion (350g Bento Box)' : 'Single Bowl (350g)',
        standardWebsitePrice: 280,
        unitPrice: defaultPrice,
        quantity: defaultQty,
        lineTotal: defaultPrice * defaultQty,
        specialInstructions: ''
      }
    ]);
    setFormDiscountAmount(0);
    setFormInternalNotes('');
    setShowAddModal(true);
  };

  // Open modal for editing existing order
  const handleEditOrder = (order: OmnichannelOrder) => {
    setEditingOrderId(order.id);
    setFormChannel(order.channel);
    setFormChannelOrderId(order.channelOrderId);
    setFormOrderDate(order.orderDate);
    setFormOrderTime(order.orderTime);
    setFormCustomerName(order.customerName);
    setFormCustomerPhone(order.customerPhone || '');
    setFormDeliveryAddress(order.deliveryAddress || '');
    setFormLandmarkPincode(order.landmarkPincode || '');
    setFormRiderName(order.riderName || '');
    setFormRiderPhone(order.riderPhone || '');
    setFormVehicleNo(order.vehicleNo || '');
    setFormItems(order.items && order.items.length > 0 ? order.items : [
      {
        id: `itm-${Date.now()}`,
        dishName: 'Healthy Bowl Selection',
        category: 'Proteins & Grills',
        portionSize: 'Single Bowl (350g)',
        standardWebsitePrice: 280,
        unitPrice: 280,
        quantity: 1,
        lineTotal: 280,
        specialInstructions: ''
      }
    ]);
    setFormPackagingCharge(order.packagingCharge || 0);
    setFormDeliveryCharge(order.deliveryCharge || 0);
    setFormGstAmount(order.gstAmount || 0);
    setFormDiscountAmount(order.discountAmount || 0);
    setFormCommissionPct(order.aggregatorCommissionPct || 0);
    setFormPaymentMethod(order.paymentMethod);
    setFormPaymentStatus(order.paymentStatus);
    setFormKitchenStatus(order.kitchenStatus);
    setFormInternalNotes(order.internalNotes || '');

    if (order.partyDetails) {
      setFormPartyOccasion(order.partyDetails.occasion || 'Corporate Wellness Lunch');
      setFormPartyGuestCount(order.partyDetails.guestCount || 30);
      setFormPartyEventDate(order.partyDetails.eventDate || order.orderDate);
      setFormPartyEventTimeSlot(order.partyDetails.eventTimeSlot || '01:00 PM - 03:00 PM');
      setFormPartyVenueAddress(order.partyDetails.venueAddress || order.deliveryAddress || '');
      setFormPartyContactPerson(order.partyDetails.contactPerson || order.customerName);
      setFormPartyContactPhone(order.partyDetails.contactPhone || order.customerPhone || '');
      setFormPartyCateringStyle(order.partyDetails.cateringStyle || 'Individual Bento Boxes');
      setFormPartySetupRequired(order.partyDetails.setupRequired ?? true);
      setFormPartyVegCount(order.partyDetails.dietarySplit?.vegCount || 0);
      setFormPartyNonVegCount(order.partyDetails.dietarySplit?.nonVegCount || 0);
      setFormPartyVeganCount(order.partyDetails.dietarySplit?.veganOrKetoCount || 0);
      setFormPartyAdvancePaid(order.partyDetails.advancePaid || 0);
      setFormPartySpecialNotes(order.partyDetails.specialNotes || '');
    }

    setModalSize('wide');
    setShowAddModal(true);
  };

  // Handle adding an item to the form
  const handleAddItemToForm = (recipe?: RecipeItem) => {
    let markup = 1.0;
    if (formChannel === 'swiggy') markup = 1.18; // approx 18-20% markup on aggregator
    if (formChannel === 'zomato') markup = 1.15;
    if (formChannel === 'party_order') markup = 0.85; // 15% bulk discount for party orders

    const basePrice = recipe ? (recipe.calories > 400 ? 320 : 260) : 250;
    const channelPrice = Math.round(basePrice * markup);

    const newItem: ChannelOrderItem = {
      id: `itm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      recipeId: recipe?.id,
      dishName: recipe ? recipe.name : 'Custom Healthy Bowl / Platter',
      category: recipe ? recipe.category : 'Proteins & Grills',
      portionSize: formChannel === 'party_order' ? 'Bulk Party Portion (350g)' : 'Single Bowl (350g)',
      standardWebsitePrice: basePrice,
      unitPrice: channelPrice,
      quantity: formChannel === 'party_order' ? 20 : 1,
      lineTotal: channelPrice * (formChannel === 'party_order' ? 20 : 1),
      specialInstructions: ''
    };

    setFormItems([...formItems, newItem]);
  };

  const handleUpdateFormItem = (index: number, field: keyof ChannelOrderItem, value: any) => {
    const updated = [...formItems];
    const item = { ...updated[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
      item.lineTotal = Number(item.quantity || 1) * Number(item.unitPrice || 0);
    }
    updated[index] = item;
    setFormItems(updated);
  };

  const handleRemoveFormItem = (index: number) => {
    if (formItems.length === 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  // Calculated Financials for the Form
  const formItemsSubtotal = useMemo(() => {
    return formItems.reduce((sum, itm) => sum + (Number(itm.lineTotal) || 0), 0);
  }, [formItems]);

  const formGrossAmount = useMemo(() => {
    return Math.max(0, formItemsSubtotal + Number(formPackagingCharge || 0) + Number(formDeliveryCharge || 0) + Number(formGstAmount || 0) - Number(formDiscountAmount || 0));
  }, [formItemsSubtotal, formPackagingCharge, formDeliveryCharge, formGstAmount, formDiscountAmount]);

  const formAggregatorCommissionAmount = useMemo(() => {
    if (formCommissionPct <= 0) return 0;
    return Math.round((formGrossAmount * (formCommissionPct / 100)) * 100) / 100;
  }, [formGrossAmount, formCommissionPct]);

  const formNetPayout = useMemo(() => {
    return Math.round((formGrossAmount - formAggregatorCommissionAmount) * 100) / 100;
  }, [formGrossAmount, formAggregatorCommissionAmount]);

  // Submit Order (Add or Edit)
  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerName.trim()) {
      alert('Please enter a Customer or Company / Host Name.');
      return;
    }

    const orderData: OmnichannelOrder = {
      id: editingOrderId || `omni-${Date.now()}`,
      channel: formChannel,
      channelOrderId: formChannelOrderId || `ORD-${Date.now()}`,
      orderDate: formOrderDate,
      orderTime: formOrderTime,
      customerName: formCustomerName,
      customerPhone: formCustomerPhone,
      deliveryAddress: formDeliveryAddress,
      landmarkPincode: formLandmarkPincode,
      riderName: formRiderName,
      riderPhone: formRiderPhone,
      vehicleNo: formVehicleNo,
      items: formItems,
      itemsSubtotal: formItemsSubtotal,
      packagingCharge: Number(formPackagingCharge) || 0,
      deliveryCharge: Number(formDeliveryCharge) || 0,
      gstAmount: Number(formGstAmount) || 0,
      discountAmount: Number(formDiscountAmount) || 0,
      grossAmount: formGrossAmount,
      aggregatorCommissionPct: Number(formCommissionPct) || 0,
      aggregatorCommissionAmount: formAggregatorCommissionAmount,
      platformFeeDeducted: formChannel === 'swiggy' ? 10 : formChannel === 'zomato' ? 8 : 0,
      netPayoutRevenue: formNetPayout,
      kitchenStatus: formKitchenStatus,
      paymentStatus: formPaymentStatus,
      paymentMethod: formPaymentMethod,
      loggedByStaff: 'Staff POS Operator',
      internalNotes: formInternalNotes,
      createdAt: new Date().toISOString()
    };

    if (formChannel === 'party_order') {
      orderData.partyDetails = {
        occasion: formPartyOccasion,
        guestCount: Number(formPartyGuestCount) || 20,
        eventDate: formPartyEventDate || formOrderDate,
        eventTimeSlot: formPartyEventTimeSlot,
        venueAddress: formPartyVenueAddress || formDeliveryAddress,
        contactPerson: formPartyContactPerson || formCustomerName,
        contactPhone: formPartyContactPhone || formCustomerPhone,
        cateringStyle: formPartyCateringStyle,
        setupRequired: formPartySetupRequired,
        dietarySplit: {
          vegCount: Number(formPartyVegCount) || 0,
          nonVegCount: Number(formPartyNonVegCount) || 0,
          veganOrKetoCount: Number(formPartyVeganCount) || 0
        },
        advancePaid: Number(formPartyAdvancePaid) || 0,
        balanceDue: Math.max(0, formGrossAmount - (Number(formPartyAdvancePaid) || 0)),
        specialNotes: formPartySpecialNotes
      };
    }

    if (editingOrderId) {
      setOrders(prev => prev.map(o => o.id === editingOrderId ? orderData : o));
      if (onUpdateOrder) onUpdateOrder(orderData);
    } else {
      setOrders(prev => [orderData, ...prev]);
      if (onAddOrder) onAddOrder(orderData);
    }

    setShowAddModal(false);
    confetti({ particleCount: 45, spread: 60 });
  };

  // Quick Status Updater
  const handleQuickStatusChange = (orderId: string, newStatus: OmnichannelOrder['kitchenStatus']) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        const updated = { ...o, kitchenStatus: newStatus };
        if (onUpdateOrder) onUpdateOrder(updated);
        return updated;
      }
      return o;
    }));
  };

  // Delete Order
  const handleDeleteOrder = (orderId: string) => {
    if (window.confirm('Are you sure you want to delete this order entry?')) {
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (onDeleteOrder) onDeleteOrder(orderId);
    }
  };

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Channel Filter
      if (activeChannelTab !== 'all' && o.channel !== activeChannelTab) return false;

      // Date Filter
      if (selectedDateFilter === 'today' && o.orderDate !== '2026-08-15') return false;
      if (selectedDateFilter === 'yesterday' && o.orderDate !== '2026-08-14') return false;
      if (selectedDateFilter === 'custom' && o.orderDate !== customDate) return false;

      // Status Filter
      if (statusFilter !== 'all' && o.kitchenStatus !== statusFilter) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCust = o.customerName.toLowerCase().includes(q);
        const matchId = o.channelOrderId.toLowerCase().includes(q);
        const matchPhone = o.customerPhone.includes(q);
        const matchDish = o.items.some(i => i.dishName.toLowerCase().includes(q));
        const matchRider = o.riderName?.toLowerCase().includes(q);
        if (!matchCust && !matchId && !matchPhone && !matchDish && !matchRider) return false;
      }

      return true;
    });
  }, [orders, activeChannelTab, selectedDateFilter, customDate, statusFilter, searchQuery]);

  // Aggregate Metrics for Selected Day & Channel
  const metrics = useMemo(() => {
    const totalOrdersCount = filteredOrders.length;
    const totalGrossRevenue = filteredOrders.reduce((sum, o) => sum + o.grossAmount, 0);
    const totalCommissions = filteredOrders.reduce((sum, o) => sum + o.aggregatorCommissionAmount, 0);
    const totalNetPayout = filteredOrders.reduce((sum, o) => sum + o.netPayoutRevenue, 0);
    
    const swiggyOrders = filteredOrders.filter(o => o.channel === 'swiggy');
    const zomatoOrders = filteredOrders.filter(o => o.channel === 'zomato');
    const partyOrders = filteredOrders.filter(o => o.channel === 'party_order');
    const directOrders = filteredOrders.filter(o => o.channel === 'walk_in_pos' || o.channel === 'direct_phone_whatsapp');

    const totalPartyGuests = partyOrders.reduce((sum, o) => sum + (o.partyDetails?.guestCount || 0), 0);
    const totalPartyAdvance = partyOrders.reduce((sum, o) => sum + (o.partyDetails?.advancePaid || 0), 0);
    const totalPartyBalance = partyOrders.reduce((sum, o) => sum + (o.partyDetails?.balanceDue || 0), 0);

    return {
      totalOrdersCount,
      totalGrossRevenue,
      totalCommissions,
      totalNetPayout,
      swiggyCount: swiggyOrders.length,
      swiggyGross: swiggyOrders.reduce((sum, o) => sum + o.grossAmount, 0),
      swiggyNet: swiggyOrders.reduce((sum, o) => sum + o.netPayoutRevenue, 0),
      zomatoCount: zomatoOrders.length,
      zomatoGross: zomatoOrders.reduce((sum, o) => sum + o.grossAmount, 0),
      zomatoNet: zomatoOrders.reduce((sum, o) => sum + o.netPayoutRevenue, 0),
      partyCount: partyOrders.length,
      partyGross: partyOrders.reduce((sum, o) => sum + o.grossAmount, 0),
      partyAdvance: totalPartyAdvance,
      partyBalance: totalPartyBalance,
      totalPartyGuests,
      directCount: directOrders.length,
      directGross: directOrders.reduce((sum, o) => sum + o.grossAmount, 0)
    };
  }, [filteredOrders]);

  // Channel Chart Data
  const channelChartData = [
    { name: 'Swiggy', orders: metrics.swiggyCount, gross: metrics.swiggyGross, net: metrics.swiggyNet, color: '#FC8019' },
    { name: 'Zomato', orders: metrics.zomatoCount, gross: metrics.zomatoGross, net: metrics.zomatoNet, color: '#E23744' },
    { name: 'Party / Catering', orders: metrics.partyCount, gross: metrics.partyGross, net: metrics.partyGross, color: '#8B5CF6' },
    { name: 'Direct / POS', orders: metrics.directCount, gross: metrics.directGross, net: metrics.directGross, color: '#10B981' }
  ];

  const channelBadgeStyles: Record<ExternalChannelType, { label: string; bg: string; text: string; border: string; icon: string }> = {
    swiggy: { label: 'Swiggy Food', bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', icon: '🛵' },
    zomato: { label: 'Zomato Online', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', icon: '🔴' },
    party_order: { label: 'Party / Bulk Catering', bg: 'bg-purple-500/10', text: 'text-purple-300', border: 'border-purple-500/30', icon: '🎉' },
    walk_in_pos: { label: 'Walk-In / POS Counter', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', icon: '🏪' },
    direct_phone_whatsapp: { label: 'WhatsApp / Direct Call', bg: 'bg-teal-500/10', text: 'text-teal-300', border: 'border-teal-500/30', icon: '💬' },
    website_direct: { label: 'Website Direct', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', icon: '🌐' }
  };

  const statusBadgeStyles: Record<OmnichannelOrder['kitchenStatus'], { label: string; bg: string; text: string; dot: string }> = {
    received: { label: 'Order Received', bg: 'bg-blue-950/60', text: 'text-blue-300', dot: 'bg-blue-400' },
    in_prep: { label: 'In Kitchen Prep', bg: 'bg-amber-950/60', text: 'text-amber-300', dot: 'bg-amber-400' },
    ready_packed: { label: 'Ready & Packed', bg: 'bg-purple-950/60', text: 'text-purple-300', dot: 'bg-purple-400' },
    dispatched: { label: 'Dispatched / With Rider', bg: 'bg-indigo-950/60', text: 'text-indigo-300', dot: 'bg-indigo-400' },
    completed: { label: 'Delivered / Completed', bg: 'bg-emerald-950/60', text: 'text-emerald-300', dot: 'bg-emerald-400' },
    cancelled: { label: 'Cancelled', bg: 'bg-rose-950/60', text: 'text-rose-300', dot: 'bg-rose-400' }
  };

  return (
    <div className="space-y-6 animate-fadeIn text-white">
      {/* Top Banner & Omnichannel Header */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-900 to-amber-950/80 rounded-3xl p-6 sm:p-8 border border-stone-800 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Omnichannel & Daily Sales Ledger
              </span>
              <span className="text-[11px] font-bold text-stone-400 bg-stone-800/80 px-2.5 py-1 rounded-full border border-stone-700">
                Multi-Channel Pricing & Party Catering Engine
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
              Daily External Orders Log (Swiggy, Zomato & Party Orders)
            </h1>
            <p className="text-xs sm:text-sm text-stone-400 max-w-3xl leading-relaxed">
              Capture, reconcile and track daily orders across Swiggy, Zomato, Party/Catering bulk bookings, and direct walk-in counters. Supports channel-specific custom item pricing, aggregator commission deductions, and event advance schedules without losing any daily transaction data.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleOpenNewOrderModal()}
              className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-5 py-3 rounded-2xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Log New Order</span>
            </button>

            <button
              onClick={() => handleOpenNewOrderModal('party_order')}
              className="bg-purple-600 hover:bg-purple-500 text-white font-black px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all hover:scale-[1.02]"
            >
              <span className="text-base">🎉</span>
              <span>+ Party / Catering Order</span>
            </button>

            <button
              onClick={() => setShowSettlementModal(true)}
              className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-center gap-2 border border-stone-700 transition-all"
            >
              <FileText className="w-4 h-4 text-amber-400" />
              <span>Day-End Settlement</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-5 space-y-2 relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Channel Orders</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-white">{metrics.totalOrdersCount}</div>
          <div className="text-[11px] text-stone-400 flex items-center gap-2 flex-wrap pt-1 border-t border-stone-800/80 font-medium">
            <span className="text-orange-400 font-bold">{metrics.swiggyCount} Swiggy</span>
            <span>•</span>
            <span className="text-rose-400 font-bold">{metrics.zomatoCount} Zomato</span>
            <span>•</span>
            <span className="text-purple-400 font-bold">{metrics.partyCount} Party</span>
            <span>•</span>
            <span className="text-emerald-400 font-bold">{metrics.directCount} Direct</span>
          </div>
        </div>

        {/* Gross Omnichannel Billing */}
        <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-5 space-y-2 relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold uppercase tracking-wider">Gross Day Billing</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-400">₹{metrics.totalGrossRevenue.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-stone-400 pt-1 border-t border-stone-800/80">
            Custom channel pricing & party billings included
          </div>
        </div>

        {/* Platform Commissions Deducted */}
        <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-5 space-y-2 relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold uppercase tracking-wider">Platform Commission (Swiggy/Zomato)</span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-rose-400">₹{metrics.totalCommissions.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-stone-400 pt-1 border-t border-stone-800/80">
            Avg ~19% aggregator cut on online food orders
          </div>
        </div>

        {/* Net Cash / Payout Realized */}
        <div className="bg-stone-900/90 border border-stone-800 rounded-3xl p-5 space-y-2 relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs font-bold uppercase tracking-wider">Net Realized Payout</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-300">₹{metrics.totalNetPayout.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-emerald-400 font-bold pt-1 border-t border-stone-800/80 flex items-center justify-between">
            <span>Net Kitchen Inflow</span>
            <span>{metrics.totalGrossRevenue > 0 ? ((metrics.totalNetPayout / metrics.totalGrossRevenue) * 100).toFixed(1) : 0}% Realization</span>
          </div>
        </div>
      </div>

      {/* Party Order Highlight Card if Party Orders Exist */}
      {metrics.partyCount > 0 && (
        <div className="bg-purple-950/40 border border-purple-800/60 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-2xl">
              🎉
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-purple-300">Party & Bulk Catering Pipeline</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 text-[10px] font-black border border-purple-500/30">
                  {metrics.partyCount} Active Bookings
                </span>
              </div>
              <p className="text-xs text-stone-300 font-medium mt-0.5">
                Total <strong className="text-white font-bold">{metrics.totalPartyGuests} Guests / Plates</strong> to prepare across corporate & fitness celebration bookings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-stone-950/70 p-3 rounded-2xl border border-purple-900/50 text-xs w-full md:w-auto justify-between md:justify-end">
            <div>
              <span className="text-[10px] text-stone-400 block font-medium">Party Total Value</span>
              <strong className="text-white font-bold text-sm">₹{metrics.partyGross.toLocaleString('en-IN')}</strong>
            </div>
            <div className="h-6 w-px bg-stone-800" />
            <div>
              <span className="text-[10px] text-emerald-400 block font-medium">Advance Collected</span>
              <strong className="text-emerald-400 font-bold text-sm">₹{metrics.partyAdvance.toLocaleString('en-IN')}</strong>
            </div>
            <div className="h-6 w-px bg-stone-800" />
            <div>
              <span className="text-[10px] text-amber-400 block font-medium">Balance on Delivery</span>
              <strong className="text-amber-400 font-bold text-sm">₹{metrics.partyBalance.toLocaleString('en-IN')}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Control Bar: Channel Tabs, Date Filter, Search & View Switcher */}
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-4 space-y-3">
        {/* Channel Navigation Pills */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-1.5 flex-nowrap">
            {[
              { id: 'all', label: 'All Channels', icon: '📊', count: orders.length },
              { id: 'swiggy', label: 'Swiggy', icon: '🛵', count: orders.filter(o => o.channel === 'swiggy').length },
              { id: 'zomato', label: 'Zomato', icon: '🔴', count: orders.filter(o => o.channel === 'zomato').length },
              { id: 'party_order', label: 'Party / Bulk Orders', icon: '🎉', count: orders.filter(o => o.channel === 'party_order').length },
              { id: 'walk_in_pos', label: 'Walk-In / Counter', icon: '🏪', count: orders.filter(o => o.channel === 'walk_in_pos').length },
              { id: 'direct_phone_whatsapp', label: 'Direct WhatsApp', icon: '💬', count: orders.filter(o => o.channel === 'direct_phone_whatsapp').length },
            ].map((tab) => {
              const active = activeChannelTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveChannelTab(tab.id as any)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap border ${
                    active
                      ? 'bg-amber-500 text-stone-950 border-amber-500 font-black shadow-lg shadow-amber-500/20'
                      : 'bg-stone-950/60 text-stone-300 border-stone-800 hover:bg-stone-800 hover:text-white'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    active ? 'bg-stone-950 text-amber-400' : 'bg-stone-800 text-stone-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-2xl border border-stone-800 shrink-0">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'cards' ? 'bg-stone-800 text-white font-black' : 'text-stone-400 hover:text-white'
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                viewMode === 'table' ? 'bg-stone-800 text-white font-black' : 'text-stone-400 hover:text-white'
              }`}
            >
              Spreadsheet
            </button>
            <button
              onClick={() => setViewMode('party_pipeline')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                viewMode === 'party_pipeline' ? 'bg-purple-900/80 text-purple-200 font-black' : 'text-stone-400 hover:text-purple-300'
              }`}
            >
              <span>🎉 Party Specs</span>
            </button>
          </div>
        </div>

        {/* Date Filter & Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-stone-800">
          {/* Search Box */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by Order ID, Customer, Phone, Dish or Rider..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-950 border border-stone-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-stone-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Date Selector */}
          <div className="sm:col-span-4 flex items-center gap-1.5">
            <div className="bg-stone-950 p-1 rounded-2xl border border-stone-800 flex items-center gap-1 w-full text-xs font-bold">
              <button
                onClick={() => setSelectedDateFilter('today')}
                className={`flex-1 py-1.5 rounded-xl transition-all ${
                  selectedDateFilter === 'today' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-stone-400 hover:text-white'
                }`}
              >
                Today (15 Aug)
              </button>
              <button
                onClick={() => setSelectedDateFilter('yesterday')}
                className={`flex-1 py-1.5 rounded-xl transition-all ${
                  selectedDateFilter === 'yesterday' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-stone-400 hover:text-white'
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={() => setSelectedDateFilter('all')}
                className={`flex-1 py-1.5 rounded-xl transition-all ${
                  selectedDateFilter === 'all' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-stone-400 hover:text-white'
                }`}
              >
                All Dates
              </button>
            </div>
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-3 py-2.5 text-xs text-stone-200 font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Kitchen Statuses</option>
              <option value="received">Order Received</option>
              <option value="in_prep">In Kitchen Prep</option>
              <option value="ready_packed">Ready & Packed</option>
              <option value="dispatched">Dispatched / With Rider</option>
              <option value="completed">Delivered / Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* MAIN VIEW AREA */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.length === 0 ? (
            <div className="col-span-full bg-stone-900/60 border border-stone-800 rounded-3xl p-12 text-center space-y-4">
              <ShoppingBag className="w-12 h-12 text-stone-600 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">No Orders Found for this Filter</h3>
                <p className="text-xs text-stone-400 max-w-md mx-auto">
                  Try changing the date filter, channel, or click "+ Log New Order" to record an order from Swiggy, Zomato, or a Party Catering inquiry.
                </p>
              </div>
              <button
                onClick={() => handleOpenNewOrderModal()}
                className="bg-amber-500 text-stone-950 font-bold px-4 py-2 rounded-xl text-xs inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Log First Order</span>
              </button>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const channelBadge = channelBadgeStyles[order.channel] || channelBadgeStyles.swiggy;
              const statusBadge = statusBadgeStyles[order.kitchenStatus] || statusBadgeStyles.received;
              const isParty = order.channel === 'party_order';

              return (
                <div
                  key={order.id}
                  className={`bg-stone-900 border ${isParty ? 'border-purple-800/80 shadow-purple-950/30' : 'border-stone-800'} rounded-3xl p-5 space-y-4 shadow-xl hover:border-amber-500/50 transition-all flex flex-col justify-between group relative overflow-hidden`}
                >
                  {isParty && (
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-bl-full pointer-events-none" />
                  )}

                  <div className="space-y-3">
                    {/* Header: Channel Badge & Order ID */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${channelBadge.bg} ${channelBadge.text} ${channelBadge.border} flex items-center gap-1`}>
                          <span>{channelBadge.icon}</span>
                          <span>{channelBadge.label}</span>
                        </span>
                        <span className="text-xs font-black text-stone-300 bg-stone-950 px-2 py-0.5 rounded-lg border border-stone-800">
                          {order.channelOrderId}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-stone-400">
                        <Clock className="w-3.5 h-3.5 text-stone-500" />
                        <span>{order.orderTime}</span>
                      </div>
                    </div>

                    {/* Customer Info */}
                    <div className="space-y-1">
                      <h3 className="font-extrabold text-white text-base leading-snug group-hover:text-amber-400 transition-colors flex items-center justify-between">
                        <span>{order.customerName}</span>
                      </h3>
                      {order.customerPhone && (
                        <div className="flex items-center gap-1 text-xs text-stone-400">
                          <Phone className="w-3 h-3 text-stone-500" />
                          <span>{order.customerPhone}</span>
                        </div>
                      )}
                      {order.deliveryAddress && (
                        <div className="flex items-start gap-1 text-[11px] text-stone-400 line-clamp-1">
                          <MapPin className="w-3 h-3 text-stone-500 shrink-0 mt-0.5" />
                          <span>{order.deliveryAddress}</span>
                        </div>
                      )}
                    </div>

                    {/* Party Specific Highlights if applicable */}
                    {isParty && order.partyDetails && (
                      <div className="bg-purple-950/60 p-3 rounded-2xl border border-purple-800/60 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-purple-200 font-bold">
                          <span>🎉 {order.partyDetails.occasion}</span>
                          <span className="bg-purple-900 px-2 py-0.5 rounded-full text-[10px] font-black text-white">
                            {order.partyDetails.guestCount} Guests
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-purple-800/40">
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">Advance Paid</span>
                            <span className="text-emerald-400 font-bold">₹{order.partyDetails.advancePaid.toLocaleString('en-IN')}</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">Balance Due</span>
                            <span className="text-amber-300 font-bold">₹{order.partyDetails.balanceDue.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Items List Snapshot */}
                    <div className="space-y-1.5 bg-stone-950 p-3 rounded-2xl border border-stone-800/80">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center justify-between">
                        <span>Items Ordered ({order.items.length})</span>
                        <span>Channel Price</span>
                      </div>
                      <div className="space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs font-medium text-stone-300">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-md bg-stone-900 text-amber-400 text-[10px] font-black flex items-center justify-center border border-stone-800">
                                {item.quantity}x
                              </span>
                              <span className="line-clamp-1 max-w-[170px] text-white font-semibold">
                                {item.dishName}
                              </span>
                            </div>
                            <span className="font-bold text-stone-200">
                              ₹{item.lineTotal.toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rider details if present */}
                    {order.riderName && (
                      <div className="flex items-center justify-between text-[11px] bg-stone-950/60 px-3 py-1.5 rounded-xl border border-stone-800/60 text-stone-400">
                        <span className="flex items-center gap-1">
                          <Truck className="w-3 h-3 text-amber-400" />
                          <span>Rider: <strong className="text-white font-bold">{order.riderName}</strong></span>
                        </span>
                        {order.riderPhone && <span>{order.riderPhone}</span>}
                      </div>
                    )}

                    {/* Financial Breakdown Snapshot */}
                    <div className="grid grid-cols-3 gap-2 text-center bg-stone-950 p-2.5 rounded-2xl border border-stone-800 text-xs">
                      <div>
                        <span className="text-[9px] text-stone-500 uppercase block font-medium">Billed Gross</span>
                        <span className="font-black text-white">₹{order.grossAmount.toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-stone-500 uppercase block font-medium">Platform Cut</span>
                        <span className="font-bold text-rose-400">
                          {order.aggregatorCommissionAmount > 0 ? `-₹${order.aggregatorCommissionAmount}` : '₹0'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-emerald-500 uppercase block font-bold">Net Payout</span>
                        <span className="font-black text-emerald-400">₹{order.netPayoutRevenue.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer: Live Kitchen Status Selector & Actions */}
                  <div className="pt-3 border-t border-stone-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${statusBadge.dot} animate-pulse`} />
                        <span className={`text-xs font-black ${statusBadge.text}`}>
                          {statusBadge.label}
                        </span>
                      </div>

                      {/* Status quick toggle dropdown */}
                      <select
                        value={order.kitchenStatus}
                        onChange={(e) => handleQuickStatusChange(order.id, e.target.value as any)}
                        className="bg-stone-950 border border-stone-800 text-[11px] font-bold text-stone-300 rounded-xl px-2 py-1 focus:outline-none focus:border-amber-500"
                      >
                        <option value="received">Received</option>
                        <option value="in_prep">In Prep</option>
                        <option value="ready_packed">Packed</option>
                        <option value="dispatched">Dispatched</option>
                        <option value="completed">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        onClick={() => setShowDetailModal(order)}
                        className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View Invoice & KOT</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditOrder(order)}
                          className="p-1.5 text-stone-400 hover:text-amber-400 hover:bg-stone-800 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-bold"
                          title="Edit Order"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteOrder(order.id)}
                          className="p-1.5 text-stone-500 hover:text-rose-400 hover:bg-stone-800 rounded-lg transition-colors"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SPREADSHEET TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-300">
              <thead className="bg-stone-950 text-stone-400 font-bold uppercase tracking-wider text-[10px] border-b border-stone-800">
                <tr>
                  <th className="p-4">Channel & ID</th>
                  <th className="p-4">Time</th>
                  <th className="p-4">Customer / Event</th>
                  <th className="p-4">Items & Qty</th>
                  <th className="p-4 text-right">Gross Billed</th>
                  <th className="p-4 text-right">Commission</th>
                  <th className="p-4 text-right">Net Payout</th>
                  <th className="p-4">Payment</th>
                  <th className="p-4">Kitchen Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60 font-medium">
                {filteredOrders.map((order) => {
                  const channelBadge = channelBadgeStyles[order.channel] || channelBadgeStyles.swiggy;
                  const statusBadge = statusBadgeStyles[order.kitchenStatus] || statusBadgeStyles.received;
                  return (
                    <tr key={order.id} className="hover:bg-stone-800/40 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${channelBadge.bg} ${channelBadge.text} ${channelBadge.border}`}>
                            {channelBadge.label}
                          </span>
                          <span className="font-black text-white">{order.channelOrderId}</span>
                        </div>
                      </td>
                      <td className="p-4 text-stone-400">{order.orderTime}</td>
                      <td className="p-4">
                        <div className="font-bold text-white">{order.customerName}</div>
                        <div className="text-[10px] text-stone-400">{order.customerPhone}</div>
                      </td>
                      <td className="p-4">
                        <div className="max-w-[200px] line-clamp-1 text-stone-200">
                          {order.items.map(i => `${i.quantity}x ${i.dishName}`).join(', ')}
                        </div>
                      </td>
                      <td className="p-4 text-right font-black text-white">
                        ₹{order.grossAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 text-right font-bold text-rose-400">
                        {order.aggregatorCommissionAmount > 0 ? `-₹${order.aggregatorCommissionAmount}` : '₹0'}
                      </td>
                      <td className="p-4 text-right font-black text-emerald-400">
                        ₹{order.netPayoutRevenue.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-950 border border-stone-800 font-bold text-amber-300">
                          {order.paymentMethod}
                        </span>
                      </td>
                      <td className="p-4">
                        <select
                          value={order.kitchenStatus}
                          onChange={(e) => handleQuickStatusChange(order.id, e.target.value as any)}
                          className="bg-stone-950 border border-stone-800 text-[10px] font-bold text-stone-200 rounded-lg px-2 py-1"
                        >
                          <option value="received">Received</option>
                          <option value="in_prep">In Prep</option>
                          <option value="ready_packed">Packed</option>
                          <option value="dispatched">Dispatched</option>
                          <option value="completed">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditOrder(order)}
                            className="p-1 text-stone-400 hover:text-amber-400 hover:bg-stone-800 rounded-lg transition-colors"
                            title="Edit Order"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setShowDetailModal(order)}
                            className="p-1 text-amber-400 hover:text-white"
                            title="View Details"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="p-1 text-stone-500 hover:text-rose-400 hover:bg-stone-800 rounded-lg transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PARTY PIPELINE & CATERING PRODUCTION SPECS */}
      {viewMode === 'party_pipeline' && (
        <div className="space-y-6">
          <div className="bg-purple-950/40 border border-purple-800/80 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-purple-300 bg-purple-900/60 px-3 py-1 rounded-full border border-purple-700/50">
                  Bulk Catering & Party Orders Command
                </span>
                <h2 className="text-2xl font-black text-white mt-1">
                  Scheduled Catering Events & Prep Batches
                </h2>
                <p className="text-xs text-stone-300">
                  Track guest counts, customized bento boxes, buffet setups, advance payments and dispatch timings.
                </p>
              </div>

              <button
                onClick={() => handleOpenNewOrderModal('party_order')}
                className="bg-purple-600 hover:bg-purple-500 text-white font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2 shadow-lg"
              >
                <Plus className="w-4 h-4" />
                <span>+ Book New Party Event</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {orders.filter(o => o.channel === 'party_order').map((party) => (
                <div key={party.id} className="bg-stone-900 border border-purple-800/80 rounded-3xl p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-purple-300 bg-purple-950 px-2.5 py-1 rounded-xl border border-purple-800">
                      {party.channelOrderId}
                    </span>
                    <span className="text-xs font-bold text-stone-400">
                      📅 {party.partyDetails?.eventDate || party.orderDate} • {party.partyDetails?.eventTimeSlot || party.orderTime}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-white">{party.customerName}</h3>
                    <p className="text-xs font-bold text-amber-400 mt-0.5">🎉 {party.partyDetails?.occasion}</p>
                    <p className="text-xs text-stone-400 mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-stone-500" />
                      <span>{party.partyDetails?.venueAddress || party.deliveryAddress}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-stone-950 p-3 rounded-2xl border border-stone-800 text-center text-xs">
                    <div>
                      <span className="text-[9px] text-stone-500 uppercase block font-medium">Guest Count</span>
                      <strong className="text-purple-300 font-black text-sm">{party.partyDetails?.guestCount || 25} Guests</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-500 uppercase block font-medium">Style</span>
                      <strong className="text-white font-bold text-[11px]">{party.partyDetails?.cateringStyle || 'Bento Boxes'}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-500 uppercase block font-medium">Setup Warmers</span>
                      <strong className="text-emerald-400 font-bold text-xs">{party.partyDetails?.setupRequired ? 'Yes (Live)' : 'No'}</strong>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs bg-stone-950/60 p-3 rounded-2xl border border-stone-800">
                    <span className="text-[10px] font-bold uppercase text-stone-400 block">Menu Items Breakdown</span>
                    {party.items.map((itm, i) => (
                      <div key={i} className="flex justify-between items-center text-stone-300 font-medium">
                        <span>{itm.quantity}x {itm.dishName} ({itm.portionSize})</span>
                        <span className="font-bold text-amber-300">@₹{itm.unitPrice}/plate</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-stone-800 text-xs">
                    <div>
                      <span className="text-[10px] text-stone-500 block">Advance Collected</span>
                      <span className="text-emerald-400 font-bold">₹{party.partyDetails?.advancePaid.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-500 block">Balance Payable</span>
                      <span className="text-amber-400 font-bold">₹{party.partyDetails?.balanceDue.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-500 block">Total Event Value</span>
                      <span className="text-white font-black">₹{party.grossAmount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowDetailModal(party)}
                        className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>KOT Ticket</span>
                      </button>
                      <button
                        onClick={() => handleEditOrder(party)}
                        className="bg-stone-800 hover:bg-stone-700 text-amber-300 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Event</span>
                      </button>
                    </div>
                    <select
                      value={party.kitchenStatus}
                      onChange={(e) => handleQuickStatusChange(party.id, e.target.value as any)}
                      className="bg-stone-950 border border-stone-800 text-xs font-bold text-stone-300 rounded-xl px-2.5 py-1.5"
                    >
                      <option value="received">Order Booked</option>
                      <option value="in_prep">Kitchen Batch Prep</option>
                      <option value="ready_packed">Packed in Chafing Trays</option>
                      <option value="dispatched">Van Dispatched to Venue</option>
                      <option value="completed">Event Completed</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: ADD / LOG / EDIT OMNICHANNEL & PARTY ORDER (FULLY ADJUSTABLE & RESPONSIVE) */}
      {/* ==================================================================== */}
      {showAddModal && (
        <div 
          className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddModal(false);
            }
          }}
        >
          <div 
            className={`bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl flex flex-col w-full overflow-hidden transition-all duration-200 ${
              modalSize === 'fullscreen' 
                ? 'max-w-[99vw] h-[98vh] max-h-[98vh] rounded-2xl' 
                : modalSize === 'wide' 
                  ? 'max-w-5xl h-[92vh] max-h-[92vh]' 
                  : 'max-w-3xl h-[88vh] max-h-[88vh]'
            }`}
          >
            {/* FIXED TOP HEADER (Always Visible & Adjustable) */}
            <div className="p-4 sm:p-5 border-b border-stone-800 bg-stone-950/90 backdrop-blur-md shrink-0 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                    formChannel === 'party_order' 
                      ? 'text-purple-300 bg-purple-500/20 border-purple-500/30' 
                      : 'text-amber-400 bg-amber-500/20 border-amber-500/30'
                  }`}>
                    {formChannel === 'party_order' ? '🎉 Party Catering Booking Terminal' : 'Daily Sales Logging Terminal'}
                  </span>
                  <span className="text-[11px] font-bold text-stone-400">
                    {editingOrderId ? 'Editing Existing Order' : 'New Order Entry'}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white mt-0.5">
                  {formChannel === 'party_order' ? 'Party & Bulk Catering Order' : 'External Channel & Counter Order'}
                </h2>
              </div>

              {/* Sizing & Close Window Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Window Size Adjuster Pill */}
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-1 flex items-center gap-1 text-[11px] font-bold text-stone-400">
                  <span className="text-[10px] text-stone-500 px-1 hidden md:inline">Window:</span>
                  <button
                    type="button"
                    onClick={() => setModalSize('standard')}
                    className={`px-2 py-1 rounded-lg transition-all text-xs ${
                      modalSize === 'standard' ? 'bg-amber-500 text-stone-950 font-black' : 'hover:text-white'
                    }`}
                    title="Standard Width"
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalSize('wide')}
                    className={`px-2 py-1 rounded-lg transition-all text-xs ${
                      modalSize === 'wide' ? 'bg-amber-500 text-stone-950 font-black' : 'hover:text-white'
                    }`}
                    title="Wide / 2-Column Mode"
                  >
                    Wide
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalSize('fullscreen')}
                    className={`px-2 py-1 rounded-lg transition-all text-xs flex items-center gap-1 ${
                      modalSize === 'fullscreen' ? 'bg-amber-500 text-stone-950 font-black' : 'hover:text-white'
                    }`}
                    title="Full Screen View"
                  >
                    <Maximize2 className="w-3 h-3 inline" />
                    <span className="hidden sm:inline">Expand</span>
                  </button>
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="p-2 text-stone-400 hover:text-white bg-stone-950 hover:bg-rose-950 hover:text-rose-300 rounded-full border border-stone-800 transition-colors"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* SCROLLABLE FORM BODY */}
            <form id="orderForm" onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Channel Selector Row */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-300">Select Sales Channel *</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: 'party_order', label: 'Party / Bulk Catering', icon: '🎉' },
                    { id: 'swiggy', label: 'Swiggy Delivery', icon: '🛵' },
                    { id: 'zomato', label: 'Zomato Delivery', icon: '🔴' },
                    { id: 'walk_in_pos', label: 'Walk-In / POS Counter', icon: '🏪' },
                    { id: 'direct_phone_whatsapp', label: 'WhatsApp Direct', icon: '💬' }
                  ].map((ch) => (
                    <button
                      type="button"
                      key={ch.id}
                      onClick={() => handleChannelChange(ch.id as any)}
                      className={`p-2.5 rounded-2xl text-xs font-bold transition-all border text-center flex flex-col items-center justify-center gap-1 ${
                        formChannel === ch.id
                          ? ch.id === 'party_order'
                            ? 'bg-purple-600 text-white border-purple-400 font-black shadow-lg shadow-purple-900/30'
                            : 'bg-amber-500 text-stone-950 border-amber-500 font-black shadow-md'
                          : 'bg-stone-950 text-stone-300 border-stone-800 hover:bg-stone-800'
                      }`}
                    >
                      <span className="text-lg">{ch.icon}</span>
                      <span className="whitespace-nowrap">{ch.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Order ID, Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-stone-400 block mb-1">
                    {formChannel === 'party_order' ? 'Party Order Reference #' : 'Channel Order / Token #'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formChannelOrderId}
                    onChange={(e) => setFormChannelOrderId(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-stone-400 block mb-1">Order / Event Date</label>
                  <input
                    type="date"
                    required
                    value={formOrderDate}
                    onChange={(e) => {
                      setFormOrderDate(e.target.value);
                      if (formChannel === 'party_order') setFormPartyEventDate(e.target.value);
                    }}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-stone-400 block mb-1">Delivery / Serving Time</label>
                  <input
                    type="time"
                    required
                    value={formOrderTime}
                    onChange={(e) => setFormOrderTime(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  />
                </div>
              </div>

              {/* PARTY ORDER SPECIFIC ENHANCED SECTION */}
              {formChannel === 'party_order' ? (
                <div className="bg-purple-950/40 p-4 sm:p-5 rounded-2xl border border-purple-800/80 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-1.5">
                        <span>🎉 Party & Bulk Catering Specifications</span>
                      </h4>
                      <p className="text-[11px] text-purple-200/70">
                        Configure guest count, serving setup, dietary preferences and advance payments.
                      </p>
                    </div>
                    <span className="text-[10px] text-purple-200 bg-purple-900/80 px-2.5 py-1 rounded-full font-bold border border-purple-700">
                      Bulk Catering Module
                    </span>
                  </div>

                  {/* Quick Guest Count Presets */}
                  <div className="space-y-1.5 bg-stone-950/60 p-3 rounded-xl border border-purple-900/50">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-purple-200">Quick Guest Count Presets:</label>
                      <span className="text-[10px] text-stone-400">Current: <strong className="text-white font-black">{formPartyGuestCount} guests</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[15, 25, 30, 50, 75, 100, 150, 200].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => {
                            setFormPartyGuestCount(count);
                            // Auto split 40% veg, 60% non veg
                            const veg = Math.round(count * 0.35);
                            setFormPartyVegCount(veg);
                            setFormPartyNonVegCount(count - veg);
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                            formPartyGuestCount === count 
                              ? 'bg-purple-500 text-white shadow' 
                              : 'bg-stone-900 text-purple-200 hover:bg-stone-800 border border-purple-900/40'
                          }`}
                        >
                          {count} Guests
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-stone-300 block mb-1">Occasion / Event Title *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. CultFit Annual Fitness Party or Infopark Tech Lunch"
                        value={formPartyOccasion}
                        onChange={(e) => setFormPartyOccasion(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-stone-300 block mb-1">Total Plates / Guests *</label>
                      <input
                        type="number"
                        min="5"
                        required
                        value={formPartyGuestCount}
                        onChange={(e) => setFormPartyGuestCount(Number(e.target.value))}
                        className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-stone-300 block mb-1">Catering Serving Style</label>
                      <select
                        value={formPartyCateringStyle}
                        onChange={(e) => setFormPartyCateringStyle(e.target.value as any)}
                        className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                      >
                        <option value="Individual Bento Boxes">Individual Bento Boxes (Sealed)</option>
                        <option value="Buffet / Bulk Chafing Trays">Buffet / Bulk Chafing Warmers</option>
                        <option value="Live Salad Counter">Live Salad & Protein Bowl Counter</option>
                        <option value="Finger Food & Smoothies">Finger Food, Smoothies & Bites</option>
                      </select>
                    </div>
                  </div>

                  {/* Dietary Preference Split */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-stone-950/60 p-3 rounded-xl border border-purple-900/40">
                    <div>
                      <label className="text-[11px] font-bold text-emerald-400 block mb-1">Veg Plates</label>
                      <input
                        type="number"
                        min="0"
                        value={formPartyVegCount}
                        onChange={(e) => setFormPartyVegCount(Number(e.target.value))}
                        className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-emerald-300 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-amber-400 block mb-1">Non-Veg Plates</label>
                      <input
                        type="number"
                        min="0"
                        value={formPartyNonVegCount}
                        onChange={(e) => setFormPartyNonVegCount(Number(e.target.value))}
                        className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-cyan-400 block mb-1">Vegan / Keto Plates</label>
                      <input
                        type="number"
                        min="0"
                        value={formPartyVeganCount}
                        onChange={(e) => setFormPartyVeganCount(Number(e.target.value))}
                        className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-cyan-300 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-emerald-400 block mb-1">Advance Received (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={formPartyAdvancePaid}
                        onChange={(e) => setFormPartyAdvancePaid(Number(e.target.value))}
                        className="w-full bg-stone-900 border border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-emerald-400 font-black"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-bold text-purple-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formPartySetupRequired}
                        onChange={(e) => setFormPartySetupRequired(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-0 w-4 h-4 bg-stone-900 border-stone-700"
                      />
                      <span>Kitchen Chafing Dishes, Warmers & Service Team Required</span>
                    </label>

                    {/* Sync items with guest count button */}
                    <button
                      type="button"
                      onClick={() => {
                        const updated = formItems.map(itm => ({
                          ...itm,
                          quantity: formPartyGuestCount,
                          lineTotal: itm.unitPrice * formPartyGuestCount
                        }));
                        setFormItems(updated);
                      }}
                      className="px-3 py-1 bg-purple-900 hover:bg-purple-800 text-purple-200 rounded-lg text-xs font-bold border border-purple-700 transition-colors"
                      title="Update all menu item quantities to match guest count"
                    >
                      ⚡ Sync Line Quantities to {formPartyGuestCount} Guests
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Customer & Delivery / Event Details */}
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 space-y-3">
                <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider">
                  {formChannel === 'party_order' ? 'Host & Venue Contact Details' : 'Customer & Delivery Information'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-stone-400 block mb-1">
                      {formChannel === 'party_order' ? 'Company / Host Name *' : 'Customer Full Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CultFit Infopark or Rahul Varma"
                      value={formCustomerName}
                      onChange={(e) => setFormCustomerName(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-stone-400 block mb-1">Contact Phone Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. +91 98471 22910"
                      value={formCustomerPhone}
                      onChange={(e) => setFormCustomerPhone(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-stone-400 block mb-1">Delivery / Venue Address</label>
                    <input
                      type="text"
                      placeholder="e.g. Level 4, Brigade World Trade Center, Kakkanad, Kochi"
                      value={formDeliveryAddress}
                      onChange={(e) => setFormDeliveryAddress(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-stone-400 block mb-1">
                      {formChannel === 'party_order' ? 'Delivery Vehicle / Driver' : 'Rider / Partner Name'}
                    </label>
                    <input
                      type="text"
                      placeholder={formChannel === 'party_order' ? 'e.g. Kitchen Van (KL-07-CC-4421)' : 'e.g. Sujith (Swiggy)'}
                      value={formRiderName}
                      onChange={(e) => setFormRiderName(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* ITEMS & PRICING ENGINE */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider">
                      Dish Items & Channel-Specific Unit Pricing
                    </h4>
                    <p className="text-[11px] text-stone-400">
                      Customize unit price per channel (e.g. Swiggy markup vs Party bulk discounted rate).
                    </p>
                  </div>

                  {/* Quick add dish from catalog */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddItemToForm()}
                      className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 border border-stone-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Custom Line Item</span>
                    </button>
                  </div>
                </div>

                {/* Popular Dishes Quick Pill Bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <span className="text-[10px] font-bold text-stone-500 uppercase whitespace-nowrap">Add Quick Dish:</span>
                  {ALL_RECIPES.slice(0, 6).map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => handleAddItemToForm(recipe)}
                      className="px-2.5 py-1 rounded-xl bg-stone-950 border border-stone-800 text-[11px] text-stone-300 hover:text-amber-400 hover:border-amber-500/50 whitespace-nowrap font-medium transition-colors"
                    >
                      + {recipe.name.split('–')[0].substring(0, 22)}
                    </button>
                  ))}
                </div>

                {/* Line Items Table */}
                <div className="space-y-2 bg-stone-950 p-3 sm:p-4 rounded-2xl border border-stone-800">
                  {formItems.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-stone-900 p-2.5 rounded-xl border border-stone-800">
                      {/* Dish Name */}
                      <div className="sm:col-span-4">
                        <label className="text-[9px] text-stone-500 uppercase block">Dish Name</label>
                        <input
                          type="text"
                          required
                          value={item.dishName}
                          onChange={(e) => handleUpdateFormItem(idx, 'dishName', e.target.value)}
                          className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold"
                        />
                      </div>

                      {/* Portion Size */}
                      <div className="sm:col-span-3">
                        <label className="text-[9px] text-stone-500 uppercase block">Portion / Packaging</label>
                        <input
                          type="text"
                          value={item.portionSize}
                          onChange={(e) => handleUpdateFormItem(idx, 'portionSize', e.target.value)}
                          className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2 py-1.5 text-xs text-stone-300 font-medium"
                        />
                      </div>

                      {/* Unit Price (Editable!) */}
                      <div className="sm:col-span-2">
                        <label className="text-[9px] text-amber-400 uppercase block font-bold">Unit Price (₹)</label>
                        <input
                          type="number"
                          required
                          value={item.unitPrice}
                          onChange={(e) => handleUpdateFormItem(idx, 'unitPrice', Number(e.target.value))}
                          className="w-full bg-stone-950 border border-amber-500/50 rounded-lg px-2 py-1.5 text-xs text-amber-300 font-black"
                        />
                      </div>

                      {/* Qty */}
                      <div className="sm:col-span-1">
                        <label className="text-[9px] text-stone-500 uppercase block">Qty</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.quantity}
                          onChange={(e) => handleUpdateFormItem(idx, 'quantity', Number(e.target.value))}
                          className="w-full bg-stone-950 border border-stone-800 rounded-lg px-1.5 py-1.5 text-xs text-white font-bold text-center"
                        />
                      </div>

                      {/* Total & Remove */}
                      <div className="sm:col-span-2 flex items-center justify-between gap-1">
                        <div>
                          <label className="text-[9px] text-stone-500 uppercase block">Total</label>
                          <span className="text-xs font-black text-emerald-400">
                            ₹{item.lineTotal.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFormItem(idx)}
                          disabled={formItems.length === 1}
                          className="p-1.5 text-stone-500 hover:text-rose-400 disabled:opacity-30 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Charges, Commission & Net Breakdown */}
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 space-y-3">
                <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider">
                  Charges, Taxes & Commission Economics
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="text-[10px] text-stone-400 block mb-1">Packaging / Trays (₹)</label>
                    <input
                      type="number"
                      value={formPackagingCharge}
                      onChange={(e) => setFormPackagingCharge(Number(e.target.value))}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 block mb-1">Delivery / Transport (₹)</label>
                    <input
                      type="number"
                      value={formDeliveryCharge}
                      onChange={(e) => setFormDeliveryCharge(Number(e.target.value))}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 block mb-1">GST Tax (₹)</label>
                    <input
                      type="number"
                      value={formGstAmount}
                      onChange={(e) => setFormGstAmount(Number(e.target.value))}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 block mb-1">Discount / Promo (₹)</label>
                    <input
                      type="number"
                      value={formDiscountAmount}
                      onChange={(e) => setFormDiscountAmount(Number(e.target.value))}
                      className="w-full bg-stone-900 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-rose-400 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-rose-400 block mb-1 font-bold">Platform Cut (%)</label>
                    <input
                      type="number"
                      value={formCommissionPct}
                      onChange={(e) => setFormCommissionPct(Number(e.target.value))}
                      className="w-full bg-stone-900 border border-rose-500/40 rounded-xl px-2.5 py-1.5 text-xs text-rose-300 font-black"
                    />
                  </div>
                </div>

                {/* Final Calculation Summary Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-stone-900 p-3 rounded-xl border border-stone-800 text-center font-bold">
                  <div>
                    <span className="text-[9px] text-stone-400 uppercase block">Gross Billed</span>
                    <span className="text-base font-black text-white">₹{formGrossAmount.toLocaleString('en-IN')}</span>
                  </div>
                  {formChannel === 'party_order' ? (
                    <>
                      <div>
                        <span className="text-[9px] text-emerald-400 uppercase block">Advance Paid</span>
                        <span className="text-base font-black text-emerald-400">₹{formPartyAdvancePaid.toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-amber-400 uppercase block">Balance Due</span>
                        <span className="text-base font-black text-amber-300">
                          ₹{Math.max(0, formGrossAmount - formPartyAdvancePaid).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-[9px] text-rose-400 uppercase block">Commission Deducted</span>
                        <span className="text-base font-black text-rose-400">-₹{formAggregatorCommissionAmount.toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-emerald-400 uppercase block">Net Kitchen Payout</span>
                        <span className="text-base font-black text-emerald-400">₹{formNetPayout.toLocaleString('en-IN')}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Payment Mode & Kitchen Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-stone-400 block mb-1">Payment Method</label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as any)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="Bank Transfer / NEFT">Bank Transfer / NEFT</option>
                    <option value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</option>
                    <option value="Swiggy Pay">Swiggy Pay</option>
                    <option value="Zomato Pay">Zomato Pay</option>
                    <option value="Cash on Delivery">Cash on Delivery</option>
                    <option value="Credit Card POS">Credit Card POS</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-stone-400 block mb-1">Payment Status</label>
                  <select
                    value={formPaymentStatus}
                    onChange={(e) => setFormPaymentStatus(e.target.value as any)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="advance_paid">Advance Paid (Party)</option>
                    <option value="paid_online">Paid Online (Full)</option>
                    <option value="paid_cash">Paid Cash</option>
                    <option value="pending">Pending</option>
                    <option value="settled">Settled</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-stone-400 block mb-1">Initial Kitchen / Dispatch Status</label>
                  <select
                    value={formKitchenStatus}
                    onChange={(e) => setFormKitchenStatus(e.target.value as any)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="received">Order Received / Booked</option>
                    <option value="in_prep">In Kitchen Batch Prep</option>
                    <option value="ready_packed">Ready & Packed</option>
                    <option value="dispatched">Dispatched to Venue</option>
                    <option value="completed">Delivered / Event Done</option>
                  </select>
                </div>
              </div>

              {/* Internal Notes */}
              <div>
                <label className="text-[11px] font-bold text-stone-400 block mb-1">Internal Kitchen / Catering Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Host requested warm chafing dishes by 12:45 PM, extra disposable cutlery provided"
                  value={formInternalNotes}
                  onChange={(e) => setFormInternalNotes(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-300 font-medium"
                />
              </div>
            </form>

            {/* FIXED BOTTOM FOOTER (Always Reachable & Clickable) */}
            <div className="p-4 sm:p-5 border-t border-stone-800 bg-stone-950/95 backdrop-blur-md shrink-0 flex items-center justify-between gap-3">
              <div className="text-xs text-stone-400 hidden sm:block">
                <span>Items: <strong className="text-white">{formItems.length}</strong></span> • 
                <span className="ml-2">Gross: <strong className="text-emerald-400">₹{formGrossAmount.toLocaleString('en-IN')}</strong></span>
                {formChannel === 'party_order' && (
                  <span className="ml-2"> • Due: <strong className="text-amber-300">₹{Math.max(0, formGrossAmount - formPartyAdvancePaid).toLocaleString('en-IN')}</strong></span>
                )}
              </div>

              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-stone-800 text-stone-300 text-xs font-bold hover:bg-stone-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="orderForm"
                  className={`px-6 py-2.5 rounded-xl text-xs font-black shadow-lg transition-all ${
                    formChannel === 'party_order'
                      ? 'bg-purple-500 hover:bg-purple-400 text-white shadow-purple-900/30'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-stone-950 shadow-emerald-500/20'
                  }`}
                >
                  {editingOrderId ? '✓ Save Changes to Order' : formChannel === 'party_order' ? '✓ Save Party Catering Booking' : '✓ Save Daily Order Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: ORDER DETAIL, INVOICE & KOT TICKET VIEW */}
      {/* ==================================================================== */}
      {showDetailModal && (
        <div 
          className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDetailModal(null);
            }
          }}
        >
          <div className="bg-stone-900 border border-stone-800 w-full max-w-xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn relative">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-stone-800 bg-stone-950/90 backdrop-blur-md shrink-0 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  Certified Cloud Kitchen Receipt & KOT
                </span>
                <h3 className="text-xl font-black text-white mt-1">{showDetailModal.channelOrderId}</h3>
                <p className="text-xs text-stone-400">
                  Channel: <strong className="text-amber-400 uppercase">{showDetailModal.channel}</strong> • Date: {showDetailModal.orderDate} at {showDetailModal.orderTime}
                </p>
              </div>

              <button
                onClick={() => setShowDetailModal(null)}
                className="p-2 text-stone-400 hover:text-white bg-stone-800 rounded-full border border-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Customer & Delivery Specs */}
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-stone-400">Customer / Host:</span>
                  <strong className="text-white font-bold">{showDetailModal.customerName}</strong>
                </div>
                {showDetailModal.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-stone-400">Phone:</span>
                    <span className="text-stone-200">{showDetailModal.customerPhone}</span>
                  </div>
                )}
                {showDetailModal.deliveryAddress && (
                  <div className="flex justify-between">
                    <span className="text-stone-400">Delivery Address:</span>
                    <span className="text-stone-200 text-right max-w-[260px]">{showDetailModal.deliveryAddress}</span>
                  </div>
                )}
                {showDetailModal.riderName && (
                  <div className="flex justify-between pt-1 border-t border-stone-800 text-amber-300 font-bold">
                    <span>Assigned Rider:</span>
                    <span>{showDetailModal.riderName} ({showDetailModal.riderPhone || 'Partner'})</span>
                  </div>
                )}
              </div>

              {/* Party Specific Details if available */}
              {showDetailModal.partyDetails && (
                <div className="bg-purple-950/60 p-4 rounded-2xl border border-purple-800/80 space-y-2 text-xs">
                  <div className="flex justify-between text-purple-200 font-bold">
                    <span>Occasion:</span>
                    <span>{showDetailModal.partyDetails.occasion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">Guests / Plates:</span>
                    <strong className="text-white">{showDetailModal.partyDetails.guestCount} Plates ({showDetailModal.partyDetails.cateringStyle})</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-400">Dietary Split:</span>
                    <span className="text-stone-300">
                      {showDetailModal.partyDetails.dietarySplit?.vegCount} Veg / {showDetailModal.partyDetails.dietarySplit?.nonVegCount} Non-Veg
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-purple-800/60 font-bold">
                    <div>
                      <span className="text-[10px] text-stone-400 block">Advance Paid</span>
                      <span className="text-emerald-400">₹{showDetailModal.partyDetails.advancePaid.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block">Balance Payable</span>
                      <span className="text-amber-300">₹{showDetailModal.partyDetails.balanceDue.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Line Items */}
              <div className="space-y-2 bg-stone-950 p-4 rounded-2xl border border-stone-800">
                <div className="flex justify-between text-[10px] uppercase font-bold text-stone-400 pb-1 border-b border-stone-800">
                  <span>Item & Portion</span>
                  <span>Qty x Rate</span>
                  <span>Total</span>
                </div>
                {showDetailModal.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-stone-300 font-medium">
                    <div className="max-w-[200px]">
                      <p className="text-white font-bold">{item.dishName}</p>
                      <p className="text-[10px] text-stone-500">{item.portionSize}</p>
                    </div>
                    <div className="text-stone-400">
                      {item.quantity} x ₹{item.unitPrice}
                    </div>
                    <div className="font-bold text-white">
                      ₹{item.lineTotal.toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}

                {/* Financial Deductions & Totals */}
                <div className="pt-3 border-t border-stone-800 space-y-1 text-xs text-stone-400">
                  <div className="flex justify-between">
                    <span>Items Subtotal:</span>
                    <span className="text-white">₹{showDetailModal.itemsSubtotal.toLocaleString('en-IN')}</span>
                  </div>
                  {showDetailModal.packagingCharge > 0 && (
                    <div className="flex justify-between">
                      <span>Packaging & Container Charge:</span>
                      <span>₹{showDetailModal.packagingCharge}</span>
                    </div>
                  )}
                  {showDetailModal.gstAmount > 0 && (
                    <div className="flex justify-between">
                      <span>GST (5% / 18%):</span>
                      <span>₹{showDetailModal.gstAmount}</span>
                    </div>
                  )}
                  {showDetailModal.discountAmount > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Discount / Promo:</span>
                      <span>-₹{showDetailModal.discountAmount}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-white pt-1 border-t border-stone-800">
                    <span>Gross Total Billed:</span>
                    <span className="text-emerald-400">₹{showDetailModal.grossAmount.toLocaleString('en-IN')}</span>
                  </div>
                  {showDetailModal.aggregatorCommissionAmount > 0 && (
                    <div className="flex justify-between text-xs text-rose-400 pt-1">
                      <span>Platform Commission ({showDetailModal.aggregatorCommissionPct}%):</span>
                      <span>-₹{showDetailModal.aggregatorCommissionAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-amber-300 pt-1 border-t border-stone-800">
                    <span>Net Kitchen Payout Realized:</span>
                    <span>₹{showDetailModal.netPayoutRevenue.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Print Buttons */}
            <div className="p-4 sm:p-5 border-t border-stone-800 bg-stone-950/90 backdrop-blur-md shrink-0 flex items-center justify-between gap-3">
              <button
                onClick={() => window.print()}
                className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print Kitchen KOT</span>
              </button>

              <button
                onClick={() => setShowDetailModal(null)}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-5 py-2.5 rounded-xl text-xs"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: DAY-END SETTLEMENT & RECONCILIATION SHEET */}
      {/* ==================================================================== */}
      {showSettlementModal && (
        <div 
          className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSettlementModal(false);
            }
          }}
        >
          <div className="bg-stone-900 border border-stone-800 w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn relative">
            <div className="p-4 sm:p-5 border-b border-stone-800 bg-stone-950/90 backdrop-blur-md shrink-0 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-400 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                  End-of-Day Financial Reconciliation
                </span>
                <h3 className="text-xl font-black text-white mt-1">Daily Day-End Settlement Sheet (15 Aug 2026)</h3>
                <p className="text-xs text-stone-400">
                  Multi-channel breakdown of gross collections, platform commission withholdings, and net bank realization.
                </p>
              </div>

              <button
                onClick={() => setShowSettlementModal(false)}
                className="p-2 text-stone-400 hover:text-white bg-stone-800 rounded-full border border-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Channel-wise Settlement Table */}
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 space-y-3">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] text-stone-500 uppercase border-b border-stone-800">
                    <tr>
                      <th className="pb-2">Channel</th>
                      <th className="pb-2 text-center">Orders</th>
                      <th className="pb-2 text-right">Gross Billing</th>
                      <th className="pb-2 text-right">Comm. Cut</th>
                      <th className="pb-2 text-right">Net Realized</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60 font-medium">
                    {channelChartData.map((ch, idx) => (
                      <tr key={idx} className="text-stone-300">
                        <td className="py-2.5 font-bold text-white flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ch.color }} />
                          <span>{ch.name}</span>
                        </td>
                        <td className="py-2.5 text-center font-bold">{ch.orders}</td>
                        <td className="py-2.5 text-right font-bold text-white">₹{ch.gross.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 text-right text-rose-400">
                          {ch.gross - ch.net > 0 ? `-₹${(ch.gross - ch.net).toLocaleString('en-IN')}` : '₹0'}
                        </td>
                        <td className="py-2.5 text-right font-black text-emerald-400">₹{ch.net.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                    {/* Totals */}
                    <tr className="font-black text-sm text-white pt-2 border-t-2 border-stone-700">
                      <td className="pt-3">Total Consolidated</td>
                      <td className="pt-3 text-center">{metrics.totalOrdersCount}</td>
                      <td className="pt-3 text-right text-emerald-400">₹{metrics.totalGrossRevenue.toLocaleString('en-IN')}</td>
                      <td className="pt-3 text-right text-rose-400">-₹{metrics.totalCommissions.toLocaleString('en-IN')}</td>
                      <td className="pt-3 text-right text-amber-300">₹{metrics.totalNetPayout.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Audit Signoff */}
              <div className="bg-stone-950/60 p-3 rounded-xl border border-stone-800 flex items-center justify-between text-xs text-stone-400">
                <span>Verified & Audited by: <strong className="text-white">MD Operations & Kitchen Head</strong></span>
                <span className="text-emerald-400 font-bold">✓ Daily Settlement Balanced</span>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-stone-800 bg-stone-950/90 backdrop-blur-md shrink-0 flex justify-end gap-3">
              <button
                onClick={() => window.print()}
                className="bg-stone-800 text-stone-200 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print Settlement Sheet</span>
              </button>
              <button
                onClick={() => setShowSettlementModal(false)}
                className="bg-emerald-500 text-stone-950 font-black px-5 py-2 rounded-xl text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
