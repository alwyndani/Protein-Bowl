import { FakeBackend } from './fakeBackend';

/**
 * Commerce test double mirroring the AUDITED backend contract (route names, envelopes, money representations, error codes,
 * idempotency semantics). The real behaviour is proven by server/src/tests/p11b.contract.test.ts. Test support only.
 *
 * Its totals are intentionally NOT derived from the cart lines in some tests (see `netOverride`) so the mobile tests can prove the
 * app shows the server figures verbatim and never calculates its own.
 */
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

interface FakeVariant {
  id: string;
  name: string;
  price: string;
  isActive: boolean;
  isDefault: boolean;
}
interface FakeProduct {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  image: string | null;
  basePrice: string;
  variants: FakeVariant[];
}
interface Line {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
}

export class FakeCommerceBackend extends FakeBackend {
  categories = [
    { id: 'cat-1', name: 'Protein Bowls', slug: 'protein-bowls', description: null, image: null, displayOrder: 1 },
    { id: 'cat-2', name: 'Drinks', slug: 'drinks', description: null, image: null, displayOrder: 2 }
  ];
  products: FakeProduct[] = [
    { id: 'p-1', slug: 'chicken-bowl', name: 'Chicken Bowl', categoryId: 'cat-1', image: null, basePrice: '299', variants: [{ id: 'v-1', name: 'Standard', price: '299', isActive: true, isDefault: true }] },
    {
      id: 'p-2',
      slug: 'paneer-bowl',
      name: 'Paneer Bowl',
      categoryId: 'cat-1',
      image: 'https://images.example.test/paneer.jpg',
      basePrice: '249.5',
      variants: [
        { id: 'v-2a', name: 'Regular', price: '249.5', isActive: true, isDefault: true },
        { id: 'v-2b', name: 'Large', price: '1249.50', isActive: true, isDefault: false },
        { id: 'v-2c', name: 'Retired', price: '10', isActive: false, isDefault: false }
      ]
    },
    { id: 'p-3', slug: 'tepache', name: 'Tepache', categoryId: 'cat-2', image: 'http://insecure.example.test/t.jpg', basePrice: '120', variants: [] }
  ];
  carts = new Map<string, Line[]>();
  addresses = new Map<string, Array<Record<string, unknown>>>();
  orders = new Map<string, Array<Record<string, any>>>();
  idempotent = new Map<string, { addressId: string; instructions: string; order: Record<string, any> }>();
  minimumOrder = { enabled: true, requiredAmount: 100 };
  /** When set, every net amount returned by cart / preview is this value (proves verbatim display). */
  netOverride: number | null = null;
  /** Server-side fee / tax changes between two previews (the net total may stay the same). */
  deliveryFeeOverride: number | null = null;
  taxOverride: number | null = null;
  /** After the next POST /orders is COMMITTED the response is lost (network error). */
  loseNextOrderResponse = false;
  private seq = 0;

  private lines(userId: string) {
    if (!this.carts.has(userId)) this.carts.set(userId, []);
    return this.carts.get(userId)!;
  }
  private addrs(userId: string) {
    if (!this.addresses.has(userId)) this.addresses.set(userId, []);
    return this.addresses.get(userId)!;
  }
  private ordersOf(userId: string) {
    if (!this.orders.has(userId)) this.orders.set(userId, []);
    return this.orders.get(userId)!;
  }

  private priced(userId: string) {
    const items = this.lines(userId).map((l) => {
      const p = this.products.find((x) => x.id === l.productId)!;
      const v = l.variantId ? p.variants.find((x) => x.id === l.variantId)! : null;
      const unit = Number(v ? v.price : p.basePrice);
      const subtotal = unit * l.quantity;
      const tax = subtotal * 0.05;
      return { l, p, v, unit, subtotal, tax };
    });
    const itemsSubtotal = items.reduce((a, i) => a + i.subtotal, 0);
    const totalTax = this.taxOverride ?? items.reduce((a, i) => a + i.tax, 0);
    const deliveryFee = this.deliveryFeeOverride ?? (items.length ? 40 : 0);
    const net = this.netOverride ?? itemsSubtotal + totalTax + deliveryFee;
    const unmet = this.minimumOrder.enabled && itemsSubtotal < this.minimumOrder.requiredAmount;
    return {
      items,
      summary: { itemsSubtotal, totalTax, containerDepositTotal: 0, packagingFee: 0, deliveryFee, discountAmount: 0, netAmount: net },
      minimumOrder: { enabled: this.minimumOrder.enabled, requiredAmount: this.minimumOrder.requiredAmount, met: !unmet, shortfall: unmet ? this.minimumOrder.requiredAmount - itemsSubtotal : 0 }
    };
  }

