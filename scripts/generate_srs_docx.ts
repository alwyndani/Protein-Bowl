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
import * as fs from 'fs';
import * as path from 'path';

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
      color: '1E3A8A' // Deep Blue
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

function createH3(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 80 },
    run: {
      font: 'Arial',
      size: 20,
      bold: true,
      color: '334155'
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
        color: '92400E' // Amber 800
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
      fill: 'FEF3C7' // Warm amber background
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

export async function buildSRS(): Promise<Document> {
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,    // 1 inch
            right: 1440,
            bottom: 1440,
            left: 1440
          }
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
        // Title block
        createTitle("SOFTWARE REQUIREMENTS SPECIFICATION (SRS)"),
        createSubtitle("Enterprise FoodTech Suite, Cloud Kitchen Network, FMCG Bakery, Gut-Health Brewery & Kerala Mess Management"),
        
        // Metadata Table
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

        // Executive Summary
        createH1("EXECUTIVE SUMMARY"),
        createBodyP(
          "Protein Bowl is an integrated, next-generation omni-channel FoodTech ecosystem engineered to bridge health-focused culinary science with high-throughput cloud kitchen operations. Unlike standard restaurant POS software, the platform unites five distinctive business verticals under a unified real-time enterprise architecture: (1) High-protein, clean-label direct-to-consumer meal delivery; (2) Kerala Homestyle Mess and hostel subscription logistics with QR meal passes and automated balance pausing; (3) Third-party aggregator synchronization (Swiggy & Zomato) with live stock reservation and surge buffer controls; (4) Artisanal FMCG health bakery and live Tepache/Kombucha fermentation brewery tracking; and (5) A Clinical Dietitian & AI metabolic assessment suite."
        ),
        createBodyP(
          "This Software Requirements Specification (SRS) defines the functional, behavioral, performance, safety, and architectural requirements for all subsystems, guaranteeing absolute operational integrity across multi-branch cloud kitchens, central production commissaries, and front-line retail touchpoints."
        ),

        // Section 1: Introduction
        createH1("1. INTRODUCTION"),
        
        createH2("1.1 Purpose"),
        createBodyP(
          "This document provides a complete, authoritative specification of the functional and non-functional requirements for the Protein Bowl platform. It establishes the verification baseline for engineering teams, quality assurance auditors, kitchen operations leads, clinical dietetics councils, and executive leadership."
        ),

        createH2("1.2 Document Conventions"),
        createBodyP(
          "This specification complies with IEEE Std 830-1998. Requirements are classified using RFC 2119 keywords: MUST indicates an absolute mandatory requirement; SHOULD indicates a highly recommended capability; and MAY indicates an optional feature. Requirements carry unique identifiers formatted as [REQ-<MODULE>-<NUMBER>] for end-to-end traceability across test suites."
        ),

        createH2("1.3 Intended Audience"),
        createBullet("Full-Stack Software Engineers: Guiding microservice APIs, state machines, and real-time event brokers.", "Software Engineers: "),
        createBullet("Cloud Kitchen Operations Managers & Head Chefs: Defining KDS routing, batch scaling, and temperature logging.", "Operations Leads: "),
        createBullet("Managing Directors & Financial Controllers: Detailing unit economics, P&L reporting, and procurement MRP.", "Executive Leadership: "),
        createBullet("Clinical Nutritionists & Dietitians: Guiding macro calculation algorithms and intake assessments.", "Nutritionists: "),
        createBullet("Regulatory & Food Hygiene Auditors: Specifying FSSAI, HACCP, allergen isolation, and cold-chain compliance.", "Quality Auditors: "),

        createH2("1.4 Product Scope"),
        createBodyP(
          "The Protein Bowl software ecosystem orchestrates all operations from raw ingredient receipt at central supply depots to front-door customer delivery and meal consumption. In scope: Consumer ordering storefront, Kerala Mess meal plan subscriptions, dual-channel aggregator pacing, live Kitchen Display Systems, brewery fermentation IoT monitoring, employee payroll/attendance, cold-chain GPS/temperature tracking, and multi-kitchen executive analytics. Out of scope: Third-party banking rails (handled via verified external gateways) and physical kitchen machinery firmware."
        ),

        createH2("1.5 Definitions, Acronyms, and Abbreviations"),
        createTable(
          ["Term / Acronym", "Full Definition & Operational Meaning"],
          [
            ["KDS", "Kitchen Display System: Real-time digital touchscreens replacing paper tickets across hot/cold/prep cook stations."],
            ["FMCG", "Fast-Moving Consumer Goods: Packaged shelf-stable protein bars, granola clusters, and baked goods."],
            ["Brix (°Bx)", "Refractometric sugar content measurement used to evaluate raw must and completed Tepache/Kombucha batches."],
            ["MRP", "Material Requirements Planning: Algorithm calculating raw ingredient purchase orders based on projected batches."],
            ["POS", "Point of Sale: Omnichannel counter checkout handling dine-in, takeaway, and digital payments."],
            ["QR Pass", "Dynamic or static Quick Response barcode scanned at mess hostels for daily meal authentication."],
            ["HACCP", "Hazard Analysis Critical Control Point: Systematic preventive approach to food safety and biological hazards."],
            ["FSSAI", "Food Safety and Standards Authority of India: Primary statutory body governing culinary compliance."]
          ]
        ),

        // Section 2: Overall Description
        createH1("2. OVERALL SYSTEM DESCRIPTION"),

        createH2("2.1 Product Perspective & Context"),
        createBodyP(
          "Protein Bowl functions as a distributed, full-stack cloud enterprise. It bridges real-time consumer web applications, staff mobile web terminals, kitchen wall-mounted displays, and central enterprise resource planning (ERP) databases. The system interacts externally with delivery aggregator APIs (Swiggy Partner API, Zomato Food Engine), payment gateways (Razorpay, UPI QR), and thermal ESC/POS printing stations."
        ),

        createH2("2.2 Enterprise Subsystems"),
        createBullet("Subsystem A - Customer Experience: Responsive web application for customized bowl assembly, calorie/macro visualization, and Kerala Mess subscriptions.", "Storefront Portal: "),
        createBullet("Subsystem B - Kerala Mess & Hostel Portal: Dedicated student/PG subscription hub for batch bookings, daily QR passes, and meal pause credits.", "Kerala Mess Portal: "),
        createBullet("Subsystem C - Aggregator & Buffer Engine: Automated inventory reservation gate balancing walk-ins against online Swiggy/Zomato orders.", "Aggregator Engine: "),
        createBullet("Subsystem D - Central Commissary & Cloud Branches: Multi-unit management coordinating Kochi HQ, Calicut, and Bangalore branches.", "Multi-Kitchen Hub: "),
        createBullet("Subsystem E - Chef KDS & Station Routing: Station-aware dispatch (Grill, Assembly, Steam Kettles, Bakery) with ticket pacing.", "Kitchen Displays: "),
        createBullet("Subsystem F - Brewery & Fermentation Monitor: Time-series tracking of live fermentation tanks for probiotic Tepache and Kombucha.", "Fermentation Lab: "),
        createBullet("Subsystem G - Clinical Nutrition & AI Dietetics: Metabolic profiling, BMR/TDEE calculation, and customized prescription diets.", "Clinical Suite: "),
        createBullet("Subsystem H - HRM, Biometric Attendance & Payroll: Staff record lifecycle, shift scheduling, wage disbursement, and Kerala Mess auth terminals.", "HRM & Workforce: "),
        createBullet("Subsystem I - Supply Chain & Procurement MRP: Par-level restocking, batch expiration tracking, and vendor purchase requisitions.", "Procurement Engine: "),
        createBullet("Subsystem J - Executive Managing Director Cockpit: Real-time unit economics, multi-branch revenue, margin tracking, and recipe costing.", "MD Executive Suite: ")
      ]
    },
    {
      properties: {
        page: {
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440
          }
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
        createH2("2.3 User Classes and Operational Personas"),
        createTable(
          ["User Role", "Key Responsibilities", "Primary Interface & Security Clearance"],
          [
            ["Retail Customer", "Browses menu, configures bowl ingredients, checks macros, places orders, tracks live dispatch.", "Customer PWA / Web (Public / Auth Customer Role)"],
            ["Hostel / Mess Student", "Subscribes to monthly Kerala Mess, scans daily QR pass, pauses meals during leaves/vacations.", "Student Mess Portal (Mess Customer Role)"],
            ["Executive Head Chef", "Oversees KDS queues, manages recipes, initiates bulk kettle steam batches, logs food safety temps.", "Chef KDS Display & Kitchen Tablet (Chef Role)"],
            ["Kerala Mess Cook", "Prepares authentic Kerala meals (Avial, Sambar, Matta rice), loads delivery crates, verifies portions.", "Kerala Mess KDS Terminal (Mess Chef Role)"],
            ["Aggregator Coordinator", "Monitors Swiggy/Zomato dispatch, manages throttle buffers, marks items out of stock on delivery apps.", "Aggregator Command Board (Aggregator Role)"],
            ["Clinical Nutritionist", "Analyzes client blood metrics/lifestyle intake, formulates therapeutic macro plans, consults.", "Nutritionist Workbench (Nutritionist Role)"],
            ["POS Cashier", "Operates counter terminal, scans barcodes, issues GST compliant bills, accepts multi-mode payments.", "Cloud POS Interface (POS Role)"],
            ["Logistics Rider", "Accepts delivery dispatch, follows GPS route, records proof-of-delivery via OTP, verifies crate temp.", "Logistics Mobile App (Delivery Role)"],
            ["HR Manager", "Maintains employee files, tracks biometric check-in, processes monthly payroll, issues appointment letters.", "HRM & Workforce Portal (HR/MD Role)"],
            ["Managing Director (MD)", "Monitors multi-city profitability, cost of goods sold (COGS), labor efficiency, and brand expansion.", "Executive Command Center (MD Super Admin Role)"]
          ]
        ),

        new Paragraph({ text: "", spacing: { after: 180 } }),

        // Section 3: Functional Requirements
        createH1("3. SPECIFIC FUNCTIONAL REQUIREMENTS"),

        createH2("3.1 Customer Storefront & Healthy Nutrition Engine"),
        createBodyP(
          "The consumer storefront allows users to order prepared healthy bowls, customize ingredients, and evaluate nutritional data before checkout."
        ),
        createBullet("The system MUST calculate live macronutrient tallies (Protein, Carbs, Healthy Fats, Total Calories, Dietary Fiber) in real-time as users modify ingredients.", "[REQ-STORE-001] Real-Time Macro Computation: "),
        createBullet("The system MUST enforce allergen exclusion filters (e.g., Gluten-Free, Dairy-Free, Nut-Free, Keto, Vegan) and disable incompatible choices.", "[REQ-STORE-002] Allergen Safety Filter: "),
        createBullet("The checkout engine MUST support address geotagging, delivery scheduling (ASAP vs. Scheduled Slot), and multi-tender digital payments.", "[REQ-STORE-003] Multi-Tender Checkout: "),
        createBullet("The system MUST issue instant order confirmations with an interactive progress tracker mapping kitchen prep, packing, rider assignment, and transit.", "[REQ-STORE-004] Real-Time Order Tracking: "),

        createH2("3.2 Kerala Homestyle Mess & Student Hostel Subscription Subsystem"),
        createBodyP(
          "This subsystem addresses the dietary requirements of students, interns, and young professionals residing in hostels and paying-guest accommodations."
        ),
        createBullet("The system MUST support recurring Kerala Mess subscription plans: Daily Trial, 7-Day Sprint, 15-Day Flex, and 30-Day Full Semester Pass.", "[REQ-MESS-001] Plan Tiering: "),
        createBullet("Users MUST be permitted to pause meal delivery up to 10:00 PM the previous night with automatic wallet credit extension for unused days.", "[REQ-MESS-002] Automated Meal Pausing: "),
        createBullet("The system MUST generate a dynamic daily cryptographic QR Meal Pass valid only for the designated lunch or dinner window.", "[REQ-MESS-003] QR Meal Pass Generation: "),
        createBullet("The kitchen module MUST compute automated kettle batch sizing for Kerala staples (Avial, Sambar, Thoran, Kootu, Kerala Matta Rice) based on verified morning headcount.", "[REQ-MESS-004] Kettle Batch Calculation: "),
        createBullet("The system MUST organize dispatch into designated, thermal-insulated Hostel Crate Routes (e.g., Kalamassery Campus Hub, Kakkanad Tech Hostel Hub).", "[REQ-MESS-005] Hostel Crate Logistics: "),

        createH2("3.3 Aggregator Omnichannel Pacing & Live Buffer Engine"),
        createCallout(
          "Aggregator Buffer Protection",
          "When direct kitchen load exceeds 85% capacity, the system automatically adjusts Swiggy and Zomato availability to prevent dispatch delays."
        ),
        createBullet("The system MUST maintain bidirectional API communication with Swiggy and Zomato menus, pricing, and live inventory status.", "[REQ-AGGR-001] Bi-Directional Menu Sync: "),
        createBullet("The system MUST reserve a configurable safety portion buffer (default: 15% of daily prep) strictly for direct Protein Bowl customers.", "[REQ-AGGR-002] Direct Customer Portion Lock: "),
        createBullet("When kitchen active ticket count exceeds maximum threshold (e.g., 25 tickets/15 mins), the system MUST trigger automated aggregator throttling (increasing delivery prep time from 20 to 45 mins or toggling temporary off-line).", "[REQ-AGGR-003] Kitchen Overload Throttling: "),
        createBullet("The system MUST reconcile third-party aggregator commissions (18% - 24%), delivery packaging charges, and GST deductions against daily net settlements.", "[REQ-AGGR-004] Financial Settlement Reconciliation: "),

        createH2("3.4 Chef Kitchen Display System (KDS) & Cook Stations"),
        createBullet("Orders received from any channel MUST be split and routed to station-specific touchscreens: Station 1 (Grill & Protein), Station 2 (Cold Assembly & Greens), Station 3 (Kettles & Kerala Mess), Station 4 (Packaging & Quality Seal).", "[REQ-KDS-001] Station-Based Ticket Routing: "),
        createBullet("Tickets MUST visually escalate color based on wait duration: Green (<10 mins), Amber (10-18 mins), Blinking Red (>18 mins).", "[REQ-KDS-002] Visual Delay Escalation: "),
        createBullet("Chefs MUST be able to tap an item to view scaled recipe ingredient measurements and allergen isolation checklists.", "[REQ-KDS-003] Recipe Scaling & Guidelines: "),
        createBullet("Cooks MUST log critical core cooking temperatures (>75°C for poultry, <4°C for cold storage) directly onto the KDS for HACCP compliance.", "[REQ-KDS-004] HACCP Digital Temperature Logs: ")
      ]
    },
    {
      properties: {
        page: {
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440
          }
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
        createH2("3.5 FMCG Bakery & Gut-Friendly Probiotic Brewery Subsystem"),
        createBodyP(
          "The specialized production facility manufactures clean-label FMCG bakery goods and artisanal fermented beverages (Pineapple Tepache and Kombucha)."
        ),
        createBullet("The system MUST track fermentation vessel batches (Tank ID, Inoculation Date, Baseline Brix, Target pH, Live Acidity).", "[REQ-FERM-001] Fermentation Batch Telemetry: "),
        createBullet("The system MUST alert brewmasters when a vessel reaches the optimal bottling window (pH 3.2 - 3.6, Brix 4.5°Bx) before over-acetification occurs.", "[REQ-FERM-002] Automated Bottling Window Alerts: "),
        createBullet("Packaged goods MUST generate serialized GS1-compliant barcode labels featuring batch number, manufacturing date, and FSSAI license number.", "[REQ-FMCG-001] Barcode Serialization: "),
        createBullet("The system MUST manage batch expiry dates with automated FIFO (First-In, First-Out) picking protocols.", "[REQ-FMCG-002] Automated FIFO Inventory: "),

        createH2("3.6 Clinical Nutritionist & AI Metabolic Assessment Suite"),
        createBullet("The system MUST collect and securely store patient clinical intakes (Height, Weight, Body Fat %, Fasting Blood Glucose, HbA1c, Lipid Profiles, Allergies).", "[REQ-DIET-001] Clinical Intake Profiles: "),
        createBullet("The macro engine MUST calculate exact basal metabolic rates (BMR) and Total Daily Energy Expenditure (TDEE) using the Mifflin-St Jeor equation.", "[REQ-DIET-002] Metabolic Caloric Algorithm: "),
        createBullet("Dietitians MUST be able to publish structured 7-day therapeutic meal plans that directly link to the Protein Bowl kitchen production queue.", "[REQ-DIET-003] Integrated Therapeutic Meal Plans: "),
        createBullet("The system MUST provide real-time WhatsApp and PDF meal plan exports for direct patient compliance monitoring.", "[REQ-DIET-004] Compliance Export: "),

        createH2("3.7 Point of Sale (POS) & Billing Engine"),
        createBullet("The POS terminal MUST support offline sales caching with automatic cloud sync upon network restoration.", "[REQ-POS-001] Offline Resilient Billing: "),
        createBullet("The billing engine MUST compute GST compliant invoices (CGST 2.5% + SGST 2.5% or IGST 5.0%) with HSN/SAC code mapping.", "[REQ-POS-002] GST Tax Calculation: "),
        createBullet("The system MUST interface with ESC/POS thermal receipt printers over USB, Ethernet, and Bluetooth.", "[REQ-POS-003] ESC/POS Thermal Printing: "),
        createBullet("Cashiers MUST execute shift end Z-Report reconciliation balancing cash drawer, card slips, and UPI settlements.", "[REQ-POS-004] Cash Drawer Z-Report: "),

        createH2("3.8 Human Resource Management (HRM) & Staff Portals"),
        createBullet("The HRM module MUST maintain full employee records including employment contracts, KYC documents, and emergency contacts.", "[REQ-HRM-001] Employee Records: "),
        createBullet("The system MUST support biometric attendance tracking and calculate overtime, loss of pay (LOP), and leave balances.", "[REQ-HRM-002] Attendance & Leave Ledger: "),
        createBullet("The payroll engine MUST generate automated monthly payslips detailing Basic Pay, HRA, Travel Allowance, PF deduction, PT, and Net Salary.", "[REQ-HRM-003] Payroll Generation: "),
        createBullet("The system MUST provide dedicated 1-click Department Authentication Terminals for staff, including specialized Kerala Mess Lead Chef, Hostel Logistics, and Dietetic Auditor roles.", "[REQ-HRM-004] Staff Authentication Terminals: "),

        createH2("3.9 Procurement, Inventory & Supply Chain MRP"),
        createBullet("The system MUST track real-time stock levels of raw materials across central dry stores, cold walk-ins, and kitchen prep lines.", "[REQ-INV-001] Real-Time Stock Ledger: "),
        createBullet("When stock levels drop below dynamic par-thresholds, the system MUST generate automated Purchase Requisitions (PR) for approved vendors.", "[REQ-INV-002] Automated Reorder Triggers: "),
        createBullet("The receiving dock module MUST enforce temperature checks (e.g., dairy <4°C, frozen poultry <-18°C) before accepting Goods Received Notes (GRN).", "[REQ-INV-003] Receiving Dock QA Validation: "),

        createH2("3.10 Cold-Chain Fleet & Delivery Management"),
        createBullet("The system MUST automatically cluster delivery orders based on geographical delivery zones and rider availability.", "[REQ-DEL-001] Algorithmic Route Clustering: "),
        createBullet("Riders MUST collect one-time passwords (OTP) from customers to complete high-value meal package handovers.", "[REQ-DEL-002] OTP Proof-of-Delivery: "),
        createBullet("The logistics module MUST record transit times and verify insulated thermal bag temperature integrity upon delivery.", "[REQ-DEL-003] Cold-Chain Integrity: "),

        createH2("3.11 Managing Director (MD) Executive Command Center"),
        createBullet("The MD dashboard MUST display live aggregate revenue, Gross Merchandise Value (GMV), and net profit margins across all active cloud kitchens.", "[REQ-EXEC-001] Real-Time Financial Telemetry: "),
        createBullet("The system MUST provide unit economics breakdowns: Food Cost %, Packaging Cost %, Labor Cost %, and Aggregator Commission % per dish.", "[REQ-EXEC-002] Unit Economics & COGS Breakdown: "),
        createBullet("The platform MUST feature an interactive Ingredient Price & Recipe Costing Calculator with instant profit margin impact modeling.", "[REQ-EXEC-003] Recipe Costing Calculator: ")
      ]
    },
    {
      properties: {
        page: {
          margin: {
            top: 1440,
            right: 1440,
            bottom: 1440,
            left: 1440
          }
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
        // Section 4: External Interfaces
        createH1("4. EXTERNAL INTERFACE REQUIREMENTS"),

        createH2("4.1 User Interfaces"),
        createBodyP(
          "The user interface follows a modern, accessible design language emphasizing optical hierarchy, high contrast, and responsive layout across desktop, tablet, and mobile devices."
        ),
        createBullet("Storefront: Clean, visual dish catalog with nutrition badges, macro cards, and modal customization dialogs.", "Customer UI: "),
        createBullet("Kitchen KDS: High-contrast dark theme optimized for low-glare kitchen environments with large 44px+ touch targets.", "KDS Kitchen UI: "),
        createBullet("POS Terminal: Fast numerical keypad entry, barcode scanning listener, and single-click checkout buttons.", "POS UI: "),
        createBullet("Executive Cockpit: Responsive dashboard charts (Recharts), key performance metric cards, and drill-down tables.", "Executive UI: "),

        createH2("4.2 Hardware Interfaces"),
        createBullet("Thermal Receipt Printers: Standard ESC/POS command protocol over USB/Ethernet/Bluetooth for 80mm and 58mm paper widths.", "Printers: "),
        createBullet("Digital Kitchen Scales: RS-232 serial and Bluetooth communication for exact portion weight verification.", "Weighing Scales: "),
        createBullet("Barcode & QR Scanners: HID keyboard emulation and 2D image sensors for student meal pass scanning.", "Barcode Scanners: "),
        createBullet("Temperature Data Loggers: Bluetooth Low Energy (BLE) sensors transmitting walk-in cooler temperature logs.", "IoT Sensors: "),

        createH2("4.3 Software & API Interfaces"),
        createTable(
          ["External System", "Integration Type", "Purpose & Data Exchanged"],
          [
            ["Swiggy Partner API", "REST Webhooks / OAuth2", "Menu synchronization, order push notifications, rider arrival ETA, cancellation events."],
            ["Zomato Food Engine", "REST Webhooks / Secret Key", "Live stock toggling, order acceptance, batch pacing, settlement reports."],
            ["Razorpay / UPI Gateway", "Secure Hosted SDK / Webhooks", "Tokenized card transactions, dynamic UPI QR generation, instant refunds."],
            ["Twilio / WhatsApp Business", "HTTPS REST API", "Subscription meal pass reminders, dispatch tracking links, OTP delivery authentication."],
            ["Biometric Attendance", "TCP/IP Socket Sync", "Staff clock-in/out timestamp synchronization with HRM shift management."]
          ]
        ),

        createH2("4.4 Communications Interfaces"),
        createBodyP(
          "All data in transit MUST be encrypted using Transport Layer Security (TLS 1.3). Real-time communication between server and kitchen KDS terminals MUST utilize WebSockets with automated fallback to HTTP long-polling."
        ),

        // Section 5: Non-Functional Requirements
        createH1("5. NON-FUNCTIONAL REQUIREMENTS"),

        createH2("5.1 Performance and Scalability"),
        createBullet("The web storefront MUST achieve a First Contentful Paint (FCP) of under 1.2 seconds on standard 4G mobile networks.", "[NFR-PERF-001] Latency: "),
        createBullet("The KDS engine MUST reflect newly placed orders across all kitchen stations in under 500 milliseconds.", "[NFR-PERF-002] Order Propagation: "),
        createBullet("The system architecture MUST support a minimum concurrency of 10,000 active customer sessions and 250 cloud kitchen branches without performance degradation.", "[NFR-PERF-003] Concurrency: "),

        createH2("5.2 Food Safety & Regulatory Compliance"),
        createBullet("The platform MUST comply with FSSAI regulations, recording hygiene audit checklists and water quality reports.", "[NFR-SAFE-001] Statutory Compliance: "),
        createBullet("Every batch of poultry and dairy MUST be traceable to specific vendor delivery lots and temperature-controlled storage logs.", "[NFR-SAFE-002] Lot Traceability: "),
        createBullet("All allergen data MUST be explicitly stored and prominently displayed on product labels and customer receipts.", "[NFR-SAFE-003] Allergen Transparency: "),

        createH2("5.3 Security and Access Control"),
        createBullet("Role-Based Access Control (RBAC) MUST strictly restrict sensitive screens (Payroll, COGS, Vendor Rates) to authorized executive credentials.", "[NFR-SEC-001] Role-Based Access: "),
        createBullet("All customer Personally Identifiable Information (PII) and health metrics MUST be encrypted at rest using AES-256.", "[NFR-SEC-002] Data Encryption: "),
        createBullet("Every administrative action (e.g., price changes, staff terminations, refunds) MUST be logged in an immutable audit trail.", "[NFR-SEC-003] Immutable Audit Trail: "),

        createH2("5.4 Software Quality Attributes"),
        createBullet("The system MUST maintain a minimum uptime SLA of 99.95% during operational kitchen hours (06:00 AM - 11:59 PM IST).", "High Availability: "),
        createBullet("In the event of an internet disruption, local POS and KDS stations MUST continue executing operations via local caching.", "Fault Tolerance: "),
        createBullet("System updates and releases MUST be deployable with zero downtime via rolling blue-green deployments.", "Maintainability: "),

        // Section 6: Verification Matrix
        createH1("6. REQUIREMENTS VERIFICATION MATRIX"),
        createTable(
          ["Requirement ID", "Module", "Verification Method", "Success Acceptance Criteria"],
          [
            ["REQ-STORE-001", "Storefront", "Automated Unit Test & E2E", "Macros match ingredient database values within ±0.5% tolerance."],
            ["REQ-MESS-002", "Kerala Mess", "Integration Test", "Meal paused before 10 PM credited to wallet; meal after 10 PM rejected."],
            ["REQ-AGGR-002", "Buffer Engine", "Stress Test Simulation", "Aggregator orders throttled when kitchen queue exceeds 25 active tickets."],
            ["REQ-KDS-001", "Chef KDS", "Live Station Verification", "Multi-item orders split accurately across Grill, Cold, and Kettle displays."],
            ["REQ-FERM-002", "Brewery Lab", "Threshold Trigger Test", "Alert fires within 60 seconds when tank reaches pH 3.4 and 4.5° Brix."],
            ["REQ-POS-002", "Billing Engine", "Financial Audit Test", "GST CGST/SGST invoices calculate 5% with exact rounded paise accuracy."],
            ["REQ-HRM-004", "Staff Portal", "Security Authentication Test", "Kerala Mess terminal login automatically activates Mess Chef workspace."]
          ]
        ),

        new Paragraph({ text: "", spacing: { after: 200 } }),
        createCallout(
          "Document Approval",
          "This Software Requirements Specification has been formally verified and approved by the Protein Bowl Enterprise Architecture Council and is ready for production release and distribution."
        )
      ]
    }]
  });

  return doc;
}

async function main() {
  console.log("Generating Protein Bowl Enterprise SRS Word Document (.docx)...");
  const doc = await buildSRS();
  
  // Ensure public directory exists
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const outputPath = path.join(publicDir, 'Protein_Bowl_Enterprise_SRS.docx');
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);

  console.log(`SRS Word Document successfully created at: ${outputPath}`);
  console.log(`File size: ${(buffer.length / 1024).toFixed(2)} KB`);
}

main().catch(err => {
  console.error("Error generating SRS Word document:", err);
  process.exit(1);
});
