import { RecipeItem } from '../../types';

export const SANDWICHES_AND_SMOOTHIES_RECIPES: RecipeItem[] = [
  // ==========================================
  // SANDWICHES (7)
  // ==========================================
  {
    id: 'sw-1',
    category: 'Sandwiches & Wraps',
    name: 'Spicy Chicken Fat Loss Sandwich',
    servingSize: '1 sandwich (Serves 1)',
    servingGrams: 240,
    calories: 320,
    protein: 36,
    carbs: 32,
    fat: 6,
    fiber: 5,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Spicy',
    ingredientsList: [
      { name: 'Whole Wheat Sourdough Bread', quantity: 2, unit: 'slices' },
      { name: 'Grilled Chicken Breast', quantity: 150, unit: 'g' },
      { name: 'Sliced Tomato', quantity: 0.5, unit: 'unit' },
      { name: 'Sliced Cucumber', quantity: 0.5, unit: 'unit' },
      { name: 'Spicy Greek Yogurt Spread', quantity: 2, unit: 'tbsp' }
    ],
    prepSteps: [
      'Toast sourdough bread slice.',
      'Spread spicy Greek yogurt spread on bread.',
      'Add grilled chicken, tomato and cucumber slice.',
      'Close with second slice and press gently.'
    ],
    image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'sw-2',
    category: 'Sandwiches & Wraps',
    name: 'Curry Chicken Sandwich',
    servingSize: '1 sandwich (Serves 1)',
    servingGrams: 230,
    calories: 330,
    protein: 36,
    carbs: 31,
    fat: 7,
    fiber: 4,
    dietaryTag: 'non-veg',
    cuisine: 'Indian Fusion',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Whole Grain Bread', quantity: 2, unit: 'slices' },
      { name: 'Shredded Chicken Breast', quantity: 150, unit: 'g' },
      { name: 'Curry Greek Yogurt Mix', quantity: 2, unit: 'tbsp' },
      { name: 'Fresh Lettuce & Sliced Tomato', quantity: 50, unit: 'g' }
    ],
    prepSteps: [
      'Mix shredded chicken with curry Greek yogurt dressing.',
      'Layer on whole grain bread with lettuce and tomato.',
      'Press gently and slice diagonally.'
    ],
    image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'sw-3',
    category: 'Sandwiches & Wraps',
    name: 'Buffalo Chicken Wrap',
    servingSize: '1 wrap (Serves 1)',
    servingGrams: 250,
    calories: 340,
    protein: 38,
    carbs: 28,
    fat: 8,
    fiber: 4,
    dietaryTag: 'non-veg',
    cuisine: 'American',
    spiceLevel: 'Spicy',
    ingredientsList: [
      { name: 'Whole Wheat Tortilla', quantity: 1, unit: 'unit' },
      { name: 'Buffalo Grilled Chicken', quantity: 150, unit: 'g' },
      { name: 'Shredded Cabbage & Celery', quantity: 0.5, unit: 'cup' },
      { name: 'Light Ranch / Greek Yogurt Spread', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Toss grilled chicken in buffalo sauce.',
      'Place on tortilla with shredded cabbage, celery and yogurt spread.',
      'Roll tightly and cut in half.'
    ],
    image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'sw-4',
    category: 'Sandwiches & Wraps',
    name: 'Avocado Toast with Egg & Tomato',
    servingSize: '1 toast (Serves 1)',
    servingGrams: 180,
    calories: 270,
    protein: 13,
    carbs: 22,
    fat: 15,
    fiber: 6,
    dietaryTag: 'egg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Whole-Grain Bread', quantity: 1, unit: 'slice' },
      { name: 'Mashed Avocado', quantity: 0.5, unit: 'unit' },
      { name: 'Poached or Fried Egg', quantity: 1, unit: 'unit' },
      { name: 'Sliced Tomato', quantity: 2, unit: 'slices' }
    ],
    prepSteps: [
      'Toast bread slice.',
      'Spread mashed avocado over toast.',
      'Top with tomato slices and poached egg.',
      'Season with salt, black pepper and red pepper flakes.'
    ],
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'sw-5',
    category: 'Sandwiches & Wraps',
    name: 'High Protein Paneer Sandwich',
    servingSize: '1 sandwich (Serves 1)',
    servingGrams: 220,
    calories: 310,
    protein: 18,
    carbs: 30,
    fat: 14,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'Indian Fusion',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Whole Wheat Sourdough Bread', quantity: 2, unit: 'slices' },
      { name: 'Fresh Paneer (grated/sliced)', quantity: 80, unit: 'g' },
      { name: 'Mint Coriander Chutney', quantity: 1, unit: 'tbsp' },
      { name: 'Sliced Onion & Capsicum', quantity: 50, unit: 'g' }
    ],
    prepSteps: [
      'Spread mint chutney on sourdough slices.',
      'Layer paneer, onion and capsicum slices.',
      'Grill in a press until golden and crisp.'
    ],
    image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'sw-6',
    category: 'Sandwiches & Wraps',
    name: 'Tofu Pesto Toast',
    servingSize: '1 toast (Serves 1)',
    servingGrams: 170,
    calories: 250,
    protein: 14,
    carbs: 20,
    fat: 13,
    fiber: 4,
    dietaryTag: 'vegan',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Sourdough Bread', quantity: 1, unit: 'slice' },
      { name: 'Pan-Seared Tofu', quantity: 80, unit: 'g' },
      { name: 'Vegan Basil Pesto', quantity: 1, unit: 'tbsp' },
      { name: 'Cherry Tomatoes', quantity: 4, unit: 'units' }
    ],
    prepSteps: [
      'Toast sourdough.',
      'Spread vegan basil pesto.',
      'Top with pan-seared tofu and halved cherry tomatoes.'
    ],
    image: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'sw-7',
    category: 'Sandwiches & Wraps',
    name: 'Hummus & Veggie Wrap',
    servingSize: '1 wrap (Serves 1)',
    servingGrams: 230,
    calories: 280,
    protein: 10,
    carbs: 38,
    fat: 10,
    fiber: 7,
    dietaryTag: 'vegan',
    cuisine: 'Middle Eastern',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Whole Wheat Tortilla', quantity: 1, unit: 'unit' },
      { name: 'Hummus', quantity: 3, unit: 'tbsp' },
      { name: 'Shredded Lettuce & Carrot', quantity: 0.5, unit: 'cup' },
      { name: 'Sliced Cucumber & Bell Pepper', quantity: 0.5, unit: 'cup' }
    ],
    prepSteps: [
      'Spread hummus evenly over tortilla.',
      'Layer shredded veggies down the center.',
      'Roll tightly and wrap in parchment before cutting.'
    ],
    image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },

  // ==========================================
  // PROTEIN SMOOTHIES & SHAKES (5)
  // ==========================================
  {
    id: 'sm-1',
    category: 'Smoothies & Shakes',
    name: 'Peanut Butter Banana Protein Smoothie',
    servingSize: '1 glass (Serves 1)',
    servingGrams: 350,
    calories: 340,
    protein: 32,
    carbs: 35,
    fat: 10,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'Beverage',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Ripe Banana', quantity: 1, unit: 'unit' },
      { name: 'Natural Peanut Butter', quantity: 1, unit: 'tbsp' },
      { name: 'Protein Powder (Vanilla/Chocolate)', quantity: 1, unit: 'scoop' },
      { name: 'Skimmed Milk or Almond Milk', quantity: 250, unit: 'ml' },
      { name: 'Chia Seeds', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Add banana, peanut butter, protein powder and milk to blender.',
      'Blend on high until completely smooth and creamy.',
      'Pour into glass, top with chia seeds and ice cubes if desired.'
    ],
    image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'sm-2',
    category: 'Smoothies & Shakes',
    name: 'Berry Blast Antioxidant Protein Shake',
    servingSize: '1 glass (Serves 1)',
    servingGrams: 350,
    calories: 260,
    protein: 28,
    carbs: 26,
    fat: 4,
    fiber: 6,
    dietaryTag: 'veg',
    cuisine: 'Beverage',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Frozen Mixed Berries (Strawberries, Blueberries)', quantity: 1, unit: 'cup' },
      { name: 'Vanilla Whey Protein', quantity: 1, unit: 'scoop' },
      { name: 'Unsweetened Almond Milk', quantity: 250, unit: 'ml' },
      { name: 'Flaxseeds', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine berries, protein powder, almond milk and flaxseeds in blender.',
      'Blend for 60 seconds until thick.',
      'Serve chilled.'
    ],
    image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'sm-3',
    category: 'Smoothies & Shakes',
    name: 'Green Detox Protein Smoothie',
    servingSize: '1 glass (Serves 1)',
    servingGrams: 350,
    calories: 220,
    protein: 25,
    carbs: 20,
    fat: 3,
    fiber: 5,
    dietaryTag: 'vegan',
    cuisine: 'Beverage',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Fresh Baby Spinach', quantity: 1, unit: 'cup' },
      { name: 'Green Apple (chopped)', quantity: 0.5, unit: 'unit' },
      { name: 'Plant Protein Powder (Unflavored/Vanilla)', quantity: 1, unit: 'scoop' },
      { name: 'Coconut Water', quantity: 250, unit: 'ml' },
      { name: 'Lemon Juice', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Blend spinach, green apple, plant protein and coconut water until vibrant green.',
      'Squeeze in fresh lemon juice and stir.',
      'Serve cold.'
    ],
    image: 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'sm-4',
    category: 'Smoothies & Shakes',
    name: 'Chocolate Fudge Oat Protein Shake',
    servingSize: '1 glass (Serves 1)',
    servingGrams: 380,
    calories: 360,
    protein: 34,
    carbs: 40,
    fat: 8,
    fiber: 6,
    dietaryTag: 'veg',
    cuisine: 'Beverage',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 0.25, unit: 'cup' },
      { name: 'Chocolate Whey Protein', quantity: 1, unit: 'scoop' },
      { name: 'Dark Cocoa Powder', quantity: 1, unit: 'tbsp' },
      { name: 'Skimmed Milk', quantity: 250, unit: 'ml' },
      { name: 'Pitted Date', quantity: 1, unit: 'unit' }
    ],
    prepSteps: [
      'Blend rolled oats first into fine powder.',
      'Add protein powder, cocoa powder, date and milk.',
      'Blend high speed until smooth chocolate fudge shake forms.'
    ],
    image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'sm-5',
    category: 'Smoothies & Shakes',
    name: 'Mango Lassi Protein Shake',
    servingSize: '1 glass (Serves 1)',
    servingGrams: 350,
    calories: 280,
    protein: 26,
    carbs: 32,
    fat: 4,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Indian Fusion Beverage',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Fresh Mango Pulp / Cubes', quantity: 0.5, unit: 'cup' },
      { name: 'Low-Fat Greek Yogurt', quantity: 100, unit: 'g' },
      { name: 'Vanilla Protein Powder', quantity: 1, unit: 'scoop' },
      { name: 'Skimmed Milk / Water', quantity: 150, unit: 'ml' },
      { name: 'Cardamom Powder', quantity: 1, unit: 'pinch' }
    ],
    prepSteps: [
      'Combine mango, Greek yogurt, protein powder, milk and cardamom in blender.',
      'Blend until velvety smooth.',
      'Garnish with saffron strands or crushed pistachios.'
    ],
    image: 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  }
];
