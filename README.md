# 🥗 Protein Bowl — Master Project Specification & Development Blueprint

> **Master Single Source of Truth** for understanding, developing, completing, testing, and deploying the **Protein Bowl** Enterprise Full-Stack Platform.

---

## 📌 Executive Summary & Product Vision

**Protein Bowl** is an enterprise-grade full-stack platform combining **personalized clinical nutrition, custom food subscriptions, health & biometrics tracking, student mess management, retail FMCG packaged foods, probiotic brewery ERP, and statewide multi-kitchen cloud operations**.

The system connects end-consumers with specialized culinary, nutritional, and logistics staff across **13 distinct user roles**, backed by real-time production telemetry, financial ledgering, inventory management, and Point of Sale (POS) counter operations.

```mermaid
flowchart TB
    subgraph Public ["1. Public Website"]
        Hero["Cinematic Hero & Video Landing"]
        Catalog["12-Category Menu Catalog"]
        FMCGShop["Direct FMCG & Tepache Store"]
    end

    subgraph CustomerEcosystem ["2. Authenticated Customer Portals"]
        CustomerPortal["Customer Portal\n(Profile, Health, Diet Builder, Subscriptions, Dashboard)"]
        KeralaMessPortal["Kerala Mess Portal\n(Hostel Student Subscriptions, Meal Pause, Wallet)"]
    end

    subgraph BusinessAdmin ["3. Admin & Business Content (CMS)"]
        AdminCMS["Admin Content Management\n(Banners, Video Uploads, Plan Definitions, Pricing)"]
    end

    subgraph ERP ["4. Enterprise ERP & Staff Dashboards"]
        MD["MD Command Center"]
        Nutri["Nutritionist Workstation"]
        Trainer["Trainer Workstation"]
        Chef["Chef & KDS Station"]
        Procure["Procurement & Inventory"]
        Delivery["Logistics & Fleet"]
        POS["POS Cashier Billing"]
        FMCG["Bakery & FMCG ERP"]
        Tepache["Tepache Brewery ERP"]
        Aggregator["Swiggy/Zomato Buffer"]
        HRM["HRM & Payroll"]
        Finance["Financial Ledger"]
    end

    Public -->|Register / Login| CustomerEcosystem
    CustomerEcosystem <-->|Orders / Health Requests| ERP
    AdminCMS -->|Configures Content & Pricing| Public
    AdminCMS -->|Configures Content & Pricing| CustomerEcosystem
```

---

## 🔐 Customer vs. Staff Boundaries & Access Controls

### 1. Two Top-Level Customer Portals
An authenticated **CUSTOMER** account has access to only **TWO** primary user-facing portals:
1. **Customer Portal** — Main personalized experience (Health profile, custom diet builder, meal subscriptions, calorie tracker, workout split, cart, checkout, order tracking, referrals, support).
2. **Kerala Mess** — Specialized hostel/student subscription portal (Traditional Kerala meal plans, daily slot selection, meal pause/refund to wallet, gate pass codes).

### 2. Strict Customer Permissions Boundary
The **Customer is an END-USER / CONSUMER**. 
- **CUSTOMERS MAY**: View published menus, calculate health biometrics (BMR/TDEE/BMI), request custom diet plans, approve plans, subscribe, purchase direct FMCG/Tepache products, track orders, manage own health profile, manage delivery addresses, use Kerala Mess features, view payment receipts, and submit feedback.
- **CUSTOMERS MUST NOT**: Manage business-owned content. Customers cannot create/edit promotional banners, upload landing videos, alter meal plan prices, change product SKUs, edit stock levels, view employee records, or access any ERP dashboard.

> ⚠️ **CRITICAL SECURITY REQUIREMENT**: Frontend hiding of staff UI elements is **NOT** security. All backend APIs MUST enforce Role-Based Access Control (RBAC) and verify resource ownership (`req.user.userId`).

---

## 👥 Role & Permissions Matrix

The platform supports 13 roles defined in the Prisma database schema (`RoleEnum`):

| RoleEnum | Portal Interface | Primary Responsibilities | Data & Scope Access |
| :--- | :--- | :--- | :--- |
| `CUSTOMER` | Customer Portal | Personal profile, health biometrics, custom meal plans, cart, order tracking | Own account data (`userId`) |
| `MESS_CUSTOMER` | Kerala Mess Portal | Student hostel subscriptions, daily meal pause/refund, gate pass tracking | Own mess account data |
| `SUPER_ADMIN` | Full System Access | Platform oversight, system configuration, global RBAC override | Complete system-wide access |
| `MD` | MD Command Center | Enterprise telemetry, statewide branch metrics, P&L, stock transfers | All kitchen branches & financials |
| `NUTRITIONIST` | Clinical Workstation | Biometric review, macro calculation, meal assembly, day plan approval | Assigned customer diet requests |
| `TRAINER` | Trainer Workstation | Client workout split creation, progress photo review, 1-on-1 video sessions | Assigned customer workout plans |
| `CHEF` | Chef Dashboard & KDS | KDS station production, recipe batch scaling, quality sign-off | Kitchen branch prep & production |
| `PROCUREMENT` | Inventory ERP | Raw material stock management, vendor master, purchase bills, asset ledger | Kitchen branch stock & vendors |
| `DELIVERY` | Logistics & Fleet ERP | Route dispatch, cold-chain temperature logging, proof of delivery | Branch orders & delivery fleet |
| `POS` | POS Cashier Billing | Walk-in counter billing, KOT printing, cash float drawer management | Branch outlet cash drawer & receipts |
| `BAKERY_FMCG` | FMCG Packaged ERP | Packaged food production batches, QC sign-off, shop dispatch challans, returns | FMCG production & retail partners |
| `TEPACHE_ERP` | Probiotic Brewery | Fermentation tank telemetry (pH/Brix/CFU/Temp), B2B cafe orders, bottle return ledger | Brewery tanks & B2B accounts |
| `SWIGGY_ZOMATO` | Aggregator Manager | Swiggy/Zomato stock buffer allocation, commission tracking, pickup OTP verification | Aggregator order streams |