  private cartDto(userId: string) {
    const pr = this.priced(userId);
    return {
      id: `cart-${userId}`,
      customerProfileId: `cp-${userId}`,
      items: pr.items.map((i) => ({
        id: i.l.id,
        productId: i.p.id,
        variantId: i.v?.id ?? null,
        name: i.p.name,
        variantName: i.v?.name ?? null,
        sku: 'SKU-SECRET',
        category: i.p.categoryId,
        image: i.p.image,
        unitPrice: i.unit,
        quantity: i.l.quantity,
        subtotal: i.subtotal,
        taxAmount: i.tax,
        containerDeposit: 0,
        lineTotal: i.subtotal + i.tax
      })),
      ...pr.summary,
      minimumOrder: pr.minimumOrder,
      quantityIssues: [],
      totals: { subtotal: pr.summary.itemsSubtotal }
    };
  }

  private productDto(p: FakeProduct) {
    // Raw-row shape of the real API, including the fields the app must ignore.
    const cat = this.categories.find((c) => c.id === p.categoryId)!;
    return {
      id: p.id,
      categoryId: p.categoryId,
      recipeId: 'recipe-internal',
      name: p.name,
      slug: p.slug,
      description: `${p.name} description`,
      image: p.image,
      isFMCG: false,
      isTepache: false,
      isPublished: true,
      isActive: true,
      basePrice: p.basePrice,
      containerDeposit: '0',
      taxRate: '0.0500',
      rating: 4.8,
      reviewsCount: 0,
      category: cat,
      variants: p.variants.map((v) => ({ ...v, productId: p.id, sku: 'SKU-SECRET', containerDeposit: null, stockQuantity: 100, calories: 520, protein: 45, carbs: null, fat: null }))
    };
  }

  private orderDto(o: Record<string, any>, withTimeline: boolean) {
    const { _ownerId, _timeline, ...rest } = o;
    return withTimeline ? { ...rest, timeline: _timeline } : rest;
  }

  constructor() {
    super();
    const base = this.fetch;
    this.fetch = (url: string, init: RequestInit = {}): Promise<Response> => {
      const path = url.replace(/^https?:\/\/[^/]+\/api\/v1/, '');
      if (this.loseNextOrderResponse && path === '/orders' && (init.method ?? 'GET') === 'POST') {
        this.loseNextOrderResponse = false;
        return base(url, init).then(() => {
          throw new TypeError('Network request failed');
        });
      }
      return base(url, init);
    };
  }

