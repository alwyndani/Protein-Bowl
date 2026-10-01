# Protein Bowl Enterprise Platform — Master Implementation Plan

> **Authoritative Technical Roadmap & Dependency-Ordered Execution Guide**

---

## 📌 Executive Overview

This document defines the comprehensive master execution plan for turning the Protein Bowl codebase into a production-oriented, cross-platform enterprise food-tech platform encompassing:
1. **React Web Application** (`src/`)
2. **React Native Mobile Application** (`apps/mobile/`)
3. **Node.js/Express + TypeScript REST & Real-Time API Server** (`server/`)
4. **Centralized PostgreSQL Database** with Prisma ORM (`server/prisma/schema.prisma`)
5. **Shared Types and Validation Packages** (`packages/shared/`)

---

## 🏗️ Architectural Topology & Shared Architecture

```
                               ┌───────────────────────────┐
                               │   React Web Application   │
                               │  (Vite + React 19 + TS)   │
                               └─────────────┬─────────────┘
                                             │ HTTPS / WSS
                                             ▼
┌──────────────────────────┐    ┌───────────────────────────┐
│   React Native Mobile    ├───►│  Express 4 API Gateway    │
│  (Expo SDK 52 + TS)      │    │  (TypeScript + RBAC + Zod)│
└──────────────────────────┘    └─────────────┬─────────────┘
                                             │
                                             ▼
                                ┌───────────────────────────┐
                                │   Prisma ORM (Data Layer) │
                                └─────────────┬─────────────┘
                                             │
                                             ▼
                                ┌───────────────────────────┐
                                │   PostgreSQL Database     │
                                └───────────────────────────┘
```

---

## 🗓️ Phase Breakdown & Dependency Ordering

### Phase 0: Repository Audit & Planning (COMPLETE)
- Audited frontend, backend, Prisma schema, data files, and types.
- Established `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_STATUS.md`, and `ARCHITECTURE.md`.

### Phase 1: Shared Modules & Database Schema Expansion
- **Monorepo / Shared Package Setup**: Create `packages/shared` for shared TypeScript interfaces and Zod validation schemas across server, web, and mobile.
- **Prisma Schema Expansion**: Implement normalized Prisma schema for all 21 modules:
  - Auth & Audit (`AuditLog`)
  - Health & Diet (`DietPlanRequest`, `DietPlan`, `DietPlanDay`, `DietPlanMeal`, `WorkoutPlan`)
  - Recipe & Catalog (`Recipe`, `RecipeIngredient`, `ProductCategory`, `Product`, `ProductVariant`)
  - Checkout & Orders (`Cart`, `CartItem`, `Order`, `OrderItem`, `Payment`, `PaymentAttempt`, `Refund`, `Coupon`, `Subscription`)
  - Kerala Mess (`MessAccount`, `MessSubscriptionPlan`, `MessSubscription`, `MessDailyOrder`, `MealPauseRequest`, `WalletAccount`, `WalletTransaction`, `GatePass`)
  - Kitchen & KDS (`KitchenStation`, `KitchenOrderTicket`, `KitchenBatch`, `ProductionTask`, `QualityCheck`)
  - Procurement & Inventory (`InventoryItem`, `StockMovement`, `Vendor`, `PurchaseOrder`, `GoodsReceipt`, `InventoryBatch`)
  - Logistics (`DeliveryAssignment`, `DeliveryPartner`, `DeliveryStatusEvent`, `ProofOfDelivery`)
  - POS (`POSTransaction`, `POSTransactionItem`, `CashDrawerShift`, `Receipt`)
  - FMCG & Brewery (`FMCGBatch`, `DispatchChallan`, `TepacheTank`, `TepacheBrewBatch`, `FermentationReading`, `BottleReturn`)
  - Aggregators, HRM, Finance & CMS (`AggregatorOrder`, `AggregatorCommissionRecord`, `HRMEmployee`, `AttendanceRecord`, `PayrollRecord`, `FinancialTransaction`, `FinancialVoucher`, `CMSBanner`, `CMSMedia`, `MealPlanDefinition`)
- **Database Migrations & Seeding**: Generate Prisma migrations and enrich `prisma/seed.ts` with foundational recipes, categories, kitchen branches, admin/staff users, and mess plans.

