import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export type LegalDocumentId = 'privacy' | 'terms';

interface Section { heading: string; body: string[] }

/**
 * Draft policy text describing what the application actually does. It is NOT legal advice: the business owner must have it
 * reviewed (and complete the operator details) before launch. Operator contact details come from the VITE_CONTACT_* configuration.
 */
const DOCUMENTS: Record<LegalDocumentId, { title: string; sections: Section[] }> = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Account details you give us: name, email address, phone number and delivery addresses.',
          'Order, payment-status, subscription and delivery records needed to run your orders.',
          'Health and fitness information you choose to enter (for example height, weight, goals, allergies and exercise habits) when you use nutrition or workout features.'
        ]
      },
      {
        heading: 'How we use it',
        body: [
          'To prepare and deliver your orders, process payments and refunds, and provide customer support.',
          'Health information is used only to prepare your nutrition plan. It is visible to the nutritionist who accepts your request and is not shared with other staff or third parties.',
          'Your trainer, if you have one, sees your workout plans and progress logs but not your health profile.'
        ]
      },
      {
        heading: 'Payments',
        body: [
          'Payments are made online through our payment provider. We never see or store your full card number; we keep only the payment status and provider reference needed for your order.'
        ]
      },
      {
        heading: 'Security and retention',
        body: [
          'Passwords are stored only as salted hashes. Access to staff features is restricted by role. We keep order and payment records as long as required for accounting and legal obligations.'
        ]
      },
      {
        heading: 'Your choices',
        body: ['You can ask us to correct your information or to delete your account by contacting us using the details in the footer.']
      }
    ]
  },
  terms: {
    title: 'Terms of Subscription',
    sections: [
      {
        heading: 'Ordering and payment',
        body: [
          'All orders and subscriptions are paid online at checkout. We do not accept cash on delivery or cash at the door.',
          'An order is confirmed only after your payment is verified. Unpaid orders are cancelled automatically after a short time.'
        ]
      },
      {
        heading: 'Cancellations and refunds',
        body: [
          'You can cancel an order yourself while it is pending or confirmed.',
          'Once a paid order has been accepted by the kitchen you can request cancellation; our team reviews each request. An approved cancellation is refunded in full to the original payment method.'
        ]
      },
      {
        heading: 'Delivery',
        body: ['You receive a 6-digit Delivery Code for each delivery. Share it only with the person handing over your order; delivery is completed once the code is verified.']
      },
      {
        heading: 'Kerala Mess subscriptions',
        body: [
          'A subscription starts after payment is confirmed. Meals can be paused before the pause cut-off shown for your plan.',
          'Meals that could not be delivered are handled according to the plan terms shown at purchase.'
        ]
      },
      {
        heading: 'Nutrition and workout guidance',
        body: ['Plans are general guidance prepared from the information you provide and are not medical advice. Consult a doctor before changing your diet or exercise routine if you have a medical condition.']
      }
    ]
  }
};

interface LegalDialogProps {
  document: LegalDocumentId;
  onClose: () => void;
}

export const LegalDialog: React.FC<LegalDialogProps> = ({ document: docId, onClose }) => {
  const doc = DOCUMENTS[docId];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        className="bg-white text-stone-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 id="legal-dialog-title" className="text-xl font-bold text-emerald-900">{doc.title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 rounded hover:bg-stone-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-5 text-sm leading-relaxed">
          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h3 className="font-semibold text-stone-900 mb-1">{s.heading}</h3>
              {s.body.map((p) => (
                <p key={p} className="mb-2 text-stone-700">{p}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
