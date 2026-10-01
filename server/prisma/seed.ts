import { PrismaClient, RoleEnum } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Protein Bowl Development Database...');

  // 1. Create Kitchen Branches
  const kochiBranch = await prisma.kitchenBranch.upsert({
    where: { code: 'kochi' },
    update: {},
    create: {
      code: 'kochi',
      name: 'Kochi Central HQ & Flagship Kitchen',
      address: 'Marine Drive, Kochi, Kerala',
      city: 'Kochi',
      latitude: 9.9816,
      longitude: 76.2754
    }
  });

  const kozhikodeBranch = await prisma.kitchenBranch.upsert({
    where: { code: 'kozhikode' },
    update: {},
    create: {
      code: 'kozhikode',
      name: 'Kozhikode Malabar Hub',
      address: 'Beach Road, Kozhikode, Kerala',
      city: 'Kozhikode',
      latitude: 11.2588,
      longitude: 75.7804
    }
  });

  const trivandrumBranch = await prisma.kitchenBranch.upsert({
    where: { code: 'trivandrum' },
    update: {},
    create: {
      code: 'trivandrum',
      name: 'Trivandrum Tech Park Hub',
      address: 'Technopark Phase 1, Trivandrum, Kerala',
      city: 'Trivandrum',
      latitude: 8.5565,
      longitude: 76.8820
    }
  });

  console.log(`✅ Kitchen Branches created: ${kochiBranch.name}, ${kozhikodeBranch.name}, ${trivandrumBranch.name}`);

  // Shared test password hash ('Password123!')
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // Helper function to create staff users safely
  const seedStaffUser = async (email: string, role: RoleEnum, code: string, name: string, title: string, branchId: string) => {
    return await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        roles: { create: { role } },
        employeeProfile: {
          create: {
            employeeCode: code,
            fullName: name,
            designation: title,
            assignedBranchId: branchId,
            isOnline: true
          }
        }
      }
    });
  };

  // 2. Seed All Roles (Primary & Presets)
  await prisma.user.upsert({
    where: { email: 'admin@proteinbowl.in' },
    update: {},
    create: {
      email: 'admin@proteinbowl.in',
      passwordHash,
      phone: '+91 99999 00000',
      roles: { create: { role: RoleEnum.SUPER_ADMIN } }
    }
  });

  // Primary Staff Accounts
  await seedStaffUser('md@nutrifitkitchen.in', RoleEnum.MD, 'EMP-MD-001', 'Dr. Rahul Varma', 'Managing Director & Founder', kochiBranch.id);
  await seedStaffUser('md@proteinbowl.in', RoleEnum.MD, 'EMP-MD-002', 'Dr. Anoop S. / Mathew Thomas', 'Managing Director & Strategic Operations Head', kochiBranch.id);

  await seedStaffUser('chef.kochi@nutrifitkitchen.in', RoleEnum.CHEF, 'EMP-CHEF-001', 'Chef Suresh Kumar', 'Executive Head Chef', kochiBranch.id);
  await seedStaffUser('suresh@proteinbowl.in', RoleEnum.CHEF, 'EMP-CHEF-002', 'Chef Suresh Kumar', 'Executive Head Chef (Central Kitchen KDS)', kochiBranch.id);
  await seedStaffUser('murugan.mess@proteinbowl.in', RoleEnum.CHEF, 'EMP-CHEF-003', 'Chef Murugan K.', 'Kerala Mess Lead Chef', kochiBranch.id);

  await seedStaffUser('nutritionist@nutrifitkitchen.in', RoleEnum.NUTRITIONIST, 'EMP-NUT-001', 'Ananya Sharma, RD', 'Lead Clinical Nutritionist', kochiBranch.id);
  await seedStaffUser('lekshmi@proteinbowl.in', RoleEnum.NUTRITIONIST, 'EMP-NUT-002', 'Lekshmi Devi R.', 'Kerala Mess Nutritional Auditor', kochiBranch.id);

  await seedStaffUser('trainer@nutrifitkitchen.in', RoleEnum.TRAINER, 'EMP-TRN-001', 'Vikram Seth', 'Head Strength Coach', kochiBranch.id);
  await seedStaffUser('procurement@nutrifitkitchen.in', RoleEnum.PROCUREMENT, 'EMP-PRC-001', 'Rajesh Nair', 'Supply Chain Director', kochiBranch.id);

  await seedStaffUser('delivery@nutrifitkitchen.in', RoleEnum.DELIVERY, 'EMP-DEL-001', 'Kiran V', 'Senior Fleet Lead', kochiBranch.id);
  await seedStaffUser('kiran@proteinbowl.in', RoleEnum.DELIVERY, 'EMP-DEL-002', 'Kiran K. Das', 'Fleet Dispatch & Logistics Supervisor', kochiBranch.id);

  await seedStaffUser('pos@nutrifitkitchen.in', RoleEnum.POS, 'EMP-POS-001', 'Priya Menon', 'Head POS Cashier', kochiBranch.id);
  await seedStaffUser('pos.kochi@nutrifitkitchen.in', RoleEnum.POS, 'EMP-POS-002', 'Anjana Ramesh', 'Lead POS Cashier & Counter Manager', kochiBranch.id);

  await seedStaffUser('fmcg@nutrifitkitchen.in', RoleEnum.BAKERY_FMCG, 'EMP-FMCG-001', 'Mathew Philip', 'Bakery Operations Mgr', kochiBranch.id);
  await seedStaffUser('fmcg.distribution@nutrifitkitchen.in', RoleEnum.BAKERY_FMCG, 'EMP-FMCG-002', 'Varghese Kurian', 'Category Lead (FMCG & Bakery Foods)', kochiBranch.id);

  await seedStaffUser('tepache@nutrifitkitchen.in', RoleEnum.TEPACHE_ERP, 'EMP-TEP-001', 'Master Brewer Alex', 'Brewery Telemetry Mgr', kochiBranch.id);
  await seedStaffUser('aggregator@nutrifitkitchen.in', RoleEnum.SWIGGY_ZOMATO, 'EMP-AGG-001', 'Deepak R', 'Aggregator Dispatch Ops', kochiBranch.id);
  await seedStaffUser('rahul.aggregators@proteinbowl.in', RoleEnum.SWIGGY_ZOMATO, 'EMP-AGG-002', 'Rahul M.', 'Swiggy & Zomato Aggregator Channel Lead', kochiBranch.id);

  // Seed Customer Accounts
  await prisma.user.upsert({
    where: { email: 'customer@proteinbowl.in' },
    update: {},
    create: {
      email: 'customer@proteinbowl.in',
      passwordHash,
      phone: '+91 98950 11223',
      roles: { create: { role: RoleEnum.CUSTOMER } },
      customerProfile: {
        create: {
          fullName: 'Arjun Ramesh',
          deliveryAddress: 'Marine Drive, Kochi, Kerala - 682031',
          referralCode: 'PB-ARJUN01'
        }
      }
    }
  });

  const messUser = await prisma.user.upsert({
    where: { email: 'student@proteinbowl.in' },
    update: {},
    create: {
      email: 'student@proteinbowl.in',
      passwordHash,
      phone: '+91 98950 44556',
      roles: { create: { role: RoleEnum.MESS_CUSTOMER } },
      customerProfile: {
        create: {
          fullName: 'Sneha Joseph',
          deliveryAddress: 'Hostel Block B, CUSAT, Kalamassery',
          referralCode: 'PB-SNEHA99'
        }
      }
    },
    include: { customerProfile: true }
  });

  if (messUser.customerProfile) {
    await prisma.messAccount.upsert({
      where: { customerProfileId: messUser.customerProfile.id },
      update: {},
      create: {
        customerProfileId: messUser.customerProfile.id,
        studentIdCard: 'STU-2026-88',
        collegeHostelName: 'CUSAT Ladies Hostel Block B',
        roomNumber: '304'
      }
    });

    await prisma.walletAccount.upsert({
      where: { customerProfileId: messUser.customerProfile.id },
      update: {},
      create: {
        customerProfileId: messUser.customerProfile.id,
        balance: 450.00
      }
    });
  }

  // 3. Product Categories
  const catBowls = await prisma.productCategory.upsert({
    where: { slug: 'protein-bowls' },
    update: {},
    create: { name: 'Protein Bowls', slug: 'protein-bowls', description: 'Chef-crafted high-protein whole food bowls', displayOrder: 1 }
  });

  const catTepache = await prisma.productCategory.upsert({
    where: { slug: 'tepache-probiotic' },
    update: {},
    create: { name: 'Tepache Probiotic', slug: 'tepache-probiotic', description: 'Wild fermented organic pineapple elixir', displayOrder: 2 }
  });

  const catFMCG = await prisma.productCategory.upsert({
    where: { slug: 'fmcg-packaged' },
    update: {},
    create: { name: 'FMCG Packaged Goods', slug: 'fmcg-packaged', description: 'Artisanal high-protein snacks & granolas', displayOrder: 3 }
  });

  // 4. Products & Recipes
  await prisma.product.upsert({
    where: { slug: 'kerala-spiced-chicken-bowl' },
    update: {},
    create: {
      categoryId: catBowls.id,
      name: 'Kerala Spiced Grilled Chicken Bowl',
      slug: 'kerala-spiced-chicken-bowl',
      description: 'Marinated roasted chicken breast with brown rice, steamed broccoli, and roasted pepper dip.',
      basePrice: 299.00,
      variants: {
        create: { name: 'Standard (45g Protein)', sku: 'PB-BOWL-01', price: 299.00, calories: 520, protein: 45, carbs: 48, fat: 12 }
      }
    }
  });

  await prisma.product.upsert({
    where: { slug: 'wild-pineapple-tepache-500ml' },
    update: {},
    create: {
      categoryId: catTepache.id,
      name: 'Wild Fermented Pineapple Tepache 500ml',
      slug: 'wild-pineapple-tepache-500ml',
      description: 'Living probiotic fermented pineapple brew infused with star anise and wild cinnamon.',
      isTepache: true,
      basePrice: 149.00,
      variants: {
        create: { name: '500ml Glass Bottle', sku: 'PB-TEP-500', price: 149.00, calories: 45, protein: 1, carbs: 10, fat: 0 }
      }
    }
  });

  // 5. Mess Subscription Plan
  await prisma.messSubscriptionPlan.upsert({
    where: { code: 'MESS-MONTHLY-FULL' },
    update: {},
    create: {
      name: 'Kerala Mess Monthly Full Deluxe Plan',
      code: 'MESS-MONTHLY-FULL',
      durationDays: 30,
      mealsPerDay: 2,
      basePrice: 4999.00,
      active: true
    }
  });

  // 6. Tepache Tanks
  await prisma.tepacheTank.upsert({
    where: { tankCode: 'TANK-01' },
    update: {},
    create: { tankCode: 'TANK-01', capacityLiters: 500, status: 'FERMENTING', phLevel: 3.5, brixLevel: 8.2, temperatureC: 21.5 }
  });

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
