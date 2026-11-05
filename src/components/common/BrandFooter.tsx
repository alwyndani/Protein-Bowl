import React, { useState } from 'react';
import { LogoMark } from './LogoMark';
import { LegalDialog, type LegalDocumentId } from './LegalDialog';
import { Phone, Mail, MapPin, Instagram, Facebook, Twitter, Briefcase, Utensils, ChefHat, ShieldCheck, Key, FileText } from 'lucide-react';

interface BrandFooterProps {
  onNavigate?: (tab: string) => void;
  onOpenAuthModal?: () => void;
  onOpenEmployeeLogin?: () => void;
  isCustomerRole?: boolean;
}

/** Business contact details: set VITE_CONTACT_ADDRESS / VITE_CONTACT_PHONE / VITE_CONTACT_EMAIL at build time (see docs/OPERATIONS.md). */
const CONTACT = {
  address: (import.meta.env.VITE_CONTACT_ADDRESS as string | undefined)?.trim() || '',
  phone: (import.meta.env.VITE_CONTACT_PHONE as string | undefined)?.trim() || '',
  email: (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || ''
};

/** Social profile links: set VITE_SOCIAL_INSTAGRAM / _FACEBOOK / _TWITTER to https URLs; an unset or non-https value renders no link. */
const socialUrl = (v: unknown): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^https:\/\//i.test(s) ? s : '';
};
const SOCIAL = {
  instagram: socialUrl(import.meta.env.VITE_SOCIAL_INSTAGRAM),
  facebook: socialUrl(import.meta.env.VITE_SOCIAL_FACEBOOK),
  twitter: socialUrl(import.meta.env.VITE_SOCIAL_TWITTER)
};

export const BrandFooter: React.FC<BrandFooterProps> = ({ onNavigate, onOpenAuthModal, onOpenEmployeeLogin, isCustomerRole = true }) => {
  const [legal, setLegal] = useState<LegalDocumentId | null>(null);
  return (
    <footer className="bg-emerald-950 text-stone-300 pt-12 pb-8 border-t-4 border-emerald-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pb-10 border-b border-emerald-900/80">
          
          {/* Column 1: Brand & Socials */}
          <div className="space-y-4">
            <LogoMark size="lg" variant="white" showTagline={true} />
            <p className="text-xs text-stone-400 leading-relaxed">
              Personalised nutrition plans, fresh protein meals and Kerala homestyle mess subscriptions.
            </p>
            {(SOCIAL.instagram || SOCIAL.facebook || SOCIAL.twitter) && (
              <div className="pt-2 flex items-center gap-3" data-testid="footer-social">
                {SOCIAL.instagram && (
                  <a href={SOCIAL.instagram} target="_blank" rel="noopener noreferrer" aria-label="Protein Bowl on Instagram" className="w-9 h-9 rounded-full bg-emerald-900/80 hover:bg-emerald-700 flex items-center justify-center text-emerald-300 hover:text-white transition-all">
                    <Instagram className="w-4 h-4" />
                  </a>
                )}
                {SOCIAL.facebook && (
                  <a href={SOCIAL.facebook} target="_blank" rel="noopener noreferrer" aria-label="Protein Bowl on Facebook" className="w-9 h-9 rounded-full bg-emerald-900/80 hover:bg-emerald-700 flex items-center justify-center text-emerald-300 hover:text-white transition-all">
                    <Facebook className="w-4 h-4" />
                  </a>
                )}
                {SOCIAL.twitter && (
                  <a href={SOCIAL.twitter} target="_blank" rel="noopener noreferrer" aria-label="Protein Bowl on Twitter" className="w-9 h-9 rounded-full bg-emerald-900/80 hover:bg-emerald-700 flex items-center justify-center text-emerald-300 hover:text-white transition-all">
                    <Twitter className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Column 2: Contact. Real business details come from deployment configuration; nothing is shown (and nothing is invented) when unset. */}
          {(CONTACT.address || CONTACT.phone || CONTACT.email) && (
            <div className="space-y-4" data-testid="footer-contact">
              <h4 className="font-bold text-white text-base mb-2 tracking-wide uppercase text-xs text-emerald-400">Contact</h4>
              <div className="space-y-3 text-sm">
                {CONTACT.address && (
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                    <span>{CONTACT.address}</span>
                  </div>
                )}
                {CONTACT.phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{CONTACT.phone}</span>
                  </div>
                )}
                {CONTACT.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{CONTACT.email}</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Bottom Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-400 gap-4">
          <div>
            © {new Date().getFullYear()} <span className="font-bold text-emerald-400">Protein Bowl</span>. All rights reserved. Striving for a healthier life.
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <button type="button" onClick={() => setLegal('privacy')} className="hover:text-stone-200 transition-colors">Privacy Policy</button>
            <button type="button" onClick={() => setLegal('terms')} className="hover:text-stone-200 transition-colors">Terms of Subscription</button>
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
      {legal && <LegalDialog document={legal} onClose={() => setLegal(null)} />}
    </footer>
  );
};
