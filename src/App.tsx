import React, { useState, useEffect } from 'react';
import { useAuth, mapBackendRoleToUserRole } from './context/AuthContext';
import { useCart } from './context/CartContext';
import { useStorefrontActions } from './hooks/useStorefrontActions';
import { isUiRoleAllowed } from './utils/roleGuard';
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
  KitchenBranchId,
  CloudKitchenBranch,
  MessCustomerAccount,
  MessDailyOrder,
  MessMealSlot
} from './types';
import { BLANK_CUSTOMER_PROFILE } from './data/blankProfile';
import { mapCustomerRequests } from './utils/dietMapping';
import { DietService } from './services/dietService';
import { usePublishedRecipes } from './hooks/usePublishedRecipes';

// Shared Layout Components
import { BrandHeader } from './components/common/BrandHeader';
import { BrandFooter } from './components/common/BrandFooter';
import { MenuCardModal } from './components/common/MenuCardModal';

// Customer Components
import { CustomerHome, CHEF_MENU_12_CATEGORIES, dishCount } from './components/customer/CustomerHome';
import { HealthProfileWizard } from './components/customer/HealthProfileWizard';
import { DietPlanBuilder } from './components/customer/DietPlanBuilder';
import { CustomerPlanReview } from './components/customer/CustomerPlanReview';
import { CustomerDashboard } from './components/customer/CustomerDashboard';
import { AuthModal } from './components/customer/AuthModal';
import { DirectCartCheckoutModal } from './components/customer/DirectCartCheckoutModal';
import { useOrderDeepLink } from './hooks/useOrderDeepLink';
import { DirectOrderTrackingModal } from './components/customer/DirectOrderTrackingModal';

// Kerala Mess
import { KeralaMessSection } from './components/mess/KeralaMessSection';

// Staff dashboards (the six approved roles: CUSTOMER views above, then Super Admin, Nutritionist, Trainer, Chef, Procurement)
import { AdminWorkspace } from './components/admin/AdminWorkspace';
import { NutritionistWorkspace } from './components/erp/NutritionistWorkspace';
import { TrainerWorkspace } from './components/staff/TrainerWorkspace';
import { ChefDashboard } from './components/erp/ChefDashboard';
import { ProcurementWorkspace } from './components/staff/ProcurementWorkspace';

