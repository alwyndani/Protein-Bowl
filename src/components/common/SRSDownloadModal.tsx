import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  Cpu, 
  X, 
  Printer, 
  ExternalLink,
  BookOpen,
  Sparkles,
  Award
} from 'lucide-react';
import { generateSRSDocxBlob, triggerDownloadFile } from '../../utils/srsDocxGenerator';
import confetti from 'canvas-confetti';

interface SRSDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SRSDownloadModal: React.FC<SRSDownloadModalProps> = ({ isOpen, onClose }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'features' | 'interfaces' | 'nfr' | 'matrix'>('overview');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen) return null;

  const handleDownloadDocx = async () => {
    setIsGenerating(true);
    try {
      // First try to fetch the pre-rendered production docx file from /Protein_Bowl_Enterprise_SRS.docx
      try {
        const res = await fetch('/Protein_Bowl_Enterprise_SRS.docx');
        if (res.ok) {
          const blob = await res.blob();
          triggerDownloadFile(blob, 'Protein_Bowl_Enterprise_SRS.docx');
          try { confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } }); } catch { /* ignore */ }
          setDownloadSuccess(true);
          setIsGenerating(false);
          return;
        }
      } catch (err) {
        console.warn('Direct fetch failed, falling back to dynamic generation:', err);
      }

      // Dynamic in-browser generation fallback
      const blob = await generateSRSDocxBlob();
      triggerDownloadFile(blob, 'Protein_Bowl_Enterprise_SRS.docx');
      try { confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } }); } catch { /* ignore */ }
      setDownloadSuccess(true);
    } catch (err) {
      console.error('Failed to generate docx:', err);
      // Try direct link download
      triggerDownloadFile(null, 'Protein_Bowl_Enterprise_SRS.docx', '/Protein_Bowl_Enterprise_SRS.docx');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white p-6 flex items-start justify-between border-b border-blue-900/50">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                <Award className="w-3 h-3 text-blue-400" />
                IEEE Std 830-1998 Standard
              </span>
              <span className="text-[10px] font-mono text-slate-300 bg-white/10 px-2 py-0.5 rounded">
                SRS-PB-ENT-2026-V2.4
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 mt-1">
              <FileText className="w-6 h-6 text-blue-400" />
              Software Requirements Specification (SRS)
            </h2>
            <p className="text-xs text-slate-300">
              Protein Bowl Cloud Kitchen Enterprise, FMCG Bakery, Tepache Brewery & Kerala Mess Portal
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Banner */}
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shrink-0">
              DOCX
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-blue-950">Microsoft Word Document (.docx)</h4>
              <p className="text-xs text-blue-800">
                Full 6-section formal specification ready for MS Word, Google Docs, or LibreOffice.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleDownloadDocx}
              disabled={isGenerating}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-white" />
              <span>{isGenerating ? 'Packaging Word Document...' : 'Download Word Document (.docx)'}</span>
            </button>
          </div>
        </div>

        {/* Success Toast */}
        {downloadSuccess && (
          <div className="bg-emerald-600 text-white px-6 py-2 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>Protein_Bowl_Enterprise_SRS.docx downloaded successfully!</span>
            </div>
            <button onClick={() => setDownloadSuccess(false)} className="text-emerald-200 hover:text-white text-[11px]">
              Dismiss
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 bg-stone-50 border-b border-stone-200 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-t-xl border-t border-x transition-all ${
              activeTab === 'overview'
                ? 'bg-white border-stone-200 text-blue-900 border-b-white font-black'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            1. Overview & Scope
          </button>
          <button
            onClick={() => setActiveTab('features')}
            className={`px-4 py-2 rounded-t-xl border-t border-x transition-all ${
              activeTab === 'features'
                ? 'bg-white border-stone-200 text-blue-900 border-b-white font-black'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            2. Functional Requirements
          </button>
          <button
            onClick={() => setActiveTab('interfaces')}
            className={`px-4 py-2 rounded-t-xl border-t border-x transition-all ${
              activeTab === 'interfaces'
                ? 'bg-white border-stone-200 text-blue-900 border-b-white font-black'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            3. External & Hardware Interfaces
          </button>
          <button
            onClick={() => setActiveTab('nfr')}
            className={`px-4 py-2 rounded-t-xl border-t border-x transition-all ${
              activeTab === 'nfr'
                ? 'bg-white border-stone-200 text-blue-900 border-b-white font-black'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            4. Non-Functional & Food Safety
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-2 rounded-t-xl border-t border-x transition-all ${
              activeTab === 'matrix'
                ? 'bg-white border-stone-200 text-blue-900 border-b-white font-black'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            5. Verification Matrix
          </button>
        </div>

        {/* Content Viewer Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-stone-800 text-xs sm:text-sm leading-relaxed flex-1">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="border border-stone-200 rounded-2xl p-4 bg-stone-50 space-y-2">
                <h3 className="font-black text-stone-900 text-base">Platform Identity & Scope</h3>
                <p>
                  <strong>Protein Bowl</strong> is an omni-channel cloud kitchen and food science enterprise system engineered for high-throughput culinary production, FMCG healthy bakery distribution, probiotic beverage fermentation, and Kerala homestyle student mess subscriptions.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl border border-stone-200 bg-white space-y-2">
                  <h4 className="font-extrabold text-blue-900 flex items-center gap-1.5 text-xs uppercase">
                    <Layers className="w-4 h-4" />
                    Subsystem Architecture
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-stone-600">
                    <li><strong>Direct Storefront:</strong> Macro calculator, customizable protein bowls.</li>
                    <li><strong>Kerala Mess Portal:</strong> Hostel subscriptions, daily QR passes, meal pause wallet refund.</li>
                    <li><strong>Aggregator Pacing:</strong> 15% portion buffer locks vs Swiggy/Zomato surges.</li>
                    <li><strong>Chef KDS:</strong> Station-aware ticket routing and recipe scaling.</li>
                    <li><strong>Fermentation Monitor:</strong> Live Brix & pH IoT logs for Tepache/Kombucha.</li>
                    <li><strong>HRM & Staff Auth:</strong> Biometric attendance, payroll, and 1-click Mess department logins.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl border border-stone-200 bg-white space-y-2">
                  <h4 className="font-extrabold text-emerald-900 flex items-center gap-1.5 text-xs uppercase">
                    <ShieldCheck className="w-4 h-4" />
                    Key User Personas
                  </h4>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-stone-600">
                    <li><strong>Retail Customer:</strong> Configures bowls, inspects allergens.</li>
                    <li><strong>Mess Student:</strong> Monthly subscriber, scans daily QR pass.</li>
                    <li><strong>Kerala Mess Head Chef:</strong> Steam kettle batches, authentic South Indian cuisine.</li>
                    <li><strong>Clinical Dietitian:</strong> Formulates personalized macro plans.</li>
                    <li><strong>Managing Director:</strong> Real-time unit economics, multi-kitchen telemetry.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'features' && (
            <div className="space-y-4">
              <h3 className="font-black text-stone-900 text-base">Key Functional Requirements (SRS Section 3)</h3>
              
              <div className="space-y-3">
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200">
                  <span className="text-[10px] font-mono font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                    [REQ-STORE-001] Real-Time Macro Computation
                  </span>
                  <p className="mt-1 text-xs text-stone-700 font-medium">
                    The customer storefront MUST calculate protein, carbohydrate, fat, dietary fiber, and calorie metrics dynamically upon ingredient selection.
                  </p>
                </div>

                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200">
                  <span className="text-[10px] font-mono font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                    [REQ-MESS-002] Automated Meal Pausing & Wallet Credit
                  </span>
                  <p className="mt-1 text-xs text-amber-900 font-medium">
                    Subscribers MUST be allowed to pause meal delivery up to 10:00 PM the previous evening with automated extension of their subscription validity.
                  </p>
                </div>

                <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <span className="text-[10px] font-mono font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    [REQ-AGGR-002] Direct Customer Portion Safety Lock
                  </span>
                  <p className="mt-1 text-xs text-emerald-900 font-medium">
                    The aggregator engine MUST reserve a mandatory 15% safety buffer for direct customers before releasing batch portions to Swiggy/Zomato.
                  </p>
                </div>

                <div className="p-3.5 bg-purple-50 rounded-2xl border border-purple-200">
                  <span className="text-[10px] font-mono font-black text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                    [REQ-KDS-001] Multi-Station Ticket Dispatch
                  </span>
                  <p className="mt-1 text-xs text-purple-900 font-medium">
                    The KDS MUST split orders into station queues: Station 1 (Grill/Protein), Station 2 (Cold Assembly), Station 3 (Steam Kettles/Kerala Mess), Station 4 (Packing).
                  </p>
                </div>

                <div className="p-3.5 bg-blue-50 rounded-2xl border border-blue-200">
                  <span className="text-[10px] font-mono font-black text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                    [REQ-HRM-004] Department Authentication Terminals
                  </span>
                  <p className="mt-1 text-xs text-blue-900 font-medium">
                    The HRM and Staff Portal MUST provide 1-click role logins for staff, including dedicated terminals for Kerala Mess Chef, Logistics, and Dietetic leads.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'interfaces' && (
            <div className="space-y-4">
              <h3 className="font-black text-stone-900 text-base">External & Hardware Interfaces (SRS Section 4)</h3>
              
              <div className="border border-stone-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-white font-bold">
                    <tr>
                      <th className="p-3">Interface Entity</th>
                      <th className="p-3">Type / Protocol</th>
                      <th className="p-3">Operational Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    <tr className="bg-stone-50">
                      <td className="p-3 font-bold text-stone-900">ESC/POS Thermal Printers</td>
                      <td className="p-3 font-mono">USB / Ethernet / Bluetooth</td>
                      <td className="p-3 text-stone-600">Instant kitchen KOT and customer tax invoice generation.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-stone-900">Swiggy & Zomato APIs</td>
                      <td className="p-3 font-mono">REST Webhooks / OAuth2</td>
                      <td className="p-3 text-stone-600">Menu sync, live inventory locks, rider dispatch updates.</td>
                    </tr>
                    <tr className="bg-stone-50">
                      <td className="p-3 font-bold text-stone-900">Payment Gateways</td>
                      <td className="p-3 font-mono">Razorpay / UPI Dynamic QR</td>
                      <td className="p-3 text-stone-600">Zero-touch multi-tender settlement and instant refunds.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-stone-900">Biometric Time Clocks</td>
                      <td className="p-3 font-mono">TCP/IP Socket Sync</td>
                      <td className="p-3 text-stone-600">Staff clock-in/out timestamps synced with monthly payroll.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'nfr' && (
            <div className="space-y-4">
              <h3 className="font-black text-stone-900 text-base">Non-Functional & Food Safety Requirements (SRS Section 5)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl border border-stone-200 bg-stone-50 space-y-2">
                  <h4 className="font-extrabold text-stone-900 text-xs uppercase">Performance & Scalability</h4>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-stone-600">
                    <li>First Contentful Paint (FCP) &lt; 1.2s on 4G cellular networks.</li>
                    <li>KDS ticket propagation &lt; 500ms via WebSockets.</li>
                    <li>Concurrent support for 10,000 users and 250 cloud kitchen nodes.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl border border-stone-200 bg-stone-50 space-y-2">
                  <h4 className="font-extrabold text-stone-900 text-xs uppercase">Food Safety & FSSAI / HACCP</h4>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-stone-600">
                    <li>Mandatory digital logging of core cooking temperatures (&gt;75°C poultry).</li>
                    <li>Vendor lot traceability for dairy and meat items.</li>
                    <li>Strict allergen isolation alerts on receipts and packaging.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'matrix' && (
            <div className="space-y-4">
              <h3 className="font-black text-stone-900 text-base">Requirements Verification Matrix (SRS Section 6)</h3>
              
              <div className="border border-stone-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-white font-bold">
                    <tr>
                      <th className="p-3">Requirement ID</th>
                      <th className="p-3">Module</th>
                      <th className="p-3">Verification Method</th>
                      <th className="p-3">Acceptance Criteria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    <tr className="bg-stone-50">
                      <td className="p-3 font-mono font-bold text-blue-700">REQ-STORE-001</td>
                      <td className="p-3 font-semibold">Storefront</td>
                      <td className="p-3">Unit / E2E Test</td>
                      <td className="p-3 text-stone-600">Macros match USDA/FSSAI database ±0.5%.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-amber-700">REQ-MESS-002</td>
                      <td className="p-3 font-semibold">Kerala Mess</td>
                      <td className="p-3">Integration Test</td>
                      <td className="p-3 text-stone-600">Meal paused before 10 PM credited to wallet.</td>
                    </tr>
                    <tr className="bg-stone-50">
                      <td className="p-3 font-mono font-bold text-emerald-700">REQ-AGGR-002</td>
                      <td className="p-3 font-semibold">Buffer Engine</td>
                      <td className="p-3">Stress Simulation</td>
                      <td className="p-3 text-stone-600">Aggregators throttled when kitchen queue &gt;25 tickets.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-purple-700">REQ-KDS-001</td>
                      <td className="p-3 font-semibold">Chef KDS</td>
                      <td className="p-3">Live Station Test</td>
                      <td className="p-3 text-stone-600">Dishes route accurately to Grill vs. Kettle screens.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-stone-50 border-t border-stone-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-stone-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Document formally verified and ready for audit & distribution.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleDownloadDocx}
              disabled={isGenerating}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-5 py-2 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
            >
              <Download className="w-4 h-4" />
              <span>{isGenerating ? 'Packaging...' : 'Download Word (.docx)'}</span>
            </button>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl text-xs transition-all"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
