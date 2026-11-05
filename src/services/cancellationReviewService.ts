import { ApiClient } from './apiClient';

export interface CancellationRequestRow {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  reasonCode: string;
  note: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  order: { id: string; orderNumber: string; status: string; paymentStatus: string; netAmount: string; kitchenBranchId: string | null };
}

export interface CancellationRequestPage {
  items: CancellationRequestRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const STEP_UP_HEADER = 'X-Step-Up-Token';
const post = (body: unknown, proof: string): RequestInit => ({ method: 'POST', headers: { [STEP_UP_HEADER]: proof }, body: JSON.stringify(body) });

/** SUPER_ADMIN review of customer cancellation requests. Decisions send only an optional note / the required explanation: never an amount or status. */
export class CancellationReviewService {
  static async list(status: 'PENDING' | 'APPROVED' | 'DECLINED' | '' = 'PENDING', page = 1): Promise<CancellationRequestPage> {
    const q = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (status) q.set('status', status);
    return await ApiClient.requestData<CancellationRequestPage>(`/admin/cancellation-requests?${q}`);
  }

  static async approve(id: string, note: string | undefined, proof: string): Promise<{ requestId: string; alreadyApproved: boolean; refundId: string | null }> {
    return await ApiClient.requestData(`/admin/cancellation-requests/${encodeURIComponent(id)}/approve`, post(note?.trim() ? { note: note.trim() } : {}, proof));
  }

  static async decline(id: string, note: string, proof: string): Promise<{ requestId: string; alreadyDeclined: boolean }> {
    return await ApiClient.requestData(`/admin/cancellation-requests/${encodeURIComponent(id)}/decline`, post({ note: note.trim() }, proof));
  }
}
