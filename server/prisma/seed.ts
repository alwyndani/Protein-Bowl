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

  console.log(`✅ Kitchen Branches created: ${kochiBranch.name}, ${kozhikodeBranch.name}`);

  // Shared test password hash ('Password123!')
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // 2. Create Test Customer User
  const testCustomer = await prisma.user.upsert({
    where: { email: 'customer@proteinbowl.in' },
    update: {},
    create: {
      email: 'customer@proteinbowl.in',
      passwordHash,
      phone: '+91 98950 11223',
      roles: {
        create: { role: RoleEnum.CUSTOMER }
      },
      customerProfile: {
        create: {
          fullName: 'Arjun Ramesh',
          deliveryAddress: 'Marine Drive, Kochi, Kerala - 682031',
          referralCode: 'PB-ARJUN01'
        }
      }
    }
  });
  console.log(`✅ Test Customer created: ${testCustomer.email}`);

  // 3. Create Test Staff User (MD Executive)
  const testMD = await prisma.user.upsert({
    where: { email: 'md@nutrifitkitchen.in' },
    update: {},
    create: {
      email: 'md@nutrifitkitchen.in',
      passwordHash,
      phone: '+91 98950 99999',
      roles: {
        create: { role: RoleEnum.MD }
      },
      employeeProfile: {
        create: {
          employeeCode: 'EMP-MD-001',
          fullName: 'Dr. Rahul Varma',
          designation: 'Managing Director & Founder',
          assignedBranchId: kochiBranch.id,
          isOnline: true
        }
      }
    }
  });
  console.log(`✅ Test MD Staff created: ${testMD.email}`);

  // 4. Create Test Chef User
  const testChef = await prisma.user.upsert({
    where: { email: 'chef.kochi@nutrifitkitchen.in' },
    update: {},
    create: {
      email: 'chef.kochi@nutrifitkitchen.in',
      passwordHash,
      phone: '+91 98470 55667',
      roles: {
        create: { role: RoleEnum.CHEF }
      },
      employeeProfile: {
        create: {
          employeeCode: 'EMP-CHEF-001',
          fullName: 'Chef Suresh Kumar',
          designation: 'Head Executive Chef',
          assignedBranchId: kochiBranch.id,
          isOnline: true
        }
      }
    }
  });
  console.log(`✅ Test Chef Staff created: ${testChef.email}`);

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
