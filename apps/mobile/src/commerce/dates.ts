/**
 * Customer-facing times are shown in India Standard Time (Asia/Kolkata, UTC+05:30, no DST). A fixed offset is applied to the epoch
 * and read through UTC getters, so the result never depends on the device time zone or on Hermes Intl support. Server timestamps
 * (ISO UTC) are never mutated.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t + IST_OFFSET_MS);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h12}:${mm} ${h24 < 12 ? 'am' : 'pm'} IST`;
}