---

## 🏗️ Technical Architecture

### 1. Technology Stack
- **Frontend**: React 19, TypeScript 5.8, Vite 6, TailwindCSS 4, Lucide React, Motion (Framer), Recharts, Canvas-Confetti, Docx (SRS generation).
- **Backend**: Node.js, Express 4.21, TypeScript 5.8, Prisma ORM 6.4, PostgreSQL.
- **Security & Auth**: Bcryptjs (Password Hashing, cost 12), JSON Web Tokens (JWT Access Token 15m), Cookie-Parser (HTTP-Only Refresh Token Cookie 7d), Helmet, CORS, Express Rate Limit, Zod validation.

### 2. Physical Directory Layout
```
protein-bowl/
├── .env / .env.example              # Frontend environment configuration
├── index.html                       # Entry HTML file
├── package.json                     # Frontend dependencies & scripts
├── vite.config.ts                   # Vite build & dev server config
├── scripts/                         # Build & SRS generator scripts
│   └── generate_srs_docx.ts
├── server/                          # Backend Express + Prisma Application
│   ├── .env / .env.example          # Backend environment configuration
│   ├── package.json                 # Backend dependencies & scripts
│   ├── tsconfig.json                # Server TypeScript config
│   ├── prisma/
│   │   ├── schema.prisma            # PostgreSQL Master Database Schema
│   │   ├── seed.ts                  # Database seeding script
│   │   └── migrations/              # Database migration history
│   └── src/
│       ├── server.ts                # Server listener entrypoint (Port 5000)
│       ├── app.ts                   # Express app setup, CORS, Helmet, routes
│       ├── config/                  # Environment variable validation (`env.ts`)
│       ├── middleware/              # Auth, RBAC, Rate Limiter, Error, Validator
│       ├── modules/                 # Modular domain features (`auth/`)
│       └── utils/                   # API response helpers, JWT, Hash utilities
└── src/                             # Frontend React Application
    ├── App.tsx                      # Root Application Shell & State Orchestrator
    ├── main.tsx                     # React DOM Root Entrypoint
    ├── types.ts                     # Master TypeScript Type Definitions (1500+ lines)
    ├── assets/                      # Static images & branding assets
    ├── components/
    │   ├── common/                  # BrandHeader, BrandFooter, Modals, Calculators
    │   ├── customer/                # Customer Portal, Health Wizard, Diet Builder
    │   ├── erp/                     # 12 Internal Staff ERP Dashboards
    │   └── mess/                    # Kerala Mess Portal & Swiggy/Zomato Portal
    ├── context/
    │   └── AuthContext.tsx          # Real Auth Provider & Role Mapping
    ├── data/                        # Static Mock Databases (Domain data)
    └── services/
        ├── apiClient.ts             # Centralized Fetch Client (In-memory token, auto-refresh)
        └── authService.ts           # Authentication API service wrapper
```

---

## 🔒 Authentication & Security Architecture (Phase 1 Real Implementation)

Phase 1 production authentication is **fully implemented** in Node.js/Express + PostgreSQL + Prisma:

```mermaid
sequenceDiagram
    autonumber
    actor User as Client (Browser)
    participant Client as ApiClient / AuthContext
    participant API as Express API Server (/api/v1/auth)
    participant DB as PostgreSQL (Prisma)

    Note over User, DB: 1. User Authentication (Login)
    User->>Client: Enters Email & Password
    Client->>API: POST /api/v1/auth/login
    API->>DB: Query User & UserRoleAssignment by email
    DB-->>API: Return User & passwordHash
    API->>API: Verify Password with bcrypt.compare()
    API->>DB: Create RefreshToken (SHA-256 hash, 7d expiry)
    API-->>Client: Set HTTP-Only Cookie (pb_refresh_token) + Return AccessToken (15m) & User JSON
    Client->>Client: Store AccessToken in Memory (Never localStorage)

    Note over User, DB: 2. Protected API Request
    Client->>API: GET /api/v1/auth/me (Header: Bearer AccessToken)
    API->>API: Verify JWT Signature & Expiry
    API->>DB: Fetch User & Profiles
    API-->>Client: Return 200 OK + User Data

    Note over User, DB: 3. Token Rotation (Expired Access Token)
    API-->>Client: 401 Unauthorized (Token Expired)
    Client->>API: POST /api/v1/auth/refresh (Cookie: pb_refresh_token)
    API->>DB: Look up Token Hash, check revokedAt & expiresAt
    API->>DB: Revoke Old Token & Insert New Hashed RefreshToken
    API-->>Client: Set New HTTP-Only Cookie + Return New AccessToken (15m)
    Client->>API: Retry Original API Request
```

### Security Standards Enforced:
1. **In-Memory Access Tokens**: Access tokens are kept strictly in JavaScript memory (`ApiClient.accessTokenInMemory`). They are **never stored** in `localStorage` or `sessionStorage` to prevent XSS token theft.
2. **HTTP-Only Refresh Cookies**: Refresh tokens are stored in secure, `HttpOnly`, `SameSite=lax` cookies (`pb_refresh_token`) with a 7-day lifespan.
3. **Database Token Hashing & Rotation**: Refresh tokens are SHA-256 hashed in the `refresh_tokens` database table. Reusing a refresh token revokes all tokens for that user session.
4. **Backend RBAC**: Middleware `requireRoles([RoleEnum.MD, ...])` validates user roles stored in the JWT on the server side.

---

## 📊 Current Implementation Status Table