  protected route(path: string, headers: Record<string, string>, body: any): Response {
    const method = (this.log[this.log.length - 1]?.method ?? 'GET').toUpperCase();
    const cleanPath = path.split('?')[0];
    const query = path.includes('?') ? new URLSearchParams(path.split('?')[1]) : new URLSearchParams();
    const commerce = /^\/(products|cart|customers|checkout|orders)/.test(cleanPath);
    if (!commerce) return super.route(path, headers, body);

    // catalog is public
    if (cleanPath === '/products/categories') return this.respond(200, { success: true, data: this.categories });
    if (cleanPath === '/products' && method === 'GET') {
      const cid = query.get('categoryId');
      return this.respond(200, { success: true, data: this.products.filter((p) => !cid || p.categoryId === cid).map((p) => this.productDto(p)) });
    }
    if (cleanPath.startsWith('/products/')) {
      const slug = decodeURIComponent(cleanPath.slice('/products/'.length));
      const p = this.products.find((x) => x.slug === slug || x.id === slug);
      return p ? this.respond(200, { success: true, data: this.productDto(p) }) : this.respond(404, { success: false, message: 'Product not found' });
    }

    const user = this.bearer(headers);
    if (!user) return this.err(401, 'UNAUTHORIZED');
    if (!user.roles.includes('CUSTOMER')) return this.err(403, 'FORBIDDEN');
    const uid = user.id;

    // cart
    if (cleanPath === '/cart' && method === 'GET') return this.respond(200, { success: true, data: this.cartDto(uid) });
    if (cleanPath === '/cart' && method === 'DELETE') {
      this.carts.set(uid, []);
      return this.respond(200, { success: true, data: this.cartDto(uid) });
    }
    if (cleanPath === '/cart/items' && method === 'POST') {
      const p = this.products.find((x) => x.id === body.productId);
      if (!p) return this.err(400, 'UNAVAILABLE_PRODUCT');
      if (body.variantId && !p.variants.find((v) => v.id === body.variantId && v.isActive)) return this.err(400, 'INVALID_VARIANT');
      const qty = body.quantity;
      if (!Number.isInteger(qty) || qty < 1) return this.err(422, 'INVALID_QUANTITY');
      if (qty > 10) return this.err(422, 'MAX_LINE_QUANTITY_EXCEEDED');
      const existing = this.lines(uid).find((l) => l.productId === body.productId && (l.variantId ?? null) === (body.variantId ?? null));
      if (existing) existing.quantity += qty;
      else this.lines(uid).push({ id: `line-${++this.seq}`, productId: body.productId, variantId: body.variantId ?? null, quantity: qty });
      return this.respond(201, { success: true, data: this.cartDto(uid) });
    }
    const itemMatch = cleanPath.match(/^\/cart\/items\/([^/]+)$/);
    if (itemMatch) {
      const line = this.lines(uid).find((l) => l.id === itemMatch[1]);
      if (!line) return this.err(404, 'NOT_FOUND');
      if (method === 'PATCH') {
        if (!Number.isInteger(body.quantity) || body.quantity < 1) return this.err(422, 'INVALID_QUANTITY');
        if (body.quantity > 10) return this.err(422, 'MAX_CART_QUANTITY_EXCEEDED');
        line.quantity = body.quantity;
      } else if (method === 'DELETE') {
        this.carts.set(uid, this.lines(uid).filter((l) => l.id !== line.id));
      }
      return this.respond(200, { success: true, data: this.cartDto(uid) });
    }

    // addresses (owner scoped)
    if (cleanPath === '/customers/me/addresses' && method === 'GET') return this.respond(200, { success: true, data: this.addrs(uid).filter((a) => a.isActive) });
    if (cleanPath === '/customers/me/addresses' && method === 'POST') {
      if (!body.addressLine1 || body.addressLine1.length < 3 || !body.city || !body.postalCode) return this.err(422, 'VALIDATION_ERROR');
      if (body.isDefault) this.addrs(uid).forEach((a) => (a.isDefault = false));
      const a = { id: `addr-${++this.seq}`, customerProfileId: `cp-${uid}`, title: body.title || 'Home', addressLine1: body.addressLine1, addressLine2: body.addressLine2 ?? null, city: body.city, state: body.state || 'Kerala', postalCode: body.postalCode, isDefault: !!body.isDefault, isActive: true, latitude: null, longitude: null };
      this.addrs(uid).push(a);
      return this.respond(201, { success: true, data: a });
    }
    const addrMatch = cleanPath.match(/^\/customers\/me\/addresses\/([^/]+)$/);
    if (addrMatch) {
      const a = this.addrs(uid).find((x) => x.id === addrMatch[1] && x.isActive);
      if (!a) return this.err(404, 'NOT_FOUND'); // another customer's address is indistinguishable from a missing one
      if (method === 'PUT') {
        if (body.isDefault) this.addrs(uid).forEach((x) => (x.isDefault = false));
        Object.assign(a, body);
        return this.respond(200, { success: true, data: a });
      }
      if (method === 'DELETE') {
        a.isActive = false;
        a.isDefault = false;
        return this.respond(200, { success: true, data: { success: true } });
      }
    }

    // checkout
    if (cleanPath === '/checkout/preview' && method === 'POST') {
      const pr = this.priced(uid);
      if (pr.items.length === 0) return this.err(400, 'EMPTY_CART');
      let address: Record<string, any> | null = null;
      if (body.addressId) {
        address = this.addrs(uid).find((a) => a.id === body.addressId && a.isActive) ?? null;
        if (!address) return this.err(400, 'INVALID_ADDRESS');
      } else address = this.addrs(uid).find((a) => a.isDefault && a.isActive) ?? null;
      return this.respond(200, {
        success: true,
        data: {
          cartId: `cart-${uid}`,
          items: pr.items.map((i) => ({ productId: i.p.id, variantId: i.v?.id ?? null, title: i.p.name, variantName: i.v?.name ?? null, sku: 'SKU-SECRET', unitPrice: i.unit, quantity: i.l.quantity, subtotal: i.subtotal, taxRate: 0.05, taxAmount: i.tax, containerDeposit: 0, totalPrice: i.subtotal + i.tax })),
          summary: pr.summary,
          minimumOrder: pr.minimumOrder,
          deliveryAddress: address ? { id: address.id, title: address.title, addressLine1: address.addressLine1, addressLine2: address.addressLine2, city: address.city, state: address.state, postalCode: address.postalCode, recipientName: user.fullName } : null
        }
      });
    }

    // orders
    if (cleanPath === '/orders' && method === 'POST') {
      const key = headers['x-idempotency-key'];
      if (!key) return this.err(400, 'IDEMPOTENCY_KEY_REQUIRED');
      if (!IDEMPOTENCY.test(key)) return this.err(400, 'INVALID_IDEMPOTENCY_KEY');
      if ('paymentMethod' in body) return this.err(422, 'INVALID_PAYMENT_METHOD');
      const scoped = `${uid}:${key}`;
      const prior = this.idempotent.get(scoped);
      const instructions = body.deliveryInstructions ?? '';
      if (prior) {
        if (prior.addressId !== body.addressId || prior.instructions !== instructions) return this.err(409, 'IDEMPOTENCY_KEY_REUSED');
        return this.respond(201, { success: true, data: this.orderDto(prior.order, false) });
      }
      const pr = this.priced(uid);
      if (pr.items.length === 0) return this.err(400, 'EMPTY_CART');
      const address = this.addrs(uid).find((a) => a.id === body.addressId && a.isActive);
      if (!address) return this.err(400, 'INVALID_ADDRESS');
      if (pr.minimumOrder.enabled && !pr.minimumOrder.met) return this.err(422, 'MINIMUM_ORDER_NOT_MET');
      const order: Record<string, any> = {
        id: `ord-${++this.seq}`,
        orderNumber: `PB-261013-T${String(this.seq).padStart(5, '0')}`,
        status: 'PENDING',
        orderType: 'DIRECT',
        paymentStatus: 'PENDING',
        paymentMethod: 'ONLINE',
        totalAmount: String(pr.summary.itemsSubtotal),
        discountAmount: '0',
        taxAmount: String(pr.summary.totalTax),
        deliveryFee: String(pr.summary.deliveryFee),
        packagingFee: '0',
        containerDepositTotal: '0',
        netAmount: String(pr.summary.netAmount),
        deliveryAddress: 'line',
        deliveryAddressSnapshot: { title: address.title, addressLine1: address.addressLine1, addressLine2: address.addressLine2, city: address.city, state: address.state, postalCode: address.postalCode, recipientName: user.fullName, phone: '+910000000000', email: user.email, ...(instructions ? { deliveryInstructions: instructions } : {}) },
        confirmedAt: null,
        cancelledAt: null,
        createdAt: '2026-10-13T10:15:00.000Z',
        updatedAt: '2026-10-13T10:15:00.000Z',
        items: pr.items.map((i, n) => ({ id: `oi-${this.seq}-${n}`, orderId: `ord-${this.seq}`, productId: i.p.id, variantId: i.v?.id ?? null, itemTitle: i.p.name, variantName: i.v?.name ?? null, sku: 'SKU-SECRET', unitPrice: String(i.unit), quantity: i.l.quantity, totalPrice: String(i.subtotal + i.tax), taxRate: '0.0500', taxAmount: String(i.tax), containerDeposit: '0' })),
        cancellation: { state: 'CANCELLATION_AVAILABLE', allowed: true },
        refund: { state: 'NO_REFUND' },
        payment: { state: 'NOT_STARTED', canStartPayment: true },
        _ownerId: uid,
        _timeline: [{ fromStatus: null, toStatus: 'PENDING', at: '2026-10-13T10:15:00.000Z' }]
      };
      this.ordersOf(uid).unshift(order);
      this.idempotent.set(scoped, { addressId: body.addressId, instructions, order });
      this.carts.set(uid, []); // the cart is consumed in the same transaction
      return this.respond(201, { success: true, data: this.orderDto(order, false) });
    }
    if (cleanPath === '/orders/my-orders') return this.respond(200, { success: true, data: this.ordersOf(uid).map((o) => this.orderDto(o, false)) });
    const ordMatch = cleanPath.match(/^\/orders\/([^/]+)$/);
    if (ordMatch) {
      const o = this.ordersOf(uid).find((x) => x.id === ordMatch[1] || x.orderNumber === ordMatch[1]);
      return o ? this.respond(200, { success: true, data: this.orderDto(o, true) }) : this.err(404, 'NOT_FOUND');
    }
    return this.err(404, 'NOT_FOUND');
  }
}
