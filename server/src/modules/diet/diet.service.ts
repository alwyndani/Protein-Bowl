import { prisma } from '../../config/database.js';
import { AppError } from '../../middleware/error.middleware.js';

export class DietService {
  /**
   * 1. Customer Submits a new Diet Plan Request
   */
  public static async createRequest(userId: string, data: {
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
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      throw new AppError('Customer profile not found for authenticated user', 404);
    }

    return await prisma.dietPlanRequest.create({
      data: {
        customerProfileId: customerProfile.id,
        goal: data.goal,
        notes: data.notes,
        planType: data.planType || 'complete',
        durationDays: data.durationDays || 30,
        dietaryPreference: data.dietaryPreference || 'non-veg',
        cuisinePreference: data.cuisinePreference || 'Kerala Traditional',
        grainPreference: data.grainPreference || 'Kerala Matta Rice',
        spiceLevel: data.spiceLevel || 'Medium',
        allergiesExclusions: data.allergiesExclusions || '',
        customQuery: data.customQuery || '',
        addonSlots: data.addonSlots || [],
        preferredCategories: data.preferredCategories || [],
        calculatedPrice: data.calculatedPrice || undefined,
        status: 'SUBMITTED'
      },
      include: {
        customerProfile: {
          select: {
            id: true,
            fullName: true,
            referralCode: true
          }
        }
      }
    });
  }

  /**
   * 2. Customer fetches own Diet Requests
   */
  public static async getCustomerRequests(userId: string) {
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) return [];

