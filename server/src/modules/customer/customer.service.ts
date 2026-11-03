import { prisma } from '../../config/database.js';
import { UpdateCustomerProfileDto } from './customer.validator.js';
import { calculateBiometrics } from '../../utils/biometricsCalculator.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizePhone } from '../../utils/phone.js';
import { isPhoneTaken } from '../auth/phoneUniqueness.js';
import { deriveForClient } from '../health/biometricsPresentation.js';

export class CustomerService {
  /**
   * Fetch customer profile + health biometrics for the authenticated userId
   */
  async getCustomerProfile(userId: string) {
    let profile = await prisma.customerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            createdAt: true
          }
        },
        healthBiometrics: true
      }
    });

    // If profile does not exist yet, create default CustomerProfile
    if (!profile) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const randomReferral = 'PB' + Math.random().toString(36).substring(2, 8).toUpperCase();
      profile = await prisma.customerProfile.create({
        data: {
          userId,
          fullName: user.email.split('@')[0],
          referralCode: randomReferral
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              createdAt: true
            }
          },
          healthBiometrics: true
        }
      });
    }

    return this.formatProfileResponse(profile);
  }

  /**
   * Update or create health biometrics & customer profile for the authenticated userId
   */
  async updateCustomerProfile(userId: string, data: UpdateCustomerProfileDto) {
    let profile = await prisma.customerProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      const randomReferral = 'PB' + Math.random().toString(36).substring(2, 8).toUpperCase();
      profile = await prisma.customerProfile.create({
        data: {
          userId,
          fullName: data.fullName || user.email.split('@')[0],
          referralCode: randomReferral
        }
      });
    }

    // What is stored already fills any of the four required measurements that this request omits (a partial update), but nothing is ever invented.
    const stored = await prisma.healthBiometrics.findUnique({
      where: { customerProfileId: profile.id },
      select: { heightCm: true, weightKg: true, goal: true, activityLevel: true, hasExercise: true }
    });
    const merged = {
      heightCm: data.heightCm ?? stored?.heightCm,
      weightKg: data.weightKg ?? stored?.weightKg,
      goal: data.goal ?? stored?.goal,
      activityLevel: data.activityLevel ?? stored?.activityLevel
    };
    const hasRequired = merged.heightCm != null && merged.weightKg != null && !!merged.goal && !!merged.activityLevel;
    // BASICS-ONLY request (e.g. a customer who skipped the health step but entered a date of birth and gender at sign-up): only the basics are
    // stored and NO health profile row is created, so no height, weight, goal or activity level exists that the customer did not provide.
    const BASIC_KEYS = new Set(['fullName', 'dob', 'gender', 'deliveryAddress', 'phone']);
    const healthKeysSent = Object.entries(data).filter(([k, v]) => !BASIC_KEYS.has(k) && v !== undefined).map(([k]) => k);
    if (!hasRequired && healthKeysSent.length > 0) {
      throw new AppError('Height, weight, goal and activity level are required together before health details can be saved', 422, 'HEALTH_PROFILE_INCOMPLETE');
    }
    // Server-side calculated biometrics. An omitted `hasExercise` means "unchanged", so the stored value feeds the calculation.
    const calc = hasRequired
      ? calculateBiometrics({
          heightCm: merged.heightCm!,
          weightKg: merged.weightKg!,
          dob: data.dob || profile.dob,
          gender: data.gender || profile.gender,
          activityLevel: merged.activityLevel!,
          goal: merged.goal!,
          hasExercise: data.hasExercise ?? stored?.hasExercise
        })
      : null;

    const parsedDob = data.dob ? new Date(data.dob) : undefined;

    // Use Prisma transaction to atomically update CustomerProfile and HealthBiometrics
    let updatedProfile;
    try {
    updatedProfile = await prisma.$transaction(async (tx) => {
      // 0. Mobile number (stored on the user account). Only an actual change is written; a duplicate is refused, never ignored.
      if (data.phone !== undefined) {
        const next = normalizePhone(data.phone)!; // validated by the schema
        const owner = await tx.user.findUnique({ where: { id: userId }, select: { phone: true } });
        const current = owner?.phone ? normalizePhone(owner.phone) : null;
        if (next !== current) {
          if (await isPhoneTaken(next, userId, tx)) throw new AppError('This mobile number is already registered to another account', 409, 'PHONE_IN_USE');
          await tx.user.update({ where: { id: userId }, data: { phone: next } });
          // The audit row records THAT it changed, never the number itself.
          await AuditService.record({ actor: { userId, roles: ['CUSTOMER'] }, action: 'CUSTOMER_PHONE_CHANGED', entity: 'User', entityId: userId, payload: { changed: true } }, tx);
        }
      }

      // 1. Update CustomerProfile basic fields
      const updatedCustProfile = await tx.customerProfile.update({
        where: { id: profile.id },
        data: {
          fullName: data.fullName || profile.fullName,
          dob: parsedDob,
          gender: data.gender || profile.gender,
          deliveryAddress: data.deliveryAddress !== undefined ? data.deliveryAddress : profile.deliveryAddress
        }
      });

      // 2. Upsert HealthBiometrics (only when a complete set of required measurements exists)
      if (calc) {
      const biometricsData = {
        heightCm: merged.heightCm!,
        weightKg: merged.weightKg!,
        targetWeightKg: data.targetWeightKg,
        muscleMassKg: data.muscleMassKg,
        occupation: data.occupation,
        workSchedule: data.workSchedule,
        sleepDuration: data.sleepDuration,
        wakeUpTime: data.wakeUpTime,
        bedTime: data.bedTime,

        circumferences: (data.circumferences as any) || undefined,
        limbCircumferences: (data.limbCircumferences as any) || undefined,

        goal: merged.goal!,
        // PARTIAL-UPDATE RULE: a field that was not sent is `undefined`, which Prisma leaves untouched on update (and the column default
        // applies on first create). Only an explicit value, including an explicit empty list, changes stored health information.
        primaryGoals: data.primaryGoals,
        activityLevel: merged.activityLevel!,

        hasExercise: data.hasExercise,
        workoutTypes: data.workoutTypes,
        workoutFrequency: data.workoutFrequency,
        workoutDuration: data.workoutDuration,
        dailyStepCount: data.dailyStepCount,
        cardioSessions: data.cardioSessions,
        strengthSessions: data.strengthSessions,

        medicalConditions: data.medicalConditions,
        currentMedications: data.currentMedications,
        supplements: data.supplements,
        bloodTestResults: (data.bloodTestResults as any) || undefined,

        foodPreference: data.foodPreference,
        allergies: data.allergies,
        foodDislikes: data.foodDislikes,
        customQuery: data.customQuery,

        mealsPerDay: data.mealsPerDay, // not provided -> the column's own default (3); a schema decision, not invented here
        mealTimings: (data.mealTimings as any) || undefined,
        waterIntakeL: data.waterIntakeL, // the calculated requirement is stored separately in waterRequirementL

        digestiveHealth: data.digestiveHealth,
        smoking: data.smoking,
        alcohol: data.alcohol,
        tobacco: data.tobacco,
        stressLevel: data.stressLevel,
        sleepQuality: data.sleepQuality,

        isPregnant: data.isPregnant,
        isBreastfeeding: data.isBreastfeeding,
        menstrualCycle: data.menstrualCycle,
        isMenopause: data.isMenopause,

        planDurationDays: data.planDurationDays,
        planFrequency: data.planFrequency,
        preferredSlot: data.preferredSlot,
        addonSlots: data.addonSlots,

        // Server calculated metrics. When the date of birth or gender is not saved yet, calories/macros are NOT CALCULATED: the schema columns
        // are not nullable, so they hold 0 as the "not calculated" marker (no real value is ever 0) and every reader treats 0 as absent.
        bmi: calc.bmi,
        bmiCategory: calc.bmiCategory,
        bmr: calc.bmr,
        tdee: calc.tdee,
        maintenanceCalories: calc.maintenanceCalories,
        targetCalories: calc.targetCalories,
        macroTargets: calc.macroTargets as any,
        waterRequirementL: calc.waterRequirementL,
        idealBodyWeightKg: calc.idealBodyWeightKg,
        calorieDeficitSurplus: calc.calorieDeficitSurplus
      };

      await tx.healthBiometrics.upsert({
        where: { customerProfileId: updatedCustProfile.id },
        create: {
          customerProfileId: updatedCustProfile.id,
          ...biometricsData
        },
        update: biometricsData
      });
      }

      return tx.customerProfile.findUnique({
        where: { id: updatedCustProfile.id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              createdAt: true
            }
          },
          healthBiometrics: true
        }
      });
    });
    } catch (err) {
      // Two accounts racing for the same number: the database unique constraint is the final arbiter.
      if ((err as { code?: string }).code === 'P2002') {
        throw new AppError('This mobile number is already registered to another account', 409, 'PHONE_IN_USE');
      }
      throw err;
    }

    return this.formatProfileResponse(updatedProfile!);
  }

  /**
   * Helper to format DB models into the frontend CustomerProfile type
   */
  private formatProfileResponse(profile: any) {
    const bio = profile.healthBiometrics;
    // Only what the customer provided is returned: a missing value is absent (undefined), never a made-up default.
    const dobStr = profile.dob ? profile.dob.toISOString().split('T')[0] : '';
    let age: number | undefined;
    if (profile.dob) {
      const dob = new Date(profile.dob);
      const today = new Date();
      age = today.getFullYear() - dob.getFullYear();
      if (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) age--;
    }

    // Derived figures exist only when the customer stored the inputs they depend on.
    // The shared presentation function is the single source of every derived figure (also used by both Nutritionist reads).
    const derived = bio
      ? deriveForClient({ heightCm: bio.heightCm, weightKg: bio.weightKg, activityLevel: bio.activityLevel, goal: bio.goal, hasExercise: bio.hasExercise, dob: profile.dob, gender: profile.gender })
      : {};

    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.fullName || '',
      email: profile.user?.email || '',
      phone: profile.user?.phone || '',
      dob: dobStr,
      age,
      gender: profile.gender ?? undefined,
      deliveryAddress: profile.deliveryAddress || '',
      referralCode: profile.referralCode,
      walletBalance: Number(profile.walletBalance || 0),

      heightCm: bio?.heightCm ?? undefined,
      weightKg: bio?.weightKg ?? undefined,
      targetWeightKg: bio?.targetWeightKg ?? undefined,
      occupation: bio?.occupation ?? undefined,
      workSchedule: bio?.workSchedule ?? undefined,
      sleepDuration: bio?.sleepDuration ?? undefined,
      wakeUpTime: bio?.wakeUpTime ?? undefined,
      bedTime: bio?.bedTime ?? undefined,

      muscleMassKg: bio?.muscleMassKg ?? undefined,
      circumferences: bio?.circumferences ?? undefined,
      limbCircumferences: bio?.limbCircumferences ?? undefined,

      goal: bio?.goal ?? undefined,
      primaryGoals: bio?.primaryGoals ?? undefined,
      activityLevel: bio?.activityLevel ?? undefined,

      hasExercise: bio?.hasExercise ?? undefined,
      workoutTypes: bio?.workoutTypes ?? undefined,
      workoutFrequency: bio?.workoutFrequency ?? undefined,
      workoutDuration: bio?.workoutDuration ?? undefined,
      dailyStepCount: bio?.dailyStepCount ?? undefined,
      cardioSessions: bio?.cardioSessions ?? undefined,
      strengthSessions: bio?.strengthSessions ?? undefined,

      medicalConditions: bio?.medicalConditions ?? undefined,
      currentMedications: bio?.currentMedications ?? undefined,
      supplements: bio?.supplements ?? undefined,
      bloodTestResults: bio?.bloodTestResults ?? undefined,

      foodPreference: bio?.foodPreference ?? undefined,
      allergies: bio?.allergies ?? undefined,
      foodDislikes: bio?.foodDislikes ?? undefined,
      customQuery: bio?.customQuery ?? undefined,

      mealsPerDay: bio?.mealsPerDay ?? undefined,
      mealTimings: bio?.mealTimings ?? undefined,
      waterIntakeL: bio?.waterIntakeL ?? undefined,

      digestiveHealth: bio?.digestiveHealth ?? undefined,
      smoking: bio?.smoking ?? undefined,
      alcohol: bio?.alcohol ?? undefined,
      tobacco: bio?.tobacco ?? undefined,
      stressLevel: bio?.stressLevel ?? undefined,
      sleepQuality: bio?.sleepQuality ?? undefined,

      isPregnant: bio?.isPregnant ?? undefined,
      isBreastfeeding: bio?.isBreastfeeding ?? undefined,
      menstrualCycle: bio?.menstrualCycle ?? undefined,
      isMenopause: bio?.isMenopause ?? undefined,

      planDurationDays: bio?.planDurationDays ?? undefined,
      planFrequency: bio?.planFrequency ?? undefined,
      preferredSlot: bio?.preferredSlot ?? undefined,
      addonSlots: bio?.addonSlots ?? undefined,

      // Derived figures are always recalculated from the CURRENT saved inputs (never read back from rows that may have been computed with an
      // assumed age). BMI, water and ideal weight need only height/weight; calories and macros also need the saved date of birth and gender,
      // and are ABSENT (not 0, not a guess) until both exist. `calculation` tells the client what is missing.
      ...derived
    };
  }

  /**
   * Fetch active addresses for authenticated customer
   */
  async getCustomerAddresses(userId: string) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
    }

    return await prisma.customerAddress.findMany({
      where: { customerProfileId: profile.id, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Create new address for authenticated customer
   */
  async createCustomerAddress(userId: string, data: any) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
    }

    // If setting as default, update previous default addresses for this customer
    if (data.isDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerProfileId: profile.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    // If this is the customer's first address, force default
    const existingCount = await prisma.customerAddress.count({
      where: { customerProfileId: profile.id, isActive: true },
    });
    const isDefault = data.isDefault !== undefined ? data.isDefault : existingCount === 0;

    return await prisma.customerAddress.create({
      data: {
        customerProfileId: profile.id,
        title: data.title, // required by the validator: never defaulted here
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        city: data.city,
        state: data.state, // required by the validator: never defaulted here
        postalCode: data.postalCode,
        isDefault,
        isActive: true,
        latitude: data.latitude || null,
        longitude: data.longitude || null,
      },
    });
  }

  /**
   * Update existing address owned by authenticated customer
   */
  async updateCustomerAddress(userId: string, addressId: string, data: any) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
    }

    const existing = await prisma.customerAddress.findFirst({
      where: { id: addressId, customerProfileId: profile.id, isActive: true },
    });

    if (!existing) {
      throw new AppError('Customer address not found or access denied', 404, 'NOT_FOUND');
    }

    if (data.isDefault) {
      await prisma.customerAddress.updateMany({
        where: { customerProfileId: profile.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    return await prisma.customerAddress.update({
      where: { id: addressId },
      data: {
        title: data.title !== undefined ? data.title : existing.title,
        addressLine1: data.addressLine1 !== undefined ? data.addressLine1 : existing.addressLine1,
        addressLine2: data.addressLine2 !== undefined ? data.addressLine2 : existing.addressLine2,
        city: data.city !== undefined ? data.city : existing.city,
        state: data.state !== undefined ? data.state : existing.state,
        postalCode: data.postalCode !== undefined ? data.postalCode : existing.postalCode,
        isDefault: data.isDefault !== undefined ? data.isDefault : existing.isDefault,
        latitude: data.latitude !== undefined ? data.latitude : existing.latitude,
        longitude: data.longitude !== undefined ? data.longitude : existing.longitude,
      },
    });
  }

  /**
   * Soft delete address owned by authenticated customer
   */
  async deleteCustomerAddress(userId: string, addressId: string) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError('Customer profile not found', 404, 'NOT_FOUND');
    }

    const existing = await prisma.customerAddress.findFirst({
      where: { id: addressId, customerProfileId: profile.id, isActive: true },
    });

    if (!existing) {
      throw new AppError('Customer address not found or access denied', 404, 'NOT_FOUND');
    }

    await prisma.customerAddress.update({
      where: { id: addressId },
      data: { isActive: false, isDefault: false },
    });

    return { success: true, message: 'Address removed successfully' };
  }
}