The repository currently operates in a **Hybrid State**: Phase 1 Authentication & Database Infrastructure are **REAL**, while complex domain modules use **Mock/Stateful Frontend Data**.

| Module / Domain | Status | Data Source | Real Backend / DB | Mock / Frontend |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication & Sessions** | 🟢 REAL BACKEND | PostgreSQL (`users`, `refresh_tokens`) | ✅ Real JWT, Cookies, Bcrypt, Prisma | ❌ None |
| **Role Assignment & RBAC** | 🟢 REAL BACKEND | PostgreSQL (`user_role_assignments`) | ✅ Real `RoleEnum` verification | ❌ None |
| **Kitchen Branch Management** | 🟡 PARTIAL | PostgreSQL (`kitchen_branches`) + Mock | ✅ DB seed branches (Kochi, Kozhikode) | ⚠️ State array in `App.tsx` |
| **Customer Profiles** | 🟢 REAL BACKEND | PostgreSQL (`customer_profiles`, `health_biometrics`) | ✅ Real DB profile & health biometrics | ❌ None |
| **Health Profile & Biometrics** | 🟢 REAL BACKEND | PostgreSQL (`health_biometrics`) | ✅ Real biometrics, BMR/TDEE/macros, Zod | ❌ None |
| **Diet Plan Builder & Requests** | 🟠 MOCK / STATEFUL | `mockData.ts` / Local React State | ❌ Planned Phase 3 | ⚠️ `DietPlanBuilder.tsx` |
| **Meal Recipe Database** | 🟠 MOCK / STATEFUL | `recipeDatabase.ts` / `recipes/*.ts` | ❌ Planned Phase 4 | ⚠️ 12 Categories (80+ recipes) |
| **Direct FMCG & Cart Checkout** | 🟠 MOCK / STATEFUL | `mockBakeryFMCGData.ts` / State | ❌ Planned Phase 4 | ⚠️ `DirectCartCheckoutModal.tsx` |
| **Subscriptions & Orders** | 🟠 MOCK / STATEFUL | `mockData.ts` / Local React State | ❌ Planned Phase 5 | ⚠️ `CheckoutModal.tsx` |
| **Order Live Tracking** | 🟠 MOCK / STATEFUL | `mockDirectOrdersData.ts` | ❌ Planned Phase 5 | ⚠️ `DirectOrderTrackingModal.tsx` |
| **Kerala Mess & Student Hostel** | 🟠 MOCK / STATEFUL | `mockKeralaMessData.ts` | ❌ Planned Phase 6 | ⚠️ `MessCustomerPortal.tsx` |
| **Chef & KDS Station Operations** | 🟠 MOCK / STATEFUL | Local React State | ❌ Planned Phase 7 | ⚠️ `ChefDashboard.tsx` |
| **Nutritionist Clinical Workstation**| 🟠 MOCK / STATEFUL | Local React State | ❌ Planned Phase 8 | ⚠️ `NutritionistDashboard.tsx` |
| **Trainer Workstation & Fitness** | 🟠 MOCK / STATEFUL | `mockFitnessData.ts` | ❌ Planned Phase 8 | ⚠️ `TrainerDashboard.tsx` |
| **Procurement & Asset ERP** | 🟠 MOCK / STATEFUL | `inventoryDatabase.ts` | ❌ Planned Phase 9 | ⚠️ `ProcurementDashboard.tsx` |
| **Delivery & Fleet Logistics** | 🟠 MOCK / STATEFUL | Local React State | ❌ Planned Phase 9 | ⚠️ `DeliveryDashboard.tsx` |
| **Point of Sale (POS) Billing** | 🟠 MOCK / STATEFUL | `mockPOSData.ts` | ❌ Planned Phase 10 | ⚠️ `POSDashboard.tsx` |
| **Bakery & FMCG Packaged Foods** | 🟠 MOCK / STATEFUL | `mockBakeryFMCGData.ts` | ❌ Planned Phase 11 | ⚠️ `BakeryFMCGDashboard.tsx` |
| **Tepache Probiotic Brewery ERP** | 🟠 MOCK / STATEFUL | `mockTepacheData.ts` | ❌ Planned Phase 12 | ⚠️ `TepacheBreweryDashboard.tsx` |
| **Swiggy & Zomato Buffer Manager**| 🟠 MOCK / STATEFUL | Local React State | ❌ Planned Phase 13 | ⚠️ `SwiggyZomatoAggregatorPortal.tsx`|
| **MD Command Center & Telemetry**| 🟠 MOCK / STATEFUL | `mockOmnichannelData.ts` | ❌ Planned Phase 15 | ⚠️ `MDDashboard.tsx` |
| **Human Resource Management (HRM)**| 🟠 MOCK / STATEFUL | Local React State | ❌ Planned Phase 15 | ⚠️ `HRMModule.tsx` |
| **Financial Ledger & Accounts** | 🟠 MOCK / STATEFUL | Local React State | ❌ Planned Phase 15 | ⚠️ `FinancialsModule.tsx` |
| **Admin CMS (Banners/Videos)** | 🔴 PLANNED | None | ❌ Planned Phase 14 | ❌ Not built |

---

## 🗄️ Database Architecture (Prisma & PostgreSQL)

### 1. Implemented Schema (Phase 1)
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum RoleEnum {
  CUSTOMER
  MESS_CUSTOMER
  SUPER_ADMIN
  MD
  NUTRITIONIST
  TRAINER
  CHEF
  PROCUREMENT
  DELIVERY
  POS
  BAKERY_FMCG
  TEPACHE_ERP
  SWIGGY_ZOMATO
}

enum UserStatus {
  PENDING
  ACTIVE
  SUSPENDED
  DEACTIVATED
}