export function App() {
  const auth = useAuth();
  const published = usePublishedRecipes(); // the customer menu = recipes a Super Admin published
  const cart = useCart();

  // Role & Navigation State
  // `requestedRole` is what the UI asked to show; `currentRole` is what is actually rendered. In production builds a staff
  // dashboard is only rendered for a session that holds the matching backend role (presentation hygiene - the backend
  // authorizes every API call regardless). Development builds keep the role sandbox.
  const [requestedRole, setCurrentRole] = useState<UserRole>('customer');
  const currentRole: UserRole = isUiRoleAllowed(requestedRole, auth.user?.roles, import.meta.env.DEV) ? requestedRole : 'customer';
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedMenuFilter, setSelectedMenuFilter] = useState<string>('All');

  // Direct (storefront) checkout / order-tracking modals. The cart itself lives on the SERVER (CartContext).
  const [isCartCheckoutOpen, setIsCartCheckoutOpen] = useState<boolean>(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState<boolean>(false);
  const [trackingLookupOrderNumber, setTrackingLookupOrderNumber] = useState<string>('');

  // Customer Profile & Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  // No demo data: the profile, diet requests and orders start EMPTY and are filled only from the signed-in customer's own server data.
  const [profile, setProfile] = useState<CustomerProfile>(BLANK_CUSTOMER_PROFILE);
  const [requests, setRequests] = useState<DietPlanRequest[]>([]);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  // Synchronize authenticated backend user with app state and load real customer biometrics
  useEffect(() => {
    if (auth.isAuthenticated && auth.user) {
      setIsLoggedIn(true);
      const mappedRole = mapBackendRoleToUserRole(auth.user.roles);
      setCurrentRole(mappedRole);

      if (mappedRole !== 'customer') return; // staff sessions have no customer profile or diet requests
      let cancelled = false;
      // Fetch the real persisted customer profile & biometrics, then the customer's own diet requests, from the backend API
      (async () => {
        try {
          const res = await CustomerService.getMyProfile();
          if (cancelled || !res.success || !res.data) return;
          setProfile(res.data);
          const mine = await DietService.getMyRequests();
          if (!cancelled) setRequests(mapCustomerRequests(mine, res.data));
        } catch {
          // The screens simply show their empty state; nothing is invented.
        }
      })();
      return () => {
        cancelled = true;
      };
    } else if (!auth.isLoading && !auth.isAuthenticated) {
      setIsLoggedIn(false);
      // A signed-out browser must never keep the previous person's data in memory.
      setProfile(BLANK_CUSTOMER_PROFILE);
      setRequests([]);
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

  // Workout plans are real data now (trainer API, shown by CustomerWorkouts); no fitness demo state exists here.

  // Modals State
  const [selectedRecipeModal, setSelectedRecipeModal] = useState<RecipeItem | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'signin' | 'signup' | 'employee_login' | 'health_capture'>('signin');
  const [authModalKey, setAuthModalKey] = useState(0); // bumping it re-opens the modal with a freshly loaded profile
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

  // Production: a staff role can only be presented after a real staff login; otherwise prompt employee sign-in.
  const handleRoleChangeRequest = (role: UserRole) => {
    if (isUiRoleAllowed(role, auth.user?.roles, import.meta.env.DEV)) {
      setCurrentRole(role);
    } else {
      setAuthModalInitialMode('employee_login');
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
    // P10A: Kerala Mess lives INSIDE the customer portal (one CUSTOMER identity); there is no separate workspace role.
    requireCustomerAuth(() => {
      setCurrentRole('customer');
      setActiveTab('kerala_mess');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  // Guard private tabs and customer roles from unauthenticated direct access
  useEffect(() => {
    if (!isLoggedIn && !auth.isAuthenticated) {
      if (activeTab === 'dashboard' || activeTab === 'health_profile' || activeTab === 'plan_review' || activeTab === 'plan_builder' || activeTab === 'kerala_mess') {
        setActiveTab('home');
      }
    } else if (isLoggedIn || auth.isAuthenticated) {
      // Restrict authenticated customers to valid customer portals only
      const userRoles = auth.user?.roles || ['CUSTOMER'];
      const hasStaffRole = userRoles.some(r => r !== 'CUSTOMER' && r !== 'MESS_CUSTOMER');
      if (!hasStaffRole && currentRole !== 'customer') {
        setCurrentRole('customer');
      }
    }
  }, [isLoggedIn, auth.isAuthenticated, activeTab, currentRole, auth.user]);

  // Active Pending Review Request for Customer
  const pendingCustomerRequest = requests.find(
    (r) => r.customerId === profile.id && (r.status === 'plan_ready' || r.status === 'under_review')
  ) || requests[0];

  // Callback when user updates health profile
  // The profile feeds the diet request, so the customer moves on only after the server stored it; a failure is shown, never hidden.
  const handleUpdateProfile = async (updatedProfile: CustomerProfile): Promise<boolean> => {
    setProfileSaveError(null);
    try {
      const res = await CustomerService.updateMyProfile(updatedProfile);
      if (!res.success || !res.data) throw new Error('profile not saved');
      setProfile(res.data);
      return true;
    } catch {
      setProfileSaveError('Your health profile could not be saved. Please check your connection and try again.');
      return false;
    }
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

  // Callback after the SERVER accepted the customer's approval of a plan. There is no diet-plan payment/checkout: approval is only an approval.
  const handlePlanApproved = (req: DietPlanRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'approved' as const } : r)));
  };

  // Storefront cart handlers: every add goes to the SERVER cart; unauthenticated users are asked to log in first.
  const isCustomerSession = auth.isAuthenticated || isLoggedIn;
  const { add: handleStorefrontAdd, buyNow: handleStorefrontBuyNow } = useStorefrontActions({
    isCustomerSession,
    requireCustomerAuth,
    addItem: cart.addItem,
    openCheckout: () => setIsCartCheckoutOpen(true)
  });

  // Order deep link (/orders/<orderNumber>): waits for the session restoration, requires a customer sign-in, then loads from the backend.
  const orderLink = useOrderDeepLink({
    authLoading: auth.isLoading,
    open: (orderNumber) => {
      setTrackingLookupOrderNumber(orderNumber);
      setIsTrackingModalOpen(true);
    },
    close: () => {
      setIsTrackingModalOpen(false);
      setTrackingLookupOrderNumber('');
    },
    requireAuth: requireCustomerAuth,
    isAuthenticated: auth.isAuthenticated
  });

  // A financial request reported that the session is gone: show the sign-in flow (the customer lands back where they were).
  const handleSessionExpired = () => {
    setAuthModalInitialMode('signin');
    setAuthModalOpen(true);
  };

  const handleOpenTrackingForOrder = (orderNumber?: string) => {
    if (orderNumber) {
      setTrackingLookupOrderNumber(orderNumber);
      orderLink.pushOrder(orderNumber);
    }
    setIsTrackingModalOpen(true);
  };

  // Header cart badge: figures come from the server cart.
  const cartItemsCount = cart.itemCount;
  const cartTotal = cart.cart?.itemsSubtotal ?? 0;

  return (
    <div className="min-h-screen bg-stone-950 text-white font-sans flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      
      {/* Universal Header with Role Switcher - Shown when not on video landing page */}
      {!(currentRole === 'customer' && activeTab === 'home') && (
        <BrandHeader
          currentRole={currentRole}
          onRoleChange={(role) => {
            handleRoleChangeRequest(role);
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
          hideRoleDemo={currentRole === 'customer' || activeTab === 'health_profile'}
          cartItemsCount={cartItemsCount}
          cartTotal={cartTotal}
          onOpenCart={() => requireCustomerAuth(() => setIsCartCheckoutOpen(true))}
          onOpenDirectTracking={() => requireCustomerAuth(() => setIsTrackingModalOpen(true))}
          onOpenKeralaMessPortal={handleOpenKeralaMessPortal}
        />
      )}

      {/* Main Screen Content Router */}
      <main className="flex-1">
        {profileSaveError && (
          <div role="alert" className="max-w-3xl mx-auto mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-sm font-bold text-rose-800 flex items-center justify-between gap-3">
            <span>{profileSaveError}</span>
            <button type="button" onClick={() => setProfileSaveError(null)} className="underline text-xs">Dismiss</button>
          </div>
        )}

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
                onRoleChange={(role) => handleRoleChangeRequest(role)}
                onOpenKeralaMessPortal={handleOpenKeralaMessPortal}
                onAddToCart={handleStorefrontAdd}
                onQuickBuy={handleStorefrontBuyNow}
                onOpenCart={() => requireCustomerAuth(() => setIsCartCheckoutOpen(true))}
                onOpenDirectTracking={() => requireCustomerAuth(() => setIsTrackingModalOpen(true))}
              />
            )}

            {activeTab === 'health_profile' && (
              <div className="max-w-5xl mx-auto px-4 py-8">
                <HealthProfileWizard
                  initialProfile={profile}
                  onSaveProfile={handleUpdateProfile}
                  onProceedToCustomerModule={() => {
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
                  onSubmitRequest={handleSubmitDietRequest}
                />
              </div>
            )}

            {activeTab === 'plan_review' && (
              <CustomerPlanReview
                request={pendingCustomerRequest}
                profile={profile}
                onApproved={handlePlanApproved}
                onRequestRevision={handleRequestRevision}
                onRejectPlan={handleRejectPlan}
                onOpenMenuModal={(recipe) => setSelectedRecipeModal(recipe)}
              />
            )}

            {activeTab === 'dashboard' && (
              <CustomerDashboard
                profile={profile}
                onNavigate={handleSelectCustomerTab}
                onOpenOrders={() => { setTrackingLookupOrderNumber(''); setIsTrackingModalOpen(true); }}
              />
            )}

            {activeTab === 'kerala_mess' && <KeralaMessSection onSessionExpired={handleSessionExpired} />}

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
                      Show All Categories ({published.status === 'ready' ? published.recipes.length : '…'} Dishes)
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
                              {published.status === 'ready' ? dishCount(published.recipes, cat.id) : '…'}
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

                {published.status === 'error' && (
                  <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">
                    <span>The menu could not be loaded.</span>
                    <button type="button" onClick={published.reload} className="font-black underline">Retry</button>
                  </div>
                )}
                {/* Filtered Recipe Cards */}
                {(() => {
                  const filtered = selectedMenuFilter === 'All'
                    ? published.recipes
                    : published.recipes.filter((r) => {
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

        {/* SUPER ADMIN WORKSPACE (platform administration; separate from the MD experience) */}
        {currentRole === 'super_admin' && <AdminWorkspace />}

        {/* STAFF DASHBOARDS (approved staff roles only) */}
        {currentRole === 'nutritionist' && (
          <NutritionistWorkspace onOpenMenuModal={(recipe) => setSelectedRecipeModal(recipe)} />
        )}

        {currentRole === 'trainer' && (
          <TrainerWorkspace />
        )}

        {currentRole === 'chef' && (
          <ChefDashboard onSessionExpired={handleSessionExpired} />
        )}

        {currentRole === 'procurement' && (
          <ProcurementWorkspace />
        )}

        {/* Delivery is operated by a SUPER_ADMIN from the admin workspace; there is no driver, POS, MD, FMCG, Tepache or aggregator workspace. */}

      </main>

      {/* Universal Footer */}
      <BrandFooter
        isCustomerRole={currentRole === 'customer'}
        onOpenAuthModal={() => {
          setAuthModalInitialMode('signin');
          setAuthModalOpen(true);
        }}
        onOpenEmployeeLogin={() => {
          setAuthModalInitialMode('employee_login');
          setAuthModalOpen(true);
        }}
      />

      {/* Modals */}
      {selectedRecipeModal && (
        <MenuCardModal
          recipe={selectedRecipeModal}
          onClose={() => setSelectedRecipeModal(null)}
          userRole={currentRole}
        />
      )}

      {authModalOpen && (
        <AuthModal
          key={authModalKey}
          isOpen={authModalOpen}
          onClose={() => { setAuthModalOpen(false); setAuthModalInitialMode('signin'); }}
          initialProfile={profile}
          initialMode={authModalInitialMode}
          onProfileLoaded={(stored) => {
            // Signed in, profile incomplete: re-open the modal on the health step, prefilled from what the server holds.
            setProfile(stored);
            setAuthModalInitialMode('health_capture');
            setAuthModalKey((k) => k + 1);
          }}
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

      {/* Direct FMCG & Tepache Cart & Checkout Modal */}
      <DirectCartCheckoutModal
        isOpen={isCartCheckoutOpen}
        onClose={() => setIsCartCheckoutOpen(false)}
        onSessionExpired={handleSessionExpired}
        onOpenTracking={(orderNum) => {
          setIsCartCheckoutOpen(false);
          handleOpenTrackingForOrder(orderNum);
        }}
      />

      {/* Customer order history & order detail (persisted server orders only) */}
      <DirectOrderTrackingModal
        isOpen={isTrackingModalOpen}
        onClose={() => {
          setIsTrackingModalOpen(false);
          setTrackingLookupOrderNumber('');
          orderLink.clearOrder();
        }}
        onSessionExpired={handleSessionExpired}
        initialOrderNumber={trackingLookupOrderNumber}
      />

    </div>
  );
}

export default App;
