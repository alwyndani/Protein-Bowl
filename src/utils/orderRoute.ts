/**
 * Order deep links WITHOUT a router, following the existing pathname convention (/staff/accept-invite):
 *   /orders/<orderNumber>
 * Only the order number travels in the URL (it is not a secret: the server enforces ownership and answers 404 for anyone else).
 * Nothing payment-related is ever put in a URL.
 */
const ORDER_PATH = /^\/orders\/([A-Za-z0-9][A-Za-z0-9-]{2,63})\/?$/;

export function parseOrderRoute(pathname: string): string | null {
  const match = ORDER_PATH.exec(pathname);
  return match ? match[1] : null;
}

export function orderPath(orderNumber: string): string {
  return `/orders/${encodeURIComponent(orderNumber)}`;
}
