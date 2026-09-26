import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  BorderStyle, 
  AlignmentType, 
  Header, 
  Footer, 
  PageNumber, 
  ShadingType 
} from 'docx';

function createTitle(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 120 },
    run: {
      font: 'Arial',
      size: 36,
      bold: true,
      color: '1E3A8A'
    }
  });
}

function createSubtitle(text: string): Paragraph {
  return new Paragraph({
    text,
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 360 },
    run: {
      font: 'Arial',
      size: 22,
      italics: true,
      color: '4B5563'
    }
  });
}

function createH1(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 140 },
    run: {
      font: 'Arial',
      size: 28,
      bold: true,
      color: '0F172A'
    }
  });
}

function createH2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
    run: {
      font: 'Arial',
      size: 24,
      bold: true,
      color: '1E40AF'
    }
  });
}

function createBodyP(text: string, boldPrefix?: string): Paragraph {
  const children: TextRun[] = [];
  if (boldPrefix) {
    children.push(new TextRun({
      text: boldPrefix,
      bold: true,
      font: 'Arial',
      size: 20,
      color: '0F172A'
    }));
  }
  children.push(new TextRun({
    text,
    font: 'Arial',
    size: 20,
    color: '334155'
  }));

  return new Paragraph({
    children,
    spacing: { before: 60, after: 80, line: 276 }
  });
}

function createBullet(text: string, boldPrefix?: string): Paragraph {
  const children: TextRun[] = [];
  if (boldPrefix) {
    children.push(new TextRun({
      text: boldPrefix,
      bold: true,
      font: 'Arial',
      size: 20,
      color: '0F172A'
    }));
  }
  children.push(new TextRun({
    text,
    font: 'Arial',
    size: 20,
    color: '334155'
  }));

  return new Paragraph({
    children,
    bullet: { level: 0 },
    spacing: { before: 40, after: 40, line: 260 }
  });
}

function createCallout(title: string, content: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `[NOTE: ${title}] `,
        bold: true,
        font: 'Arial',
        size: 19,
        color: '92400E'
      }),
      new TextRun({
        text: content,
        italics: true,
        font: 'Arial',
        size: 19,
        color: '78350F'
      })
    ],
    shading: {
      type: ShadingType.CLEAR,
      fill: 'FEF3C7'
    },
    spacing: { before: 120, after: 120 },
    border: {
      left: {
        color: 'D97706',
        space: 12,
        style: BorderStyle.SINGLE,
        size: 24
      }
    }
  });
}

function createTable(headers: string[], rows: string[][]): Table {
  const headerRow = new TableRow({
    children: headers.map(h => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: h, bold: true, font: 'Arial', size: 19, color: 'FFFFFF' })],
        alignment: AlignmentType.LEFT
      })],
      shading: { type: ShadingType.CLEAR, fill: '1E3A8A' },
      margins: { top: 120, bottom: 120, left: 140, right: 140 }
    }))
  });

  const dataRows = rows.map((row, idx) => new TableRow({
    children: row.map(cellText => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: cellText, font: 'Arial', size: 18, color: '1E293B' })],
        alignment: AlignmentType.LEFT
      })],
      shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? 'F8FAFC' : 'FFFFFF' },
      margins: { top: 100, bottom: 100, left: 140, right: 140 }
    }))
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows]
  });
}

