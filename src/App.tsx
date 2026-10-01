import React, { useState, useEffect } from 'react';
import { useAuth, mapBackendRoleToUserRole } from './context/AuthContext';
import { CustomerService } from './services/customerService';
import { 
  UserRole, 
  CustomerProfile, 
  DietPlanRequest, 
  Order, 
  RecipeItem,
  ClientWorkoutPlan,
  ProgressPhoto,
  OneOnOneVideoSession,
  OmnichannelOrder,
  KitchenBranchId,
  StaffUserAccount,
  CloudKitchenBranch,
  DirectGuestOrder,
  DirectCartItem,
  RetailCustomerAccount,
  MessCustomerAccount,
  MessDailyOrder,
  MessMealSlot
} from './types';
import { 
  INITIAL_CUSTOMER_PROFILE, 
  INITIAL_DIET_PLAN_REQUESTS, 
  INITIAL_ORDERS
} from './data/mockData';
import { INITIAL_OMNICHANNEL_ORDERS } from './data/mockOmnichannelData';
import { CLOUD_KITCHEN_BRANCHES } from './data/cloudKitchensData';
import { 
  INITIAL_WORKOUT_PLAN, 
  INITIAL_PROGRESS_PHOTOS, 
  INITIAL_VIDEO_SESSIONS 
} from './data/mockFitnessData';
import { INITIAL_DIRECT_ORDERS, INITIAL_RETAIL_ACCOUNTS } from './data/mockDirectOrdersData';
import { INITIAL_MESS_ACCOUNTS, INITIAL_MESS_DAILY_ORDERS } from './data/mockKeralaMessData';
import { ALL_RECIPES } from './data/recipeDatabase';

// Shared Layout Components
import { BrandHeader } from './components/common/BrandHeader';
import { BrandFooter } from './components/common/BrandFooter';
import { MenuCardModal } from './components/common/MenuCardModal';
import { SRSDownloadModal } from './components/common/SRSDownloadModal';

// Customer Components
import { CustomerHome, CHEF_MENU_12_CATEGORIES } from './components/customer/CustomerHome';
import { HealthProfileWizard } from './components/customer/HealthProfileWizard';
import { DietPlanBuilder } from './components/customer/DietPlanBuilder';
import { CustomerPlanReview } from './components/customer/CustomerPlanReview';
import { CustomerDashboard } from './components/customer/CustomerDashboard';
import { CheckoutModal } from './components/customer/CheckoutModal';
import { AuthModal } from './components/customer/AuthModal';
import { DirectCartCheckoutModal } from './components/customer/DirectCartCheckoutModal';
import { DirectOrderTrackingModal } from './components/customer/DirectOrderTrackingModal';

// Kerala Mess & Swiggy/Zomato Aggregator Portals
import { MessCustomerPortal } from './components/mess/MessCustomerPortal';
import { SwiggyZomatoAggregatorPortal } from './components/mess/SwiggyZomatoAggregatorPortal';

// ERP Staff Dashboards
import { MDDashboard } from './components/erp/MDDashboard';
import { NutritionistDashboard } from './components/erp/NutritionistDashboard';
import { TrainerDashboard } from './components/erp/TrainerDashboard';
import { ChefDashboard } from './components/erp/ChefDashboard';
import { ProcurementDashboard } from './components/erp/ProcurementDashboard';
import { DeliveryDashboard } from './components/erp/DeliveryDashboard';
import { POSDashboard } from './components/erp/POSDashboard';
import { BakeryFMCGDashboard } from './components/erp/BakeryFMCGDashboard';
import { TepacheBreweryDashboard } from './components/erp/TepacheBreweryDashboard';