model User {
  id                  String               @id @default(uuid())
  email               String               @unique
  passwordHash        String
  phone               String?              @unique
  status              UserStatus           @default(ACTIVE)
  isEmailVerified     Boolean              @default(false)
  lastLoginAt         DateTime?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  deletedAt           DateTime?

  roles               UserRoleAssignment[]
  refreshTokens       RefreshToken[]
  customerProfile     CustomerProfile?
  employeeProfile     EmployeeProfile?

  @@map("users")
}

model UserRoleAssignment {
  id                  String               @id @default(uuid())
  userId              String
  role                RoleEnum
  assignedAt          DateTime             @default(now())
  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, role])
  @@map("user_role_assignments")
}

model RefreshToken {
  id                  String               @id @default(uuid())
  tokenHash           String               @unique
  userId              String
  expiresAt           DateTime
  revokedAt           DateTime?
  createdAt           DateTime             @default(now())
  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("refresh_tokens")
}

model KitchenBranch {
  id                  String               @id @default(uuid())
  code                String               @unique
  name                String
  address             String
  city                String
  latitude            Float?
  longitude           Float?
  isActive            Boolean              @default(true)
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  employees           EmployeeProfile[]

  @@map("kitchen_branches")
}

model CustomerProfile {
  id                  String               @id @default(uuid())
  userId              String               @unique
  fullName            String
  dob                 DateTime?
  gender              String?
  deliveryAddress     String?
  referralCode        String               @unique
  referredByCode      String?
  walletBalance       Decimal              @default(0.00) @db.Decimal(10, 2)
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("customer_profiles")
}