### Phase 2: Core Backend Modules Implementation
- Build domain-driven modules in `server/src/modules/`:
  - `recipes`: CRUD, portion scaling, nutrition calculations, published catalog.
  - `products`: Category filtering, variants, pricing, branch inventory.
  - `cart`: Cart creation, item additions/updates/deletions, tax & delivery fee calculations.
  - `orders`: Order placement, stock reservation, status transitions (`PENDING` -> `CONFIRMED` -> `PREPARING` -> `READY` -> `DISPATCHED` -> `DELIVERED`), order history, tracking.
  - `subscriptions`: Diet & mess subscription activation, renewal scheduling, daily meal generation.
  - `mess`: Student registration, daily slot selection, meal pauses with atomic wallet ledger crediting, gate passes.
  - `kds`: Branch-specific station queues, batch scaling, status progress updates.
  - `procurement`: Stock movements, PO lifecycle, vendor master, low-stock & expiry alerts.
  - `delivery`: Driver queue, dispatch assignment, proof of delivery upload/verification.
  - `pos`: Walk-in order processing, drawer float shifts, split payments, instant receipt generation.
  - `fmcg`: Production batches, QC sign-off, retail partner dispatch challans.
  - `tepache`: Tank readings (pH, Brix, temp), brewing stages, bottle deposits & returns.
  - `aggregators`: Swiggy/Zomato webhook handler, stock buffer management, commission tracking.
  - `md`: Statewide branch telemetry, revenue analytics, P&L generation, cross-branch stock transfers.
  - `hrm`: Staff attendance, leave workflows, payroll generation, appointment letters.
  - `finance`: Ledger vouchers, expense tracking, cashflow reports.
  - `cms`: Promotional banners, video media links, pricing overrides.
  - `audit`: System-wide audit log query service.

### Phase 3: Web Application Integration
- Replace mock data and local state across all existing components:
  - `CustomerDashboard.tsx`, `CustomerHome.tsx`, `HealthProfileWizard.tsx`, `DietPlanBuilder.tsx`
  - `MessCustomerPortal.tsx`
  - `ChefDashboard.tsx`, `NutritionistDashboard.tsx`, `TrainerDashboard.tsx`, `ProcurementDashboard.tsx`, `DeliveryDashboard.tsx`, `POSDashboard.tsx`, `BakeryFMCGDashboard.tsx`, `TepacheBreweryDashboard.tsx`, `SwiggyZomatoAggregatorPortal.tsx`, `MDDashboard.tsx`, `HRMModule.tsx`, `FinancialsModule.tsx`, `MultiKitchenOverviewModule.tsx`
- Ensure all API calls flow through `src/services/apiClient.ts` with seamless auth refresh and token management.

### Phase 4: Mobile Application Development (`apps/mobile`)
- Initialize React Native Expo app with TypeScript and Expo Router / React Navigation.
- Set up secure token storage (`expo-secure-store`).
- Build Customer Screens: Auth, Home, Menu, Health Profile, Custom Diet Plan Requests, Mess Portal & Meal Pausing, Wallet, Cart, Checkout, Live Order Tracking, Workout Split, Notifications.
- Build Staff Screens: Chef KDS Queue, Delivery Dispatch & Proof of Delivery, Procurement Stock Count, Mess Meal Gatepass Verification.
- Integrate Expo Push Notifications and deep linking.

### Phase 5: Real-Time Telemetry & Background Job Automation
- Implement SSE (Server-Sent Events) or WebSockets in Express server for live KDS order streaming, order tracking updates, and MD dashboard telemetry.
- Build node-cron / background worker services in backend for:
  - Daily Kerala Mess meal generation at midnight.
  - Automated subscription renewal reminders.
  - Expiry and low-stock notification triggers.
  - Swiggy/Zomato stock buffer reconciliation.

### Phase 6: Automated Testing, Verification & Production Readiness
- **Backend Testing**: Unit tests for Zod validators and biometric calculators; integration tests for auth, order creation, wallet transactions, and RBAC authorization.
- **Web Testing**: Component rendering tests and end-to-end user workflow verification.
- **Mobile Testing**: Navigation, token refresh, and ordering flow tests.
- **Docker & DevOps**: Dockerfile for backend, docker-compose for local PostgreSQL & server execution, environment configuration validation.

---

## 🔒 Security & Compliance Safeguards
1. **Zero Secret Leakage**: No hardcoded API keys or database passwords in client apps.
2. **RBAC Enforcement**: All backend routes protected by `authenticateToken` and `requireRole(...)`.
3. **Data Isolation**: Customers restricted to their own `userId` records.
4. **Ledger Immutability**: Wallet balances mutated exclusively via double-entry `WalletTransaction` records.
