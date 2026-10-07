import { PrismaClient } from '@prisma/client';
import { FMCG_PACKAGED_PRODUCTS } from '../../src/data/mockBakeryFMCGData.js';

const prisma = new PrismaClient();


export async function seedProducts() {
  console.log('Starting commercial product catalog import/seed...');

  // 1. Seed Product Categories
  const categoryMap = new Map<string, string>(); // category slug -> category ID

  const categoryDefinitions = [
    { slug: 'granola_bars', name: '⚡ Granola & Energy Bars', description: 'Handcrafted slow-baked oat and nut energy bars' },
    { slug: 'granola_pouches', name: '🥣 Slow-Baked Granola Pouches', description: 'High-protein ziplock granola pouches for breakfast' },
    { slug: 'artisan_breads', name: '🍞 Artisan Breads & Sourdough', description: 'Wild fermented sourdough and high-protein grain loaves' },
    { slug: 'protein_bars', name: '⚡ 20g Protein Bars', description: 'Clean whey and plant protein bars with low glycemic load' },
    { slug: 'healthy_cookies', name: '🍪 Guilt-Free Protein Cookies', description: 'Almond flour and oat cookies baked with zero refined sugar' },
    { slug: 'healthy_muffins', name: '🧁 High-Protein Muffins', description: 'Freshly baked protein muffins with natural fruit preserves' },
    { slug: 'tepache_beverages', name: '🍍 Wild Fermented Tepache Brews', description: 'Probiotic fermented pineapple & spices in glass bottles' },
    { slug: 'prepared_bowls', name: '🥗 Prepared Protein Bowls', description: 'Chef-crafted macro-balanced warm protein bowls & salads' },
  ];

  for (const catDef of categoryDefinitions) {
    const category = await prisma.productCategory.upsert({
      where: { slug: catDef.slug },
      update: { name: catDef.name, description: catDef.description, isActive: true },
      create: {
        slug: catDef.slug,
        name: catDef.name,
        description: catDef.description,
        isActive: true,
      },
    });
    categoryMap.set(catDef.slug, category.id);
  }

  let seededProductCount = 0;
  let seededVariantCount = 0;

  // 2. Seed FMCG Packaged Products from source dataset
  for (const item of FMCG_PACKAGED_PRODUCTS) {
    const categoryId = categoryMap.get(item.category) || categoryMap.get('granola_bars')!;
    const slug = item.sku.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const product = await prisma.product.upsert({
      where: { slug },
      update: {
        categoryId,
        name: item.name,
        description: item.description,
        basePrice: item.mrp,
        isFMCG: true,
        isPublished: true,
        isActive: true,
        taxRate: 0.0500,
      },
      create: {
        slug,
        categoryId,
        name: item.name,
        description: item.description,
        basePrice: item.mrp,
        isFMCG: true,
        isPublished: true,
        isActive: true,
        taxRate: 0.0500,
      },
    });
    seededProductCount++;

    await prisma.productVariant.upsert({
      where: { sku: item.sku },
      update: {
        productId: product.id,
        name: `${item.netWeight || 'Standard Pack'}`,
        price: item.mrp,
        isActive: true,
        isDefault: true,
        calories: item.nutritionPer100g?.calories,
        protein: item.nutritionPer100g?.protein,
        carbs: item.nutritionPer100g?.carbs,
        fat: item.nutritionPer100g?.fat,
      },
      create: {
        sku: item.sku,
        productId: product.id,
        name: `${item.netWeight || 'Standard Pack'}`,
        price: item.mrp,
        isActive: true,
        isDefault: true,
        calories: item.nutritionPer100g?.calories,
        protein: item.nutritionPer100g?.protein,
        carbs: item.nutritionPer100g?.carbs,
        fat: item.nutritionPer100g?.fat,
      },
    });
    seededVariantCount++;
  }

  // 3. Seed Tepache Beverage Product with ₹10 Container Deposit
  const tepacheCatId = categoryMap.get('tepache_beverages')!;
  const tepacheProduct = await prisma.product.upsert({
    where: { slug: 'wild-pineapple-tepache-500ml' },
    update: {
      categoryId: tepacheCatId,
      name: 'Wild Fermented Pineapple Tepache 500ml',
      description: 'Living probiotic fermented pineapple brew infused with star anise and wild cinnamon in eco glass bottle.',
      basePrice: 149.00,
      containerDeposit: 10.00, // ₹10 refundable glass bottle deposit
      isTepache: true,
      isPublished: true,
      isActive: true,
      taxRate: 0.0500,
    },
    create: {
      slug: 'wild-pineapple-tepache-500ml',
      categoryId: tepacheCatId,
      name: 'Wild Fermented Pineapple Tepache 500ml',
      description: 'Living probiotic fermented pineapple brew infused with star anise and wild cinnamon in eco glass bottle.',
      basePrice: 149.00,
      containerDeposit: 10.00,
      isTepache: true,
      isPublished: true,
      isActive: true,
      taxRate: 0.0500,
    },
  });
  seededProductCount++;

  await prisma.productVariant.upsert({
    where: { sku: 'PB-TEP-500' },
    update: {
      productId: tepacheProduct.id,
      name: '500ml Glass Bottle',
      price: 149.00,
      containerDeposit: 10.00,
      isActive: true,
      isDefault: true,
      calories: 45,
      protein: 1.0,
      carbs: 10.0,
      fat: 0.0,
    },
    create: {
      sku: 'PB-TEP-500',
      productId: tepacheProduct.id,
      name: '500ml Glass Bottle',
      price: 149.00,
      containerDeposit: 10.00,
      isActive: true,
      isDefault: true,
      calories: 45,
      protein: 1.0,
      carbs: 10.0,
      fat: 0.0,
    },
  });
  seededVariantCount++;

  // 4. Seed Prepared Meal Products from Recipe domain
  const mealCatId = categoryMap.get('prepared_bowls')!;
  const sampleRecipes = await prisma.recipe.findMany({
    where: { isPublished: true },
    take: 10,
  });

  for (const recipe of sampleRecipes) {
    const slug = `product-${recipe.code.toLowerCase()}`;
    const product = await prisma.product.upsert({
      where: { slug },
      update: {
        categoryId: mealCatId,
        recipeId: recipe.id,
        name: recipe.title,
        description: recipe.description || `${recipe.servingSize} macro-balanced prepared meal.`,
        basePrice: 249.00,
        isPublished: true,
        isActive: true,
        taxRate: 0.0500,
      },
      create: {
        slug,
        categoryId: mealCatId,
        recipeId: recipe.id,
        name: recipe.title,
        description: recipe.description || `${recipe.servingSize} macro-balanced prepared meal.`,
        basePrice: 249.00,
        isPublished: true,
        isActive: true,
        taxRate: 0.0500,
      },
    });
    seededProductCount++;

    const sku = `SKU-${recipe.code.toUpperCase()}`;
    await prisma.productVariant.upsert({
      where: { sku },
      update: {
        productId: product.id,
        name: recipe.servingSize || 'Standard Portion',
        price: 249.00,
        isActive: true,
        isDefault: true,
        calories: recipe.calories,
        protein: recipe.proteinGrams,
        carbs: recipe.carbsGrams,
        fat: recipe.fatGrams,
      },
      create: {
        sku,
        productId: product.id,
        name: recipe.servingSize || 'Standard Portion',
        price: 249.00,
        isActive: true,
        isDefault: true,
        calories: recipe.calories,
        protein: recipe.proteinGrams,
        carbs: recipe.carbsGrams,
        fat: recipe.fatGrams,
      },
    });
    seededVariantCount++;
  }

  console.log('=== PRODUCT CATALOG SEED STATISTICS ===');
  console.log(`Product Categories Seeded : ${categoryDefinitions.length}`);
  console.log(`Products Seeded           : ${seededProductCount}`);
  console.log(`Product Variants Seeded    : ${seededVariantCount}`);
  console.log('=======================================');

  return {
    categoryCount: categoryDefinitions.length,
    productCount: seededProductCount,
    variantCount: seededVariantCount,
  };
}

if (process.argv[1] && process.argv[1].endsWith('seedProducts.ts')) {
  seedProducts()
    .catch(console.error)
    .finally(async () => {
      await prisma.$disconnect();
    });
}