    return await prisma.dietPlanRequest.findMany({
      where: { customerProfileId: customerProfile.id },
      include: {
        dietPlans: {
          where: { isLatestVersion: true },
          select: {
            id: true,
            name: true,
            versionNumber: true,
            status: true,
            customerVisibleNotes: true,
            customerFeedback: true,
            createdAt: true,
            days: {
              include: { meals: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * 3. Customer fetches published/approved Diet Plans (Sanitized - no internal clinical notes)
   */
  public static async getCustomerDietPlans(userId: string) {
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) return [];

    const plans = await prisma.dietPlan.findMany({
      where: {
        customerProfileId: customerProfile.id,
        isLatestVersion: true,
        status: { in: ['SUBMITTED', 'APPROVED', 'REVISED'] }
      },
      include: {
        request: {
          select: {
            id: true,
            status: true,
            planType: true,
            durationDays: true,
            calculatedPrice: true,
            allergiesExclusions: true
          }
        },
        days: {
          orderBy: { dayNumber: 'asc' },
          include: { meals: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Explicitly sanitize response to remove internalClinicalNotes for customer privacy
    return plans.map(plan => {
      const { internalClinicalNotes, ...sanitizedPlan } = plan as any;
      return sanitizedPlan;
    });
  }

  /**
   * 4. Nutritionist fetches unassigned queue (SUBMITTED status, no nutritionist assigned)
   */
  public static async getUnassignedQueue() {
    return await prisma.dietPlanRequest.findMany({
      where: {
        status: 'SUBMITTED',
        nutritionistId: null
      },
      include: {
        customerProfile: {
          select: {
            id: true,
            fullName: true,
            user: { select: { email: true, phone: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * 5. Nutritionist fetches own claimed requests queue
   */
  public static async getClaimedQueue(nutritionistUserId: string) {
    return await prisma.dietPlanRequest.findMany({
      where: {
        nutritionistId: nutritionistUserId
      },
      include: {
        customerProfile: {
          select: {
            id: true,
            fullName: true,
            user: { select: { email: true, phone: true } },
            healthBiometrics: true
          }
        },
        dietPlans: {
          orderBy: { versionNumber: 'desc' },
          include: {
            days: {
              orderBy: { dayNumber: 'asc' },
              include: { meals: true }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * 6. Nutritionist Claims an Unassigned Request (Race-Condition Protected via Prisma Transaction)
   */
  public static async claimRequest(requestId: string, nutritionistUserId: string) {
    return await prisma.$transaction(async (tx) => {
      const req = await tx.dietPlanRequest.findUnique({
        where: { id: requestId }
      });

      if (!req) {
        throw new AppError('Diet plan request not found', 404);
      }

      if (req.nutritionistId && req.nutritionistId !== nutritionistUserId) {
        throw new AppError('Request has already been claimed by another nutritionist', 409);
      }

      if (req.nutritionistId === nutritionistUserId) {
        return req;
      }

      return await tx.dietPlanRequest.update({
        where: { id: requestId },
        data: {
          nutritionistId: nutritionistUserId,
          claimedAt: new Date(),
          status: 'ASSIGNED'
        }
      });
    });
  }

  /**
   * 7. Get Authorized Patient Health Profile (Only assigned nutritionist or Super Admin)
   */
  public static async getAuthorizedHealthProfile(requestId: string, requestingUserId: string, userRoles: string[]) {
    const req = await prisma.dietPlanRequest.findUnique({
      where: { id: requestId },
      include: {
        customerProfile: {
          include: {
            user: { select: { id: true, email: true, phone: true } },
            healthBiometrics: true
          }
        }
      }
    });

    if (!req) {
      throw new AppError('Diet plan request not found', 404);
    }

    const isSuperAdmin = userRoles.includes('SUPER_ADMIN');
    const isAssignedNutritionist = req.nutritionistId === requestingUserId;

    if (!isAssignedNutritionist && !isSuperAdmin) {
      throw new AppError('Unauthorized: Detailed health profile access is restricted to the assigned nutritionist', 403);
    }

    return req.customerProfile;
  }

  /**
   * 8. Create or Publish a Diet Plan (Supports initial version & revision multi-version history)
   */
  public static async createOrPublishDietPlan(nutritionistUserId: string, userRoles: string[], data: {
    requestId: string;
    name: string;
    targetCalories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    fiberGrams?: number;
    internalClinicalNotes?: string;
    customerVisibleNotes?: string;
    days: Array<{
      dayNumber: number;
      dayName: string;
      notes?: string;
      meals: Array<{
        mealType: string;
        timingLabel?: string;
        recipeId?: string;
        recipeName: string;
        portionScale?: number;
        portionGrams?: number;
        portionSize?: string;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        instructions?: string;
        customizationNote?: string;
        slotRemarks?: string;
      }>;
    }>;
  }) {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.dietPlanRequest.findUnique({
        where: { id: data.requestId }
      });

      if (!request) {
        throw new AppError('Diet plan request not found', 404);
      }

      const isSuperAdmin = userRoles.includes('SUPER_ADMIN');
      if (request.nutritionistId !== nutritionistUserId && !isSuperAdmin) {
        throw new AppError('Unauthorized: You are not the assigned nutritionist for this request', 403);
      }

      // Find any existing plans for this request to handle versioning
      const existingPlans = await tx.dietPlan.findMany({
        where: { requestId: data.requestId },
        orderBy: { versionNumber: 'desc' }
      });

      let versionNumber = 1;
      let parentPlanId: string | undefined = undefined;

      if (existingPlans.length > 0) {
        const latestExisting = existingPlans[0];
        versionNumber = latestExisting.versionNumber + 1;
        parentPlanId = latestExisting.id;

        // Mark all existing plans as isLatestVersion = false
        await tx.dietPlan.updateMany({
          where: { requestId: data.requestId },
          data: { isLatestVersion: false }
        });
      }

      // Create new version plan
      const newPlan = await tx.dietPlan.create({
        data: {
          requestId: data.requestId,
          customerProfileId: request.customerProfileId,
          nutritionistId: nutritionistUserId,
          name: data.name || `Custom Diet Plan v${versionNumber}`,
          versionNumber,
          parentPlanId,
          isLatestVersion: true,
          targetCalories: data.targetCalories,
          proteinGrams: data.proteinGrams,
          carbsGrams: data.carbsGrams,
          fatGrams: data.fatGrams,
          fiberGrams: data.fiberGrams || 30,
          status: 'SUBMITTED', // Published for customer review
          internalClinicalNotes: data.internalClinicalNotes || undefined,
          customerVisibleNotes: data.customerVisibleNotes || undefined,
          days: {
            create: data.days.map(d => ({
              dayNumber: d.dayNumber,
              dayName: d.dayName,
              notes: d.notes,
              meals: {
                create: d.meals.map(m => ({
                  mealType: m.mealType,
                  timingLabel: m.timingLabel,
                  recipeId: m.recipeId || undefined,
                  recipeName: m.recipeName,
                  portionScale: m.portionScale || 1.0,
                  portionGrams: m.portionGrams || 200,
                  portionSize: m.portionSize,
                  calories: m.calories,
                  protein: m.protein,
                  carbs: m.carbs,
                  fat: m.fat,
                  instructions: m.instructions,
                  customizationNote: m.customizationNote,
                  slotRemarks: m.slotRemarks
                }))
              }
            }))
          }
        },
        include: {
          days: {
            orderBy: { dayNumber: 'asc' },
            include: { meals: true }
          }
        }
      });

      // Update DietPlanRequest status to PLAN_CREATED
      await tx.dietPlanRequest.update({
        where: { id: data.requestId },
        data: { status: 'PLAN_CREATED' }
      });

      return newPlan;
    });
  }

  /**
   * 9. Customer Approves Plan
   */
  public static async approvePlan(userId: string, planId: string, customerFeedback?: string) {
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      throw new AppError('Customer profile not found', 404);
    }

    return await prisma.$transaction(async (tx) => {
      const plan = await tx.dietPlan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        throw new AppError('Diet plan not found', 404);
      }

      if (plan.customerProfileId !== customerProfile.id) {
        throw new AppError('Unauthorized: You can only approve your own diet plan', 403);
      }

      if (plan.status !== 'SUBMITTED') {
        throw new AppError(`Cannot approve plan in status '${plan.status}'`, 400);
      }

      // Update plan to APPROVED
      const updatedPlan = await tx.dietPlan.update({
        where: { id: planId },
        data: {
          status: 'APPROVED',
          customerFeedback: customerFeedback || 'Approved by customer'
        }
      });

      // Update request status to COMPLETED if linked
      if (plan.requestId) {
        await tx.dietPlanRequest.update({
          where: { id: plan.requestId },
          data: { status: 'COMPLETED' }
        });
      }

      const { internalClinicalNotes, ...sanitized } = updatedPlan as any;
      return sanitized;
    });
  }

  /**
   * 10. Customer Requests Revision
   */
  public static async requestRevision(userId: string, planId: string, revisionNotes: string) {
    const customerProfile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!customerProfile) {
      throw new AppError('Customer profile not found', 404);
    }

    return await prisma.$transaction(async (tx) => {
      const plan = await tx.dietPlan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        throw new AppError('Diet plan not found', 404);
      }

      if (plan.customerProfileId !== customerProfile.id) {
        throw new AppError('Unauthorized: You can only request revisions for your own diet plan', 403);
      }

      if (plan.status !== 'SUBMITTED') {
        throw new AppError(`Cannot request revision for plan in status '${plan.status}'`, 400);
      }

      // Update plan status to REVISED
      const updatedPlan = await tx.dietPlan.update({
        where: { id: planId },
        data: {
          status: 'REVISED',
          customerFeedback: revisionNotes
        }
      });

      // Update request status to REVISION_REQUESTED
      if (plan.requestId) {
        await tx.dietPlanRequest.update({
          where: { id: plan.requestId },
          data: {
            status: 'REVISION_REQUESTED',
            revisionNotes
          }
        });
      }

      const { internalClinicalNotes, ...sanitized } = updatedPlan as any;
      return sanitized;
    });
  }
}
