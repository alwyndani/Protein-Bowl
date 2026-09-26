import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Sparkles,
  ArrowRight,
  Flame,
  ShieldCheck,
  Zap,
  Scale,
  Upload,
  Volume2,
  VolumeX,
  Video,
  Maximize2,
  Utensils,
  User,
  ShoppingBag,
  Building2,
  Stethoscope,
  Dumbbell,
  ChefHat,
  Package,
  Truck,
  ChevronDown,
  Calculator,
  Boxes,
  Store,
  FlaskConical
} from 'lucide-react';

import { CustomerProfile, UserRole } from '../../types';
import { LogoMark } from '../common/LogoMark';
import heroMealImg from '../../assets/images/cinematic_hero_meal_1785490286643.jpg';
import rawHarvestImg from '../../assets/images/fresh_harvest_raw_1785490318214.jpg';
import cloudBoxImg from '../../assets/images/cloud_kitchen_box_1785490338740.jpg';

interface CinematicHeroAnimationProps {
  activeTab?: string;
  onSelectTab: (tab: string) => void;
  onOpenAuthModal: () => void;
  isLoggedIn?: boolean;
  currentUser?: CustomerProfile | null;
  currentRole?: UserRole;
  onRoleChange?: (role: UserRole) => void;
  cartItemsCount?: number;
  cartTotal?: number;
  onOpenCart?: () => void;
  onOpenDirectTracking?: () => void;
}