model EmployeeProfile {
  id                  String               @id @default(uuid())
  userId              String               @unique
  employeeCode        String               @unique
  fullName            String
  designation         String
  shiftTiming         String?
  assignedBranchId    String?
  isOnline            Boolean              @default(false)
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  user                User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  assignedBranch      KitchenBranch?       @relation(fields: [assignedBranchId], references: [id])

  @@map("employee_profiles")
}
```

### 2. Proposed Database Models (For Future Phases)
To migrate remaining frontend modules to PostgreSQL, the following models are planned:
- `HealthBiometrics`: Storing height, weight, circumferences, medical conditions, blood test JSON.
- `Recipe`: Storing dish ingredients, macros, categories, step-by-step prep instructions.
- `DietPlanRequest` & `DayPlan`: Storing custom customer requests and nutritionist-approved meal plans.
- `Order` & `OrderItem`: Subscriptions, delivery slots, payment transactions, and FSSAI batch numbers.
- `MessSubscription` & `MessDailyOrder`: Student hostel passes, meal pauses, and gate pass codes.
- `FMCGBatch` & `FMCGDispatchChallan`: Packaged bakery batches, QC logs, retail shop deliveries.
- `TepacheBrewBatch`: Fermentation tank readings (pH, Brix, CFU, Temperature).
- `POSTransaction` & `CashDrawerShift`: Counter sales receipts, cash drawer floats, KOT tickets.
- `InventoryItem` & `VendorMaster`: Raw material stock levels, reorder thresholds, vendor contracts.
- `StaffEmployee` & `PayslipRecord`: HRM employee directory, payroll calculations, leave tracking.

---

## 🔌 API Architecture (REST Endpoints)

### 1. Implemented Endpoints (`/api/v1`)
| HTTP Method | Endpoint | Auth Required | Allowed Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | ❌ None | Public | Service health check |
| `POST` | `/api/v1/auth/register` | ❌ None | Public | Register new customer/mess account |
| `POST` | `/api/v1/auth/login` | ❌ None | Public | Authenticate user & return tokens |
| `POST` | `/api/v1/auth/refresh` | ❌ None (Cookie) | Public | Rotate HTTP-only refresh token |
| `POST` | `/api/v1/auth/logout` | ❌ None (Cookie) | Public | Revoke refresh token & clear cookie |
| `GET` | `/api/v1/auth/me` | ✅ Bearer JWT | Authenticated | Retrieve authenticated user profile |
| `GET` | `/api/v1/auth/rbac-test` | ✅ Bearer JWT | Privileged Staff | Test RBAC permissions middleware |
| `GET` | `/api/v1/customers/me/profile` | ✅ Bearer JWT | CUSTOMER / MESS_CUSTOMER | Retrieve authenticated customer biometrics & profile |
| `PUT` | `/api/v1/customers/me/profile` | ✅ Bearer JWT | CUSTOMER / MESS_CUSTOMER | Update customer biometrics with server-computed macros |

### 2. Planned API Domains (Future Phases)
- `/api/v1/customers/me/diet-requests` (GET, POST) — Submit & track diet requests
- `/api/v1/customers/me/orders` (GET, POST) — Order checkout & payment callback
- `/api/v1/mess/subscriptions` (GET, POST, PUT) — Kerala mess plans & meal pauses
- `/api/v1/recipes` (GET, POST, PUT) — Public menu catalog & recipe database
- `/api/v1/erp/chef/kot` (GET, PATCH) — Kitchen Display System order management
- `/api/v1/erp/pos/transactions` (POST) — POS counter billing & receipt generation
- `/api/v1/erp/bakery/batches` (GET, POST, PATCH) — FMCG batch production & dispatch
- `/api/v1/erp/tepache/tanks` (GET, POST, PATCH) — Brewery fermentation telemetry
- `/api/v1/admin/cms` (GET, POST, PUT, DELETE) — Business content & promotional banners

---

## 📦 Comprehensive Module Inventory

Each module listed below represents a core operational capability of Protein Bowl.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 1: AUTHENTICATION & SESSION MANAGEMENT                           │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: All Roles (Public / Customer / Staff)                     │
│ • Current State: REAL BACKEND + DATABASE (Phase 1 Complete)              │
│ • Data Source: PostgreSQL (users, user_role_assignments, refresh_tokens) │
│ • Features: Express Auth Controller, Zod Validation, Bcrypt hashing,     │
│   JWT Access Tokens (15m), HTTP-Only Refresh Cookies (7d), Rotation,     │
│   AuthContext session restoration, Role Mapping to UserRole enum.         │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 2: CUSTOMER ONBOARDING & HEALTH BIOMETRICS                        │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: CUSTOMER                                                 │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: HealthProfileWizard.tsx / mockData.ts                     │
│ • Features: 5-step health wizard, auto BMR/TDEE/BMI/Macro calculators,   │
│   limb circumferences, medical conditions, blood test inputs (HbA1c/HDL),│
│   women's health tracking, target calorie deficit calculation.           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 3: CUSTOM DIET PLAN BUILDER & REQUEST WORKFLOW                    │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: CUSTOMER                                                 │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: DietPlanBuilder.tsx / CustomerPlanReview.tsx              │
│ • Features: Custom duration (3, 7, 20, 30 days), frequency selection,    │
│   cuisine/grain/spice preferences, automated pricing breakdown,          │
│   submission to Nutritionist workstation, revision & rejection flow.    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 4: CUSTOMER DASHBOARD & CALORIE TRACKER                           │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: CUSTOMER                                                 │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: CustomerDashboard.tsx                                     │
│ • Features: Active subscription tracking, daily meal schedule, weight log│
│   chart, calorie/macro compliance gauge, progress photo uploader,        │
│   1-on-1 video consultation booking, meal feedback submission.           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 5: 12-CATEGORY CHEF MENU CATALOG & NUTRITION ENGINE              │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: All Users (Public / Customer / Chef / Nutritionist)      │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: recipeDatabase.ts / recipes/*.ts (80+ recipes)            │
│ • Features: 12 category filter grid (Proteins, Salads, Quinoa, Desserts),│
│   full macro breakdown, ingredient cost engine, macro label generator,   │
│   modal nutrition inspect cards.                                         │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 6: DIRECT FMCG & TEPACHE SHOPPING CART & TRACKING                 │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: CUSTOMER                                                 │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: DirectCartCheckoutModal.tsx / DirectOrderTrackingModal.tsx│
│ • Features: E-commerce shopping cart, quick buy, guest checkout,         │
│   instant order lookup by phone/order number, glass bottle deposit      │
│   credit balance ledger, reorder basket flow.                            │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 7: KERALA MESS & STUDENT HOSTEL SUBSCRIPTION PORTAL               │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: MESS_CUSTOMER                                            │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: MessCustomerPortal.tsx / mockKeralaMessData.ts            │
│ • Features: Traditional Kerala meal plans (Veg, Non-Veg, Fish, Egg),     │
│   daily slot ordering, home-trip meal pause with automatic wallet refund,│
│   tiffin container tracking, hostel gate pass QR/code delivery.          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 8: CHEF & KDS STATION PRODUCTION DASHBOARD                        │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: CHEF                                                     │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: ChefDashboard.tsx                                         │
│ • Features: Kitchen Display System (KDS), station prep queues, recipe    │
│   batch scaling by portion count, quality sign-off checklist, FSSAI      │
│   batch number assignment, branch switching.                             │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 9: NUTRITIONIST CLINICAL WORKSTATION                              │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: NUTRITIONIST                                             │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: NutritionistDashboard.tsx                                 │
│ • Features: Review incoming customer diet requests, inspect biometrics,  │
│   calibrate daily target calories, assemble 7-day meal plans from recipe │
│   database, add clinical notes, approve plan for customer review.        │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 10: TRAINER WORKSTATION & FITNESS MODULE                          │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: TRAINER                                                  │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: TrainerDashboard.tsx / mockFitnessData.ts                 │
│ • Features: Assign 3-day/5-day/6-day workout splits, manage exercises,   │
│   review masked customer progress photos, schedule 1-on-1 video sessions. │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 11: PROCUREMENT, INVENTORY & ASSET ERP                            │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: PROCUREMENT                                              │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: ProcurementDashboard.tsx / inventoryDatabase.ts           │
│ • Features: Raw material stock tracking, automated reorder thresholds,   │
│   vendor master registry, purchase bill logging, capital asset ledger,   │
│   kitchen yield vs. wastage variance calculator.                         │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 12: LOGISTICS, FLEET & DELIVERY ERP                               │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: DELIVERY                                                 │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: DeliveryDashboard.tsx                                     │
│ • Features: Delivery route dispatch, cold-chain temperature logging,    │
│   status transitions (Confirmed -> Production -> Dispatched -> Delivered),│
│   driver phone assignment, customer address navigation.                  │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 13: POINT OF SALE (POS) CASHIER COUNTER BILLING                   │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: POS                                                      │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: POSDashboard.tsx / mockPOSData.ts                        │
│ • Features: Fast touch menu billing, instant KOT printing, split payment │
│   (Cash + UPI + Card), cash drawer float shift opening/closing, receipt │
│   number generation (`POS-KOC-10492`).                                   │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 14: BAKERY & PACKAGED FOODS FMCG ERP                              │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: BAKERY_FMCG                                              │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: BakeryFMCGDashboard.tsx / mockBakeryFMCGData.ts           │
│ • Features: Packaged batch production tracking, QC pass/reject, dispatch │
│   challans to supermarkets/cafes, near-expiry alert engine, returns       │
│   disposition (bio-compost/credit note).                                 │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 15: TEPACHE PROBIOTIC BREWERY & REVERSE LOGISTICS                 │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: TEPACHE_ERP                                              │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: TepacheBreweryDashboard.tsx / mockTepacheData.ts          │
│ • Features: Fermentation tank telemetry (pH, Brix, CFU, Temp, stage),    │
│   B2B cafe supply order fulfillment, glass bottle reverse logistics      │
│   returns inspection, bottle deposit refund ledger.                      │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 16: SWIGGY & ZOMATO AGGREGATOR BUFFER MANAGER                     │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: SWIGGY_ZOMATO                                            │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: SwiggyZomatoAggregatorPortal.tsx                          │
│ • Features: Real-time stock reservation buffer between mess and 3rd party│
│   apps, commission margin calculator (Swiggy 20% vs Zomato 18%), live    │
│   order stream, pickup OTP verification.                                 │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 17: MD EXECUTIVE COMMAND CENTER & BRANCH METRICS                  │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: MD                                                       │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: MDDashboard.tsx / mockOmnichannelData.ts                  │
│ • Features: Statewide multi-kitchen telemetry (Kochi, Kozhikode, Trivandrum),│
│   live capacity utilization, inter-kitchen stock transfers, omnichannel   │
│   sales revenue breakdown, staff account switcher.                       │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 18: HUMAN RESOURCE MANAGEMENT (HRM) & PAYROLL                      │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: SUPER_ADMIN / MD / HR                                    │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: HRMModule.tsx                                             │
│ • Features: Complete staff directory, attendance log, leave approvals,   │
│   automated payroll calculation (Allowances, PF, ESI, TDS), payslip PDF  │
│   generator, formal appointment letter generator, exit FNF clearance.    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 19: FINANCIAL LEDGER & ACCOUNTS MODULE                            │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: SUPER_ADMIN / MD / Accountant                            │
│ • Current State: MOCK / STATEFUL FRONTEND                                │
│ • Data Source: FinancialsModule.tsx                                      │
│ • Features: Income & expense voucher logging, vendor purchase bill audit,│
│   P&L cashflow analytics, statutory tax filing tracking.                 │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ MODULE 20: ADMIN CONTENT MANAGEMENT SYSTEM (CMS)                         │
├──────────────────────────────────────────────────────────────────────────┤
│ • Primary Role: SUPER_ADMIN / MD                                         │
│ • Current State: 🔴 PLANNED (Future Phase 14)                            │
│ • Target State: Upload landing banners, promo videos, define base prices,│
│   configure global discount coupons, publish seasonal menu items.        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Phased Development Roadmap

The platform will transition from mock state to full database integration in **17 structured phases**:

```
Phase 1: Real Auth, PostgreSQL, Prisma, JWT, Refresh Tokens, RBAC (COMPLETED)
   │
