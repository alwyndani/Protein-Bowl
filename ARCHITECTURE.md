# Protein Bowl Enterprise Platform — Architecture & Technical Blueprint

> **Unified Technical Architecture & Data Specification**

---

## 🏢 Platform System Architecture

```
+-----------------------------------------------------------------------+
|                            CLIENT LAYER                               |
|                                                                       |
|  +-------------------------------+  +------------------------------+  |
|  |       React Web App           |  |     React Native Mobile      |  |
|  |    (Vite + React 19 + TS)     |  |     (Expo SDK 52 + TS)       |  |
|  +───────────────┬───────────────+  +──────────────┬───────────────+  |
+------------------│--------------------------------─│------------------+
                   │ HTTPS REST / WSS                │ HTTPS REST / Push
                   ▼                                 ▼
+-----------------------------------------------------------------------+
|                            BACKEND API                                |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  | Express 4 Gateway (/api/v1)                                     |  |
|  |  ├── Helmet Security & CORS Policy                             |  |
|  |  ├── JWT Bearer & HTTP-Only Cookie Auth Middleware              |  |
|  |  ├── RBAC Permission Guards (13 User Roles)                     |  |
|  |  └── Zod Schema Validation Pipeline                             |  |
|  +────────────────────────────────┬────────────────────────────────+  |
|                                   │                                   |
|  +--------------------------------▼--------------------------------+  |
|  | Domain Services Layer                                           |  |
|  |  ├── Auth & Customer Services                                   |  |
|  |  ├── Diet & Biometrics Service                                  |  |
|  |  ├── Catalog & Recipe Service                                   |  |
|  |  ├── Order & Subscriptions Service                              |  |
|  |  ├── Kerala Mess & Wallet Ledger Service                        |  |
|  |  ├── Kitchen KDS & Batch Production Service                     |  |
|  |  ├── Procurement, POS & ERP Services                            |  |
|  |  └── Real-Time Telemetry (SSE / WSS)                            |  |
|  +────────────────────────────────┬────────────────────────────────+  |
+--------------------------------───│-----------------------------------+
                                    │ Prisma ORM
                                    ▼
+-----------------------------------------------------------------------+
|                           DATABASE LAYER                              |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  | PostgreSQL Centralized Database                                 |  |
|  |  ├── Normalized Domain Schema (60+ Tables)                      |  |
|  |  ├── Immutable Financial & Wallet Ledgers                        |  |
|  |  ├── Foreign Key Constraints & Cascades                         |  |
|  |  └── Indexed Query Execution                                    |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
```

---

## 🔐 Security & Identity Architecture

### 1. Web Authentication
- Access Tokens: Short-lived JSON Web Tokens (15 min) transmitted via `Authorization: Bearer <token>` header, held in-memory by `ApiClient`.
- Refresh Tokens: Long-lived tokens (7 days) saved in `RefreshToken` database table and sent in HTTP-Only, SameSite, Secure cookies (`pb_refresh_token`). Automatic token rotation on renewal.

### 2. Mobile Authentication
- Mobile client communicates with same `/api/v1/auth` endpoints.
- Store refresh token and access token in `Expo SecureStore` (Keychain on iOS, EncryptedSharedPreferences on Android).

### 3. Role-Based Access Control (RBAC)
- 13 Enum Roles enforced via `requireRole([...allowedRoles])` middleware on Express routes.
- Resource ownership validation comparing `req.user.userId` or employee's `assignedBranchId`.

---

## 💾 Centralized Database Design

The system employs a single normalized PostgreSQL database managed by Prisma ORM. Key entity relationships include:
- `User` 1:N `UserRoleAssignment`
- `CustomerProfile` 1:1 `HealthBiometrics`
- `CustomerProfile` 1:N `DietPlanRequest` 1:1 `DietPlan`
- `CustomerProfile` 1:N `Order` 1:N `OrderItem`
- `CustomerProfile` 1:1 `MessAccount` 1:N `MessSubscription`
- `MessAccount` 1:1 `WalletAccount` 1:N `WalletTransaction` (Immutable Ledger)
- `KitchenBranch` 1:N `EmployeeProfile`
- `KitchenBranch` 1:N `KitchenOrderTicket`
- `Product` 1:N `ProductVariant`
- `Recipe` 1:N `RecipeIngredient` 1:1 `Ingredient`

---

## 📡 Real-Time & Background Task Infrastructure
1. **Server-Sent Events (SSE) / WebSockets**: `/api/v1/kds/stream` and `/api/v1/orders/:id/stream` for immediate updates without polling.
2. **Background Jobs (`node-cron`)**: Automated Kerala Mess daily order generation, subscription billing, low stock alerts, and expiry notifications.
