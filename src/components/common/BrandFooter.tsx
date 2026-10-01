import React from 'react';
import { LogoMark } from './LogoMark';
import { Phone, Mail, MapPin, Instagram, Facebook, Twitter, Briefcase, Utensils, ChefHat, ShieldCheck, Key, FileText } from 'lucide-react';

interface BrandFooterProps {
  onNavigate?: (tab: string) => void;
  onOpenAuthModal?: () => void;
  onOpenEmployeeLogin?: () => void;
  onOpenSRS?: () => void;
  isCustomerRole?: boolean;
}

export const BrandFooter: React.FC<BrandFooterProps> = ({ onNavigate, onOpenAuthModal, onOpenEmployeeLogin, onOpenSRS, isCustomerRole = true }) => {
  return (
    <footer className="bg-emerald-950 text-stone-300 pt-12 pb-8 border-t-4 border-emerald-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pb-10 border-b border-emerald-900/80">
          
          {/* Column 1: Brand & Socials */}
          <div className="space-y-4">
            <LogoMark size="lg" variant="white" showTagline={true} />
            <p className="text-xs text-stone-400 leading-relaxed">
              Kerala's premier clinical nutrition kitchen, student mess subscription hub, probiotic brewery, and state-wide cloud kitchen ERP network.
            </p>
            <div className="pt-2 flex items-center gap-3">
              <a href="#" className="w-9 h-9 rounded-full bg-emerald-900/80 hover:bg-emerald-700 flex items-center justify-center text-emerald-300 hover:text-white transition-all">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-emerald-900/80 hover:bg-emerald-700 flex items-center justify-center text-emerald-300 hover:text-white transition-all">
                <Facebook className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-emerald-900/80 hover:bg-emerald-700 flex items-center justify-center text-emerald-300 hover:text-white transition-all">
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Column 2: Location & Contact */}
          <div className="space-y-4">
            <h4 className="font-bold text-white text-base mb-2 tracking-wide uppercase text-xs text-emerald-400">Cloud Kitchen Location</h4>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                <span>Protein Bowl Central Kitchen, Plot 42, Panampilly Nagar Ave, Kochi, Kerala - 682036</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>+91 98765 43210 / 0484 2345678</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>care@proteinbowl.in</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-400 gap-4">
          <div>
            © {new Date().getFullYear()} <span className="font-bold text-emerald-400">Protein Bowl</span>. All rights reserved. Striving for a healthier life.
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <a href="#" className="hover:text-stone-200 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-stone-200 transition-colors">Terms of Subscription</a>
            {onOpenSRS && (
              <button onClick={onOpenSRS} className="text-blue-400 hover:text-blue-300 transition-colors font-bold flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                <span>SRS Document (.docx)</span>
              </button>
            )}
            {onOpenEmployeeLogin && (
              <a
                href="#staff"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenEmployeeLogin();
                }}
                className="text-stone-400 hover:text-amber-400 transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>Staff Access Portal</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