export const CinematicHeroAnimation: React.FC<CinematicHeroAnimationProps> = ({
  activeTab = 'home',
  onSelectTab,
  onOpenAuthModal,
  isLoggedIn = false,
  currentUser = null,
  currentRole = 'customer',
  onRoleChange,
  cartItemsCount = 0,
  cartTotal = 0,
  onOpenCart,
  onOpenDirectTracking
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number>(0);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fallback high-resolution visual slides if no video file uploaded yet
  const fallbackFrames = [
    { title: 'Raw Salmon & Whole Protein Harvest', image: rawHarvestImg },
    { title: 'Eco-Sealed Cloud Kitchen Box', image: cloudBoxImg },
    { title: 'Plated High-Protein Grain Bowl', image: heroMealImg }
  ];

  // Read saved video from LocalStorage on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem('hero_landing_video_url');
    const savedName = localStorage.getItem('hero_landing_video_name');
    if (savedUrl) {
      setUploadedVideoUrl(savedUrl);
      if (savedName) setVideoFileName(savedName);
    }
  }, []);

  // Auto animation loop for image fallback
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && !uploadedVideoUrl) {
      interval = setInterval(() => {
        setCurrentFrameIdx((prev) => (prev + 1) % fallbackFrames.length);
      }, 4500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, uploadedVideoUrl, fallbackFrames.length]);

  // Handle local video file upload from user
  const handleProcessVideoFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('Please select a valid MP4 or WebM video file.');
      return;
    }
    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);
    setVideoFileName(file.name);
    localStorage.setItem('hero_landing_video_url', url);
    localStorage.setItem('hero_landing_video_name', file.name);
    setIsPlaying(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleProcessVideoFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (currentRole !== 'customer') {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = () => {
    if (currentRole !== 'customer') {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (currentRole !== 'customer') {
      setIsDraggingOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleProcessVideoFile(file);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  const handleToggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const [employeeModalOpen, setEmployeeModalOpen] = useState<boolean>(false);

  const websiteTabs = [
    { id: 'home', label: 'Home' },
    { id: 'who_we_are', label: 'Who We Are' },
    { id: 'menu', label: 'Menu' },
    { id: 'plan_builder', label: 'Subscription Packages' },
    { id: 'dashboard', label: 'My Subscriptions' },
  ];

  // To retrieve any hidden employee role later, remove its role ID from this list (or set to [])
  const HIDDEN_EMPLOYEE_ROLES = ['pos', 'bakery_fmcg', 'tepache_erp'];

  const employeeRoles = [
    {
      role: 'md',
      title: 'MD Executive Portal',
      desc: 'Executive Analytics, P&L & Omnichannel Oversight',
      icon: <Building2 className="w-5 h-5 text-amber-400" />,
      badge: 'Headquarters'
    },
    {
      role: 'pos',
      title: 'POS Counter Billing',
      desc: 'Cloud Cashier, Quick Dine-in & Takeaway Invoicing',
      icon: <Calculator className="w-5 h-5 text-indigo-400" />,
      badge: 'Storefront POS'
    },
    {
      role: 'bakery_fmcg',
      title: 'Packaged Foods & FMCG',
      desc: 'Bakery Batch Control, Shelf Life & Retail Distribution',
      icon: <Boxes className="w-5 h-5 text-amber-400" />,
      badge: 'Retail & Bakery'
    },
    {
      role: 'tepache_erp',
      title: 'Tepache Brewery & Sourcing ERP',
      desc: 'Fermentation Tanks, Organic Sourcing, B2B Distribution, Returns & Payments',
      icon: <FlaskConical className="w-5 h-5 text-emerald-400" />,
      badge: 'Fermentation Hub'
    },
    {
      role: 'chef',
      title: 'Kitchen Chef ERP',
      desc: 'Recipe BOM Preparation, Daily KOTs & Production Schedule',
      icon: <ChefHat className="w-5 h-5 text-orange-400" />,
      badge: 'Production'
    },
    {
      role: 'nutritionist',
      title: 'Dietician Workspace',
      desc: 'Macro Calculations, Clinical Audits & Custom Meal Approvals',
      icon: <Stethoscope className="w-5 h-5 text-teal-400" />,
      badge: 'Clinical'
    },
    {
      role: 'trainer',
      title: 'Trainer Dashboard',
      desc: 'Workout Plan Variations & 1-on-1 Live Coaching Sessions',
      icon: <Dumbbell className="w-5 h-5 text-emerald-400" />,
      badge: 'Fitness'
    },
    {
      role: 'procurement',
      title: 'Procurement ERP',
      desc: 'Vendor PO Orders, Raw Inventory & Cold Storage',
      icon: <Package className="w-5 h-5 text-blue-400" />,
      badge: 'Supply Chain'
    },
    {
      role: 'delivery',
      title: 'Logistics & Delivery',
      desc: 'Thermal Dispatch, Route Dispatching & Live Tracking',
      icon: <Truck className="w-5 h-5 text-purple-400" />,
      badge: 'Fleet Dispatch'
    },
  ].filter(item => !HIDDEN_EMPLOYEE_ROLES.includes(item.role));

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative w-full min-h-screen overflow-hidden bg-stone-950 text-white transition-all ${isDraggingOver && currentRole !== 'customer' ? 'ring-8 ring-emerald-500/50' : ''
        }`}
    >

      {/* Drag & Drop Visual Overlay (Admin Only) */}
      {isDraggingOver && currentRole !== 'customer' && (
        <div className="absolute inset-0 z-50 bg-emerald-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-3 animate-fadeIn">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-300 rounded-full flex items-center justify-center border-2 border-emerald-400">
            <Upload className="w-10 h-10 animate-bounce" />
          </div>
          <h3 className="text-2xl font-black text-white">Drop Your Video File Here</h3>
          <p className="text-sm text-emerald-200">Release to fit this MP4 video directly to the full landing screen</p>
        </div>
      )}

      {/* Edge-to-Edge Full Screen Background Video */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {uploadedVideoUrl ? (
          <video
            ref={videoRef}
            src={uploadedVideoUrl}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            className="w-full h-full object-cover scale-105"
          />
        ) : (
          <div className="absolute inset-0 z-0">
            {fallbackFrames.map((frame, idx) => (
              <div
                key={idx}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${currentFrameIdx === idx ? 'opacity-100 scale-105' : 'opacity-0 scale-100 pointer-events-none'
                  }`}
              >
                <img
                  src={frame.image}
                  alt={frame.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-[6000ms] ease-out scale-110"
                />
              </div>
            ))}
          </div>
        )}

        {/* Cinematic Lighting Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950/95 via-stone-950/60 to-transparent z-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-stone-950/80 via-transparent to-stone-950/90 z-10" />
      </div>

      {/* 1. SEAMLESS TOP NAVBAR MERGED DIRECTLY INTO THE VIDEO OVERLAY */}
      <div className="relative z-30 w-full pt-6 px-6 sm:px-10 lg:px-14">
        <div className="max-w-7xl mx-auto flex items-center justify-between py-2">

          {/* Brand Logo inside Video */}
          <div
            onClick={() => onSelectTab('home')}
            className="cursor-pointer group"
          >
            <LogoMark size="md" variant="white" />
          </div>

          {/* Navigation links removed per user request */}

          {/* SIMPLIFIED LOGINS & CART CONTROLS */}
          <div className="flex items-center gap-2 sm:gap-3">

            {/* 
              FEATURE FLAG: Set SHOW_TRACK_AND_CART = true to bring back Track Orders and Cart buttons!
            */}
            {/* Track Orders Button */}
            {true /* set to true to retrieve */ && onOpenDirectTracking && (
              <button
                onClick={onOpenDirectTracking}
                className="hidden md:flex items-center gap-1.5 bg-stone-900/80 hover:bg-stone-800 text-stone-200 border border-white/20 px-3.5 py-2.5 rounded-full text-xs font-bold backdrop-blur-md transition-all shadow-md hover:scale-105"
                title="Track Direct Packaged & Probiotic Orders"
              >
                <Truck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Track Orders</span>
              </button>
            )}

            {/* Shopping Cart Button */}
            {true /* set to true to retrieve */ && onOpenCart && (
              <button
                onClick={onOpenCart}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-black transition-all shadow-lg hover:scale-105 ${cartItemsCount > 0
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-stone-950 shadow-amber-500/20'
                  : 'bg-stone-900/80 hover:bg-stone-800 text-white border border-white/20 backdrop-blur-md'
                  }`}
                title="View Shopping Cart"
              >
                <div className="relative">
                  <ShoppingBag className={`w-4 h-4 ${cartItemsCount > 0 ? 'text-stone-950' : 'text-amber-400'}`} />
                  {cartItemsCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-stone-950 text-amber-400 text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-amber-400">
                      {cartItemsCount}
                    </span>
                  )}
                </div>
                <span>{cartItemsCount > 0 ? `Cart (₹${cartTotal})` : 'Cart'}</span>
              </button>
            )}

            {/* Customer Login Button */}
            {isLoggedIn && currentUser ? (
              <button
                onClick={() => onSelectTab('dashboard')}
                className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-4 py-2.5 rounded-full text-xs shadow-md transition-all flex items-center gap-2 hover:scale-105"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>My Customer Dashboard</span>
              </button>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-5 py-2.5 rounded-full text-xs shadow-md transition-all flex items-center gap-2 hover:scale-105"
              >
                <User className="w-4 h-4" />
                <span>Customer Login</span>
              </button>
            )}

          </div>

        </div>

        {/* Mobile Tabs Bar inside Video Header */}
        <div className="lg:hidden flex items-center gap-2 overflow-x-auto pt-3 pb-1 scrollbar-none">
          {websiteTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${isActive
                  ? 'bg-emerald-500 text-stone-950 font-black shadow-md'
                  : 'bg-black/50 text-stone-200 border border-white/10 backdrop-blur-md'
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. HERO CONTENT OVERLAY ON THE VIDEO - ULTRA CLEAN EXACT TEXT */}
      <div className="relative z-20 max-w-7xl mx-auto px-6 sm:px-10 lg:px-14 w-full h-[calc(100%-140px)] flex items-center min-h-[480px]">
        <div className="max-w-2xl space-y-6 text-left py-12">

          {/* Headline - Exact Image 2 Requirement */}
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[1.02] text-white drop-shadow-lg">
            NUTRITION, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-200">
              ELEVATED.
            </span>
          </h1>

          {/* Sub-Headline - Exact Image 2 Requirement */}
          <p className="text-stone-200 text-base sm:text-lg lg:text-xl leading-relaxed font-medium drop-shadow-md max-w-xl">
            Fresh, high-protein, chef-crafted meal bowls delivered hot from our certified kitchen directly to your doorstep.
          </p>
        </div>
      </div>

      {/* EMPLOYEE ROLE SELECTION MODAL (Admin Only) */}
      {employeeModalOpen && currentRole !== 'customer' && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEmployeeModalOpen(false);
          }}
        >
          <div className="bg-stone-900 border border-stone-700/80 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">

            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-stone-800 bg-stone-950/80 shrink-0 flex items-center justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Internal Staff & ERP Access
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">Select Employee Department</h3>
                <p className="text-xs text-stone-400">Log in directly to your authorized cloud kitchen, POS, or department workspace</p>
              </div>

              <button
                onClick={() => setEmployeeModalOpen(false)}
                className="text-stone-400 hover:text-white bg-stone-800 p-2.5 rounded-full border border-stone-700 transition-all hover:bg-stone-700"
              >
                ✕
              </button>
            </div>

            {/* Department Portals Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {employeeRoles.map((item) => (
                  <button
                    key={item.role}
                    onClick={() => {
                      if (onRoleChange) onRoleChange(item.role as UserRole);
                      setEmployeeModalOpen(false);
                    }}
                    className="w-full text-left p-3.5 sm:p-4 rounded-2xl bg-stone-950/70 hover:bg-stone-800/90 border border-stone-800 hover:border-emerald-500/50 transition-all flex flex-col justify-between group hover:scale-[1.01] hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-2 w-full mb-2">
                      <div className="p-2.5 rounded-xl bg-stone-900 border border-stone-700/80 group-hover:bg-stone-950 transition-colors">
                        {item.icon}
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 border border-stone-700 group-hover:border-emerald-500/30 group-hover:text-emerald-300 transition-colors">
                        {item.badge}
                      </span>
                    </div>

                    <div className="space-y-1 w-full">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors">
                          {item.title}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-stone-600 group-hover:text-emerald-400 transition-colors" />
                      </div>
                      <p className="text-xs text-stone-400 leading-snug line-clamp-2">{item.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 bg-stone-950/90 border-t border-stone-800 text-center shrink-0">
              <span className="text-[11px] text-stone-500">
                Authorized Personnel Only • Statewide Cloud Kitchens & Outlets Network
              </span>
            </div>

          </div>
        </div>
      )}

      {/* 3. FLOATING VIDEO CONTROLS & FILE UPLOAD (FOR ADMIN / CONTENT-MANAGEMENT ONLY) */}
      {currentRole !== 'customer' && (
        <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 bg-stone-950/80 backdrop-blur-md border border-white/15 rounded-2xl p-2 shadow-2xl">
          {uploadedVideoUrl ? (
            <>
              <div className="hidden sm:flex items-center gap-1 text-[10px] text-emerald-400 font-bold px-2.5 py-1 bg-emerald-950/80 rounded-xl border border-emerald-800">
                <Video className="w-3.5 h-3.5" />
                <span className="truncate max-w-[130px]">{videoFileName || 'Video Background Active'}</span>
              </div>

              <button
                onClick={togglePlay}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl transition-all"
                title={isPlaying ? 'Pause Video' : 'Play Video'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>

              <button
                onClick={toggleMute}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl transition-all"
                title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-300" /> : <Volume2 className="w-4 h-4 text-emerald-300" />}
              </button>

              <button
                onClick={handleToggleFullscreen}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl transition-all"
                title="Full Screen Video"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </>
          ) : null}

          <label
            htmlFor="hero-video-upload"
            className="cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition-all"
            title="Upload your MP4 video file for full screen hero landing"
          >
            <Upload className="w-4 h-4" />
            <span>{uploadedVideoUrl ? 'Replace Video' : 'Upload Video MP4'}</span>
          </label>
          <input
            type="file"
            id="hero-video-upload"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      )}

    </div>
  );
};



