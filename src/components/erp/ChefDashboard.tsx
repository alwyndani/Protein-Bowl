import React, { useState, useMemo } from 'react';
import { ProductionBatch, RecipeItem, Order, DietaryPreference, KitchenBranchId, MessKitchenBatchSummary } from '../../types';
import { INITIAL_PRODUCTION_BATCHES } from '../../data/mockData';
import { ALL_RECIPES } from '../../data/recipeDatabase';
import { INITIAL_MESS_KITCHEN_BATCHES } from '../../data/mockKeralaMessData';
import { DispatchLabelPrintModal, DispatchLabelItem, LabelTypeMode } from './DispatchLabelPrintModal';
import { 
  ChefHat, 
  CheckCircle2, 
  Clock, 
  Utensils, 
  Printer, 
  ShieldCheck, 
  Plus, 
  Sparkles, 
  FileText, 
  AlertCircle,
  Edit3,
  Search,
  Trash2,
  X,
  User,
  MapPin,
  Phone,
  Calendar,
  Layers,
  Filter,
  PackageCheck,
  Check,
  CheckSquare,
  Square,
  Flame,
  UserCheck,
  Truck,
  Building2
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface IndividualCustomerOrderItem {
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
  timeSlot: '9:00 AM Breakfast Slot' | '1:00 PM Lunch Slot' | '8:00 PM Dinner Slot';
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
}

interface ChefDashboardProps {
  orders: Order[];
  onOpenMenuModal: (recipe: RecipeItem) => void;
  selectedBranchId?: KitchenBranchId;
  onSelectBranch?: (branchId: KitchenBranchId) => void;
}

export const ChefDashboard: React.FC<ChefDashboardProps> = ({ 
  orders, 
  onOpenMenuModal,
  selectedBranchId = 'all',
  onSelectBranch
}) => {
  const [activeTab, setActiveTab] = useState<'production' | 'recipes' | 'labels' | 'kerala_mess'>('production');
  const [batches, setBatches] = useState<ProductionBatch[]>(INITIAL_PRODUCTION_BATCHES);
  const [messBatches, setMessBatches] = useState<MessKitchenBatchSummary[]>(INITIAL_MESS_KITCHEN_BATCHES);
  const [selectedMessSlotFilter, setSelectedMessSlotFilter] = useState<'all' | 'breakfast' | 'lunch' | 'dinner'>('all');

  const handleUpdateMessBatchStatus = (batchId: string, newStatus: MessKitchenBatchSummary['status']) => {
    setMessBatches(prev => prev.map(b => {
      if (b.id === batchId) {
        if (newStatus === 'ready_for_packing' || newStatus === 'cooking') {
          confetti({ particleCount: 30, spread: 45 });
        }
        return {
          ...b,
          status: newStatus,
          leadChef: 'Head Chef Suresh (Kerala Mess Incharge)'
        };
      }
      return b;
    }));
  };

  // Recipe Database Versioning State
  const [recipes, setRecipes] = useState<RecipeItem[]>(ALL_RECIPES);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Modal State for Edit or Create Recipe
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingRecipe, setEditingRecipe] = useState<RecipeItem | null>(null);

  // Form State for Add / Edit Recipe
  const [formRecipe, setFormRecipe] = useState<Partial<RecipeItem>>({
    name: '',
    category: 'Choice of Chicken – Air Fried',
    servingSize: '1 Portion (250g)',
    servingGrams: 250,
    calories: 320,
    protein: 35,
    carbs: 18,
    fat: 8,
    fiber: 4,
    dietaryTag: 'non-veg',
    cuisine: 'Kerala Traditional',
    ingredientsList: [
      { name: 'Fresh Boneless Chicken Breast', quantity: 200, unit: 'g' },
      { name: 'Extra Virgin Olive Oil', quantity: 10, unit: 'ml' },
      { name: 'Garlic & Herb Marinade', quantity: 15, unit: 'g' }
    ],
    prepSteps: [
      'Trim and dice chicken breast into equal bite-sized cubes.',
      'Marinate with garlic, lemon juice, salt, and extra virgin olive oil for 30 mins.',
      'Air fry at 180°C for 14 minutes until golden browned and juicy inside.'
    ],
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=600&q=80'
  });

  // Modal State for Viewing Prep Steps
  const [viewPrepRecipe, setViewPrepRecipe] = useState<RecipeItem | null>(null);

  // Individual Customer Orders for Packaging Labels
  const [individualOrders, setIndividualOrders] = useState<IndividualCustomerOrderItem[]>([
    {
      id: 'ord-lbl-001',
      orderRef: 'PB-ORD-8819',
      customerName: 'Anjali Ramesh',
      customerPhone: '+91 98765 43210',
      deliveryAddress: {
        street: 'Flat 402, Green Valley Heights, Panampilly Nagar',
        city: 'Kochi, Kerala',
        pincode: '682036',
        landmark: 'Near Avenue Center'
      },
      timeSlot: '9:00 AM Breakfast Slot',
      dishName: 'Kerala Steamed Puttu with Kadala Curry & Fresh Papaya Salad',
      portionSize: '1 Portion (300g)',
      calories: 380,
      protein: 18,
      carbs: 52,
      fat: 6,
      fiber: 9,
      prepTimestamp: '24-JUL-2026, 07:30 AM',
      dietaryNote: 'Includes Snack & Salad',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    },
    {
      id: 'ord-lbl-002',
      orderRef: 'PB-ORD-8820',
      customerName: 'Rahul Verma',
      customerPhone: '+91 91234 56789',
      deliveryAddress: {
        street: 'Plot 88, Edappally Toll, Near Lulu Mall',
        city: 'Kochi, Kerala',
        pincode: '682024',
        landmark: 'Opp. Oberon Mall'
      },
      timeSlot: '9:00 AM Breakfast Slot',
      dishName: 'High-Protein Oats & Chia Pudding Bowl with Berries',
      portionSize: '1 Portion (280g)',
      calories: 340,
      protein: 26,
      carbs: 38,
      fat: 8,
      fiber: 7,
      prepTimestamp: '24-JUL-2026, 07:45 AM',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    },
    {
      id: 'ord-lbl-101',
      orderRef: 'PB-ORD-8821',
      customerName: 'Anjali Ramesh',
      customerPhone: '+91 98765 43210',
      deliveryAddress: {
        street: 'Flat 402, Green Valley Heights, Panampilly Nagar',
        city: 'Kochi, Kerala',
        pincode: '682036',
        landmark: 'Near Avenue Center'
      },
      timeSlot: '1:00 PM Lunch Slot',
      dishName: 'Lemon Garlic Air-Fried Chicken with Kerala Matta Rice & Salad',
      portionSize: '1 Portion (350g)',
      calories: 420,
      protein: 38,
      carbs: 42,
      fat: 8,
      fiber: 5,
      prepTimestamp: '24-JUL-2026, 11:30 AM',
      dietaryNote: 'Includes Snack & Salad',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    },
    {
      id: 'ord-lbl-102',
      orderRef: 'PB-ORD-8822',
      customerName: 'Dr. Vikram Sethi',
      customerPhone: '+91 98450 11223',
      deliveryAddress: {
        street: 'Villa 12, Sobha City, Kakkanad',
        city: 'Kochi, Kerala',
        pincode: '682030',
        landmark: 'Opposite Infopark Phase 1'
      },
      timeSlot: '1:00 PM Lunch Slot',
      dishName: 'High Protein Avocado Chicken Salad with Lemon Dressing',
      portionSize: '1 Portion (300g)',
      calories: 380,
      protein: 42,
      carbs: 12,
      fat: 18,
      fiber: 8,
      prepTimestamp: '24-JUL-2026, 11:45 AM',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    },
    {
      id: 'ord-lbl-103',
      orderRef: 'PB-ORD-8823',
      customerName: 'Meera Nambiar',
      customerPhone: '+91 97455 88990',
      deliveryAddress: {
        street: 'Apartment 3B, Skyline Imperial, Kadavanthra',
        city: 'Kochi, Kerala',
        pincode: '682020',
        landmark: 'Behind Metro Station'
      },
      timeSlot: '1:00 PM Lunch Slot',
      dishName: 'Herbed Grilled Fish with Brown Rice & Veggies',
      portionSize: '1 Portion (280g)',
      calories: 350,
      protein: 35,
      carbs: 28,
      fat: 7,
      fiber: 4,
      prepTimestamp: '24-JUL-2026, 12:00 PM',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    },
    {
      id: 'ord-lbl-104',
      orderRef: 'PB-ORD-8824',
      customerName: 'Rahul Verma',
      customerPhone: '+91 91234 56789',
      deliveryAddress: {
        street: 'Plot 88, Edappally Toll, Near Lulu Mall',
        city: 'Kochi, Kerala',
        pincode: '682024',
        landmark: 'Opp. Oberon Mall'
      },
      timeSlot: '1:00 PM Lunch Slot',
      dishName: 'Lemon Herb Grilled Chicken Quinoa Power Bowl',
      portionSize: '1 Portion (320g)',
      calories: 460,
      protein: 45,
      carbs: 38,
      fat: 12,
      fiber: 6,
      prepTimestamp: '24-JUL-2026, 12:15 PM',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    },
    {
      id: 'ord-lbl-201',
      orderRef: 'PB-ORD-8825',
      customerName: 'Anjali Ramesh',
      customerPhone: '+91 98765 43210',
      deliveryAddress: {
        street: 'Flat 402, Green Valley Heights, Panampilly Nagar',
        city: 'Kochi, Kerala',
        pincode: '682036',
        landmark: 'Near Avenue Center'
      },
      timeSlot: '8:00 PM Dinner Slot',
      dishName: 'Mocha Protein Yogurt Bowl & Energy Truffles',
      portionSize: '1 Portion (240g)',
      calories: 320,
      protein: 28,
      carbs: 24,
      fat: 6,
      fiber: 4,
      prepTimestamp: '24-JUL-2026, 06:30 PM',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    },
    {
      id: 'ord-lbl-202',
      orderRef: 'PB-ORD-8826',
      customerName: 'Arjun Das',
      customerPhone: '+91 98951 22334',
      deliveryAddress: {
        street: 'House #14, Jawahar Nagar',
        city: 'Kochi, Kerala',
        pincode: '682020',
        landmark: 'Near Water Tank'
      },
      timeSlot: '8:00 PM Dinner Slot',
      dishName: 'Air-Fried Peri Peri Chicken Wings with Salad',
      portionSize: '1 Portion (250g)',
      calories: 380,
      protein: 38,
      carbs: 8,
      fat: 14,
      fiber: 3,
      prepTimestamp: '24-JUL-2026, 06:45 PM',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    },
    {
      id: 'ord-lbl-203',
      orderRef: 'PB-ORD-8827',
      customerName: 'Priya Nair',
      customerPhone: '+91 94471 00112',
      deliveryAddress: {
        street: 'Flat 8A, Trinity World, Kakkanad',
        city: 'Kochi, Kerala',
        pincode: '682030',
        landmark: 'Near Sunrise Hospital'
      },
      timeSlot: '8:00 PM Dinner Slot',
      dishName: 'Paneer Tikka Quinoa Stir Fry Bowl',
      portionSize: '1 Portion (260g)',
      calories: 390,
      protein: 24,
      carbs: 36,
      fat: 15,
      fiber: 5,
      prepTimestamp: '24-JUL-2026, 07:00 PM',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    },
    {
      id: 'ord-lbl-204',
      orderRef: 'PB-ORD-8828',
      customerName: 'Dr. Vikram Sethi',
      customerPhone: '+91 98450 11223',
      deliveryAddress: {
        street: 'Villa 12, Sobha City, Kakkanad',
        city: 'Kochi, Kerala',
        pincode: '682030',
        landmark: 'Opposite Infopark Phase 1'
      },
      timeSlot: '8:00 PM Dinner Slot',
      dishName: 'Lemon Garlic Chicken Grill with Tossed Greens',
      portionSize: '1 Portion (350g)',
      calories: 420,
      protein: 44,
      carbs: 14,
      fat: 12,
      fiber: 5,
      prepTimestamp: '24-JUL-2026, 07:15 PM',
      fssaiLicense: 'KITCHEN LIC NO. 11322007000341'
    }
  ]);

  // Label Tab State Filters & Customer Selection
  const [selectedSlotFilter, setSelectedSlotFilter] = useState<'9:00 AM Breakfast Slot' | '1:00 PM Lunch Slot' | '8:00 PM Dinner Slot' | 'All'>('1:00 PM Lunch Slot');
  const [labelSearchQuery, setLabelSearchQuery] = useState('');
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('All');

  // Selected Order IDs for batch printing across different people
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([
    'ord-lbl-101',
    'ord-lbl-102',
    'ord-lbl-103'
  ]);

  // Modal State for Label Printing
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printModalMode, setPrintModalMode] = useState<LabelTypeMode>('both');
  const [printTargetOrders, setPrintTargetOrders] = useState<IndividualCustomerOrderItem[]>([]);

  // Unique customers list for filter dropdown
  const allUniqueCustomers = useMemo(() => {
    return Array.from(new Set(individualOrders.map(o => o.customerName)));
  }, [individualOrders]);

  // Sorted and Filtered Orders for Label Tab
  const sortedAndFilteredOrders = useMemo(() => {
    return individualOrders
      .filter((ord) => {
        const matchesSlot = selectedSlotFilter === 'All' || ord.timeSlot === selectedSlotFilter;
        const matchesCustomer = selectedCustomerFilter === 'All' || ord.customerName === selectedCustomerFilter;
        const matchesSearch = ord.customerName.toLowerCase().includes(labelSearchQuery.toLowerCase()) ||
                              ord.dishName.toLowerCase().includes(labelSearchQuery.toLowerCase()) ||
                              ord.orderRef.toLowerCase().includes(labelSearchQuery.toLowerCase()) ||
                              ord.deliveryAddress.street.toLowerCase().includes(labelSearchQuery.toLowerCase());
        return matchesSlot && matchesCustomer && matchesSearch;
      })
      .sort((a, b) => a.customerName.localeCompare(b.customerName)); // ARRANGED ALPHABETICALLY BY NAME
  }, [individualOrders, selectedSlotFilter, selectedCustomerFilter, labelSearchQuery]);

  // Toggle single order selection
  const handleToggleOrderSelection = (id: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Select all currently filtered orders
  const handleSelectAllFiltered = () => {
    const allFilteredIds = sortedAndFilteredOrders.map(o => o.id);
    setSelectedOrderIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
  };

  // Deselect all
  const handleClearSelection = () => {
    setSelectedOrderIds([]);
  };

  // Select orders for a specific customer
  const handleSelectOrdersForCustomer = (custName: string) => {
    const customerOrderIds = individualOrders.filter(o => o.customerName === custName).map(o => o.id);
    setSelectedOrderIds(prev => Array.from(new Set([...prev, ...customerOrderIds])));
  };

  // Trigger print modal for currently selected orders (or specific order)
  const handleOpenPrintModal = (mode: LabelTypeMode, specificOrder?: IndividualCustomerOrderItem) => {
    setPrintModalMode(mode);
    if (specificOrder) {
      setPrintTargetOrders([specificOrder]);
    } else {
      const ordersToPrint = individualOrders.filter(o => selectedOrderIds.includes(o.id));
      if (ordersToPrint.length === 0) {
        setPrintTargetOrders(sortedAndFilteredOrders);
      } else {
        setPrintTargetOrders(ordersToPrint);
      }
    }
    setShowPrintModal(true);
  };

  // Batch Status Update
  const handleUpdateBatchStatus = (batchId: string, newStatus: ProductionBatch['status']) => {
    setBatches((prev) =>
      prev.map((b) => {
        if (b.id === batchId) {
          const isPassed = newStatus === 'packed' || newStatus === 'quality_check';
          if (isPassed) confetti({ particleCount: 40, spread: 50 });
          return {
            ...b,
            status: newStatus,
            qualitySignoffBy: isPassed ? 'Head Chef Suresh' : b.qualitySignoffBy,
            qualityPassed: isPassed ? true : b.qualityPassed
          };
        }
        return b;
      })
    );
  };

  // Handle Edit Click on Recipe Card
  const handleOpenEditRecipeModal = (recipe: RecipeItem) => {
    setModalMode('edit');
    setEditingRecipe(recipe);
    setFormRecipe({
      ...recipe,
      ingredientsList: recipe.ingredientsList?.length ? [...recipe.ingredientsList] : [
        { name: 'Fresh Main Ingredient', quantity: 150, unit: 'g' }
      ],
      prepSteps: recipe.prepSteps?.length ? [...recipe.prepSteps] : ['Prepare and serve hot.']
    });
    setShowRecipeModal(true);
  };

  // Handle Create New Menu Click
  const handleOpenAddRecipeModal = () => {
    setModalMode('add');
    setEditingRecipe(null);
    setFormRecipe({
      id: `rec-custom-${Date.now()}`,
      name: '',
      category: 'Choice of Chicken – Air Fried',
      servingSize: '1 Portion (250g)',
      servingGrams: 250,
      calories: 350,
      protein: 38,
      carbs: 15,
      fat: 8,
      fiber: 4,
      dietaryTag: 'non-veg',
      cuisine: 'Kerala Traditional',
      ingredientsList: [
        { name: 'Fresh Boneless Chicken', quantity: 200, unit: 'g' },
        { name: 'Extra Virgin Olive Oil', quantity: 10, unit: 'ml' }
      ],
      prepSteps: [
        'Clean and marinate ingredients with fresh spices.',
        'Cook in air fryer or oven until internal temp reaches 75°C.',
        'Pack hot in eco meal container with fresh garnish.'
      ],
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'
    });
    setShowRecipeModal(true);
  };

  // Handle Save Recipe Add/Edit Form
  const handleSaveRecipeForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRecipe.name?.trim()) return;

    const recipeToSave: RecipeItem = {
      id: formRecipe.id || `rec-${Date.now()}`,
      name: formRecipe.name.trim(),
      category: formRecipe.category || 'Choice of Chicken – Air Fried',
      servingSize: formRecipe.servingSize || '1 Portion (250g)',
      servingGrams: Number(formRecipe.servingGrams) || 250,
      calories: Number(formRecipe.calories) || 300,
      protein: Number(formRecipe.protein) || 30,
      carbs: Number(formRecipe.carbs) || 20,
      fat: Number(formRecipe.fat) || 8,
      fiber: Number(formRecipe.fiber) || 4,
      dietaryTag: (formRecipe.dietaryTag as DietaryPreference) || 'non-veg',
      cuisine: formRecipe.cuisine || 'Kerala Traditional',
      ingredientsList: formRecipe.ingredientsList || [],
      prepSteps: formRecipe.prepSteps || [],
      image: formRecipe.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
      rating: 4.9
    };

    if (modalMode === 'add') {
      setRecipes([recipeToSave, ...recipes]);
    } else {
      setRecipes((prev) => prev.map((r) => (r.id === recipeToSave.id ? recipeToSave : r)));
    }

    setShowRecipeModal(false);
    confetti({ particleCount: 50, spread: 70 });
  };

  // Dynamic Ingredient Row Helpers
  const handleAddIngredientRow = () => {
    setFormRecipe({
      ...formRecipe,
      ingredientsList: [
        ...(formRecipe.ingredientsList || []),
        { name: '', quantity: 50, unit: 'g' }
      ]
    });
  };

  const handleUpdateIngredientRow = (index: number, field: string, value: any) => {
    const list = [...(formRecipe.ingredientsList || [])];
    list[index] = { ...list[index], [field]: value };
    setFormRecipe({ ...formRecipe, ingredientsList: list });
  };

  const handleRemoveIngredientRow = (index: number) => {
    const list = [...(formRecipe.ingredientsList || [])];
    list.splice(index, 1);
    setFormRecipe({ ...formRecipe, ingredientsList: list });
  };

  // Dynamic Prep Steps Helpers
  const handleAddPrepStepRow = () => {
    setFormRecipe({
      ...formRecipe,
      prepSteps: [...(formRecipe.prepSteps || []), '']
    });
  };

  const handleUpdatePrepStepRow = (index: number, value: string) => {
    const steps = [...(formRecipe.prepSteps || [])];
    steps[index] = value;
    setFormRecipe({ ...formRecipe, prepSteps: steps });
  };

  const handleRemovePrepStepRow = (index: number) => {
    const steps = [...(formRecipe.prepSteps || [])];
    steps.splice(index, 1);
    setFormRecipe({ ...formRecipe, prepSteps: steps });
  };

  // Recipe Catalog Filter
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const matchesSearch = r.name.toLowerCase().includes(recipeSearch.toLowerCase()) ||
                            r.category.toLowerCase().includes(recipeSearch.toLowerCase()) ||
                            r.cuisine.toLowerCase().includes(recipeSearch.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || r.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [recipes, recipeSearch, selectedCategory]);

  const categories = ['All', 'Choice of Chicken – Air Fried', 'Choice of Salads – Non-Veg', 'Choice of Quinoa', 'Kerala Breakfast', 'Yogurt Bowls', 'Desserts & Protein Truffles'];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-950 via-stone-900 to-amber-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-orange-900/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-xs font-bold uppercase tracking-wider">
              <ChefHat className="w-3.5 h-3.5" />
              <span>Executive Chef & Kitchen Operations ERP</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black mt-2">
              Kitchen Production & Recipe Management
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-2xl leading-relaxed">
              Full recipe version control with portion sizes, precise ingredient quantities, method notes, and bifurcated customer label generation for 9 AM Breakfast, 1 PM Lunch & 8 PM Dinner dispatches.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 shrink-0 text-center">
            <div className="pr-4 border-r border-white/20">
              <span className="text-[10px] text-orange-200 font-bold uppercase block">Today's Batches</span>
              <span className="text-3xl font-black text-orange-400">115</span>
            </div>
            <div className="pl-2">
              <span className="text-[10px] text-amber-200 font-bold uppercase block">Menu Catalog</span>
              <span className="text-2xl font-black text-amber-300">{recipes.length} Dishes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-stone-200 pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'production', label: "📋 Daily Production Sheet", icon: FileText },
          { id: 'recipes', label: `📖 Recipe Database & Versioning (${recipes.length})`, icon: Utensils },
          { id: 'kerala_mess', label: "🍛 Kerala Mess & Mass Batches", icon: Flame },
          { id: 'labels', label: "🏷️ Order Dispatch", icon: Printer },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
                active
                  ? 'bg-orange-950 text-white shadow-lg'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Auto-Generated Production Sheet */}
      {activeTab === 'production' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-stone-900">Aggregated Recipe Portion Schedule</h3>
                <p className="text-xs text-stone-500">Auto-calculated total portion requirements for kitchen batch cooking</p>
              </div>
              <span className="text-xs font-bold text-orange-800 bg-orange-100 px-3 py-1 rounded-full border border-orange-200">
                Batch Date: 24-JUL-2026
              </span>
            </div>

            <div className="space-y-3">
              {batches.map((b) => (
                <div key={b.id} className="p-4 rounded-2xl border border-stone-200 bg-stone-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-orange-900 uppercase bg-orange-100 px-2.5 py-0.5 rounded-md border border-orange-200">
                        {b.totalPortions} Portions
                      </span>
                      <span className="text-xs font-bold text-stone-600">{b.timeSlot}</span>
                    </div>
                    <h4 className="font-black text-stone-900 text-base mt-1">{b.recipeName}</h4>
                    <p className="text-xs text-stone-500">Assigned: <span className="font-bold text-stone-700">{b.chefAssigned}</span> • Quality Check: <span className="font-bold text-emerald-800">{b.qualityPassed ? 'PASSED ✓' : 'PENDING'}</span></p>
                  </div>

                  {/* Batch Status Stepper Buttons */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {['in_prep', 'cooking', 'quality_check', 'packed'].map((st) => {
                      const active = b.status === st;
                      return (
                        <button
                          key={st}
                          onClick={() => handleUpdateBatchStatus(b.id, st as any)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase transition-all whitespace-nowrap ${
                            active
                              ? 'bg-orange-950 text-white shadow-xs'
                              : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {st.replace('_', ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Recipe Database & Versioning */}
      {activeTab === 'recipes' && (
        <div className="space-y-6 bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm">
          
          {/* Header & Add Recipe Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-stone-900 flex items-center gap-2">
                <Utensils className="w-5 h-5 text-orange-700" />
                <span>Recipe Database, Ingredients & Version Control</span>
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Click the <strong>Pencil icon</strong> to edit ingredient quantities, portion size & preparation notes, or click <strong>Add New Menu Item</strong>.
              </p>
            </div>

            <button
              onClick={handleOpenAddRecipeModal}
              className="bg-orange-950 hover:bg-stone-900 text-white font-black px-5 py-3 rounded-2xl text-xs transition-all shadow-md flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4 text-orange-400" />
              <span>Add New Menu Item / Recipe</span>
            </button>
          </div>

          {/* Search & Category Dropdown Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-stone-100">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                placeholder="Search recipe name, ingredient, or cuisine..."
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-10 pr-4 py-2 text-xs font-bold text-stone-900 outline-none focus:border-orange-800"
              />
            </div>

            {/* Category Select Dropdown */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="recipe-category-dropdown" className="text-xs font-bold text-stone-600 flex items-center gap-1.5 whitespace-nowrap">
                <Filter className="w-3.5 h-3.5 text-orange-800" />
                <span>Category:</span>
              </label>
              <select
                id="recipe-category-dropdown"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full sm:w-64 bg-stone-50 border border-stone-300 text-stone-900 font-extrabold text-xs rounded-2xl px-3.5 py-2 outline-none focus:border-orange-800 focus:ring-2 focus:ring-orange-800/10 cursor-pointer shadow-2xs"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? 'All Categories (Full Catalog)' : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Recipe Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((r) => (
              <div
                key={r.id}
                className="p-5 rounded-3xl border border-stone-200 bg-stone-50/80 hover:bg-white transition-all space-y-4 flex flex-col justify-between shadow-2xs hover:shadow-md relative group"
              >
                <div className="space-y-3">
                  {/* Category & Edit Pencil Icon */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-900 bg-orange-100 px-2.5 py-0.5 rounded-md border border-orange-200">
                      {r.category}
                    </span>

                    {/* PENCIL EDIT ICON FOR EXISTING RECIPES */}
                    <button
                      onClick={() => handleOpenEditRecipeModal(r)}
                      className="p-2 bg-white text-stone-700 hover:text-orange-900 hover:bg-orange-100 rounded-xl border border-stone-200 transition-all shadow-xs flex items-center gap-1 text-xs font-bold"
                      title="Edit Menu Recipe, Portion Size & Quantities"
                    >
                      <Edit3 className="w-4 h-4 text-orange-800" />
                      <span className="hidden group-hover:inline text-[11px]">Edit Recipe</span>
                    </button>
                  </div>

                  {/* Title & Serving Size */}
                  <div>
                    <h4 className="font-black text-stone-900 text-base leading-snug">{r.name}</h4>
                    <p className="text-xs text-stone-500 font-medium mt-0.5">
                      Cuisine: <strong className="text-stone-700">{r.cuisine}</strong> • Portion: <strong className="text-orange-950 font-extrabold">{r.servingSize}</strong>
                    </p>
                  </div>

                  {/* Macros Pill Box */}
                  <div className="bg-white p-3 rounded-2xl border border-stone-200 grid grid-cols-5 text-center text-xs font-bold gap-1">
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Cal</span>
                      <span className="text-orange-950 font-black">{r.calories}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Prot</span>
                      <span className="text-emerald-800 font-black">{r.protein}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Carb</span>
                      <span className="text-amber-800 font-black">{r.carbs}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Fat</span>
                      <span className="text-blue-800 font-black">{r.fat}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Fib</span>
                      <span className="text-teal-800 font-black">{r.fiber}g</span>
                    </div>
                  </div>

                  {/* SPECIFIED INGREDIENT QUANTITIES LIST */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                      Ingredients & Quantities Needed:
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {r.ingredientsList?.map((ing, i) => (
                        <span
                          key={i}
                          className="bg-white text-stone-800 text-[11px] font-extrabold px-2.5 py-1 rounded-lg border border-stone-200 flex items-center gap-1 shadow-2xs"
                        >
                          <span className="text-orange-900">•</span>
                          <span>{ing.name}:</span>
                          <span className="text-orange-950 bg-amber-100 px-1.5 py-0.2 rounded text-[10px]">
                            {ing.quantity} {ing.unit}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom View Prep Action */}
                <div className="pt-2 border-t border-stone-200 flex items-center gap-2">
                  <button
                    onClick={() => setViewPrepRecipe(r)}
                    className="w-full bg-white hover:bg-stone-100 border border-stone-300 text-stone-900 font-extrabold py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Utensils className="w-3.5 h-3.5 text-stone-600" />
                    <span>View Preparation Method ({r.prepSteps?.length || 0} Steps)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* TAB: Kerala Homestyle Mess & Aggregator Batch Production */}
      {activeTab === 'kerala_mess' && (
        <div className="space-y-6">
          {/* Top Banner for Kerala Mess KDS */}
          <div className="bg-gradient-to-r from-emerald-950 via-stone-900 to-amber-950 text-white p-6 sm:p-8 rounded-3xl border border-emerald-500/30 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold uppercase tracking-wider">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Central Cloud Kitchen Steam Kettles & Mass Batch Production</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black mt-2">
                  Kerala Mess Cooking Batches & Aggregator Buffer Manager
                </h3>
                <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
                  Real-time synchronization between <strong>Hostel Mess Subscribers</strong> and <strong>Swiggy/Zomato Reserved Buffers</strong>. Monitor kettle temperatures, batch volumes, and dispatch insulated hostel crates.
                </p>
              </div>

              {/* Quick Filter */}
              <div className="flex items-center gap-2 bg-stone-950/80 p-2 rounded-2xl border border-stone-800 shrink-0">
                <span className="text-xs font-bold text-stone-400 px-2">Slot:</span>
                {(['all', 'breakfast', 'lunch', 'dinner'] as const).map(slot => (
                  <button
                    key={slot}
                    onClick={() => setSelectedMessSlotFilter(slot)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black capitalize transition-all ${
                      selectedMessSlotFilter === slot
                        ? 'bg-emerald-500 text-stone-950 shadow-md'
                        : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-stone-800/80 text-xs">
              <div className="bg-stone-950/60 p-3 rounded-xl border border-stone-800">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Total Mess Orders</span>
                <span className="text-lg font-black text-emerald-400">
                  {messBatches.reduce((acc, b) => acc + b.messSubscriberPortions + b.dailyDirectPortions, 0)} meals
                </span>
              </div>
              <div className="bg-stone-950/60 p-3 rounded-xl border border-stone-800">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Swiggy/Zomato Reserved</span>
                <span className="text-lg font-black text-orange-400">
                  {messBatches.reduce((acc, b) => acc + b.swiggyZomatoReservedPortions, 0)} meals
                </span>
              </div>
              <div className="bg-stone-950/60 p-3 rounded-xl border border-stone-800">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Total Batch Volume</span>
                <span className="text-lg font-black text-amber-400">
                  {messBatches.reduce((acc, b) => acc + b.totalPortionsRequired, 0)} portions
                </span>
              </div>
              <div className="bg-stone-950/60 p-3 rounded-xl border border-stone-800">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Safety Compliance</span>
                <span className="text-lg font-black text-cyan-400 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4" />
                  100% Passed
                </span>
              </div>
            </div>
          </div>

          {/* Batches Grid */}
          <div className="grid grid-cols-1 gap-6">
            {messBatches
              .filter(b => selectedMessSlotFilter === 'all' || b.mealSlot === selectedMessSlotFilter)
              .map(batch => {
                const messPortions = batch.messSubscriberPortions + batch.dailyDirectPortions;
                const aggPortions = batch.swiggyZomatoReservedPortions;
                const messPercent = Math.round((messPortions / Math.max(batch.totalPortionsRequired, 1)) * 100);

                return (
                  <div 
                    key={batch.id}
                    className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm hover:shadow-md transition-all"
                  >
                    {/* Batch Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                            batch.mealSlot === 'lunch' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                            batch.mealSlot === 'breakfast' ? 'bg-orange-100 text-orange-900 border border-orange-300' :
                            'bg-purple-100 text-purple-900 border border-purple-300'
                          }`}>
                            {batch.mealSlot} Batch
                          </span>
                          <span className="text-xs font-mono font-bold text-stone-500">ID: {batch.id}</span>
                          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {batch.vesselScale}
                          </span>
                        </div>

                        <h4 className="text-xl font-black text-stone-900">{batch.dishName}</h4>
                        {batch.malayalamName && (
                          <p className="text-xs font-bold text-stone-500 font-sans">{batch.malayalamName}</p>
                        )}
                      </div>

                      {/* Status pill & temp probe */}
                      <div className="flex items-center gap-3">
                        {batch.temperatureCheckCelsius && (
                          <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl text-center">
                            <span className="text-[10px] uppercase font-bold text-amber-800 block">Kettle Probe</span>
                            <span className="text-xs font-black text-amber-900 flex items-center gap-1">
                              <Flame className="w-3.5 h-3.5 text-amber-600" />
                              {batch.temperatureCheckCelsius}°C
                            </span>
                          </div>
                        )}

                        <span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider ${
                          batch.status === 'ready_for_packing' ? 'bg-emerald-500 text-white' :
                          batch.status === 'cooking' ? 'bg-amber-500 text-stone-950 animate-pulse' :
                          batch.status === 'dispatched' ? 'bg-stone-900 text-white' :
                          'bg-stone-100 text-stone-700'
                        }`}>
                          {batch.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Portions Allocation Split */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
                      <div className="space-y-1">
                        <span className="text-[11px] text-stone-500 font-bold uppercase">1. Hostel Mess Subscribers</span>
                        <div className="text-lg font-black text-emerald-800">
                          {batch.messSubscriberPortions} meals
                        </div>
                        <span className="text-[10px] text-stone-500">Monthly / Weekly Pass holders</span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] text-stone-500 font-bold uppercase">2. Single Hostel Add-ons</span>
                        <div className="text-lg font-black text-emerald-700">
                          +{batch.dailyDirectPortions} meals
                        </div>
                        <span className="text-[10px] text-stone-500">Booked today via Mess Portal</span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] text-stone-500 font-bold uppercase">3. Swiggy / Zomato Reserved</span>
                        <div className="text-lg font-black text-orange-600">
                          {batch.swiggyZomatoReservedPortions} meals
                        </div>
                        <span className="text-[10px] text-stone-500">Protected aggregator retail buffer</span>
                      </div>
                    </div>

                    {/* Capacity Visual Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-stone-600">
                        <span>Mess Guaranteed: {messPortions} ({messPercent}%)</span>
                        <span>Aggregator Buffer: {aggPortions} ({100 - messPercent}%)</span>
                      </div>
                      <div className="w-full h-3 bg-stone-200 rounded-full overflow-hidden flex">
                        <div className="bg-emerald-600 h-full" style={{ width: `${messPercent}%` }} />
                        <div className="bg-orange-500 h-full" style={{ width: `${100 - messPercent}%` }} />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-stone-100">
                      <div className="flex items-center gap-2 text-xs text-stone-500">
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        <span>Assigned to: <strong className="text-stone-800">{batch.leadChef}</strong></span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleUpdateMessBatchStatus(batch.id, 'cooking')}
                          className="px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          <Flame className="w-3.5 h-3.5 text-amber-700" />
                          <span>Start Kettle Cooking</span>
                        </button>

                        <button
                          onClick={() => handleUpdateMessBatchStatus(batch.id, 'ready_for_packing')}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-colors shadow-sm flex items-center gap-1.5"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          <span>Ready for Packing / In Crate</span>
                        </button>

                        <button
                          onClick={() => handleUpdateMessBatchStatus(batch.id, 'dispatched')}
                          className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-black transition-colors shadow-sm flex items-center gap-1.5"
                        >
                          <Truck className="w-3.5 h-3.5 text-orange-400" />
                          <span>Dispatch to Hostel Routes</span>
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB 3: Printable Nutrition & Delivery Labels (Dual Labels per Order) */}
      {activeTab === 'labels' && (
        <div className="space-y-6 bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm">
          
          {/* Header Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-orange-900 bg-orange-100 px-2.5 py-0.5 rounded-md border border-orange-200">
                Packaging & Dispatch Terminal
              </span>
              <h3 className="text-xl font-black text-stone-900 mt-1">
                Order Dispatch & Batch Label Printing Engine
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Select orders across different customers and print <strong>only the stickers</strong> without any surrounding web menus or dashboard clutter.
              </p>
            </div>

            {/* Quick Batch Printing Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleOpenPrintModal('dispatch_only')}
                disabled={selectedOrderIds.length === 0}
                className="bg-orange-950 hover:bg-orange-900 text-white font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <MapPin className="w-3.5 h-3.5 text-orange-400" />
                <span>Print Address Labels ({selectedOrderIds.length})</span>
              </button>

              <button
                onClick={() => handleOpenPrintModal('nutrition_only')}
                disabled={selectedOrderIds.length === 0}
                className="bg-emerald-800 hover:bg-emerald-900 text-white font-black px-4 py-2.5 rounded-2xl text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Flame className="w-3.5 h-3.5 text-emerald-300" />
                <span>Print Nutrition Labels ({selectedOrderIds.length})</span>
              </button>

              <button
                onClick={() => handleOpenPrintModal('both')}
                className="bg-stone-950 hover:bg-stone-900 text-white font-black px-5 py-2.5 rounded-2xl text-xs flex items-center gap-2 shadow-lg transition-all"
              >
                <Printer className="w-4 h-4 text-orange-400" />
                <span>Print Both Labels ({selectedOrderIds.length > 0 ? selectedOrderIds.length : sortedAndFilteredOrders.length})</span>
              </button>
            </div>
          </div>

          {/* Timing Slot Bifurcation Filters, Customer Dropdown & Search */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200">
            {/* Slot Bifurcation Buttons */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <span className="text-xs font-bold text-stone-500 uppercase">Dispatch Slot:</span>
              {[
                { id: '9:00 AM Breakfast Slot', label: '🌅 9:00 AM Breakfast' },
                { id: '1:00 PM Lunch Slot', label: '☀️ 1:00 PM Lunch' },
                { id: '8:00 PM Dinner Slot', label: '🌙 8:00 PM Dinner' },
                { id: 'All', label: 'All Slots' }
              ].map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlotFilter(slot.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                    selectedSlotFilter === slot.id
                      ? 'bg-orange-950 text-white border-orange-950 shadow-xs'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {slot.label}
                </button>
              ))}
            </div>

            {/* Filter by Customer & Search input */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
              <select
                value={selectedCustomerFilter}
                onChange={(e) => setSelectedCustomerFilter(e.target.value)}
                className="bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-hidden focus:border-orange-800"
              >
                <option value="All">All Customers ({allUniqueCustomers.length})</option>
                {allUniqueCustomers.map((cust) => (
                  <option key={cust} value={cust}>{cust}</option>
                ))}
              </select>

              {/* Alphabetical Customer Search */}
              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  value={labelSearchQuery}
                  onChange={(e) => setLabelSearchQuery(e.target.value)}
                  placeholder="Search customer or dish..."
                  className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-3 py-1.5 text-xs font-bold text-stone-900 outline-none focus:border-orange-800"
                />
              </div>
            </div>
          </div>

          {/* BATCH SELECTION ACTION BAR */}
          <div className="bg-orange-50 border border-orange-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAllFiltered}
                className="bg-white hover:bg-orange-100 text-orange-950 font-black px-3 py-1.5 rounded-xl border border-orange-300 flex items-center gap-1.5 transition-all shadow-2xs"
              >
                <CheckSquare className="w-3.5 h-3.5 text-orange-900" />
                <span>Select All Filtered ({sortedAndFilteredOrders.length})</span>
              </button>

              <button
                onClick={handleClearSelection}
                className="text-stone-600 hover:text-stone-900 font-bold px-2 py-1"
              >
                Clear Selection
              </button>

              <span className="text-stone-700 font-extrabold">
                <strong className="text-orange-950 font-black">{selectedOrderIds.length}</strong> of {individualOrders.length} orders selected across different people
              </span>
            </div>

            {/* Quick Customer Selection Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
              <span className="text-[10px] font-bold text-stone-500 uppercase shrink-0">Select by Person:</span>
              {allUniqueCustomers.slice(0, 5).map((cust) => {
                const count = individualOrders.filter(o => o.customerName === cust).length;
                const isAllSelected = individualOrders.filter(o => o.customerName === cust).every(o => selectedOrderIds.includes(o.id));
                return (
                  <button
                    key={cust}
                    onClick={() => handleSelectOrdersForCustomer(cust)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all whitespace-nowrap ${
                      isAllSelected 
                        ? 'bg-orange-950 text-white border-orange-950' 
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {cust} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* DUAL LABELS LIST WITH SELECTIVE CHECKBOXES */}
          <div className="space-y-6">
            {sortedAndFilteredOrders.length === 0 ? (
              <div className="bg-stone-50 rounded-2xl p-8 text-center border border-stone-200">
                <p className="text-xs text-stone-500 font-bold">No dispatch orders matching the current filter criteria.</p>
              </div>
            ) : (
              sortedAndFilteredOrders.map((ord, index) => {
                const isSelected = selectedOrderIds.includes(ord.id);
                return (
                  <div
                    key={ord.id}
                    className={`p-6 rounded-3xl border transition-all space-y-4 shadow-xs ${
                      isSelected 
                        ? 'border-orange-500 bg-orange-50/20 ring-1 ring-orange-400' 
                        : 'border-stone-300 bg-stone-50/50'
                    }`}
                  >
                    {/* Order Customer Header with Checkbox & Print Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleOrderSelection(ord.id)}
                          className="w-5 h-5 rounded text-orange-950 focus:ring-orange-950 cursor-pointer"
                        />
                        <span className="w-6 h-6 rounded-full bg-orange-950 text-white text-xs font-black flex items-center justify-center">
                          {index + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-stone-900 text-sm">{ord.customerName}</span>
                            <span className="text-xs font-bold text-stone-500">({ord.orderRef})</span>
                            <span className="text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-950 px-2 py-0.5 rounded border border-orange-200">
                              {ord.timeSlot}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card-level Print Options */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenPrintModal('dispatch_only', ord)}
                          title="Print only customer address sticker for parcel"
                          className="px-2.5 py-1.5 bg-white border border-stone-300 text-stone-800 hover:bg-orange-50 hover:border-orange-300 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs"
                        >
                          <MapPin className="w-3.5 h-3.5 text-orange-800" />
                          <span>Address Sticker Only</span>
                        </button>

                        <button
                          onClick={() => handleOpenPrintModal('nutrition_only', ord)}
                          title="Print only meal nutrition sticker for food container"
                          className="px-2.5 py-1.5 bg-white border border-stone-300 text-stone-800 hover:bg-emerald-50 hover:border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs"
                        >
                          <Flame className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Nutrition Sticker Only</span>
                        </button>

                        <button
                          onClick={() => handleOpenPrintModal('both', ord)}
                          className="px-3 py-1.5 bg-stone-900 hover:bg-stone-950 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs"
                        >
                          <Printer className="w-3.5 h-3.5 text-orange-400" />
                          <span>Print Both (Pair)</span>
                        </button>
                      </div>
                    </div>

                    {/* THE 2 LABELS SIDE-BY-SIDE */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                      
                      {/* =================================================== */}
                      {/* LABEL 1: NUTRITION & PRODUCT FACTS CONTAINER STICKER */}
                      {/* =================================================== */}
                      <div className="bg-white p-5 rounded-2xl border-2 border-emerald-800 shadow-sm space-y-3 font-sans relative overflow-hidden">
                        {/* Kitchen License Banner */}
                        <div className="flex items-center justify-between bg-emerald-950 text-emerald-100 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Hygienic Kitchen Certified</span>
                          </span>
                          <span>{ord.fssaiLicense}</span>
                        </div>

                        {/* Dish Title & Portion Size */}
                        <div className="border-b border-stone-100 pb-2">
                          <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block">LABEL 1: NUTRITION FACTS STICKER</span>
                          <h4 className="text-base font-black text-stone-900 leading-snug mt-0.5">{ord.dishName}</h4>
                          <div className="flex items-center justify-between mt-1 text-xs">
                            <span className="font-extrabold text-orange-950">Serving Size: {ord.portionSize}</span>
                            <span className="font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">{ord.calories} kcal</span>
                          </div>
                        </div>

                        {/* Macro Grid */}
                        <div className="grid grid-cols-4 gap-2 text-center text-xs">
                          <div className="bg-stone-50 p-2 rounded-xl border border-stone-200">
                            <span className="text-[9px] text-stone-500 font-bold block uppercase">Protein</span>
                            <span className="font-black text-emerald-800">{ord.protein}g</span>
                          </div>
                          <div className="bg-stone-50 p-2 rounded-xl border border-stone-200">
                            <span className="text-[9px] text-stone-500 font-bold block uppercase">Net Carbs</span>
                            <span className="font-black text-amber-800">{ord.carbs}g</span>
                          </div>
                          <div className="bg-stone-50 p-2 rounded-xl border border-stone-200">
                            <span className="text-[9px] text-stone-500 font-bold block uppercase">Healthy Fat</span>
                            <span className="font-black text-blue-800">{ord.fat}g</span>
                          </div>
                          <div className="bg-stone-50 p-2 rounded-xl border border-stone-200">
                            <span className="text-[9px] text-stone-500 font-bold block uppercase">Fiber</span>
                            <span className="font-black text-teal-800">{ord.fiber}g</span>
                          </div>
                        </div>

                        {/* Timestamp & Consume within 3 hours */}
                        <div className="text-[10px] text-stone-600 pt-2 border-t border-stone-100 flex items-center justify-between font-mono">
                          <span>Prepared: <strong>{ord.prepTimestamp}</strong></span>
                          <span className="text-amber-950 font-black bg-amber-100 px-2.5 py-0.5 rounded border border-amber-300">Consume within 3 hours</span>
                        </div>
                      </div>

                      {/* =================================================== */}
                      {/* LABEL 2: CUSTOMER DISPATCH & DELIVERY ADDRESS STICKER */}
                      {/* =================================================== */}
                      <div className="bg-white p-5 rounded-2xl border-2 border-orange-900 shadow-sm space-y-3 font-sans relative overflow-hidden flex flex-col justify-between">
                        <div>
                          {/* Slot Badge */}
                          <div className="flex items-center justify-between bg-orange-950 text-orange-200 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-orange-400" />
                              <span>LABEL 2: CUSTOMER DISPATCH STICKER</span>
                            </span>
                            <span>{ord.timeSlot}</span>
                          </div>

                          {/* Customer Name & Phone */}
                          <div className="mt-3 border-b border-stone-100 pb-2">
                            <h4 className="text-lg font-black text-stone-900 uppercase tracking-tight">{ord.customerName}</h4>
                            <div className="flex items-center gap-1 text-xs font-extrabold text-orange-950 mt-0.5">
                              <Phone className="w-3.5 h-3.5 text-orange-700" />
                              <span>{ord.customerPhone}</span>
                            </div>
                          </div>

                          {/* Address & Landmark */}
                          <div className="text-xs space-y-1 mt-2 text-stone-800 font-medium leading-relaxed">
                            <div className="font-bold text-stone-900">{ord.deliveryAddress.street}</div>
                            <div>{ord.deliveryAddress.city} - <strong className="font-black text-stone-900">{ord.deliveryAddress.pincode}</strong></div>
                            {ord.deliveryAddress.landmark && (
                              <div className="text-[11px] text-stone-500">Landmark: {ord.deliveryAddress.landmark}</div>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-dashed border-stone-200 text-center font-mono">
                          <div className="text-xs tracking-widest font-black text-stone-950">
                            ||| | |||| || ||||| |||| || ||| |||| ||
                          </div>
                          <div className="text-[8px] text-stone-500">
                            * {ord.orderRef} * {ord.deliveryAddress.pincode} *
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

      {/* VIEW PREPARATION METHOD STEPS MODAL */}
      {viewPrepRecipe && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-900 bg-orange-100 px-2.5 py-0.5 rounded">
                  {viewPrepRecipe.category}
                </span>
                <h3 className="text-xl font-black text-stone-900 mt-1">{viewPrepRecipe.name}</h3>
                <p className="text-xs text-stone-500">Portion: {viewPrepRecipe.servingSize} ({viewPrepRecipe.servingGrams}g)</p>
              </div>
              <button
                onClick={() => setViewPrepRecipe(null)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ingredients with Quantities */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider">Required Ingredients & Quantities:</h4>
              <div className="flex flex-wrap gap-2">
                {viewPrepRecipe.ingredientsList?.map((ing, i) => (
                  <span key={i} className="bg-stone-100 text-stone-800 font-extrabold text-xs px-3 py-1.5 rounded-xl border border-stone-200">
                    {ing.name} - <strong className="text-orange-950">{ing.quantity} {ing.unit}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Prep Steps List */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider">Chef Preparation Instructions:</h4>
              <ol className="list-decimal list-inside space-y-2 text-xs text-stone-800 font-medium leading-relaxed bg-orange-50/60 p-4 rounded-2xl border border-orange-200">
                {viewPrepRecipe.prepSteps?.map((step, i) => (
                  <li key={i} className="pl-1">{step}</li>
                ))}
              </ol>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setViewPrepRecipe(null)}
                className="px-5 py-2.5 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800"
              >
                Close Preparation Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT / CREATE RECIPE MODAL */}
      {showRecipeModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-xl font-black text-stone-900">
                  {modalMode === 'add' ? 'Create New Menu Item & Recipe' : 'Edit Recipe & Version Control'}
                </h3>
                <p className="text-xs text-stone-500">Define menu title, portion size, ingredient quantities, and preparation method.</p>
              </div>
              <button
                onClick={() => setShowRecipeModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecipeForm} className="space-y-5 text-xs font-bold">
              
              {/* Recipe Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 mb-1">Recipe Dish Name</label>
                  <input
                    type="text"
                    required
                    value={formRecipe.name || ''}
                    onChange={(e) => setFormRecipe({ ...formRecipe, name: e.target.value })}
                    placeholder="e.g. Air-Fried Garlic Herb Chicken Breast"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Menu Category</label>
                  <select
                    value={formRecipe.category || 'Choice of Chicken – Air Fried'}
                    onChange={(e) => setFormRecipe({ ...formRecipe, category: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800 cursor-pointer"
                  >
                    {categories.filter((c) => c !== 'All').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Portion Size & Cuisine & Dietary Tag */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-700 mb-1">Portion Label</label>
                  <input
                    type="text"
                    required
                    value={formRecipe.servingSize || ''}
                    onChange={(e) => setFormRecipe({ ...formRecipe, servingSize: e.target.value })}
                    placeholder="e.g. 1 Portion (250g)"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Cuisine Style</label>
                  <input
                    type="text"
                    value={formRecipe.cuisine || ''}
                    onChange={(e) => setFormRecipe({ ...formRecipe, cuisine: e.target.value })}
                    placeholder="e.g. Kerala Traditional"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Dietary Tag</label>
                  <select
                    value={formRecipe.dietaryTag || 'non-veg'}
                    onChange={(e) => setFormRecipe({ ...formRecipe, dietaryTag: e.target.value as any })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800 cursor-pointer"
                  >
                    <option value="non-veg">Non-Veg</option>
                    <option value="veg">Vegetarian</option>
                    <option value="egg">Eggitarian</option>
                    <option value="vegan">Vegan</option>
                    <option value="keto">Keto</option>
                    <option value="high-protein">High Protein</option>
                  </select>
                </div>
              </div>

              {/* Nutrition Macros */}
              <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-200 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-orange-950 block">
                  Per Portion Nutrition Facts:
                </span>
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase block">Calories</label>
                    <input
                      type="number"
                      value={formRecipe.calories || 0}
                      onChange={(e) => setFormRecipe({ ...formRecipe, calories: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase">Protein (g)</label>
                    <input
                      type="number"
                      value={formRecipe.protein || 0}
                      onChange={(e) => setFormRecipe({ ...formRecipe, protein: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black text-emerald-800"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase">Carbs (g)</label>
                    <input
                      type="number"
                      value={formRecipe.carbs || 0}
                      onChange={(e) => setFormRecipe({ ...formRecipe, carbs: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black text-amber-800"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase">Fat (g)</label>
                    <input
                      type="number"
                      value={formRecipe.fat || 0}
                      onChange={(e) => setFormRecipe({ ...formRecipe, fat: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black text-blue-800"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase">Fiber (g)</label>
                    <input
                      type="number"
                      value={formRecipe.fiber || 0}
                      onChange={(e) => setFormRecipe({ ...formRecipe, fiber: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black text-teal-800"
                    />
                  </div>
                </div>
              </div>

              {/* DYNAMIC INGREDIENT LIST BUILDER WITH QUANTITIES */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    Ingredients & Quantities Required (Per Portion):
                  </label>
                  <button
                    type="button"
                    onClick={handleAddIngredientRow}
                    className="text-xs font-extrabold text-orange-950 bg-orange-100 hover:bg-orange-200 px-3 py-1 rounded-xl border border-orange-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Ingredient Row</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {formRecipe.ingredientsList?.map((ing, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-200">
                      <input
                        type="text"
                        required
                        placeholder="Ingredient Name (e.g. Chicken Breast)"
                        value={ing.name}
                        onChange={(e) => handleUpdateIngredientRow(idx, 'name', e.target.value)}
                        className="flex-1 bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none"
                      />
                      <input
                        type="number"
                        required
                        min="0.1"
                        step="any"
                        placeholder="Qty"
                        value={ing.quantity}
                        onChange={(e) => handleUpdateIngredientRow(idx, 'quantity', Number(e.target.value))}
                        className="w-20 bg-white border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center outline-none"
                      />
                      <select
                        value={ing.unit}
                        onChange={(e) => handleUpdateIngredientRow(idx, 'unit', e.target.value)}
                        className="w-20 bg-white border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold outline-none cursor-pointer"
                      >
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="liters">liters</option>
                        <option value="tbsp">tbsp</option>
                        <option value="tsp">tsp</option>
                        <option value="pcs">pcs</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredientRow(idx)}
                        className="p-1 text-stone-400 hover:text-rose-600 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* DYNAMIC PREP METHOD STEPS BUILDER */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    Preparation Method Instructions (Step-by-Step):
                  </label>
                  <button
                    type="button"
                    onClick={handleAddPrepStepRow}
                    className="text-xs font-extrabold text-orange-950 bg-orange-100 hover:bg-orange-200 px-3 py-1 rounded-xl border border-orange-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Step Note</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {formRecipe.prepSteps?.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-stone-400 w-5">{idx + 1}.</span>
                      <input
                        type="text"
                        required
                        placeholder="Describe chef step or notes on preparation method..."
                        value={step}
                        onChange={(e) => handleUpdatePrepStepRow(idx, e.target.value)}
                        className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-medium outline-none focus:ring-1 focus:ring-orange-800"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePrepStepRow(idx)}
                        className="p-1 text-stone-400 hover:text-rose-600 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowRecipeModal(false)}
                  className="px-4 py-2.5 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-orange-950 text-white rounded-xl text-xs font-black hover:bg-stone-900 shadow-md"
                >
                  {modalMode === 'add' ? 'Save New Menu Item' : 'Save Recipe Version Updates'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DEDICATED LABEL PRINTING TERMINAL MODAL */}
      <DispatchLabelPrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        selectedOrders={printTargetOrders}
        allAvailableOrders={sortedAndFilteredOrders}
        onToggleOrderSelection={handleToggleOrderSelection}
        onSelectAllInSlot={handleSelectAllFiltered}
        onClearSelection={handleClearSelection}
        initialLabelMode={printModalMode}
      />

    </div>
  );
};

