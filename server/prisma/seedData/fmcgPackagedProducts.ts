/**
 * Catalogue seed source for the packaged foods sold to CUSTOMERS (formerly exported from src/data/mockBakeryFMCGData.ts, which belonged to the
 * retired Bakery/FMCG ERP dashboard). Only the fields the product seed reads are kept; the values are unchanged, so seeded slugs, SKUs, names,
 * prices and nutrition stay identical.
 */
export interface PackagedProductSeed {
  sku: string;
  name: string;
  category: string;
  description: string;
  netWeight: string;
  mrp: number;
  nutritionPer100g: { calories: number; protein: number; carbs: number; fat: number };
}

export const FMCG_PACKAGED_PRODUCTS: PackagedProductSeed[] = [
  {
    sku: 'GB-DK-ALM-45', name: 'Dark Chocolate Almond Crunch Granola Bar', category: 'granola_bars',
    description: 'Crispy rolled oats, roasted California almonds, dark cacao nibs and organic raw honey.',
    netWeight: '45g', mrp: 60, nutritionPer100g: { calories: 420, protein: 14.5, carbs: 48.0, fat: 16.5 }
  },
  {
    sku: 'GB-CRN-CHIA-45', name: 'Honey Cranberry Chia Seed Granola Bar', category: 'granola_bars',
    description: 'Tart dried cranberries paired with toasted pumpkin seeds, organic chia and roasted golden oats.',
    netWeight: '45g', mrp: 65, nutritionPer100g: { calories: 395, protein: 12.0, carbs: 52.0, fat: 13.0 }
  },
  {
    sku: 'GP-HZL-GRAIN-250', name: 'Roasted Hazelnut Ancient Grain Granola (Ziplock Pouch)', category: 'granola_pouches',
    description: 'Slow-baked rolled oats, popped amaranth, quinoa crisps, hazelnuts and warm cinnamon.',
    netWeight: '250g', mrp: 299, nutritionPer100g: { calories: 440, protein: 16.0, carbs: 46.0, fat: 18.0 }
  },
  {
    sku: 'GP-BERRY-PRO-350', name: 'Berry Blast Protein Granola Crunch (Ziplock Pouch)', category: 'granola_pouches',
    description: 'Infused with New Zealand Whey Isolate, freeze-dried blueberries, strawberries and flaxseeds.',
    netWeight: '350g', mrp: 420, nutritionPer100g: { calories: 430, protein: 26.0, carbs: 42.0, fat: 14.0 }
  },
  {
    sku: 'PB-FUDGE-20G-60', name: '20g Whey Double Chocolate Fudge Protein Bar', category: 'protein_bars',
    description: 'Triple layer high-protein bar with 20g isolate protein, rich Dutch cocoa, and zero added sugar.',
    netWeight: '60g', mrp: 140, nutritionPer100g: { calories: 360, protein: 33.3, carbs: 25.0, fat: 11.5 }
  },
  {
    sku: 'PB-VEG-PEANUT-60', name: '18g Vegan Peanut Butter Cookie Dough Protein Bar', category: 'protein_bars',
    description: '100% Plant-based pea and brown rice protein bar with slow-roasted organic peanut butter.',
    netWeight: '60g', mrp: 130, nutritionPer100g: { calories: 375, protein: 30.0, carbs: 28.0, fat: 14.0 }
  },
  {
    sku: 'AB-SOURDOUGH-450', name: '100% Wild Yeast Sourdough Country Loaf', category: 'artisan_breads',
    description: '36-hour slow fermented artisan sourdough made with unbleached flour, water, sea salt and live wild culture.',
    netWeight: '450g', mrp: 160, nutritionPer100g: { calories: 220, protein: 8.5, carbs: 44.0, fat: 1.2 }
  },
  {
    sku: 'AB-SEED-MULTI-400', name: 'High-Fiber 7-Seed Ancient Grain Bread', category: 'artisan_breads',
    description: 'Packed with Sunflower, Pumpkin, Chia, Flax, Sesame, Nigella and Hemp seeds with high dietary fiber.',
    netWeight: '400g', mrp: 175, nutritionPer100g: { calories: 245, protein: 11.5, carbs: 36.0, fat: 6.5 }
  },
  {
    sku: 'CK-RAGI-CHOC-150', name: 'Zero-Sugar Ragi Chocochip Super-Millet Cookies (150g Box)', category: 'healthy_cookies',
    description: 'Traditional Sprouted Finger Millet (Ragi), cold-pressed cow ghee, stevia and 70% dark chocolate chunks.',
    netWeight: '150g (10 Cookies)', mrp: 180, nutritionPer100g: { calories: 390, protein: 9.5, carbs: 52.0, fat: 16.0 }
  },
  {
    sku: 'CB-BROWNIE-PRO-80', name: 'Guilt-Free High-Protein Fudgy Walnut Brownie', category: 'protein_cakes_brownies',
    description: '14g protein per piece made with almond flour, Belgian dark chocolate, whey isolate and crunchy walnuts.',
    netWeight: '80g', mrp: 150, nutritionPer100g: { calories: 310, protein: 17.5, carbs: 22.0, fat: 14.5 }
  },
  {
    sku: 'CB-BANANA-LOAF-200', name: 'Oats & Banana Walnut Protein Tea Cake (200g Loaf)', category: 'protein_cakes_brownies',
    description: 'Naturally sweetened with ripe organic bananas, rolled oats flour and whey protein.',
    netWeight: '200g', mrp: 220, nutritionPer100g: { calories: 260, protein: 14.0, carbs: 34.0, fat: 7.5 }
  }
];
