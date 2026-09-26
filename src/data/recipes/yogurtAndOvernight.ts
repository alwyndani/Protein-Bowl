import { RecipeItem } from '../../types';

export const YOGURT_AND_OVERNIGHT_RECIPES: RecipeItem[] = [
  // ==========================================
  // YOGURT BOWLS (6)
  // ==========================================
  {
    id: 'yb-1',
    category: 'Yogurt Bowls',
    name: 'Mango Yogurt Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 280,
    calories: 290,
    protein: 20,
    carbs: 28,
    fat: 11,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Greek Yogurt', quantity: 1, unit: 'cup' },
      { name: 'Diced Mango', quantity: 0.5, unit: 'unit' },
      { name: 'Chia Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Pumpkin Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Pistachios (chopped)', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Spoon Greek yogurt into a bowl.',
      'Top with diced mango, chia seeds, pumpkin seeds and pistachios.',
      'Note: Use chilled yogurt for a thicker, creamier bowl.'
    ],
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'yb-2',
    category: 'Yogurt Bowls',
    name: 'Berry Cheesecake Yogurt Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 290,
    calories: 310,
    protein: 21,
    carbs: 35,
    fat: 10,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Greek Yogurt', quantity: 1, unit: 'cup' },
      { name: 'Mixed Berries', quantity: 0.5, unit: 'cup' },
      { name: 'Honey', quantity: 1, unit: 'tsp' },
      { name: 'Crushed Digestive Biscuits', quantity: 2, unit: 'tbsp' },
      { name: 'Chopped Almonds', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Spoon Greek yogurt into a bowl.',
      'Top with berries, crushed biscuit and chopped almonds; drizzle with honey.',
      'Note: Chill your yogurt for 15 minutes for a thicker, cheesecake-like texture.'
    ],
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'yb-3',
    category: 'Yogurt Bowls',
    name: 'Chocolate Peanut Butter Yogurt Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 270,
    calories: 380,
    protein: 26,
    carbs: 26,
    fat: 20,
    fiber: 6,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Greek Yogurt', quantity: 1, unit: 'cup' },
      { name: 'Cocoa Powder', quantity: 1, unit: 'tsp' },
      { name: 'Natural Peanut Butter', quantity: 1, unit: 'tbsp' },
      { name: 'Honey', quantity: 1, unit: 'tsp' },
      { name: 'Dark Chocolate Shavings', quantity: 2, unit: 'tbsp' },
      { name: 'Chia Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Crushed Peanuts', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Swirl cocoa powder and peanut butter into the yogurt.',
      'Top with dark chocolate shavings, chia seeds and crushed peanuts; drizzle with honey.',
      'Note: Use thick, creamy yogurt for the best texture and more protein.'
    ],
    image: 'https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'yb-4',
    category: 'Yogurt Bowls',
    name: 'Tropical Paradise Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 280,
    calories: 300,
    protein: 22,
    carbs: 30,
    fat: 11,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Greek Yogurt', quantity: 1, unit: 'cup' },
      { name: 'Pineapple Chunks', quantity: 0.5, unit: 'cup' },
      { name: 'Sliced Kiwi', quantity: 0.5, unit: 'unit' },
      { name: 'Coconut Flakes', quantity: 1, unit: 'tbsp' },
      { name: 'Hemp Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Honey', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Spoon Greek yogurt into a bowl.',
      'Top with pineapple, kiwi, coconut flakes and hemp seeds; drizzle with honey.',
      'Note: Use thick Greek yogurt for a creamier texture and more protein.'
    ],
    image: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'yb-5',
    category: 'Yogurt Bowls',
    name: 'Apple Cinnamon Crunch Yogurt Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 270,
    calories: 280,
    protein: 20,
    carbs: 26,
    fat: 12,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Greek Yogurt', quantity: 1, unit: 'cup' },
      { name: 'Diced Apple', quantity: 0.5, unit: 'unit' },
      { name: 'Ground Cinnamon', quantity: 0.5, unit: 'tsp' },
      { name: 'Honey', quantity: 1, unit: 'tsp' },
      { name: 'Chopped Walnuts', quantity: 1, unit: 'tbsp' },
      { name: 'Flax Seeds', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Spoon Greek yogurt into a bowl.',
      'Top with diced apple, cinnamon, walnuts and flax seeds; drizzle with honey.',
      'Note: Use a crisp apple like Honeycrisp for the best texture and flavor.'
    ],
    image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=600&q=80',
    rating: 4.75
  },
  {
    id: 'yb-6',
    category: 'Yogurt Bowls',
    name: 'Mocha Protein Yogurt Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 260,
    calories: 350,
    protein: 24,
    carbs: 24,
    fat: 18,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Greek Yogurt', quantity: 1, unit: 'cup' },
      { name: 'Instant Coffee Powder', quantity: 1, unit: 'tsp' },
      { name: 'Cocoa Powder', quantity: 1, unit: 'tsp' },
      { name: 'Almond Butter', quantity: 1, unit: 'tbsp' },
      { name: 'Chopped Almonds', quantity: 1, unit: 'tbsp' },
      { name: 'Cacao Nibs', quantity: 1, unit: 'tsp' },
      { name: 'Maple Syrup', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Dissolve instant coffee in a dash of warm water for a stronger flavor.',
      'Swirl coffee and cocoa powder into the yogurt.',
      'Top with almond butter, chopped almonds and cacao nibs.'
    ],
    image: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },

  // ==========================================
  // OVERNIGHT BOWLS (7)
  // ==========================================
  {
    id: 'ob-1',
    category: 'Overnight Bowls',
    name: 'Berry & Banana Classic',
    servingSize: '1 jar (Serves 1)',
    servingGrams: 320,
    calories: 360,
    protein: 14,
    carbs: 62,
    fat: 7,
    fiber: 8,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 0.5, unit: 'cup' },
      { name: 'Low Fat Cow Milk', quantity: 1, unit: 'cup' },
      { name: 'Chia Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Honey', quantity: 1, unit: 'tbsp' },
      { name: 'Banana Slices', quantity: 0.5, unit: 'unit' },
      { name: 'Mixed Berries', quantity: 0.25, unit: 'cup' }
    ],
    prepSteps: [
      'Combine oats, milk and chia seeds in a jar.',
      'Refrigerate overnight (8 hours).',
      'Top with banana slices, berries and a drizzle of honey before eating.'
    ],
    image: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'ob-2',
    category: 'Overnight Bowls',
    name: 'Tropical Mango Peanut Butter Oats',
    servingSize: '1 jar (Serves 1)',
    servingGrams: 350,
    calories: 420,
    protein: 17,
    carbs: 58,
    fat: 15,
    fiber: 9,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 0.5, unit: 'cup' },
      { name: 'Low Fat Cow Milk', quantity: 1, unit: 'cup' },
      { name: 'Ground Flaxseeds', quantity: 1, unit: 'tbsp' },
      { name: 'Peanut Butter', quantity: 1, unit: 'tbsp' },
      { name: 'Diced Fresh Mango', quantity: 0.25, unit: 'cup' },
      { name: 'Pumpkin Seeds', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine oats, milk and flaxseeds in a jar.',
      'Refrigerate overnight.',
      'Top with mango, banana slices, coconut and pumpkin seeds; swirl in peanut butter before eating.'
    ],
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'ob-3',
    category: 'Overnight Bowls',
    name: 'Blueberry Coconut Walnut Oats',
    servingSize: '1 jar (Serves 1)',
    servingGrams: 330,
    calories: 390,
    protein: 14,
    carbs: 56,
    fat: 14,
    fiber: 8,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 0.5, unit: 'cup' },
      { name: 'Low Fat Cow Milk', quantity: 1, unit: 'cup' },
      { name: 'Chia Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Maple Syrup', quantity: 1, unit: 'tbsp' },
      { name: 'Fresh Blueberries', quantity: 0.5, unit: 'cup' },
      { name: 'Chopped Walnuts', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine oats, Greek yogurt/milk and chia seeds in a jar.',
      'Refrigerate overnight.',
      'Top with blueberries, walnuts and shredded coconut; drizzle with maple syrup.'
    ],
    image: 'https://images.unsplash.com/photo-1584365685547-9a5fb6f3a70c?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'ob-4',
    category: 'Overnight Bowls',
    name: 'Almond Banana Chocolate Oats',
    servingSize: '1 jar (Serves 1)',
    servingGrams: 340,
    calories: 430,
    protein: 17,
    carbs: 52,
    fat: 18,
    fiber: 10,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 0.5, unit: 'cup' },
      { name: 'Low Fat Cow Milk', quantity: 1, unit: 'cup' },
      { name: 'Chia Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Sliced Banana', quantity: 0.5, unit: 'unit' },
      { name: 'Cacao Nibs', quantity: 1, unit: 'tbsp' },
      { name: 'Chopped Almonds', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine oats, oat milk/cow milk and chia seeds in a jar.',
      'Refrigerate overnight.',
      'Top with banana, cacao nibs and chopped almonds; swirl in almond butter.'
    ],
    image: 'https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'ob-5',
    category: 'Overnight Bowls',
    name: 'Autumn Apple Pecan Crunch Oats',
    servingSize: '1 jar (Serves 1)',
    servingGrams: 320,
    calories: 380,
    protein: 13,
    carbs: 58,
    fat: 12,
    fiber: 8,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 0.5, unit: 'cup' },
      { name: 'Low Fat Cow Milk', quantity: 1, unit: 'cup' },
      { name: 'Chia Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Honey', quantity: 1, unit: 'tbsp' },
      { name: 'Diced Green Apple', quantity: 0.5, unit: 'unit' },
      { name: 'Dried Cranberries', quantity: 1, unit: 'tbsp' },
      { name: 'Chopped Pecans', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine oats, vanilla milk and chia seeds in a jar.',
      'Refrigerate overnight.',
      'Top with diced apple, cranberries, pecans and a dash of cinnamon; drizzle with honey.'
    ],
    image: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=600&q=80',
    rating: 4.75
  },
  {
    id: 'ob-6',
    category: 'Overnight Bowls',
    name: 'Strawberry Chocolate Crunch Oats',
    servingSize: '1 jar (Serves 1)',
    servingGrams: 330,
    calories: 380,
    protein: 16,
    carbs: 48,
    fat: 15,
    fiber: 8,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 0.5, unit: 'cup' },
      { name: 'Low Fat Cow Milk', quantity: 1, unit: 'cup' },
      { name: 'Chopped Strawberries', quantity: 0.5, unit: 'cup' },
      { name: 'Chopped Dark Chocolate', quantity: 1, unit: 'tbsp' },
      { name: 'Chopped Pistachios', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine oats, coconut/cow milk and hemp seeds in a jar.',
      'Refrigerate overnight.',
      'Top with strawberries, cacao nibs and pistachios; swirl in tahini.'
    ],
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'ob-7',
    category: 'Overnight Bowls',
    name: 'Pineapple Coconut Sunshine Oats',
    servingSize: '1 jar (Serves 1)',
    servingGrams: 330,
    calories: 370,
    protein: 13,
    carbs: 58,
    fat: 11,
    fiber: 7,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 0.5, unit: 'cup' },
      { name: 'Low Fat Cow Milk', quantity: 1, unit: 'cup' },
      { name: 'Chia Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Agave Syrup', quantity: 1, unit: 'tbsp' },
      { name: 'Pomegranate & Pineapple Chunks', quantity: 50, unit: 'g' },
      { name: 'Sliced Almonds', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine oats, almond milk and chia seeds in a jar.',
      'Refrigerate overnight.',
      'Top with pineapple, coconut and sliced almonds; drizzle with agave syrup.'
    ],
    image: 'https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  }
];