Phase 2: Customer Profile, Health & Biometrics DB Integration (COMPLETED)
   │
Phase 3: Diet Plan Engine & Custom Subscription Request Workflow
   │
Phase 4: Product Catalog, E-Commerce Cart & Direct Checkout
   │
Phase 5: Orders, Live Tracking & Fleet Delivery Integration
   │
Phase 6: Kerala Mess & Student Hostel Subscription Management
   │
Phase 7: Kitchen Operations, Chef KOT & Station Dispatch
   │
Phase 8: Nutritionist & Trainer Clinical Workstations
   │
Phase 9: Procurement, Inventory & Vendor Management
   │
Phase 10: Point of Sale (POS) Counter Billing & Cash Drawer
   │
Phase 11: Bakery & Packaged Foods FMCG ERP
   │
Phase 12: Tepache Probiotic Brewery & Reverse Logistics
   │
Phase 13: Swiggy / Zomato Aggregator Integration
   │
Phase 14: Business Content Management (Admin CMS)
   │
Phase 15: HRM, Enterprise Financials & MD Reporting
   │
Phase 16: Automated Testing, Security Auditing & Observability
   │
Phase 17: Production Hardening, CI/CD & Deployment
```

---

### Phase Details & Completion Criteria

#### Phase 1: Authentication & RBAC Foundation (🟢 COMPLETED)
- **Objective**: Establish production database schema, user identity, secure password hashing, JWTs, HTTP-only refresh cookies, and RBAC middleware.
- **Completed Deliverables**: PostgreSQL database, Prisma schema, `bcryptjs` hashing, JWT access token (15m), HTTP-only refresh cookie (7d), SHA-256 token rotation in DB, `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/rbac-test`, `AuthContext.tsx` integration.

#### Phase 2: Customer Profile, Health & Biometrics DB Integration
- **Objective**: Migrate customer health profile, biometrics, blood test data, and addresses to PostgreSQL.
- **Database Schema Work**: Create `HealthBiometrics` and `CustomerAddress` models linked to `CustomerProfile`.
- **Backend Work**: Create `/api/v1/customers/me/health` endpoints (GET, PUT).
- **Frontend Integration**: Wire `HealthProfileWizard.tsx` and `HealthProfileTab.tsx` to call real API endpoints.

#### Phase 3: Diet Plan Engine & Custom Subscription Request Workflow
- **Objective**: Persist customer diet requests and nutritionist-approved day plans in PostgreSQL.
- **Database Schema Work**: Create `DietPlanRequest` and `DayPlanMeal` models.
- **Backend Work**: Implement `/api/v1/customers/me/diet-requests` and `/api/v1/erp/nutritionist/requests`.
- **Frontend Integration**: Connect `DietPlanBuilder.tsx` and `CustomerPlanReview.tsx` to real API endpoints.

#### Phase 4: Product Catalog, E-Commerce Cart & Direct Checkout
- **Objective**: Store master recipe database, FMCG packaged items, and Tepache bottles in PostgreSQL.
- **Database Schema Work**: Create `Recipe`, `PackagedProduct`, and `TepacheProduct` models.
- **Backend Work**: Create `/api/v1/products` catalog endpoints (GET) and cart validation API.
- **Frontend Integration**: Connect menu catalog and `DirectCartCheckoutModal.tsx` to real database.

#### Phase 5: Orders, Live Tracking & Fleet Delivery Integration
- **Objective**: Real-time order lifecycle tracking and logistics dispatch.
- **Database Schema Work**: Create `Order`, `OrderItem`, and `OrderTrackingStep` models.
- **Backend Work**: Create `/api/v1/orders` endpoints and WebSocket / SSE live tracking push.
- **Frontend Integration**: Connect `CheckoutModal.tsx`, `DirectOrderTrackingModal.tsx`, and `DeliveryDashboard.tsx`.

#### Phase 6: Kerala Mess & Student Hostel Subscriptions
- **Objective**: Hostel student subscription management and daily meal pause/refund engine.
- **Database Schema Work**: Create `MessAccount`, `MessSubscriptionPlan`, and `MessDailyOrder` models.
- **Backend Work**: Create `/api/v1/mess/pause-meal` endpoint (updates wallet balance atomically).
- **Frontend Integration**: Connect `MessCustomerPortal.tsx` to real API.

#### Phase 7: Kitchen Operations, Chef KOT & Station Dispatch
- **Objective**: Multi-kitchen KDS station queues and portion scaling.
- **Database Schema Work**: Create `KitchenBatch` and `KDSStationItem` models.
- **Backend Work**: Create `/api/v1/erp/chef/batches` endpoints with quality sign-off checks.
- **Frontend Integration**: Connect `ChefDashboard.tsx` to real backend socket.

#### Phase 8: Nutritionist & Trainer Clinical Workstations
- **Objective**: Dedicated clinical workstations for dietitians and fitness coaches.
- **Database Schema Work**: Create `ClientWorkoutPlan` and `VideoSession` models.
- **Backend Work**: Implement `/api/v1/erp/nutritionist` and `/api/v1/erp/trainer` APIs.
- **Frontend Integration**: Connect `NutritionistDashboard.tsx` and `TrainerDashboard.tsx`.

#### Phase 9: Procurement, Inventory & Asset ERP
- **Objective**: Stock inventory alerts, vendor master, purchase bills, asset tracking.
- **Database Schema Work**: Create `InventoryItem`, `VendorMaster`, `PurchaseBill`, `KitchenAsset` models.
- **Backend Work**: Create `/api/v1/erp/procurement` endpoints.
- **Frontend Integration**: Connect `ProcurementDashboard.tsx` to database.

#### Phase 10: Point of Sale (POS) Counter Billing & Cash Drawer
- **Objective**: Outlet counter sales, receipt generation, cash float drawer management.
- **Database Schema Work**: Create `POSTransaction` and `CashDrawerShift` models.
- **Backend Work**: Implement `/api/v1/erp/pos/transactions` and receipt printing API.
- **Frontend Integration**: Connect `POSDashboard.tsx` to POS backend API.

#### Phase 11: Bakery & Packaged Foods FMCG ERP
- **Objective**: Packaged batch production, QC pass/reject, wholesale retail dispatch, expiry recall.
- **Database Schema Work**: Create `BakeryBatch`, `FMCGDispatchChallan`, `ReturnTicket` models.
- **Backend Work**: Implement `/api/v1/erp/fmcg` endpoints.
- **Frontend Integration**: Connect `BakeryFMCGDashboard.tsx`.

#### Phase 12: Tepache Probiotic Brewery ERP
- **Objective**: Fermentation tank telemetry (pH, Brix, CFU, Temp) and glass bottle reverse logistics.
- **Database Schema Work**: Create `TepacheBrewBatch` and `BottleReturnLog` models.
- **Backend Work**: Implement `/api/v1/erp/tepache` endpoints.
- **Frontend Integration**: Connect `TepacheBreweryDashboard.tsx`.

#### Phase 13: Swiggy & Zomato Aggregator Integration
- **Objective**: Live inventory buffer synchronization between kitchen and 3rd party aggregators.
- **Database Schema Work**: Create `AggregatorStockBuffer` and `AggregatorOrder` models.
- **Backend Work**: Webhook receivers for Swiggy/Zomato order injection and stock sync.
- **Frontend Integration**: Connect `SwiggyZomatoAggregatorPortal.tsx`.

#### Phase 14: Business Content Management (Admin CMS)
- **Objective**: Allow Super Admin / MD to manage public content, banners, videos, and prices.
- **Database Schema Work**: Create `CMSBanner`, `CMSVideo`, `MealPlanDefinition`, `Coupon` models.
- **Backend Work**: Implement `/api/v1/admin/cms` endpoints (PUT, POST, DELETE).
- **Frontend Integration**: Build Admin CMS interface.

#### Phase 15: HRM, Enterprise Financials & MD Reporting
- **Objective**: Staff directory, payroll/payslips, financial vouchers, enterprise telemetry.
- **Database Schema Work**: Create `HRMEmployee`, `Payslip`, `FinancialVoucher`, `StockTransfer` models.
- **Backend Work**: Implement `/api/v1/erp/hrm`, `/api/v1/erp/financials`, `/api/v1/erp/md` APIs.
- **Frontend Integration**: Connect `HRMModule.tsx`, `FinancialsModule.tsx`, `MDDashboard.tsx`.

#### Phase 16: Automated Testing, Security Auditing & Observability
- **Objective**: Comprehensive test suites (Jest/Vitest, Supertest, Playwright), logging (Winston), metrics (Prometheus).
- **Deliverables**: Unit tests, integration tests, RBAC security audit, E2E tests.

#### Phase 17: Production Hardening, CI/CD & Deployment
- **Objective**: Production deployment configuration, managed PostgreSQL, HTTPS, CORS, Docker containers, CI/CD pipeline.

---

## 🤖 AI Development & Prompting Guidelines

When instructing an AI coding assistant (e.g. Antigravity or ChatGPT) to work on this repository:

1. **Always Inspect Code First**: Read existing types (`src/types.ts`), components, and Prisma schemas before modifying anything.
2. **Do NOT Rewrite Working Code Unnecessarily**: Preserve existing working UI layouts, animation components, and utilities.
3. **Never Delete Hidden Functionality**: Do not remove ERP dashboards, Kerala Mess features, or staff portals simply because they are not currently displayed on the customer landing page.
4. **Maintain Customer / ERP Separation**: Ensure customers cannot access staff tools.
5. **Enforce Backend Authority**: Never rely on frontend state for access control. Always check `req.user` in backend Express controllers.
6. **Work One Phase at a Time**: Complete and test a single phase before requesting the next.
7. **Verify Database Schemas**: Always explain proposed Prisma schema additions before running migrations.
8. **Run Verification Commands**: After writing code, run `npm run lint` and `npm run build` to verify TypeScript compliance.
9. **Never Commit Secrets**: Keep `.env` and `server/.env` untracked. Only update `.env.example` with dummy placeholders.

---

## 📋 Reusable AI Execution Prompt Template

Copy and paste the following prompt when instructing an AI assistant to execute a specific phase:

```text
Implement Phase [X] ([Phase Title]) from README.md.

