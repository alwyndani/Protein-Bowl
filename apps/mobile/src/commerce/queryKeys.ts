/** TanStack Query keys. In-memory only (the query cache is never persisted and is cleared on sign-out). */
export const qk = {
  categories: ['catalog', 'categories'] as const,
  products: (categoryId: string | null) => ['catalog', 'products', categoryId ?? 'all'] as const,
  product: (slug: string) => ['catalog', 'product', slug] as const,
  cart: ['cart'] as const,
  addresses: ['addresses'] as const,
  preview: (addressId: string | null) => ['checkout', 'preview', addressId ?? 'default'] as const,
  orders: ['orders'] as const,
  order: (id: string) => ['order', id] as const
};

/** The catalog is public and slow-changing; everything customer-specific is always re-fetched. */
export const CATALOG_STALE_MS = 60_000;
