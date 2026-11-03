import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { ProcurementController } from './procurement.controller.js';
import { PurchasingService, PO_STATUSES, PoStatus } from './purchasing.service.js';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { assertResourceBranchAccess, authorizeBranch } from '../../authz/branchScope.js';

const router = Router();
const read = [authenticateToken, requirePermission('procurement:read')];
const write = [authenticateToken, requirePermission('procurement:write')];

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const qty = z.number().positive().max(1_000_000);
const money = z.number().min(0).max(10_000_000);
const idParam = z.object({ id: uuid });

const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next: NextFunction) => { fn(req, res).catch(next); };
const uid = (req: Request) => req.user!.userId;
const branchQuery = (req: Request) => (typeof req.query.branchId === 'string' ? req.query.branchId : undefined);

// ---- Inventory & stock ----
router.get('/items', ...read, ProcurementController.getInventoryItems);
router.post('/items', ...write,
  validateBody(z.object({
    branchId: uuid, name: text(120), sku: text(60), category: text(60), unit: text(20),
    minReorderLevel: z.number().min(0).max(1_000_000), unitCost: money
  }).strict()),
  h(async (req, res) => {
    await assertResourceBranchAccess(req, 'write', req.body.branchId, 'InventoryItem');
    return ApiResponse.success(res, await PurchasingService.createItem(uid(req), req.body), 'Item created', 201);
  }));
router.post('/stock-movement', ...write,
  validateBody(z.object({
    inventoryItemId: uuid,
    // Receipts against a purchase order go through POST /purchase-orders/:id/receive.
    type: z.enum(['PRODUCTION_CONSUMPTION', 'WASTAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'PURCHASE_RECEIPT']),
    quantity: qty,
    unitCost: money,
    notes: z.string().trim().max(300).optional()
  })),
  ProcurementController.recordStockMovement);
router.get('/stock-movements', ...read, validateQuery(z.object({ branchId: uuid.optional(), inventoryItemId: uuid.optional() }).passthrough()),
  h(async (req, res) => {
    const { filter } = await authorizeBranch(req, 'read', branchQuery(req), 'StockMovement');
    return ApiResponse.success(res, await PurchasingService.movements(filter, typeof req.query.inventoryItemId === 'string' ? req.query.inventoryItemId : undefined), 'Stock movements retrieved');
  }));
router.get('/dashboard', ...read, validateQuery(z.object({ branchId: uuid.optional() }).passthrough()),
  h(async (req, res) => {
    const { filter } = await authorizeBranch(req, 'read', branchQuery(req), 'InventoryItem');
    return ApiResponse.success(res, await PurchasingService.dashboard(filter), 'Dashboard retrieved');
  }));

// ---- Suppliers ----
const supplierBody = z.object({
  name: text(120), contactName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(254).optional(), phone: z.string().trim().max(30).optional(), address: z.string().trim().max(300).optional()
}).strict();
router.get('/suppliers', ...read, h(async (req, res) => ApiResponse.success(res, await PurchasingService.listSuppliers(req.query.includeInactive === 'true'), 'Suppliers retrieved')));
router.post('/suppliers', ...write, validateBody(supplierBody),
  h(async (req, res) => ApiResponse.success(res, await PurchasingService.createSupplier(uid(req), req.body), 'Supplier created', 201)));
router.patch('/suppliers/:id', ...write, validateParams(idParam),
  validateBody(supplierBody.partial().extend({
    contactName: z.string().trim().max(120).nullable().optional(), email: z.string().trim().email().max(254).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(), address: z.string().trim().max(300).nullable().optional(), isActive: z.boolean().optional()
  }).strict()),
  h(async (req, res) => ApiResponse.success(res, await PurchasingService.updateSupplier(uid(req), req.params.id, req.body), 'Supplier updated')));

// ---- Purchase orders (branch-scoped: the order's branch is authorized, never a client claim) ----
router.get('/purchase-orders', ...read, validateQuery(z.object({ branchId: uuid.optional(), status: z.enum(PO_STATUSES).optional() }).passthrough()),
  h(async (req, res) => {
    const { filter } = await authorizeBranch(req, 'read', branchQuery(req), 'PurchaseOrder');
    const status = typeof req.query.status === 'string' ? (req.query.status as PoStatus) : undefined;
    return ApiResponse.success(res, await PurchasingService.listOrders(filter, status), 'Purchase orders retrieved');
  }));
router.get('/purchase-orders/:id', ...read, validateParams(idParam),
  h(async (req, res) => {
    await assertResourceBranchAccess(req, 'read', await PurchasingService.orderBranch(req.params.id), 'PurchaseOrder');
    return ApiResponse.success(res, await PurchasingService.getOrder(req.params.id), 'Purchase order retrieved');
  }));
router.post('/purchase-orders', ...write,
  validateBody(z.object({
    branchId: uuid, supplierId: uuid, expectedOn: z.coerce.date().optional(), notes: z.string().trim().max(500).optional(),
    lines: z.array(z.object({ inventoryItemId: uuid, orderedQuantity: qty, unitCost: money }).strict()).min(1).max(100)
  }).strict()),
  h(async (req, res) => {
    await assertResourceBranchAccess(req, 'write', req.body.branchId, 'PurchaseOrder');
    return ApiResponse.success(res, await PurchasingService.createOrder(uid(req), req.body), 'Purchase order created', 201);
  }));

const orderAction = (path: string, run: (userId: string, id: string) => Promise<unknown>, message: string) =>
  router.post(`/purchase-orders/:id/${path}`, ...write, validateParams(idParam), validateBody(z.object({}).strict()),
    h(async (req, res) => {
      await assertResourceBranchAccess(req, 'write', await PurchasingService.orderBranch(req.params.id), 'PurchaseOrder');
      return ApiResponse.success(res, await run(uid(req), req.params.id), message);
    }));
orderAction('order', PurchasingService.markOrdered.bind(PurchasingService), 'Purchase order sent');
orderAction('cancel', PurchasingService.cancel.bind(PurchasingService), 'Purchase order cancelled');

router.post('/purchase-orders/:id/receive', ...write, validateParams(idParam),
  validateBody(z.object({
    notes: z.string().trim().max(500).optional(),
    lines: z.array(z.object({ purchaseOrderLineId: uuid, quantity: qty }).strict()).min(1).max(100)
  }).strict()),
  h(async (req, res) => {
    await assertResourceBranchAccess(req, 'write', await PurchasingService.orderBranch(req.params.id), 'PurchaseOrder');
    return ApiResponse.success(res, await PurchasingService.receive(uid(req), req.params.id, req.body), 'Goods received', 201);
  }));

export default router;
