import { ApiClient } from './apiClient';

export class DietService {
  /**
   * Customer Submits Diet Request
   */
  public static async submitRequest(data: {
    goal: string;
    notes?: string;
    planType?: string;
    durationDays?: number;
    dietaryPreference?: string;
    cuisinePreference?: string;
    grainPreference?: string;
    spiceLevel?: string;
    allergiesExclusions?: string;
    customQuery?: string;
    addonSlots?: string[];
    preferredCategories?: string[];
    calculatedPrice?: number;
  }) {
    return await ApiClient.request('/diets/requests', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * Customer Retrieves Own Requests
   */
  public static async getMyRequests() {
    const response = await ApiClient.request('/diets/my-requests');
    return response.data || [];
  }

  /**
   * Customer Retrieves Published / Approved Diet Plans (Sanitized)
   */
  public static async getMyDietPlans() {
    const response = await ApiClient.request('/diets/my-plans');
    return response.data || [];
  }

  /**
   * Customer Approves Published Diet Plan
   */
  public static async approvePlan(planId: string, customerFeedback?: string) {
    return await ApiClient.request(`/diets/plans/${planId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ customerFeedback })
    });
  }

  /**
   * Customer Requests Revision for Published Diet Plan
   */
  public static async requestRevision(planId: string, revisionNotes: string) {
    return await ApiClient.request(`/diets/plans/${planId}/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ revisionNotes })
    });
  }

  /**
   * Nutritionist Fetches Unassigned Queue
   */
  public static async getUnassignedQueue() {
    const response = await ApiClient.request('/diets/nutritionist/unassigned-queue');
    return response.data || [];
  }

  /**
   * Nutritionist Fetches My Claimed Requests Queue
   */
  public static async getClaimedQueue() {
    const response = await ApiClient.request('/diets/nutritionist/my-claimed-queue');
    return response.data || [];
  }

  /**
   * Nutritionist Claims Unassigned Request (Race-condition safe)
   */
  public static async claimRequest(requestId: string) {
    return await ApiClient.request(`/diets/requests/${requestId}/claim`, {
      method: 'POST'
    });
  }

  /**
   * Nutritionist Fetches Authorized Patient Medical Health Profile
   */
  public static async getAuthorizedHealthProfile(requestId: string) {
    const response = await ApiClient.request(`/diets/requests/${requestId}/health-profile`);
    return response.data;
  }

  /**
   * Nutritionist Publishes Diet Plan (or Revision Version)
   */
  public static async publishDietPlan(payload: any) {
    return await ApiClient.request('/diets/plans', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
}
