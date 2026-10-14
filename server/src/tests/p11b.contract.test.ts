import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient } from '@prisma/client';

/**
 * P11B contract test. It drives the REAL API (no mocks, no new production behaviour) through the exact journey the customer mobile app
 * performs - mobile registration/login, catalog, cart, address, checkout preview, ONLINE order creation, replay, orders list/detail - and
 * pins the DTO shapes the mobile types (apps/mobile/src/commerce/types.ts) were written against. If the backend contract drifts, this
 * test fails here instead of silently in the app.
 */
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const CLIENT = 'protein-bowl-mobile/1.0.0 (android)';
const PASSWORD = 'Mobile-Contract-1';
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

describe('P11B — real backend contract for the customer mobile commerce journey', () => {
  const ts = Date.now();
  let categoryId: string;
  let slug: string;
  let productId: string;
  let variantId: string;
  let tokenA: string;
  let tokenB: string;
  let addressId: string;
  let itemId: string;
  let orderId: string;
  let orderNumber: string;
  const key = `IK-contract-${ts}-aaaa`;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const mobile = (path: string) => request(app).post(`/api/v1/auth/mobile${path}`).set('X-PB-Client', CLIENT);
  const keys = (o: unknown) => Object.keys(o as object).sort();

  beforeAll(async () => {
    const cat = await prisma.productCategory.create({ data: { name: `P11B Category ${ts}`, slug: `p11b-category-${ts}`, displayOrder: 99 } });
    categoryId = cat.id;
    slug = `p11b-contract-bowl-${ts}`;
    const product = await prisma.product.create({
      data: {
        categoryId,
        name: 'P11B Contract Bowl',
        slug,
        description: 'Contract fixture',
        basePrice: '299.00',
        taxRate: '0.0500',
        variants: { create: [{ name: 'Standard', sku: `P11B-SKU-${ts}`, price: '299.00', isDefault: true }] }
      },
      include: { variants: true }
    });
    productId = product.id;
    variantId = product.variants[0].id;

    for (const [who, email] of [['A', `p11b.a.${ts}@proteinbowl.test`], ['B', `p11b.b.${ts}@proteinbowl.test`]] as const) {
      const res = await mobile('/register').send({ email, password: PASSWORD, fullName: `Contract ${who}`, ...(who === 'A' ? { phone: `+9190${String(ts).slice(-8)}` } : {}) });
      expect(res.status, who).toBe(201);
      if (who === 'A') tokenA = res.body.data.accessToken;
      else tokenB = res.body.data.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. mobile registration stored the optional phone (existing contract, no profile endpoint)', async () => {
    const me = await request(app).get('/api/v1/auth/me').set(auth(tokenA));
    expect(me.body.data.user.phone).toBe(`+9190${String(ts).slice(-8)}`);
    expect(me.body.data.user.customerProfile.fullName).toBe('Contract A');
  });

  it('2. catalog: categories and the product row (raw-row API: the extra fields exist but the app does not model or render them)', async () => {
    const cats = await request(app).get('/api/v1/products/categories');
    expect(cats.status).toBe(200);
    const cat = cats.body.data.find((c: any) => c.id === categoryId);
    for (const k of ['id', 'name', 'slug', 'description', 'image', 'displayOrder']) expect(k in cat, k).toBe(true);

    const list = await request(app).get(`/api/v1/products?categoryId=${categoryId}`);
    expect(list.status).toBe(200);
    const p = list.body.data.find((x: any) => x.id === productId);
    for (const k of ['id', 'categoryId', 'name', 'slug', 'description', 'image', 'basePrice', 'containerDeposit', 'category', 'variants']) expect(k in p, k).toBe(true);
    expect(p.image).toBeNull(); // no imagery is invented: the app shows its own placeholder
    expect(typeof p.basePrice).toBe('string'); // Decimal STRING
    const v = p.variants[0];
    for (const k of ['id', 'name', 'price', 'containerDeposit', 'isActive', 'isDefault', 'calories', 'protein', 'carbs', 'fat']) expect(k in v, k).toBe(true);
    expect(typeof v.price).toBe('string');
    // documented leak fields (D-B3: the backend is NOT changed in P11B, the app simply never models them)
    for (const k of ['recipeId', 'taxRate', 'rating', 'reviewsCount']) expect(k in p, `product.${k}`).toBe(true);
    expect('stockQuantity' in v && 'sku' in v).toBe(true);
  });

  it('3. product detail by slug; an unknown product is a 404 whose code is the generic BAD_REQUEST default (the app maps it by HTTP status)', async () => {
    const ok = await request(app).get(`/api/v1/products/${slug}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.variants.length).toBe(1);
    const missing = await request(app).get('/api/v1/products/does-not-exist-p11b');
    expect(missing.status).toBe(404);
    expect(missing.body.success).toBe(false);
    expect(missing.body.error).toBe('BAD_REQUEST');
  });

  it('4. cart: empty, add, update, shape (money are NUMBERS here), minimum order block, invalid quantities', async () => {
    const empty = await request(app).get('/api/v1/cart').set(auth(tokenA));
    expect(empty.status).toBe(200);
    expect(empty.body.data.items).toEqual([]);

    const bad = await request(app).post('/api/v1/cart/items').set(auth(tokenA)).send({ productId, variantId, quantity: 0 });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toBe('INVALID_QUANTITY');
    const nope = await request(app).post('/api/v1/cart/items').set(auth(tokenA)).send({ productId: 'missing', quantity: 1 });
    expect(nope.status).toBe(400);
    expect(nope.body.error).toBe('UNAVAILABLE_PRODUCT');

    const add = await request(app).post('/api/v1/cart/items').set(auth(tokenA)).send({ productId, variantId, quantity: 2 });
    expect(add.status).toBe(201);
    const cart = add.body.data;
    for (const k of ['id', 'items', 'itemsSubtotal', 'totalTax', 'containerDepositTotal', 'packagingFee', 'deliveryFee', 'discountAmount', 'netAmount', 'minimumOrder', 'quantityIssues']) expect(k in cart, k).toBe(true);
    for (const k of ['id', 'productId', 'variantId', 'name', 'variantName', 'image', 'unitPrice', 'quantity', 'subtotal', 'taxAmount', 'containerDeposit', 'lineTotal']) expect(k in cart.items[0], k).toBe(true);
    expect(typeof cart.netAmount).toBe('number');
    expect(typeof cart.items[0].unitPrice).toBe('number');
    expect(keys(cart.minimumOrder)).toEqual(['enabled', 'met', 'requiredAmount', 'shortfall']);
    itemId = cart.items[0].id;

    const upd = await request(app).patch(`/api/v1/cart/items/${itemId}`).set(auth(tokenA)).send({ quantity: 3 });
    expect(upd.status).toBe(200);
    expect(upd.body.data.items[0].quantity).toBe(3);
    const foreign = await request(app).patch(`/api/v1/cart/items/${itemId}`).set(auth(tokenB)).send({ quantity: 1 });
    expect(foreign.status).toBe(404); // another customer's cart line is invisible
  });

  it('5. addresses: create / list / update / ownership; the FIRST address is NOT auto-default unless isDefault is sent (the app sends it explicitly)', async () => {
    const plain = await request(app).post('/api/v1/customers/me/addresses').set(auth(tokenA)).send({ addressLine1: '12 Beach Road', city: 'Kochi', postalCode: '682001' });
    expect(plain.status).toBe(201);
    expect(plain.body.data.isDefault).toBe(false);
    expect(plain.body.data.title).toBe('Home');
    expect(plain.body.data.state).toBe('Kerala');
    addressId = plain.body.data.id;
    for (const k of ['id', 'title', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'isDefault']) expect(k in plain.body.data, k).toBe(true);

    const invalid = await request(app).post('/api/v1/customers/me/addresses').set(auth(tokenA)).send({ addressLine1: 'x', city: 'K', postalCode: '1' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error).toBe('VALIDATION_ERROR');

    const upd = await request(app).put(`/api/v1/customers/me/addresses/${addressId}`).set(auth(tokenA)).send({ isDefault: true });
    expect(upd.status).toBe(200);
    expect(upd.body.data.isDefault).toBe(true);

    const list = await request(app).get('/api/v1/customers/me/addresses').set(auth(tokenA));
    expect(list.body.data.map((a: any) => a.id)).toContain(addressId);
    const otherList = await request(app).get('/api/v1/customers/me/addresses').set(auth(tokenB));
    expect(otherList.body.data.map((a: any) => a.id)).not.toContain(addressId);
    const steal = await request(app).put(`/api/v1/customers/me/addresses/${addressId}`).set(auth(tokenB)).send({ city: 'Hacked' });
    expect(steal.status).toBe(404);
    const stealDelete = await request(app).delete(`/api/v1/customers/me/addresses/${addressId}`).set(auth(tokenB));
    expect(stealDelete.status).toBe(404);
  });

  it('6. checkout preview: server figures (numbers), selected address, invalid / foreign address and empty-cart errors', async () => {
    const res = await request(app).post('/api/v1/checkout/preview').set(auth(tokenA)).send({ addressId });
    expect(res.status).toBe(200);
    const p = res.body.data;
    expect(keys(p)).toEqual(['cartId', 'deliveryAddress', 'items', 'minimumOrder', 'summary']);
    expect(keys(p.summary)).toEqual(['containerDepositTotal', 'deliveryFee', 'discountAmount', 'itemsSubtotal', 'netAmount', 'packagingFee', 'totalTax']);
    for (const k of ['productId', 'variantId', 'title', 'variantName', 'unitPrice', 'quantity', 'subtotal', 'taxAmount', 'containerDeposit', 'totalPrice']) expect(k in p.items[0], k).toBe(true);
    expect(typeof p.summary.netAmount).toBe('number');
    expect(p.deliveryAddress.id).toBe(addressId);
    expect(p.deliveryAddress.recipientName).toBe('Contract A');

    const foreign = await request(app).post('/api/v1/checkout/preview').set(auth(tokenB)).send({ addressId });
    expect(foreign.status).toBe(400); // B's cart is empty: checked first
    expect(['EMPTY_CART', 'INVALID_ADDRESS']).toContain(foreign.body.error);
    const bad = await request(app).post('/api/v1/checkout/preview').set(auth(tokenA)).send({ addressId: 'not-mine' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('INVALID_ADDRESS');
  });

  it('7. order create: idempotency key required + validated; paymentMethod is not needed; COD is refused', async () => {
    const noKey = await request(app).post('/api/v1/orders').set(auth(tokenA)).send({ addressId });
    expect(noKey.status).toBe(400);
    expect(noKey.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const badKey = await request(app).post('/api/v1/orders').set(auth(tokenA)).set('x-idempotency-key', 'short').send({ addressId });
    expect(badKey.status).toBe(400);
    expect(badKey.body.error).toBe('INVALID_IDEMPOTENCY_KEY');
    const cod = await request(app).post('/api/v1/orders').set(auth(tokenA)).set('x-idempotency-key', `IK-cod-${ts}-aaaaaa`).send({ addressId, paymentMethod: 'COD' });
    expect(cod.status).toBe(422);
    expect(cod.body.error).toBe('COD_NOT_ALLOWED');
  });

  it('8. order create: 201, PENDING / PENDING / ONLINE, derived states, snapshot, cart consumed', async () => {
    expect(key).toMatch(KEY);
    const res = await request(app).post('/api/v1/orders').set(auth(tokenA)).set('x-idempotency-key', key).send({ addressId, deliveryInstructions: 'Leave at the gate' });
    expect(res.status).toBe(201);
    const o = res.body.data;
    orderId = o.id;
    orderNumber = o.orderNumber;
    expect(o.status).toBe('PENDING');
    expect(o.paymentStatus).toBe('PENDING');
    expect(o.paymentMethod).toBe('ONLINE');
    expect(o.orderType).toBe('DIRECT');
    expect(o.payment).toEqual({ state: 'NOT_STARTED', canStartPayment: true });
    expect(o.cancellation).toEqual({ state: 'CANCELLATION_AVAILABLE', allowed: true });
    expect(o.refund).toEqual({ state: 'NO_REFUND' });
    expect(o.orderNumber).toMatch(/^PB-\d{6}-[A-Z0-9]{6}$/);
    // order money are Decimal STRINGS (unlike the cart / preview numbers)
    for (const k of ['totalAmount', 'discountAmount', 'taxAmount', 'deliveryFee', 'packagingFee', 'containerDepositTotal', 'netAmount']) expect(typeof o[k], k).toBe('string');
    for (const k of ['id', 'itemTitle', 'variantName', 'unitPrice', 'quantity', 'totalPrice']) expect(k in o.items[0], k).toBe(true);
    expect(typeof o.items[0].unitPrice).toBe('string');
    expect(o.deliveryAddressSnapshot.addressLine1).toBe('12 Beach Road');
    expect(o.deliveryAddressSnapshot.deliveryInstructions).toBe('Leave at the gate');
    expect('email' in o.deliveryAddressSnapshot && 'phone' in o.deliveryAddressSnapshot).toBe(true); // present on the wire, never modelled / rendered by the app
    // internal fields never reach the customer
    for (const k of ['idempotencyKey', 'requestFingerprint', 'pricingSnapshot', 'customerProfileId', 'kitchenBranchId']) expect(k in o, k).toBe(false);
    // the server consumed the ordered cart lines in the same transaction
    const cart = await request(app).get('/api/v1/cart').set(auth(tokenA));
    expect(cart.body.data.items).toEqual([]);
  });

  it('9. idempotency: the same key + same request replays the SAME order (HTTP 201, one row); a different request is 409 IDEMPOTENCY_KEY_REUSED; replay works on an empty cart', async () => {
    const again = await request(app).post('/api/v1/orders').set(auth(tokenA)).set('x-idempotency-key', key).send({ addressId, deliveryInstructions: 'Leave at the gate' });
    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(orderId);
    expect(again.body.data.orderNumber).toBe(orderNumber);
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);

    const changed = await request(app).post('/api/v1/orders').set(auth(tokenA)).set('x-idempotency-key', key).send({ addressId, deliveryInstructions: 'A different note' });
    expect(changed.status).toBe(409);
    expect(changed.body.error).toBe('IDEMPOTENCY_KEY_REUSED');

    const fresh = await request(app).post('/api/v1/orders').set(auth(tokenA)).set('x-idempotency-key', `IK-fresh-${ts}-bbbbbb`).send({ addressId });
    expect(fresh.status).toBe(400);
    expect(fresh.body.error).toBe('EMPTY_CART'); // a NEW key after the cart was consumed can only fail, never duplicate
  });

  it('10. idempotency is scoped per customer: another customer reusing the key is not a replay and cannot see the order', async () => {
    const res = await request(app).post('/api/v1/orders').set(auth(tokenB)).set('x-idempotency-key', key).send({ addressId });
    expect([400]).toContain(res.status);
    expect(['EMPTY_CART']).toContain(res.body.error);
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('11. orders list and detail: customer-scoped, newest first, the detail adds the timeline; a foreign order is 404', async () => {
    const list = await request(app).get('/api/v1/orders/my-orders').set(auth(tokenA));
    expect(list.status).toBe(200);
    expect(list.body.data[0].id).toBe(orderId);
    expect('timeline' in list.body.data[0]).toBe(false);

    const detail = await request(app).get(`/api/v1/orders/${orderId}`).set(auth(tokenA));
    expect(detail.status).toBe(200);
    expect(detail.body.data.timeline).toEqual([{ fromStatus: null, toStatus: 'PENDING', at: expect.any(String) }]);
    expect(Number.isNaN(Date.parse(detail.body.data.createdAt))).toBe(false);
    const byNumber = await request(app).get(`/api/v1/orders/${orderNumber}`).set(auth(tokenA));
    expect(byNumber.body.data.id).toBe(orderId);

    const foreign = await request(app).get(`/api/v1/orders/${orderId}`).set(auth(tokenB));
    expect(foreign.status).toBe(404);
    expect(foreign.body.error).toBe('NOT_FOUND');
    const otherList = await request(app).get('/api/v1/orders/my-orders').set(auth(tokenB));
    expect(otherList.body.data).toEqual([]);
  });

  it('12. the order stays unpaid: nothing in the commerce journey can pay, confirm or cancel it', async () => {
    const row = await prisma.order.findUnique({ where: { id: orderId } });
    expect(row!.status).toBe('PENDING');
    expect(row!.paymentStatus).toBe('PENDING');
    expect(await prisma.payment.count({ where: { orderId } })).toBe(0);
  });

  it('13. every commerce route needs a CUSTOMER session (no token -> 401), and the catalog is public', async () => {
    for (const [method, path] of [['get', '/api/v1/cart'], ['get', '/api/v1/orders/my-orders'], ['get', '/api/v1/customers/me/addresses'], ['post', '/api/v1/checkout/preview']] as const) {
      const res = await (request(app) as any)[method](path).send({});
      expect(res.status, path).toBe(401);
    }
    expect((await request(app).get('/api/v1/products')).status).toBe(200);
  });

  it('14. KNOWN BACKEND LIMITATION (pinned, not fixed in P11B): a duplicate phone at registration is not a handled conflict', async () => {
    const res = await mobile('/register').send({ email: `p11b.dup.${ts}@proteinbowl.test`, password: PASSWORD, fullName: 'Dup Phone', phone: `+9190${String(ts).slice(-8)}` });
    expect(res.status).toBe(500); // pre-existing web behaviour too (User.phone is UNIQUE and registration has no P2002 handling)
    expect(await prisma.user.count({ where: { email: `p11b.dup.${ts}@proteinbowl.test` } })).toBe(0);
  });
});
