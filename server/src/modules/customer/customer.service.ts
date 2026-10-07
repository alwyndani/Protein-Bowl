import { prisma } from '../../config/database.js';
import { UpdateCustomerProfileDto } from './customer.validator.js';
import { calculateBiometrics } from '../../utils/biometricsCalculator.js';
import { AppError } from '../../middleware/error.middleware.js';

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

    // Server-side calculated biometrics
    const calc = calculateBiometrics({
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      dob: data.dob || profile.dob,
      gender: data.gender || profile.gender,
      activityLevel: data.activityLevel,
      goal: data.goal,
      hasExercise: data.hasExercise
    });

    const parsedDob = data.dob ? new Date(data.dob) : undefined;

    // Use Prisma transaction to atomically update CustomerProfile and HealthBiometrics
    const updatedProfile = await prisma.$transaction(async (tx) => {
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

      // 2. Upsert HealthBiometrics
      const biometricsData = {
        heightCm: data.heightCm,
        weightKg: data.weightKg,
        targetWeightKg: data.targetWeightKg,
        muscleMassKg: data.muscleMassKg,
        occupation: data.occupation,
        workSchedule: data.workSchedule,
        sleepDuration: data.sleepDuration,
        wakeUpTime: data.wakeUpTime,
        bedTime: data.bedTime,

        circumferences: (data.circumferences as any) || undefined,
        limbCircumferences: (data.limbCircumferences as any) || undefined,

        goal: data.goal,
        primaryGoals: data.primaryGoals || [],
        activityLevel: data.activityLevel,

        hasExercise: data.hasExercise ?? false,
        workoutTypes: data.workoutTypes || [],
        workoutFrequency: data.workoutFrequency,
        workoutDuration: data.workoutDuration,
        dailyStepCount: data.dailyStepCount,
        cardioSessions: data.cardioSessions,
        strengthSessions: data.strengthSessions,

        medicalConditions: data.medicalConditions || [],
        currentMedications: data.currentMedications,
        supplements: data.supplements || [],
        bloodTestResults: (data.bloodTestResults as any) || undefined,

        foodPreference: data.foodPreference,
        allergies: data.allergies || [],
        foodDislikes: data.foodDislikes || [],
        customQuery: data.customQuery,

        mealsPerDay: data.mealsPerDay || 3,
        mealTimings: (data.mealTimings as any) || undefined,
        waterIntakeL: data.waterIntakeL || calc.waterRequirementL,

        digestiveHealth: data.digestiveHealth || [],
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
        addonSlots: data.addonSlots || [],

        // Server calculated metrics
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

    return this.formatProfileResponse(updatedProfile!);
  }

  /**
   * Helper to format DB models into the frontend CustomerProfile type
   */
  private formatProfileResponse(profile: any) {
    const bio = profile.healthBiometrics;
    const dobStr = profile.dob ? profile.dob.toISOString().split('T')[0] : '1995-04-18';
    
    // Calculate age
    let age = 25;
    if (profile.dob) {
      const today = new Date();
      age = today.getFullYear() - new Date(profile.dob).getFullYear();
    }

    const defaultCalculations = calculateBiometrics({
      heightCm: bio?.heightCm || 165,
      weightKg: bio?.weightKg || 68,
      dob: profile.dob,
      gender: profile.gender || 'female',
      activityLevel: bio?.activityLevel || 'moderate',
      goal: bio?.goal || 'weight_loss',
      hasExercise: bio?.hasExercise
    });

    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.fullName || 'Customer',
      email: profile.user?.email || '',
      phone: profile.user?.phone || '',
      dob: dobStr,
      age: defaultCalculations.age,
      gender: profile.gender || 'female',
      deliveryAddress: profile.deliveryAddress || '',
      referralCode: profile.referralCode,
      walletBalance: Number(profile.walletBalance || 0),

      heightCm: bio?.heightCm || 165,
      weightKg: bio?.weightKg || 68,
      targetWeightKg: bio?.targetWeightKg || 58,
      occupation: bio?.occupation || 'Professional',
      workSchedule: bio?.workSchedule || 'Day Shift',
      sleepDuration: bio?.sleepDuration || 7,
      wakeUpTime: bio?.wakeUpTime || '06:30',
      bedTime: bio?.bedTime || '23:00',

      muscleMassKg: bio?.muscleMassKg || 24.5,
      circumferences: bio?.circumferences || { waistCm: 81, hipCm: 98, chestCm: 88, neckCm: 34 },
      limbCircumferences: bio?.limbCircumferences || {
        leftArmCm: 28, rightArmCm: 28.5, leftThighCm: 56, rightThighCm: 56.5, leftCalfCm: 36, rightCalfCm: 36
      },

      goal: bio?.goal || 'weight_loss',
      primaryGoals: bio?.primaryGoals || ['Weight Loss', 'Fat Loss'],
      activityLevel: bio?.activityLevel || 'moderate',

      hasExercise: bio?.hasExercise ?? true,
      workoutTypes: bio?.workoutTypes || ['Strength Training', 'Yoga'],
      workoutFrequency: bio?.workoutFrequency || '3–4 Days',
      workoutDuration: bio?.workoutDuration || 45,
      dailyStepCount: bio?.dailyStepCount || 8500,
      cardioSessions: bio?.cardioSessions || 2,
      strengthSessions: bio?.strengthSessions || 3,

      medicalConditions: bio?.medicalConditions || ['None'],
      currentMedications: bio?.currentMedications || '',
      supplements: bio?.supplements || ['Multivitamin'],
      bloodTestResults: bio?.bloodTestResults || undefined,

      foodPreference: bio?.foodPreference || 'Non-Vegetarian',
      allergies: bio?.allergies || ['None'],
      foodDislikes: bio?.foodDislikes || [],
      customQuery: bio?.customQuery || '',

      mealsPerDay: bio?.mealsPerDay || 3,
      mealTimings: bio?.mealTimings || { breakfast: '08:30', lunch: '13:30', dinner: '20:00' },
      waterIntakeL: bio?.waterIntakeL || defaultCalculations.waterRequirementL,

      digestiveHealth: bio?.digestiveHealth || ['Good'],
      smoking: bio?.smoking || 'Never',
      alcohol: bio?.alcohol || 'Monthly',
      tobacco: bio?.tobacco || 'Never',
      stressLevel: bio?.stressLevel || 4,
      sleepQuality: bio?.sleepQuality || 'Good',

      isPregnant: bio?.isPregnant ?? false,
      isBreastfeeding: bio?.isBreastfeeding ?? false,
      menstrualCycle: bio?.menstrualCycle || 'Regular',
      isMenopause: bio?.isMenopause ?? false,

      planDurationDays: bio?.planDurationDays || 30,
      planFrequency: bio?.planFrequency || 3,
      preferredSlot: bio?.preferredSlot || 'Afternoon (Lunch)',
      addonSlots: bio?.addonSlots || [],

      bmi: bio?.bmi || defaultCalculations.bmi,
      bmiCategory: bio?.bmiCategory || defaultCalculations.bmiCategory,
      bmr: bio?.bmr || defaultCalculations.bmr,
      tdee: bio?.tdee || defaultCalculations.tdee,
      maintenanceCalories: bio?.maintenanceCalories || defaultCalculations.maintenanceCalories,
      targetCalories: bio?.targetCalories || defaultCalculations.targetCalories,
      macroTargets: bio?.macroTargets || defaultCalculations.macroTargets,
      waterRequirementL: bio?.waterRequirementL || defaultCalculations.waterRequirementL,
      idealBodyWeightKg: bio?.idealBodyWeightKg || defaultCalculations.idealBodyWeightKg,
      calorieDeficitSurplus: bio?.calorieDeficitSurplus || defaultCalculations.calorieDeficitSurplus
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
        title: data.title || 'Home',
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 || null,
        city: data.city,
        state: data.state || 'Kerala',
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