export async function generateSRSDocxBlob(): Promise<Blob> {
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "PROTEIN BOWL ENTERPRISE PLATFORM", bold: true, size: 16, color: "64748B" }),
                new TextRun({ text: "  |  Software Requirements Specification (SRS)", size: 16, color: "94A3B8" })
              ],
              alignment: AlignmentType.RIGHT
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "Confidential - Protein Bowl FoodTech Ltd.  |  Page ", size: 16, color: "64748B" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "64748B" }),
                new TextRun({ text: " of ", size: 16, color: "64748B" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "64748B" })
              ],
              alignment: AlignmentType.CENTER
            })
          ]
        })
      },
      children: [
        createTitle("SOFTWARE REQUIREMENTS SPECIFICATION (SRS)"),
        createSubtitle("Enterprise FoodTech Suite, Cloud Kitchen Network, FMCG Bakery, Gut-Health Brewery & Kerala Mess Management"),
        
        createTable(
          ["Document Attribute", "Details"],
          [
            ["System Name", "Protein Bowl Enterprise Cloud Kitchen & Nutrition Platform"],
            ["Document Identifier", "SRS-PB-ENT-2026-V2.4"],
            ["Standard Compliance", "IEEE Std 830-1998 (Software Requirements Specifications)"],
            ["Version / Release", "Version 2.4.0-PROD"],
            ["Date of Publication", "September 2026"],
            ["Status", "Approved Baseline for Production Implementation"],
            ["Lead Architect / Author", "Enterprise Systems Architecture Team & Product Council"],
            ["Target Ecosystem", "Multi-Tenant Web, Cloud POS, Chef KDS, Logistics Fleet, Consumer PWA"]
          ]
        ),

        new Paragraph({ text: "", spacing: { after: 200 } }),
        createH1("EXECUTIVE SUMMARY"),
        createBodyP(
          "Protein Bowl is an integrated, next-generation omni-channel FoodTech ecosystem engineered to bridge health-focused culinary science with high-throughput cloud kitchen operations. The platform unites five distinctive business verticals: (1) High-protein, clean-label direct-to-consumer meal delivery; (2) Kerala Homestyle Mess and hostel subscription logistics with QR meal passes and automated balance pausing; (3) Third-party aggregator synchronization (Swiggy & Zomato) with live stock reservation and surge buffer controls; (4) Artisanal FMCG health bakery and live Tepache/Kombucha fermentation brewery tracking; and (5) A Clinical Dietitian & AI metabolic assessment suite."
        ),

        createH1("1. INTRODUCTION"),
        createH2("1.1 Purpose"),
        createBodyP("This document specifies the software requirements for the Protein Bowl platform in full accordance with IEEE Std 830-1998."),
        createH2("1.2 Document Conventions"),
        createBodyP("Requirements are prioritized using RFC 2119 keywords (MUST, SHOULD, MAY) with unique IDs [REQ-<MODULE>-<NUMBER>]."),
        createH2("1.3 Product Scope"),
        createBodyP("The software orchestrates the entire value chain from farm procurement and central commissary batching down to last-mile consumer delivery and student hostel verification."),

        createH1("2. OVERALL SYSTEM DESCRIPTION"),
        createH2("2.1 Subsystems Overview"),
        createBullet("Storefront Portal: Responsive web app for bowl assembly and macro tracking.", "Customer Storefront: "),
        createBullet("Kerala Mess Subscriptions: Daily QR passes, meal pause wallet refunds, and hostel crate logistics.", "Kerala Mess Portal: "),
        createBullet("Aggregator Pacing Engine: Real-time inventory buffer locks preventing stockouts during Swiggy/Zomato surges.", "Buffer Engine: "),
        createBullet("Chef KDS: Touchscreen station routing (Grill, Cold, Kettle, Packing) with recipe scaling.", "Kitchen Display System: "),
        createBullet("Fermentation Brewery: Time-series IoT tracking of Brix and pH for live probiotic beverages.", "Brewery Lab: "),
        createBullet("Workforce & HRM: Biometric attendance, payroll generation, and staff login terminals.", "HRM & Payroll: "),
        createBullet("Executive MD Cockpit: Unit economics, gross margin calculations, and ingredient price simulation.", "Managing Director Suite: "),

        createH1("3. SPECIFIC FUNCTIONAL REQUIREMENTS"),
        createBullet("[REQ-STORE-001] Live macro calculation (protein, carbs, fats, fiber, calories) upon ingredient selection.", "Macro Calculation: "),
        createBullet("[REQ-STORE-002] Allergen exclusion filter enforcing strict separation for nut, gluten, and dairy sensitivities.", "Allergen Filters: "),
        createBullet("[REQ-MESS-001] Tiered subscription passes (Trial, 7-Day, 15-Day Flex, 30-Day Semester Pass).", "Mess Subscriptions: "),
        createBullet("[REQ-MESS-002] Automated meal pausing prior to 10:00 PM with direct wallet credit extension.", "Meal Pausing: "),
        createBullet("[REQ-MESS-003] Dynamic cryptographic QR meal pass scanned at hostel counters.", "QR Meal Passes: "),
        createBullet("[REQ-MESS-004] Automated steam kettle batch calculation based on morning mess headcount.", "Kettle Batching: "),
        createBullet("[REQ-AGGR-002] Live reservation of 15% safety buffer for direct customers before aggregator allocation.", "Aggregator Buffer: "),
        createBullet("[REQ-KDS-001] Automated order splitting across Grill, Cold Assembly, Kettles, and Dispatch stations.", "KDS Routing: "),
        createBullet("[REQ-FERM-002] Automated alerts when fermentation tank reaches target Brix (4.5°Bx) and pH (3.4).", "Brewery Alerting: "),
        createBullet("[REQ-POS-002] GST-compliant invoicing with CGST 2.5% + SGST 2.5% or IGST 5.0% and HSN mapping.", "POS Billing: "),
        createBullet("[REQ-HRM-004] 1-Click Department Authentication Terminals for Kerala Mess staff and operations.", "Staff Authentication: "),
        createBullet("[REQ-EXEC-002] Real-time COGS, labor cost, packaging cost, and aggregator fee breakdown per dish.", "Unit Economics: "),

        createH1("4. EXTERNAL INTERFACES & HARDWARE"),
        createBullet("Thermal Printers: ESC/POS protocol across 80mm and 58mm paper widths.", "Thermal Printers: "),
        createBullet("Aggregator APIs: REST webhooks for Swiggy and Zomato order push and status synchronization.", "Aggregator Integrations: "),
        createBullet("Payments: Razorpay and UPI dynamic QR codes with instant webhook reconciliation.", "Payment Gateways: "),

        createH1("5. NON-FUNCTIONAL REQUIREMENTS"),
        createBullet("Latency: Storefront FCP < 1.2s; KDS ticket propagation < 500ms.", "Performance: "),
        createBullet("Safety: Full FSSAI compliance and digital HACCP core cooking temperature logging.", "Food Safety: "),
        createBullet("Security: Role-Based Access Control (RBAC) and AES-256 encryption of customer health data.", "Security: "),
        createBullet("Availability: 99.95% operational uptime during active kitchen hours.", "Reliability: ")
      ]
    }]
  });

  return await Packer.toBlob(doc);
}

export function triggerDownloadFile(blob: Blob | null, filename: string, staticFallbackUrl?: string) {
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }

  if (staticFallbackUrl) {
    const a = document.createElement('a');
    a.href = staticFallbackUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
