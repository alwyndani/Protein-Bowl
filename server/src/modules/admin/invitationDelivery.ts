import { env } from '../../config/env.js';
import { getMailer } from '../email/mailer.js';

export interface InvitationDeliveryInput {
  rawToken: string;
  expiresAt: Date;
  staff: { id: string; email: string; fullName: string };
}

/** What the API hands back to the authorizing SUPER_ADMIN. */
export interface InvitationHandoff {
  deliveryMode: 'manual' | 'email';
  /** True ONLY when the mail provider accepted the message. Manual mode, and a failed send, are always false. */
  sentByEmail: boolean;
  expiresAt: string;
  /** One-time setup token: returned ONCE, never stored (only its hash is) and never returned again. */
  setupToken: string;
  setupLink: string;
  note: string;
}

/**
 * Delivery seam for staff invitations. Business logic (token generation/storage/expiry/acceptance) never depends on HOW the
 * invitation reaches the staff member.
 */
export interface InvitationDelivery {
  readonly mode: 'manual' | 'email';
  deliver(input: InvitationDeliveryInput): Promise<InvitationHandoff>;
}

function link(rawToken: string): string {
  const base = (env.STAFF_INVITE_BASE_URL ?? env.allowedOrigins[0] ?? env.CLIENT_URL).replace(/\/+$/, '');
  // The token travels in the URL fragment so it is not sent to servers or written to access logs.
  return `${base}/staff/accept-invite#token=${rawToken}`;
}

/** Manual hand-off: the setup link is returned once to the authorized SUPER_ADMIN, who delivers it out of band. */
export class ManualInvitationDelivery implements InvitationDelivery {
  public readonly mode = 'manual' as const;

  public async deliver(input: InvitationDeliveryInput): Promise<InvitationHandoff> {
    return {
      deliveryMode: 'manual',
      sentByEmail: false,
      expiresAt: input.expiresAt.toISOString(),
      setupToken: input.rawToken,
      setupLink: link(input.rawToken),
      note: 'No email was sent. Give this one-time link to the staff member through a secure channel. It is shown only once and expires automatically.'
    };
  }
}

/**
 * Email delivery: mails the one-time link to the staff member. The link is ALSO returned once to the authorizing SUPER_ADMIN as a
 * fallback. If the provider rejects the message the result honestly says so (sentByEmail=false) and the link must be handed over manually.
 */
export class EmailInvitationDelivery implements InvitationDelivery {
  public readonly mode = 'email' as const;

  public async deliver(input: InvitationDeliveryInput): Promise<InvitationHandoff> {
    const setupLink = link(input.rawToken);
    let sent = false;
    try {
      await getMailer().send({
        to: input.staff.email,
        subject: 'Your Protein Bowl staff invitation',
        text: `Hello ${input.staff.fullName},\n\nYou have been invited to join the Protein Bowl team. Set your password using this one-time link (it expires ${input.expiresAt.toUTCString()}):\n\n${setupLink}\n\nIf you did not expect this, ignore this email.`
      });
      sent = true;
    } catch {
      sent = false; // never log the message: it contains the secret link
    }
    return {
      deliveryMode: 'email',
      sentByEmail: sent,
      expiresAt: input.expiresAt.toISOString(),
      setupToken: input.rawToken,
      setupLink,
      note: sent
        ? 'The invitation was emailed to the staff member. This link is also shown once here in case it is needed.'
        : 'The email could NOT be sent. Give this one-time link to the staff member through a secure channel.'
    };
  }
}

export function getInvitationDelivery(): InvitationDelivery {
  return env.inviteDelivery === 'email' ? new EmailInvitationDelivery() : new ManualInvitationDelivery();
}