Before writing any code:
1. Inspect the relevant frontend components and backend modules.
2. Propose the database schema changes and API endpoints required for Phase [X].
3. Wait for approval before applying Prisma schema edits or migrations.

Rules during implementation:
- Preserve all existing UI, styles, animation effects, and working features.
- Preserve Phase 1 authentication architecture (JWT, HTTP-Only Refresh Cookies, Bcrypt).
- Enforce strict RBAC and customer ownership checks on all new backend routes.
- Do NOT delete or break unrelated customer or ERP components.

After completing the code:
1. Run `npm run lint` and `npm run build` in root and `server/` to verify zero TypeScript errors.
2. Provide a final summary of modified files, new database models, and API endpoints added.
3. Stop after completing Phase [X]. Do NOT automatically proceed to Phase [X+1].
```

---

## 🛠️ Project Setup & Installation Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v14.0 or higher (Running on `localhost:5432` or cloud URL)
- **npm** or **bun** package manager

### Step 1: Clone & Install Dependencies
```bash
# Clone the repository
git clone https://github.com/alwyndani/Protein-Bowl.git
cd protein-bowl

# Install Frontend Dependencies
npm install

# Install Backend Dependencies
cd server
npm install
cd ..
```

### Step 2: Environment Configuration
Create local `.env` files based on the provided safe templates:

#### Root `.env`:
```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

