import { env } from '../../config/env.js';

export interface InvitationDeliveryInput {
  rawToken: string;
  expiresAt: Date;
  staff: { id: string; email: string; fullName: string };
}

/** What the API hands back to the authorizing SUPER_ADMIN. */
export interface InvitationHandoff {
  deliveryMode: 'manual';
  /** True only when the system itself sent the invitation. Always false in manual mode - nothing is emailed. */
  sentByEmail: false;
  expiresAt: string;
  /** One-time setup token: returned ONCE, never stored (only its hash is) and never returned again. */
  setupToken: string;
  setupLink: string;
  note: string;
}

/**
 * Delivery seam for staff invitations. Business logic (token generation/storage/expiry/acceptance) never depends on HOW the
 * invitation reaches the staff member, so an email adapter (P14) can implement this interface without touching it.
 */
export interface InvitationDelivery {
  readonly mode: 'manual';
  deliver(input: InvitationDeliveryInput): Promise<InvitationHandoff>;
}

/** Manual hand-off: the setup link is returned once to the authorized SUPER_ADMIN, who delivers it out of band. */
export class ManualInvitationDelivery implements InvitationDelivery {
  public readonly mode = 'manual' as const;

  public async deliver(input: InvitationDeliveryInput): Promise<InvitationHandoff> {
    const base = (env.STAFF_INVITE_BASE_URL ?? env.allowedOrigins[0] ?? env.CLIENT_URL).replace(/\/+$/, '');
    return {
      deliveryMode: 'manual',
      sentByEmail: false,
      expiresAt: input.expiresAt.toISOString(),
      setupToken: input.rawToken,
      // The token travels in the URL fragment so it is not sent to servers or written to access logs.
      setupLink: `${base}/staff/accept-invite#token=${input.rawToken}`,
      note: 'No email was sent. Give this one-time link to the staff member through a secure channel. It is shown only once and expires automatically.'
    };
  }
}

export function getInvitationDelivery(): InvitationDelivery {
  switch (env.inviteDelivery) {
    case 'manual':
    default:
      return new ManualInvitationDelivery();
  }
}