export function App() {
  const auth = useAuth();

  // Role & Navigation State
  const [currentRole, setCurrentRole] = useState<UserRole>('customer');
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedMenuFilter, setSelectedMenuFilter] = useState<string>('All');
  const [currentBranchId, setCurrentBranchId] = useState<KitchenBranchId>('all');
  const [branches, setBranches] = useState<CloudKitchenBranch[]>(CLOUD_KITCHEN_BRANCHES);

  // Direct FMCG & Tepache Shopping Cart & Tracking State
  const [cartItems, setCartItems] = useState<DirectCartItem[]>([]);
  const [isCartCheckoutOpen, setIsCartCheckoutOpen] = useState<boolean>(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState<boolean>(false);
  const [trackingLookupOrderNumber, setTrackingLookupOrderNumber] = useState<string>('');
  const [retailAccounts, setRetailAccounts] = useState<RetailCustomerAccount[]>(INITIAL_RETAIL_ACCOUNTS);
  const [directOrders, setDirectOrders] = useState<DirectGuestOrder[]>(INITIAL_DIRECT_ORDERS);
  const [guestOrders, setGuestOrders] = useState<DirectGuestOrder[]>(INITIAL_DIRECT_ORDERS);
  const [isSRSModalOpen, setIsSRSModalOpen] = useState<boolean>(false);

  // Kerala Mess & Student Hostel State
  const [messAccounts, setMessAccounts] = useState<MessCustomerAccount[]>(INITIAL_MESS_ACCOUNTS);
  const [activeMessAccountId, setActiveMessAccountId] = useState<string>(INITIAL_MESS_ACCOUNTS[0]?.id || 'mess-cust-1');
  const [messOrders, setMessOrders] = useState<MessDailyOrder[]>(INITIAL_MESS_DAILY_ORDERS);

  const activeMessAccount = messAccounts.find(a => a.id === activeMessAccountId) || messAccounts[0];

  const handleUpdateMessAccount = (updatedAcc: MessCustomerAccount) => {
    setMessAccounts(prev => prev.map(a => a.id === updatedAcc.id ? updatedAcc : a));
  };

  const handlePlaceMessOrder = (newOrder: MessDailyOrder) => {
    setMessOrders(prev => [newOrder, ...prev]);
  };

  const handlePauseMeal = (orderId: string, mealSlot: MessMealSlot, date: string) => {
    setMessOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          orderStatus: 'paused_refunded',
          trackingSteps: [
            ...o.trackingSteps,
            { stage: 'Meal Paused / Home Trip Refunded', time: 'Just now', description: `Refund of ₹50 credited to student wallet for ${date} (${mealSlot}).`, completed: true }
          ]
        };
      }
      return o;
    }));
  };

  // Customer Profile & Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [profile, setProfile] = useState<CustomerProfile>(INITIAL_CUSTOMER_PROFILE);
  const [requests, setRequests] = useState<DietPlanRequest[]>(INITIAL_DIET_PLAN_REQUESTS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [omnichannelOrders, setOmnichannelOrders] = useState<OmnichannelOrder[]>(INITIAL_OMNICHANNEL_ORDERS);

  // Synchronize authenticated backend user with app state and load real customer biometrics
  useEffect(() => {
    if (auth.isAuthenticated && auth.user) {
      setIsLoggedIn(true);
      const mappedRole = mapBackendRoleToUserRole(auth.user.roles);
      setCurrentRole(mappedRole);

      // Fetch real persisted customer profile & biometrics from backend API
      CustomerService.getMyProfile().then((res) => {
        if (res.success && res.data) {
          setProfile(res.data);
        }
      }).catch((_err) => {
        // Fallback to local profile if API call fails
      });
    } else if (!auth.isLoading && !auth.isAuthenticated) {
      setIsLoggedIn(false);
    }
  }, [auth.isAuthenticated, auth.user, auth.isLoading]);

  // Dedicated Staff Portal Entrance route listener (/staff/login, #staff, ?portal=staff)
  useEffect(() => {
    const handleLocationCheck = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      const search = window.location.search;
      if (path.includes('/staff') || hash.includes('staff') || search.includes('portal=staff')) {
        setAuthModalInitialMode('employee_login');
        setAuthModalOpen(true);
      }
    };
    handleLocationCheck();
    window.addEventListener('popstate', handleLocationCheck);
    window.addEventListener('hashchange', handleLocationCheck);
    return () => {
      window.removeEventListener('popstate', handleLocationCheck);
      window.removeEventListener('hashchange', handleLocationCheck);
    };
  }, []);

  const handleLogout = async () => {
    await auth.logout();
    setIsLoggedIn(false);
    setCurrentRole('customer');
    setActiveTab('home');
  };

  // Add new branch outlet
  const handleAddBranch = (newBranch: CloudKitchenBranch) => {
    setBranches((prev) => [...prev, newBranch]);
  };

  // Switch to specific staff account & kitchen branch
  const handleSwitchStaffAccount = (staff: StaffUserAccount) => {
    setCurrentRole(staff.role as UserRole);
    setCurrentBranchId(staff.assignedBranchId);
  };

  // Omnichannel Handlers
  const handleAddOmnichannelOrder = (newOrder: OmnichannelOrder) => {
    setOmnichannelOrders((prev) => [newOrder, ...prev]);
  };

  const handleUpdateOmnichannelOrder = (updatedOrder: OmnichannelOrder) => {
    setOmnichannelOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
    );
  };

  const handleDeleteOmnichannelOrder = (orderId: string) => {
    setOmnichannelOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  // Fitness Module State
  const [workoutPlan, setWorkoutPlan] = useState<ClientWorkoutPlan>(INITIAL_WORKOUT_PLAN);
  const [progressPhotos, setProgressPhotos] = useState<ProgressPhoto[]>(INITIAL_PROGRESS_PHOTOS);
  const [videoSessions, setVideoSessions] = useState<OneOnOneVideoSession[]>(INITIAL_VIDEO_SESSIONS);

  // Modals State
  const [selectedRecipeModal, setSelectedRecipeModal] = useState<RecipeItem | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'signin' | 'signup' | 'employee_login'>('signin');
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [pendingCustomerAction, setPendingCustomerAction] = useState<(() => void) | null>(null);

  /**
   * Universal Reusable Customer Authentication Guard
   * Verifies real AuthContext/isLoggedIn status before performing customer-owned actions.
   * Prompts Customer Login for unauthenticated users and executes the pending action after login.
   */
  const requireCustomerAuth = (action: () => void) => {
    if (auth.isAuthenticated || isLoggedIn) {
      action();
    } else {
      setPendingCustomerAction(() => action);
      setAuthModalInitialMode('signin');
      setAuthModalOpen(true);
    }
  };

  const handleSelectCustomerTab = (tab: string) => {
    if (tab === 'home' || tab === 'menu') {
      setActiveTab(tab);
    } else {
      requireCustomerAuth(() => setActiveTab(tab));
    }
  };

  const handleOpenKeralaMessPortal = () => {
    requireCustomerAuth(() => {
      setCurrentRole('mess_customer');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  // Guard private tabs and customer roles from unauthenticated direct access
  useEffect(() => {
    if (!isLoggedIn && !auth.isAuthenticated) {
      if (activeTab === 'dashboard' || activeTab === 'health_profile' || activeTab === 'plan_review' || activeTab === 'plan_builder') {
        setActiveTab('home');
      }
      if (currentRole === 'mess_customer') {
        setCurrentRole('customer');
        setActiveTab('home');
      }
    } else if (isLoggedIn || auth.isAuthenticated) {
      // Restrict authenticated customers to valid customer portals only
      const userRoles = auth.user?.roles || ['CUSTOMER'];
      const hasStaffRole = userRoles.some(r => r !== 'CUSTOMER' && r !== 'MESS_CUSTOMER');
      if (!hasStaffRole && currentRole !== 'customer' && currentRole !== 'mess_customer') {
        setCurrentRole('customer');
      }
    }
  }, [isLoggedIn, auth.isAuthenticated, activeTab, currentRole, auth.user]);

  // Active Pending Review Request for Customer
  const pendingCustomerRequest = requests.find(
    (r) => r.customerId === profile.id && (r.status === 'plan_ready' || r.status === 'under_review')
  ) || requests[0];

  // Callback when user updates health profile
  const handleUpdateProfile = (updatedProfile: CustomerProfile) => {
    setProfile(updatedProfile);
    CustomerService.updateMyProfile(updatedProfile).then((res) => {
      if (res.success && res.data) {
        setProfile(res.data);
      }
    }).catch((_err) => {
      // Retain optimistic UI state if offline
    });
    setActiveTab('plan_builder');
  };

  // Callback when user submits new diet subscription request
  const handleSubmitDietRequest = (newRequest: DietPlanRequest) => {
    setRequests([newRequest, ...requests]);
    setActiveTab('plan_review');
  };

  // Callback when Nutritionist updates a plan
  const handleUpdatePlanByNutritionist = (updatedReq: DietPlanRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === updatedReq.id ? updatedReq : r)));
  };

  // Callback when Customer requests revision
  const handleRequestRevision = (reqId: string, notes: string) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === reqId) {
          return {
            ...r,
            status: 'under_review' as const,
            customerNotes: notes
          };
        }
        return r;
      })
    );
  };

  // Callback when Customer rejects plan
  const handleRejectPlan = (reqId: string) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === reqId ? { ...r, status: 'rejected' as const } : r))
    );
    setActiveTab('home');
  };

  // Callback when Customer approves & completes payment in CheckoutModal
  const handleOrderSuccess = (newOrder: Order) => {
    setOrders([newOrder, ...orders]);
    // Update request status to approved
    setRequests((prev) =>
      prev.map((r) => (r.id === newOrder.planId ? { ...r, status: 'approved' as const } : r))
    );
    setActiveTab('dashboard');
  };

  // Callback when Delivery status is updated
  const handleUpdateOrderStatus = (orderId: string, status: Order['orderStatus']) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, orderStatus: status } : o))
    );
  };

  // Direct Shopping Cart Handlers
  const handleAddToCart = (item: DirectCartItem) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.id === item.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + item.quantity
        };
        return updated;
      }
      return [...prev, item];
    });
  };

  const handleUpdateCartQuantity = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as DirectCartItem[]
    );
  };

  const handleRemoveFromCart = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  const handleQuickBuy = (item: DirectCartItem) => {
    handleAddToCart(item);
    setIsCartCheckoutOpen(true);
  };

  const handleDirectOrderPlaced = (
    order: DirectGuestOrder,
    customerAccount?: RetailCustomerAccount
  ) => {
    // Add to direct orders
    setDirectOrders((prev) => [order, ...prev]);
    setGuestOrders((prev) => [order, ...prev]);

    // Upsert retail customer account for instant tracking & deposit ledger
    if (customerAccount) {
      setRetailAccounts((prev) => {
        const exists = prev.some((acc) => acc.phone === customerAccount.phone);
        if (exists) {
          return prev.map((acc) => (acc.phone === customerAccount.phone ? customerAccount : acc));
        }
        return [customerAccount, ...prev];
      });
    }

    // Clear cart
    setCartItems([]);
  };

  const handleOpenTrackingForOrder = (orderNumber?: string) => {
    if (orderNumber) {
      setTrackingLookupOrderNumber(orderNumber);
    }
    setIsTrackingModalOpen(true);
  };

  const handleReorderBasket = (items: DirectCartItem[]) => {
    items.forEach((item) => handleAddToCart(item));
    setIsCartCheckoutOpen(true);
  };

  const cartItemsCount = cartItems.reduce((acc, i) => acc + i.quantity, 0);
  const cartTotal = cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

  return (
    <div className="min-h-screen bg-stone-950 text-white font-sans flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      
      {/* Universal Header with Role Switcher - Shown when not on video landing page */}
      {!(currentRole === 'customer' && activeTab === 'home') && (
        <BrandHeader
          currentRole={currentRole}
          onRoleChange={(role) => {
            setCurrentRole(role);
            if (role === 'customer') {
              setActiveTab(isLoggedIn ? 'dashboard' : 'home');
            }
          }}
          activeCustomerTab={activeTab}
          onSelectCustomerTab={(tab) => handleSelectCustomerTab(tab)}
          currentUser={isLoggedIn && activeTab !== 'health_profile' ? profile : null}
          onOpenAuthModal={() => {
            setAuthModalInitialMode('signin');
            setAuthModalOpen(true);
          }}
          onOpenEmployeeLogin={() => {
            setAuthModalInitialMode('employee_login');
            setAuthModalOpen(true);
          }}
          onLogout={handleLogout}
          activeOrdersCount={orders.length}
          hideRoleDemo={currentRole === 'customer' || activeTab === 'health_profile'}
          selectedBranchId={currentBranchId}
          onSelectBranch={(b) => setCurrentBranchId(b)}
          branches={branches}
          cartItemsCount={cartItemsCount}
          cartTotal={cartTotal}
          onOpenCart={() => requireCustomerAuth(() => setIsCartCheckoutOpen(true))}
          onOpenDirectTracking={() => requireCustomerAuth(() => setIsTrackingModalOpen(true))}
          onOpenSRS={() => setIsSRSModalOpen(true)}
          onOpenKeralaMessPortal={handleOpenKeralaMessPortal}
        />
      )}

      {/* Main Screen Content Router */}
      <main className="flex-1">
        
        {/* CUSTOMER PORTAL VIEWS */}
        {currentRole === 'customer' && (
          <>
            {activeTab === 'home' && (
              <CustomerHome
                onSelectTab={(tab) => handleSelectCustomerTab(tab)}
                onOpenMenuModal={(recipe) => setSelectedRecipeModal(recipe)}
                onOpenAuthModal={() => setAuthModalOpen(true)}
                isLoggedIn={isLoggedIn}
                currentUser={isLoggedIn ? profile : null}
                activeTab={activeTab}
                currentRole={currentRole}
                onRoleChange={(role) => setCurrentRole(role)}
                onOpenKeralaMessPortal={handleOpenKeralaMessPortal}
                onGuestOrderPlaced={(newOrder) => setGuestOrders(prev => [newOrder, ...prev])}
                cartItems={cartItems}
                onAddToCart={(item) => requireCustomerAuth(() => handleAddToCart(item))}
                onQuickBuy={(item) => requireCustomerAuth(() => handleQuickBuy(item))}
                onOpenCart={() => requireCustomerAuth(() => setIsCartCheckoutOpen(true))}
                onOpenDirectTracking={() => requireCustomerAuth(() => setIsTrackingModalOpen(true))}
              />
            )}

            {activeTab === 'health_profile' && (
              <div className="max-w-5xl mx-auto px-4 py-8">
                <HealthProfileWizard
                  initialProfile={profile}
                  onSaveProfile={handleUpdateProfile}
                  onProceedToCustomerModule={(updatedProfile) => {
                    setProfile(updatedProfile);
                    setIsLoggedIn(true);
                    setActiveTab('dashboard');
                  }}
                />
              </div>
            )}

            {activeTab === 'plan_builder' && (
              <div className="max-w-5xl mx-auto px-4 py-8">
                <DietPlanBuilder
                  profile={profile}
                  onSubmitPlanRequest={handleSubmitDietRequest}
                />
              </div>
            )}

            {activeTab === 'plan_review' && (
              <CustomerPlanReview
                request={pendingCustomerRequest}
                profile={profile}
                onApproveAndCheckout={() => setCheckoutModalOpen(true)}
                onRequestRevision={handleRequestRevision}
                onRejectPlan={handleRejectPlan}
                onOpenMenuModal={(recipe) => setSelectedRecipeModal(recipe)}
              />
            )}

            {activeTab === 'dashboard' && (
              <CustomerDashboard
                profile={profile}
                orders={orders}
                onOpenMenuModal={(recipe) => setSelectedRecipeModal(recipe)}
                workoutPlan={workoutPlan}
                onUpdateWorkoutPlanRequest={(level, split, reqs) => {
                  setWorkoutPlan(prev => ({ ...prev, fitnessLevel: level, splitType: split, specificRequirements: reqs }));
                }}
                progressPhotos={progressPhotos}
                onUploadProgressPhoto={(newPhoto) => setProgressPhotos(prev => [newPhoto, ...prev])}
                videoSessions={videoSessions}
                onBookVideoSession={(newSession) => setVideoSessions(prev => [newSession, ...prev])}
              />
            )}

            {activeTab === 'menu' && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-white">
                <div className="text-center max-w-2xl mx-auto space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-300 bg-emerald-500/20 px-3.5 py-1 rounded-full border border-emerald-500/40">
                    Certified Cloud Kitchen Menu Catalog
                  </span>
                  <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                    Chef-Crafted Healthy Menu (12 Categories)
                  </h1>
                  <p className="text-xs sm:text-sm text-stone-400">
                    All 12 categories viewable in one stance. Click any category below to filter or select "Show All".
                  </p>
                </div>

                {/* 12 Categories Stance Grid + All Filter */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                      Categories Grid ({CHEF_MENU_12_CATEGORIES.length} Categories)
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedMenuFilter('All')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        selectedMenuFilter === 'All'
                          ? 'bg-emerald-500 text-stone-950 border-emerald-500 font-black shadow-md'
                          : 'bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800'
                      }`}
                    >
                      Show All Categories ({ALL_RECIPES.length} Dishes)
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                    {CHEF_MENU_12_CATEGORIES.map((cat) => {
                      const active = selectedMenuFilter === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedMenuFilter(cat.id)}
                          className={`p-3 rounded-2xl text-left border transition-all flex flex-col justify-between ${
                            active
                              ? 'bg-emerald-950 text-white border-emerald-500 shadow-lg ring-1 ring-emerald-500/50'
                              : 'bg-stone-900 text-stone-200 border-stone-800 hover:border-emerald-500/50 hover:bg-stone-800'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className="text-xl">{cat.icon}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              active ? 'bg-emerald-400 text-stone-950 font-black' : 'bg-stone-800 text-stone-400'
                            }`}>
                              {cat.count}
                            </span>
                          </div>
                          <div>
                            <h4 className={`text-xs font-black leading-tight ${active ? 'text-emerald-300' : 'text-white'}`}>
                              {cat.title}
                            </h4>
                            <p className={`text-[9px] line-clamp-1 mt-0.5 ${active ? 'text-emerald-200' : 'text-stone-400'}`}>
                              {cat.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Filtered Recipe Cards */}
                {(() => {
                  const filtered = selectedMenuFilter === 'All'
                    ? ALL_RECIPES
                    : ALL_RECIPES.filter((r) => {
                        if (selectedMenuFilter === 'Desserts, Snacks & Bites') {
                          return r.category.includes('Dessert') || r.category.includes('Snacks') || r.category.includes('Bites') || r.category.includes('Beverage');
                        }
                        return r.category.toLowerCase().trim() === selectedMenuFilter.toLowerCase().trim();
                      });

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                      {filtered.map((recipe) => (
                        <div
                          key={recipe.id}
                          onClick={() => setSelectedRecipeModal(recipe)}
                          className="bg-stone-900 rounded-3xl border border-stone-800 overflow-hidden shadow-xl hover:shadow-2xl hover:border-emerald-500/50 transition-all cursor-pointer p-4 space-y-3 group flex flex-col justify-between"
                        >
                          <div>
                            <div className="relative h-44 overflow-hidden rounded-2xl">
                              <img src={recipe.image} alt={recipe.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              <div className="absolute top-2.5 left-2.5 bg-stone-950/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black text-emerald-400 border border-emerald-500/30">
                                {recipe.category}
                              </div>
                            </div>
                            <div className="pt-2">
                              <h3 className="font-extrabold text-white text-base leading-snug group-hover:text-emerald-400 transition-colors">{recipe.name}</h3>
                              <p className="text-xs text-stone-400 mt-0.5">{recipe.servingSize} • {recipe.cuisine || 'Healthy'}</p>
                              
                              <div className="grid grid-cols-4 gap-1.5 mt-3 text-center bg-stone-950 p-2.5 rounded-2xl border border-stone-800 text-xs font-bold">
                                <div>
                                  <span className="text-[9px] text-stone-500 block font-normal">CAL</span>
                                  <span className="text-white">{recipe.calories}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-stone-500 block font-normal">PRO</span>
                                  <span className="text-emerald-400">{recipe.protein}g</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-stone-500 block font-normal">CARB</span>
                                  <span className="text-amber-400">{recipe.carbs}g</span>
                                </div>
                                <div>
                                  <span className="text-[9px] text-stone-500 block font-normal">FAT</span>
                                  <span className="text-blue-400">{recipe.fat}g</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="text-xs font-bold text-emerald-400 flex items-center justify-between pt-1 border-t border-stone-800">
                            <span>Inspect Nutrition Table</span>
                            <span>→</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {/* ERP STAFF PORTAL VIEWS */}
        {currentRole === 'md' && (
          <MDDashboard 
            requests={requests} 
            orders={orders} 
            omnichannelOrders={omnichannelOrders}
            onAddOmnichannelOrder={handleAddOmnichannelOrder}
            onUpdateOmnichannelOrder={handleUpdateOmnichannelOrder}
            onDeleteOmnichannelOrder={handleDeleteOmnichannelOrder}
            selectedBranchId={currentBranchId}
            onSelectBranch={(b) => setCurrentBranchId(b)}
            onSwitchStaffAccount={handleSwitchStaffAccount}
            branches={branches}
            onAddBranch={handleAddBranch}
            onOpenSRS={() => setIsSRSModalOpen(true)}
          />
        )}

        {/* STANDALONE POS CASHIER & STATEWIDE OUTLET BILLING PORTAL */}
        {currentRole === 'pos' && (
          <POSDashboard
            branches={branches}
            selectedBranchId={currentBranchId}
            onSelectBranch={(b) => setCurrentBranchId(b)}
          />
        )}

        {currentRole === 'nutritionist' && (
          <NutritionistDashboard
            requests={requests}
            customerProfile={profile}
            onUpdatePlan={handleUpdatePlanByNutritionist}
            onOpenMenuModal={(recipe) => setSelectedRecipeModal(recipe)}
          />
        )}

        {currentRole === 'trainer' && (
          <TrainerDashboard
            clientProfile={profile}
            workoutPlan={workoutPlan}
            onUpdateWorkoutPlan={(updatedPlan) => setWorkoutPlan(updatedPlan)}
            progressPhotos={progressPhotos}
            videoSessions={videoSessions}
            onUpdateVideoSessions={(sessions) => setVideoSessions(sessions)}
          />
        )}

        {currentRole === 'chef' && (
          <ChefDashboard
            orders={orders}
            onOpenMenuModal={(recipe) => setSelectedRecipeModal(recipe)}
            selectedBranchId={currentBranchId}
            onSelectBranch={(b) => setCurrentBranchId(b)}
          />
        )}

        {currentRole === 'procurement' && (
          <ProcurementDashboard 
            orders={orders}
            selectedBranchId={currentBranchId}
            onSelectBranch={(b) => setCurrentBranchId(b)}
          />
        )}

        {currentRole === 'delivery' && (
          <DeliveryDashboard
            orders={orders}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            selectedBranchId={currentBranchId}
            onSelectBranch={(b) => setCurrentBranchId(b)}
          />
        )}

        {/* KERALA MESS HOSTEL & STUDENT CUSTOMER PORTAL */}
        {currentRole === 'mess_customer' && (
          <MessCustomerPortal
            accounts={messAccounts}
            activeAccount={activeMessAccount}
            onUpdateAccount={handleUpdateMessAccount}
            orders={messOrders}
            onPlaceMessOrder={handlePlaceMessOrder}
            onPauseMeal={handlePauseMeal}
            selectedBranchId={currentBranchId}
            onSelectBranch={(b) => setCurrentBranchId(b)}
            onSwitchToChef={() => setCurrentRole('chef')}
            onSwitchToAggregator={() => setCurrentRole('swiggy_zomato')}
          />
        )}

        {/* SWIGGY & ZOMATO AGGREGATOR BUFFER MANAGER */}
        {currentRole === 'swiggy_zomato' && (
          <SwiggyZomatoAggregatorPortal
            selectedBranchId={currentBranchId}
            onSelectBranch={(b) => setCurrentBranchId(b)}
            onSwitchToChef={() => setCurrentRole('chef')}
            onSwitchToMessCustomer={() => setCurrentRole('mess_customer')}
          />
        )}

        {currentRole === 'bakery_fmcg' && (
          <BakeryFMCGDashboard
            onSwitchRole={(r) => setCurrentRole(r as UserRole)}
          />
        )}

        {currentRole === 'tepache_erp' && (
          <TepacheBreweryDashboard
            onBackToHome={() => setCurrentRole('customer')}
            guestOrders={guestOrders}
          />
        )}

      </main>

      {/* Universal Footer */}
      <BrandFooter
        isCustomerRole={currentRole === 'customer' || currentRole === 'mess_customer'}
        onOpenAuthModal={() => {
          setAuthModalInitialMode('signin');
          setAuthModalOpen(true);
        }}
        onOpenEmployeeLogin={() => {
          setAuthModalInitialMode('employee_login');
          setAuthModalOpen(true);
        }}
        onOpenSRS={() => setIsSRSModalOpen(true)}
      />

      {/* Modals */}
      {selectedRecipeModal && (
        <MenuCardModal
          recipe={selectedRecipeModal}
          isOpen={!!selectedRecipeModal}
          onClose={() => setSelectedRecipeModal(null)}
          userRole={currentRole}
        />
      )}

      {authModalOpen && (
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialProfile={profile}
          initialMode={authModalInitialMode}
          onSuccessLogin={(authenticatedUser) => {
            setProfile(authenticatedUser);
            setIsLoggedIn(true);
            if (pendingCustomerAction) {
              const action = pendingCustomerAction;
              setPendingCustomerAction(null);
              action();
            } else {
              setActiveTab('dashboard');
            }
          }}
          onEmployeeLogin={(role, staffData) => {
            setCurrentRole(role);
            setAuthModalOpen(false);
          }}
        />
      )}

      {checkoutModalOpen && pendingCustomerRequest && (
        <CheckoutModal
          isOpen={checkoutModalOpen}
          onClose={() => setCheckoutModalOpen(false)}
          request={pendingCustomerRequest}
          profile={profile}
          onOrderSuccess={handleOrderSuccess}
        />
      )}

      {/* Direct FMCG & Tepache Cart & Checkout Modal */}
      <DirectCartCheckoutModal
        isOpen={isCartCheckoutOpen}
        onClose={() => setIsCartCheckoutOpen(false)}
        cartItems={cartItems}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onOrderConfirmed={handleDirectOrderPlaced}
        existingAccounts={retailAccounts}
        onOpenTracking={(orderNum) => {
          setIsCartCheckoutOpen(false);
          handleOpenTrackingForOrder(orderNum);
        }}
      />

      {/* Direct Order Live Tracking & Customer Account Ledger Modal */}
      <DirectOrderTrackingModal
        isOpen={isTrackingModalOpen}
        onClose={() => {
          setIsTrackingModalOpen(false);
          setTrackingLookupOrderNumber('');
        }}
        orders={directOrders}
        accounts={retailAccounts}
        initialOrderNumber={trackingLookupOrderNumber}
        onReorderItems={handleReorderBasket}
      />

      {/* Software Requirements Specification (SRS) Modal */}
      <SRSDownloadModal
        isOpen={isSRSModalOpen}
        onClose={() => setIsSRSModalOpen(false)}
      />

    </div>
  );
}

export default App;