#### Backend `server/.env`:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"
JWT_ACCESS_SECRET="your_jwt_access_secret_here"
JWT_REFRESH_SECRET="your_jwt_refresh_secret_here"
JWT_ACCESS_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"
CLIENT_URL="http://localhost:3000"
```

### Step 3: Database Initialization & Seeding
```bash
cd server

# Generate Prisma Client
npm run prisma:generate

# Run Database Migrations
npm run prisma:migrate

# Seed Initial Development Database (Creates test branches & accounts)
npm run prisma:seed

cd ..
```

### Step 4: Run Local Development Servers
Run the backend and frontend development servers in separate terminal windows:

```bash
# Terminal 1: Backend Express API Server (Runs on http://localhost:5000)
cd server
npm run dev

# Terminal 2: Frontend Vite React Server (Runs on http://localhost:3000)
npm run dev
```

---

## 🧪 Testing & Quality Assurance Strategy

The project requires testing across 5 core layers:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Static Type Check & Lint (npm run lint)            │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Frontend & Backend Production Builds (npm run build)│
├─────────────────────────────────────────────────────────────┤
│ Layer 3: API Unit & Integration Tests (Supertest + Jest)    │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: RBAC & Resource Ownership Security Verification    │
├─────────────────────────────────────────────────────────────┤
│ Layer 5: Manual End-to-End User Flow Inspections            │
└─────────────────────────────────────────────────────────────┘
```

### Crucial Manual Verification Flows:
1. **Customer Registration & Login**: Verify JWT issuance and session restoration on page refresh (`/auth/me`).
2. **Customer Security Protection**: Ensure authenticated customer cannot access `/staff` login or ERP dashboards.
3. **Kerala Mess Meal Pause**: Verify meal pause action credits the student wallet balance accurately.
4. **Direct FMCG Cart Checkout**: Verify item selection, delivery address input, and order placement.
5. **Staff Role Switching (MD Command Center)**: Verify MD can toggle between kitchen branches and staff roles seamlessly.

---

## 🌐 Production & Deployment Architecture

```mermaid
flowchart LR
    ClientWeb["Web Client\n(Vercel / Netlify / Cloudflare)"]
    ClientMobile["Mobile App\n(React Native / Flutter)"]

    subgraph Hosting ["Production Cloud Host (Render / Railway / AWS / VPS)"]
        APIServer["Node.js + Express API Server\n(PM2 / Docker Container)"]
    end

    subgraph ManagedDB ["Managed PostgreSQL"]
        DB[(Supabase / Neon / AWS RDS\nPostgreSQL)]
    end

    ClientWeb <-->|HTTPS + SameSite Cookies| APIServer
    ClientMobile <-->|HTTPS + Bearer Tokens| APIServer
    APIServer <-->|Prisma Connection Pool| DB
```

### Deployment Requirements:
1. **Frontend**: Deploy static Vite dist bundle to Vercel, Netlify, or Cloudflare Pages.
2. **Backend Server**: Deploy Node.js Express server inside a Docker container or PM2 process manager on Render, Railway, AWS ECS, or a VPS.
3. **Database**: Provision a managed PostgreSQL instance (Supabase, Neon, AWS RDS, DigitalOcean).
4. **SSL & Security**: Enforce HTTPS for all traffic. Set `NODE_ENV=production` so refresh cookies require `secure: true`. Enable strict CORS for trusted origins.

---

*Protein Bowl — Master Specification & Architecture Document*
