import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { seedProducts } from '../../prisma/seedProducts.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

function generateTestToken(userId: string, email: string, roles: RoleEnum[]) {
  const secret = process.env.JWT_ACCESS_SECRET || 'test_access_secret_key_1234567890_super_secret';
  return jwt.sign({ userId, email, roles }, secret, { expiresIn: '15m' });
}

describe('Phase 4B — Product Commerce, Cart & Order Foundation Tests', () => {
  const ts = Date.now();

  let userA: any;
  let tokenA: string;
  let profileAId: string;

  let userB: any;
  let tokenB: string;
  let profileBId: string;

  let userAdmin: any;
  let tokenAdmin: string;

  let publishedProduct: any;
  let variantProduct: any;
  let variantItem: any;
  let draftProduct: any;
  let inactiveProduct: any;
  let tepacheProduct: any;

  let addressAId: string;
  let addressA2Id: string;
  let addressBId: string;

  beforeAll(async () => {
    const pwdHash = await bcrypt.hash('Password123!', 10);

    // Seed products
    await seedProducts();

    // Create Customer A
    userA = await prisma.user.create({
      data: {
        email: `comm_cust_a_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.CUSTOMER } },
        customerProfile: {
          create: {
            fullName: 'Commerce Customer A',
            referralCode: `PB-CA${ts}`,
          },
        },
      },
      include: { customerProfile: true },
    });
    tokenA = generateTestToken(userA.id, userA.email, [RoleEnum.CUSTOMER]);
    profileAId = userA.customerProfile.id;

    // Create Customer B
    userB = await prisma.user.create({
      data: {
        email: `comm_cust_b_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.CUSTOMER } },
        customerProfile: {
          create: {
            fullName: 'Commerce Customer B',
            referralCode: `PB-CB${ts}`,
          },
        },
      },
      include: { customerProfile: true },
    });
    tokenB = generateTestToken(userB.id, userB.email, [RoleEnum.CUSTOMER]);
    profileBId = userB.customerProfile.id;

    // Create Super Admin User
    userAdmin = await prisma.user.create({
      data: {
        email: `comm_admin_${ts}@test.com`,
        passwordHash: pwdHash,
        roles: { create: { role: RoleEnum.SUPER_ADMIN } },
      },
    });
    tokenAdmin = generateTestToken(userAdmin.id, userAdmin.email, [RoleEnum.SUPER_ADMIN]);

    // Create Draft (Unpublished) product directly in DB for testing
    const cat = await prisma.productCategory.findFirst();
    draftProduct = await prisma.product.create({
      data: {
        slug: `draft-product-${ts}`,
        categoryId: cat!.id,
        name: 'Secret Draft Energy Bar',
        description: 'Unpublished draft item',
        basePrice: 99.0,
        isPublished: false,
        isActive: true,
      },
    });

    // Create Inactive product directly in DB for testing
    inactiveProduct = await prisma.product.create({
      data: {
        slug: `inactive-product-${ts}`,
        categoryId: cat!.id,
        name: 'Discontinued Bar',
        description: 'Inactive product',
        basePrice: 89.0,
        isPublished: true,
        isActive: false,
      },
    });

    // Fetch sample published & variant products
    publishedProduct = await prisma.product.findFirst({
      where: { isPublished: true, isActive: true, isTepache: false },
      include: { variants: true },
    });

    tepacheProduct = await prisma.product.findFirst({
      where: { isTepache: true },
      include: { variants: true },
    });

    variantProduct = await prisma.product.findFirst({
      where: { isPublished: true, isActive: true, variants: { some: { isActive: true } } },
      include: { variants: { where: { isActive: true } } },
    });
    variantItem = variantProduct.variants[0];
  });

  // ============================================================
  // PRODUCT CATALOG TESTS (1-5)
  // ============================================================
  it('1. Published active products are visible in storefront listing', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.every((p: any) => p.isPublished === true && p.isActive === true)).toBe(true);
  });

  it('2. Draft/unpublished product is hidden from customer catalog', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.data.some((p: any) => p.id === draftProduct.id)).toBe(false);

    const detailRes = await request(app).get(`/api/v1/products/${draftProduct.slug}`);
    expect(detailRes.status).toBe(404);
  });

  it('3. Inactive product is hidden from customer catalog', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.data.some((p: any) => p.id === inactiveProduct.id)).toBe(false);
  });

  it('4. Customer-safe projection (no supplier/cost/margin fields)', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    const prod = res.body.data[0];
    expect(prod).not.toHaveProperty('supplierCost');
    expect(prod).not.toHaveProperty('procurementCost');
    expect(prod).not.toHaveProperty('margin');
  });

  it('5. Product detail with valid active variants', async () => {
    const res = await request(app).get(`/api/v1/products/${variantProduct.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(variantProduct.id);
    expect(Array.isArray(res.body.data.variants)).toBe(true);
    expect(res.body.data.variants.every((v: any) => v.isActive === true)).toBe(true);
  });

  // ============================================================
  // CART TESTS (6-18)
  // ============================================================
  it('6. Customer gets or creates own cart', async () => {
    const res = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('7. Add base product to cart', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: publishedProduct.id, quantity: 2 });

    expect([200, 201].includes(res.status)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    const added = res.body.data.items.find((i: any) => i.productId === publishedProduct.id && !i.variantId);
    expect(added).toBeDefined();
    expect(added.quantity).toBe(2);
  });

  it('8. Add variant product to cart', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: variantProduct.id, variantId: variantItem.id, quantity: 1 });

    expect([200, 201].includes(res.status)).toBe(true);
    const added = res.body.data.items.find((i: any) => i.productId === variantProduct.id && i.variantId === variantItem.id);
    expect(added).toBeDefined();
    expect(added.quantity).toBe(1);
  });

  it('9. Adding same logical item merges quantity instead of duplicating row', async () => {
    const initialCart = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);
    
    const countBefore = initialCart.body.data.items.length;

    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: publishedProduct.id, quantity: 3 });

    expect([200, 201].includes(res.status)).toBe(true);
    expect(res.body.data.items.length).toBe(countBefore); // No extra row!
    const updated = res.body.data.items.find((i: any) => i.productId === publishedProduct.id && !i.variantId);
    expect(updated.quantity).toBe(5); // 2 + 3 = 5
  });

  it('10. Update cart item quantity', async () => {
    const cartRes = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);
    
    const itemToUpdate = cartRes.body.data.items[0];

    const res = await request(app)
      .patch(`/api/v1/cart/items/${itemToUpdate.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ quantity: 4 });

    expect(res.status).toBe(200);
    const updated = res.body.data.items.find((i: any) => i.id === itemToUpdate.id);
    expect(updated.quantity).toBe(4);
  });

  it('11. Remove cart item', async () => {
    const cartRes = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);

    const itemToRemove = cartRes.body.data.items.find((i: any) => i.variantId);

    const res = await request(app)
      .delete(`/api/v1/cart/items/${itemToRemove.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((i: any) => i.id === itemToRemove.id)).toBe(false);
  });

  it('12. Clear cart', async () => {
    const res = await request(app)
      .delete('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);

    const checkCart = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(checkCart.body.data.items.length).toBe(0);
  });

  it('13. Add non-existent product is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: 'invalid-prod-99999', quantity: 1 });

    expect(res.status).toBe(400);
  });

  it('14. Unpublished or inactive product added to cart is rejected', async () => {
    const resDraft = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: draftProduct.id, quantity: 1 });

    expect(resDraft.status).toBe(400);

    const resInactive = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: inactiveProduct.id, quantity: 1 });

    expect(resInactive.status).toBe(400);
  });

  it('15. Variant/product mismatch is rejected', async () => {
    const prods = await prisma.product.findMany({
      where: { isPublished: true, isActive: true, variants: { some: { isActive: true } } },
      include: { variants: true },
      take: 2,
    });

    const prodA = prods[0];
    const prodBVariant = prods[1].variants[0];

    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: prodA.id, variantId: prodBVariant.id, quantity: 1 });

    expect(res.status).toBe(400);
  });

  it('16. Customer A cannot access or mutate Customer B cart', async () => {
    // Add item to Cart A
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: publishedProduct.id, quantity: 1 });

    const cartA = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);
    
    const itemA = cartA.body.data.items[0];

    // Customer B tries to delete Customer A's item
    const mutateRes = await request(app)
      .delete(`/api/v1/cart/items/${itemA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(mutateRes.status).toBe(404); // Access denied / Not found for Customer B

    // Customer B gets own cart, should be empty
    const cartB = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(cartB.body.data.items.length).toBe(0);
  });

  it('17 & 18. Frontend fake prices are ignored and backend totals are authoritative', async () => {
    // Clear cart and add 1 Tepache bottle (base price 149, tax 5%, bottle deposit ₹10)
    await request(app).delete('/api/v1/cart').set('Authorization', `Bearer ${tokenA}`);
    
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ 
        productId: tepacheProduct.id, 
        variantId: tepacheProduct.variants[0]?.id, 
        quantity: 1,
        fakeUnitPrice: 1.00, // Attempted fake price
        fakeSubtotal: 1.00
      });

    const res = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const summary = res.body.data;
    expect(summary.itemsSubtotal).toBe(149.00); // DB price authoritative
    expect(summary.containerDepositTotal).toBe(10.00); // ₹10 bottle deposit
    expect(summary.totalTax).toBe(7.45); // 5% tax on 149
    expect(summary.deliveryFee).toBe(40.00); // Delivery fee applied under threshold
    expect(summary.netAmount).toBe(206.45); // 149 + 7.45 + 10 + 40
  });

  // ============================================================
  // ADDRESS TESTS (19-23)
  // ============================================================
  it('19. Customer creates address', async () => {
    const res = await request(app)
      .post('/api/v1/customers/me/addresses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: 'Home Kakkanad',
        addressLine1: 'Flat 4B, Olive Courtyard',
        city: 'Kochi',
        state: 'Kerala',
        postalCode: '682030',
        isDefault: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.isDefault).toBe(true);
    addressAId = res.body.data.id;
  });

  it('20. Customer updates own address', async () => {
    const res = await request(app)
      .put(`/api/v1/customers/me/addresses/${addressAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        addressLine2: 'Infopark Expressway',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.addressLine2).toBe('Infopark Expressway');
  });

  it('21. Customer cannot update another customer address', async () => {
    const res = await request(app)
      .put(`/api/v1/customers/me/addresses/${addressAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        addressLine1: 'Hacked address',
      });

    expect(res.status).toBe(404);
  });

  it('22. Default-address uniqueness behavior works', async () => {
    // Create second address for Customer A with isDefault: true
    const res = await request(app)
      .post('/api/v1/customers/me/addresses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: 'Office Technopark',
        addressLine1: 'Phase 1 Technopark',
        city: 'Trivandrum',
        state: 'Kerala',
        postalCode: '695581',
        isDefault: true,
      });

    expect(res.status).toBe(201);
    addressA2Id = res.body.data.id;
    expect(res.body.data.isDefault).toBe(true);

    // Fetch all addresses for Customer A: only addressA2Id should be default!
    const listRes = await request(app)
      .get('/api/v1/customers/me/addresses')
      .set('Authorization', `Bearer ${tokenA}`);

    const addr1 = listRes.body.data.find((a: any) => a.id === addressAId);
    const addr2 = listRes.body.data.find((a: any) => a.id === addressA2Id);

    expect(addr1.isDefault).toBe(false);
    expect(addr2.isDefault).toBe(true);
  });

  it('23. Soft deletion/inactive address behavior works', async () => {
    const res = await request(app)
      .delete(`/api/v1/customers/me/addresses/${addressA2Id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);

    const listRes = await request(app)
      .get('/api/v1/customers/me/addresses')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(listRes.body.data.some((a: any) => a.id === addressA2Id)).toBe(false);
  });

  // ============================================================
  // CHECKOUT TESTS (24-28)
  // ============================================================
  it('24. Empty cart checkout preview is rejected', async () => {
    // Clear Customer B cart
    await request(app).delete('/api/v1/cart').set('Authorization', `Bearer ${tokenB}`);

    const res = await request(app)
      .post('/api/v1/checkout/preview')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ addressId: addressAId });

    expect(res.status).toBe(400);
  });

  it('25. Invalid/unowned address checkout preview is rejected', async () => {
    // Add item to Cart A
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: publishedProduct.id, quantity: 1 });

    const res = await request(app)
      .post('/api/v1/checkout/preview')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ addressId: 'unowned-or-invalid-addr-id' });

    expect(res.status).toBe(400);
  });

  it('26 & 27. Checkout preview uses backend pricing & ignores frontend fake subtotal/tax/net total', async () => {
    const res = await request(app)
      .post('/api/v1/checkout/preview')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ 
        addressId: addressAId,
        fakeSubtotal: 10.00,
        fakeTax: 0.00,
        fakeNet: 10.00
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('summary');
    expect(res.body.data.summary.itemsSubtotal).toBeGreaterThan(0);
    expect(res.body.data.summary.netAmount).toBeGreaterThan(0);
    expect(res.body.data.summary.itemsSubtotal).not.toBe(10.00); // Fake subtotal ignored!
  });

  it('28. Checkout preview does NOT create an Order', async () => {
    const countBefore = await prisma.order.count();

    await request(app)
      .post('/api/v1/checkout/preview')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ addressId: addressAId });

    const countAfter = await prisma.order.count();
    expect(countAfter).toBe(countBefore); // Zero orders created by preview!
  });

  // ============================================================
  // ORDER TESTS (29-40)
  // ============================================================
  let createdOrderId: string;
  let orderIdempotencyKey: string;
  let originalBasePrice: number;

  it('29. Order creation succeeds transactionally', async () => {
    orderIdempotencyKey = `IK-TEST-${ts}-001`;
    originalBasePrice = Number(publishedProduct.basePrice);

    // Ensure Cart A has items for order creation
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: publishedProduct.id, quantity: 1 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-idempotency-key', orderIdempotencyKey)
      .send({
        addressId: addressAId,
        paymentMethod: 'ONLINE',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('orderNumber');
    createdOrderId = res.body.data.id;
  });

  it('30. OrderItem commercial snapshot is correct', async () => {
    const order = await prisma.order.findUnique({
      where: { id: createdOrderId },
      include: { items: true },
    });

    expect(order).toBeDefined();
    expect(order!.items.length).toBeGreaterThan(0);
    const item = order!.items.find(i => i.productId === publishedProduct.id) || order!.items[0];
    expect(item).toBeDefined();
    expect(item.itemTitle).toBeDefined();
    expect(Number(item.unitPrice)).toBeGreaterThan(0);
    const expectedLineTotal = Number(item.unitPrice) * item.quantity + Number(item.taxAmount) + Number(item.containerDeposit);
    expect(Number(item.totalPrice)).toBe(Number(expectedLineTotal.toFixed(2)));
  });

  it('31. Delivery address snapshot is correct', async () => {
    const order = await prisma.order.findUnique({
      where: { id: createdOrderId },
    });

    expect(order!.deliveryAddressSnapshot).toBeDefined();
    const snapshot: any = order!.deliveryAddressSnapshot;
    expect(snapshot.addressLine1).toBe('Flat 4B, Olive Courtyard');
    expect(snapshot.city).toBe('Kochi');
    expect(snapshot.recipientName).toBe('Commerce Customer A');
  });

  it('32. Cart is cleared after successful order', async () => {
    const cartRes = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(cartRes.body.data.items.length).toBe(0);
  });

  it('33. Failed order does not clear cart', async () => {
    // Add item to cart
    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: publishedProduct.id, quantity: 1 });

    // Attempt order creation with invalid address ID
    const failRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        addressId: 'invalid-address-id',
        paymentMethod: 'ONLINE',
      });

    expect(failRes.status).toBe(400);

    // Cart should still contain the item!
    const cartRes = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(cartRes.body.data.items.length).toBe(1);
  });

  it('34. Duplicate idempotency retry returns same Order', async () => {
    const retryRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-idempotency-key', orderIdempotencyKey)
      .send({
        addressId: addressAId,
        paymentMethod: 'ONLINE',
      });

    expect(retryRes.status).toBe(201);
    expect(retryRes.body.data.id).toBe(createdOrderId); // Identical order returned!
  });

  it('35. Same idempotency key cannot be used by a second customer account', async () => {
    const conflictRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('x-idempotency-key', orderIdempotencyKey)
      .send({
        addressId: addressAId,
        paymentMethod: 'ONLINE',
      });

    expect(conflictRes.status).toBe(409); // Conflict!
  });

  it('36. Customer A cannot view Customer B Order', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${createdOrderId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404); // Access denied / Not found
  });

  it('37. Product price change does not alter historical OrderItem snapshot', async () => {
    // Change publishedProduct basePrice in DB
    await prisma.product.update({
      where: { id: publishedProduct.id },
      data: { basePrice: 999.00 }
    });

    const order = await prisma.order.findUnique({
      where: { id: createdOrderId },
      include: { items: true },
    });

    const item = order!.items.find(i => i.productId === publishedProduct.id);
    expect(Number(item!.unitPrice)).toBe(originalBasePrice); // Original price preserved!
  });

  it('38. Address change does not alter historical Order snapshot', async () => {
    // Update Customer A's address in DB
    await prisma.customerAddress.update({
      where: { id: addressAId },
      data: { addressLine1: 'Altered Street 99' }
    });

    const order = await prisma.order.findUnique({
      where: { id: createdOrderId }
    });

    const snapshot: any = order!.deliveryAddressSnapshot;
    expect(snapshot.addressLine1).toBe('Flat 4B, Olive Courtyard'); // Snapshot preserved!
  });

  it('39. Order paymentStatus is not marked PAID without payment confirmation', async () => {
    const order = await prisma.order.findUnique({
      where: { id: createdOrderId }
    });

    expect(order!.paymentStatus).not.toBe('PAID');
    expect(order!.paymentStatus).toBe('PENDING');
  });

  it('39b. Creating an Order does not create a successful Payment record', async () => {
    const successfulPayments = await prisma.payment.count({
      where: { orderId: createdOrderId, status: 'SUCCESS' }
    });
    expect(successfulPayments).toBe(0);
    const anyPayments = await prisma.payment.count({ where: { orderId: createdOrderId } });
    expect(anyPayments).toBe(0);
  });

  it('40. No fake kitchen/delivery status progression', async () => {
    const order = await prisma.order.findUnique({
      where: { id: createdOrderId }
    });

    expect(order!.status).toBe('PENDING'); // Minimal order state, no fake PREPARING/DELIVERED
  });

  // ============================================================
  // REGRESSION TESTS (41-43)
  // ============================================================
  it('41. Foundation API health check remains passing', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('42. Phase 3 Diet workflow endpoints remain functional', async () => {
    const res = await request(app)
      .get('/api/v1/diets/my-requests')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('43. Phase 4A Recipe catalog endpoints remain functional', async () => {
    const res = await request(app).get('/api/v1/recipes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
