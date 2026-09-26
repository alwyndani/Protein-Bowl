import { RecipeItem } from '../../types';

export const DESSERTS_AND_SNACKS_RECIPES: RecipeItem[] = [
  // ==========================================
  // DESSERTS, SNACKS & BITES (21)
  // ==========================================
  {
    id: 'ds-1',
    category: 'Desserts, Snacks & Bites',
    name: 'Protein Date Cake',
    servingSize: '1 slice (Serves 1)',
    servingGrams: 80,
    calories: 220,
    protein: 6,
    carbs: 24,
    fat: 11,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Pitted Dates', quantity: 80, unit: 'g' },
      { name: 'High-Protein Curd / Greek Yogurt', quantity: 80, unit: 'g' },
      { name: 'Ghee', quantity: 35, unit: 'g' },
      { name: 'Milk', quantity: 70, unit: 'ml' },
      { name: 'Whole Wheat Flour', quantity: 85, unit: 'g' },
      { name: 'Almond Flour', quantity: 30, unit: 'g' },
      { name: 'Baking Powder & Soda', quantity: 1.25, unit: 'tsp' },
      { name: 'Walnuts', quantity: 50, unit: 'g' }
    ],
    prepSteps: [
      'Blend dates, curd, milk and ghee until smooth.',
      'Mix dry ingredients separately.',
      'Fold wet and dry mixtures together; stir in walnuts.',
      'Bake at 170°C for 30–35 minutes.'
    ],
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'ds-2',
    category: 'Desserts, Snacks & Bites',
    name: 'Protein Brownies',
    servingSize: '1 brownie (Serves 1)',
    servingGrams: 75,
    calories: 210,
    protein: 7,
    carbs: 22,
    fat: 11,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Fresh Paneer', quantity: 150, unit: 'g' },
      { name: 'Curd / Yogurt', quantity: 80, unit: 'g' },
      { name: 'Milk', quantity: 60, unit: 'ml' },
      { name: 'Jaggery Powder', quantity: 90, unit: 'g' },
      { name: 'Dark Chocolate', quantity: 80, unit: 'g' },
      { name: 'Coconut Oil', quantity: 35, unit: 'g' },
      { name: 'Oat Flour', quantity: 80, unit: 'g' },
      { name: 'Cocoa Powder', quantity: 30, unit: 'g' },
      { name: 'Dark Chocolate Chunks', quantity: 40, unit: 'g' }
    ],
    prepSteps: [
      'Blend paneer, curd, milk and jaggery until smooth.',
      'Mix in melted dark chocolate and coconut oil.',
      'Fold in dry ingredients and chocolate chunks.',
      'Bake at 175°C for 22–28 minutes.'
    ],
    image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'ds-3',
    category: 'Desserts, Snacks & Bites',
    name: 'Protein Cookie',
    servingSize: '1 large cookie (Serves 1)',
    servingGrams: 85,
    calories: 280,
    protein: 16,
    carbs: 26,
    fat: 12,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Oat Flour', quantity: 25, unit: 'g' },
      { name: 'Protein Powder', quantity: 15, unit: 'g' },
      { name: 'Ghee', quantity: 12, unit: 'g' },
      { name: 'Milk', quantity: 22, unit: 'ml' },
      { name: 'Brown Sugar', quantity: 10, unit: 'g' },
      { name: 'Dark Chocolate', quantity: 10, unit: 'g' }
    ],
    prepSteps: [
      'Cream ghee and sugar together, add milk.',
      'Fold in oat flour, protein powder and baking soda.',
      'Mix in chocolate chunks, chill 10 mins, then air-fry at 170°C for 7–10 minutes.'
    ],
    image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'ds-4',
    category: 'Desserts, Snacks & Bites',
    name: 'Protein Chocolate Mousse',
    servingSize: '1 jar (Serves 2)',
    servingGrams: 160,
    calories: 260,
    protein: 15,
    carbs: 21,
    fat: 14,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Paneer', quantity: 150, unit: 'g' },
      { name: 'Dark Chocolate', quantity: 70, unit: 'g' },
      { name: 'Low Fat Milk', quantity: 90, unit: 'ml' },
      { name: 'Cocoa Powder', quantity: 10, unit: 'g' },
      { name: 'Honey', quantity: 22, unit: 'g' },
      { name: 'Vanilla Extract', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Melt dark chocolate with milk.',
      'Blend with paneer, cocoa powder, honey and vanilla until smooth.',
      'Chill for 2–3 hours before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'ds-5',
    category: 'Desserts, Snacks & Bites',
    name: 'Protein Banana Bread',
    servingSize: '1 slice (Serves 1)',
    servingGrams: 85,
    calories: 190,
    protein: 7,
    carbs: 28,
    fat: 6,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Low Fat Milk', quantity: 160, unit: 'ml' },
      { name: 'Vinegar', quantity: 1, unit: 'tsp' },
      { name: 'Oil', quantity: 60, unit: 'ml' },
      { name: 'Raw Sugar', quantity: 120, unit: 'g' },
      { name: 'Banana Puree', quantity: 200, unit: 'g' },
      { name: 'Ragi Flour', quantity: 120, unit: 'g' },
      { name: 'Whole Wheat Flour', quantity: 50, unit: 'g' },
      { name: 'Vanilla Whey Protein', quantity: 40, unit: 'g' },
      { name: 'Chocolate Chips & Walnuts', quantity: 75, unit: 'g' }
    ],
    prepSteps: [
      'Mix milk and vinegar; set aside to curdle slightly.',
      'Add oil, sugar and banana puree.',
      'Fold in ragi flour, wheat flour, whey protein, baking powder and baking soda.',
      'Top with chocolate chips & walnuts and bake at 170°C for 40–50 minutes.'
    ],
    image: 'https://images.unsplash.com/photo-1603532648955-039310d9ed75?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'ds-6',
    category: 'Desserts, Snacks & Bites',
    name: 'Homemade Protein Bars',
    servingSize: '1 bar (Serves 1)',
    servingGrams: 65,
    calories: 240,
    protein: 7,
    carbs: 24,
    fat: 14,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Dried Apricots & Cranberries', quantity: 175, unit: 'g' },
      { name: 'Mixed Nuts & Roasted Almonds', quantity: 200, unit: 'g' },
      { name: 'Peanut Butter', quantity: 80, unit: 'g' },
      { name: 'Desiccated Coconut & Sesame Seeds', quantity: 50, unit: 'g' },
      { name: 'Dark Chocolate', quantity: 150, unit: 'g' }
    ],
    prepSteps: [
      'Roast and chop the nuts; blend dried fruits into a paste.',
      'Mix everything except chocolate and press firmly into a lined tin.',
      'Top with melted dark chocolate and chill until firm before slicing.'
    ],
    image: 'https://images.unsplash.com/photo-1622484210800-88510891efe9?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'ds-7',
    category: 'Desserts, Snacks & Bites',
    name: 'Protein Cheesecake Tub',
    servingSize: '1 tub (Serves 2)',
    servingGrams: 200,
    calories: 340,
    protein: 22,
    carbs: 26,
    fat: 17,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Bakery / Desserts',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Oat & Almond Flour Base', quantity: 45, unit: 'g' },
      { name: 'Paneer', quantity: 150, unit: 'g' },
      { name: 'Greek Yogurt', quantity: 200, unit: 'g' },
      { name: 'Instant Coffee Powder', quantity: 2, unit: 'tsp' },
      { name: 'Maple Syrup', quantity: 25, unit: 'g' },
      { name: 'Dark Chocolate Shell', quantity: 50, unit: 'g' }
    ],
    prepSteps: [
      'Press the base mixture into a serving tub.',
      'Blend filling ingredients (paneer, yogurt, coffee, maple syrup, melted dark chocolate) until smooth and pour over base.',
      'Chill overnight.',
      'Top with melted chocolate and coconut oil shell and chill until set.'
    ],
    image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'ds-8',
    category: 'Desserts, Snacks & Bites',
    name: 'Date Peanut Energy Bites',
    servingSize: '3 bites (Serves 1)',
    servingGrams: 80,
    calories: 220,
    protein: 7,
    carbs: 30,
    fat: 9,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Healthy Snack',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Soft Dates', quantity: 3, unit: 'units' },
      { name: 'Roasted Peanuts', quantity: 2, unit: 'tbsp' },
      { name: 'Cocoa Powder', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Blend dates and peanuts into a sticky mixture.',
      'Stir in cocoa powder.',
      'Roll into small bite-sized balls.',
      'Note: Naturally sweet and keeps cravings under control.'
    ],
    image: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'ds-9',
    category: 'Desserts, Snacks & Bites',
    name: 'Frozen Yogurt Bark',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 160,
    calories: 160,
    protein: 11,
    carbs: 18,
    fat: 5,
    fiber: 2,
    dietaryTag: 'veg',
    cuisine: 'Healthy Snack',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Greek Yogurt', quantity: 0.5, unit: 'cup' },
      { name: 'Berries / Diced Mango', quantity: 0.25, unit: 'cup' },
      { name: 'Chopped Nuts', quantity: 1, unit: 'tbsp' },
      { name: 'Honey', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Spread Greek yogurt in a thin layer on a lined tray.',
      'Scatter berries/mango and nuts over the top; drizzle honey.',
      'Freeze until firm, then break into pieces.'
    ],
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=600&q=80',
    rating: 4.75
  },
  {
    id: 'ds-10',
    category: 'Desserts, Snacks & Bites',
    name: 'Ferrero Protein Truffles',
    servingSize: '3 truffles (Serves 1)',
    servingGrams: 90,
    calories: 270,
    protein: 31,
    carbs: 12,
    fat: 11,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Healthy Snack',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Greek Yogurt / Hung Curd', quantity: 100, unit: 'g' },
      { name: 'Chocolate Protein Powder', quantity: 1, unit: 'scoop' },
      { name: 'Cocoa Powder', quantity: 1, unit: 'tbsp' },
      { name: 'Natural Peanut Butter', quantity: 1, unit: 'tsp' },
      { name: 'Crushed Hazelnuts', quantity: 1, unit: 'tbsp' },
      { name: 'Dark Chocolate Shavings', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Mix Greek yogurt, protein powder, cocoa powder and peanut butter until smooth.',
      'Refrigerate 10–15 minutes to firm up.',
      'Roll into small bite-sized truffles.',
      'Coat with crushed hazelnuts and dark chocolate shavings. Chill 20 minutes before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'ds-11',
    category: 'Desserts, Snacks & Bites',
    name: 'Mango Cheesecake Protein Cups',
    servingSize: '1 cup (Serves 1)',
    servingGrams: 220,
    calories: 290,
    protein: 32,
    carbs: 30,
    fat: 4,
    fiber: 2,
    dietaryTag: 'veg',
    cuisine: 'Healthy Snack',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Low-Fat Cottage Cheese / Paneer', quantity: 100, unit: 'g' },
      { name: 'Vanilla Protein Powder', quantity: 1, unit: 'scoop' },
      { name: 'Honey or Maple Syrup', quantity: 1, unit: 'tbsp' },
      { name: 'Mango Puree & Diced Mango', quantity: 0.5, unit: 'cup' },
      { name: 'Crushed Digestive Biscuits', quantity: 2, unit: 'tbsp' }
    ],
    prepSteps: [
      'Blend cottage cheese, protein powder, honey and vanilla until smooth and creamy.',
      'Add crushed biscuits as a base in a glass or jar.',
      'Spoon cheesecake mixture over base, top with mango puree & diced mango.',
      'Chill at least 2 hours before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'ds-12',
    category: 'Desserts, Snacks & Bites',
    name: 'Chocolate Peanut Butter Mousse',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 180,
    calories: 320,
    protein: 34,
    carbs: 18,
    fat: 13,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Healthy Snack',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Greek Yogurt / Hung Curd', quantity: 100, unit: 'g' },
      { name: 'Chocolate Protein Powder', quantity: 1, unit: 'scoop' },
      { name: 'Cocoa Powder', quantity: 1, unit: 'tbsp' },
      { name: 'Natural Peanut Butter', quantity: 1, unit: 'tbsp' },
      { name: 'Maple Syrup', quantity: 1, unit: 'tsp' },
      { name: 'Dark Chocolate Chips', quantity: 1.5, unit: 'tbsp' }
    ],
    prepSteps: [
      'Mix Greek yogurt, protein powder, cocoa powder, peanut butter and maple syrup.',
      'Whisk or blend until smooth, thick mousse forms.',
      'Fold in dark chocolate chips and spoon into serving bowl.',
      'Chill at least 30 minutes to set.'
    ],
    image: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'ds-13',
    category: 'Desserts, Snacks & Bites',
    name: 'Berry Protein Yogurt Parfait',
    servingSize: '1 jar (Serves 1)',
    servingGrams: 240,
    calories: 310,
    protein: 38,
    carbs: 28,
    fat: 6,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'Healthy Snack',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Low-Fat Greek Yogurt', quantity: 150, unit: 'g' },
      { name: 'Vanilla Protein Powder', quantity: 1, unit: 'scoop' },
      { name: 'Mixed Berries', quantity: 0.5, unit: 'cup' },
      { name: 'Chia Seeds', quantity: 1, unit: 'tbsp' },
      { name: 'Low Sugar Granola', quantity: 1, unit: 'tbsp' },
      { name: 'Honey', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Mix yogurt and protein powder until smooth.',
      'Layer berries, yogurt and granola in a glass or jar.',
      'Add another layer of yogurt and berries, top with granola & honey drizzle.',
      'Chill 15–20 minutes before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'ds-14',
    category: 'Desserts, Snacks & Bites',
    name: 'High Protein Chaat',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 220,
    calories: 260,
    protein: 16,
    carbs: 24,
    fat: 11,
    fiber: 6,
    dietaryTag: 'veg',
    cuisine: 'Indian Street Food',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Fresh Paneer (cubed)', quantity: 75, unit: 'g' },
      { name: 'Boiled Chickpeas (Chana)', quantity: 0.5, unit: 'cup' },
      { name: 'Cucumber & Tomato (diced)', quantity: 0.5, unit: 'cup' },
      { name: 'Onion (diced)', quantity: 2, unit: 'tbsp' },
      { name: 'Chaat Masala & Lemon Juice', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Dice paneer, cucumber, tomato and onion.',
      'Toss together with boiled chana.',
      'Season with chaat masala and a squeeze of fresh lemon juice.'
    ],
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'ds-15',
    category: 'Desserts, Snacks & Bites',
    name: 'Roasted Chana Mix',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 75,
    calories: 230,
    protein: 12,
    carbs: 28,
    fat: 8,
    fiber: 7,
    dietaryTag: 'vegan',
    cuisine: 'Indian Snack',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Roasted Chana', quantity: 0.5, unit: 'cup' },
      { name: 'Roasted Peanuts', quantity: 1, unit: 'tbsp' },
      { name: 'Curry Leaves', quantity: 10, unit: 'units' },
      { name: 'Black Salt & Red Chilli Powder', quantity: 0.5, unit: 'tsp' }
    ],
    prepSteps: [
      'Toss roasted chana and peanuts with curry leaves.',
      'Season with black salt and red chilli powder.',
      'Note: Crunchy like chips, high protein & fiber — keeps you full for longer.'
    ],
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'ds-16',
    category: 'Desserts, Snacks & Bites',
    name: 'Peanut Butter Banana Granola Bars',
    servingSize: '1 bar (Serves 1)',
    servingGrams: 60,
    calories: 190,
    protein: 6,
    carbs: 26,
    fat: 8,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 2, unit: 'cups' },
      { name: 'Mashed Banana', quantity: 1, unit: 'unit' },
      { name: 'Peanut Butter', quantity: 0.5, unit: 'cup' },
      { name: 'Honey', quantity: 0.25, unit: 'cup' },
      { name: 'Chia Seeds', quantity: 2, unit: 'tbsp' },
      { name: 'Cinnamon', quantity: 0.5, unit: 'tsp' }
    ],
    prepSteps: [
      'Preheat oven to 175°C (350°F) and line baking pan with parchment.',
      'Mix all listed ingredients together in a bowl until well combined.',
      'Press firmly into pan and bake 18–22 minutes until golden at edges. Cool and slice into 8 bars.'
    ],
    image: 'https://images.unsplash.com/photo-1622484210800-88510891efe9?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'ds-17',
    category: 'Desserts, Snacks & Bites',
    name: 'Apple Cinnamon Granola Bars',
    servingSize: '1 bar (Serves 1)',
    servingGrams: 60,
    calories: 180,
    protein: 5,
    carbs: 25,
    fat: 7,
    fiber: 4,
    dietaryTag: 'vegan',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 2, unit: 'cups' },
      { name: 'Unsweetened Applesauce', quantity: 0.5, unit: 'cup' },
      { name: 'Almond Butter', quantity: 0.5, unit: 'cup' },
      { name: 'Maple Syrup', quantity: 0.25, unit: 'cup' },
      { name: 'Diced Dried Apples', quantity: 0.5, unit: 'cup' },
      { name: 'Cinnamon', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Preheat oven to 175°C (350°F) and line baking pan with parchment.',
      'Mix all listed ingredients together in a bowl until well combined.',
      'Press firmly into lined pan and bake 18–22 minutes. Cool completely before slicing.'
    ],
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
    rating: 4.75
  },
  {
    id: 'ds-18',
    category: 'Desserts, Snacks & Bites',
    name: 'Cranberry Coconut Granola Bars',
    servingSize: '1 bar (Serves 1)',
    servingGrams: 60,
    calories: 210,
    protein: 5,
    carbs: 27,
    fat: 10,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 2, unit: 'cups' },
      { name: 'Cashew Butter', quantity: 0.5, unit: 'cup' },
      { name: 'Honey', quantity: 0.25, unit: 'cup' },
      { name: 'Dried Cranberries', quantity: 0.5, unit: 'cup' },
      { name: 'Shredded Coconut', quantity: 0.33, unit: 'cup' },
      { name: 'Pumpkin Seeds', quantity: 2, unit: 'tbsp' }
    ],
    prepSteps: [
      'Preheat oven to 175°C (350°F) and line baking pan.',
      'Mix all listed ingredients together until well combined.',
      'Press mixture firmly into pan and bake 18–22 minutes. Cool completely before slicing.'
    ],
    image: 'https://images.unsplash.com/photo-1622484210800-88510891efe9?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'ds-19',
    category: 'Desserts, Snacks & Bites',
    name: 'Chocolate Almond Granola Bars',
    servingSize: '1 bar (Serves 1)',
    servingGrams: 60,
    calories: 220,
    protein: 6,
    carbs: 26,
    fat: 11,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 2, unit: 'cups' },
      { name: 'Almond Butter', quantity: 0.5, unit: 'cup' },
      { name: 'Honey', quantity: 0.25, unit: 'cup' },
      { name: 'Cocoa Powder', quantity: 0.25, unit: 'cup' },
      { name: 'Chopped Almonds', quantity: 0.33, unit: 'cup' },
      { name: 'Dark Chocolate Chips', quantity: 0.25, unit: 'cup' }
    ],
    prepSteps: [
      'Preheat oven to 175°C (350°F) and line baking pan.',
      'Mix all listed ingredients together in a bowl until well combined.',
      'Press firmly into pan and bake for 18–22 minutes. Cool completely before slicing.'
    ],
    image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'ds-20',
    category: 'Desserts, Snacks & Bites',
    name: 'Blueberry Lemon Granola Bars',
    servingSize: '1 bar (Serves 1)',
    servingGrams: 60,
    calories: 200,
    protein: 6,
    carbs: 27,
    fat: 8,
    fiber: 4,
    dietaryTag: 'vegan',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 2, unit: 'cups' },
      { name: 'Almond / Peanut Butter', quantity: 0.5, unit: 'cup' },
      { name: 'Maple Syrup', quantity: 0.33, unit: 'cup' },
      { name: 'Dried Blueberries', quantity: 0.5, unit: 'cup' },
      { name: 'Lemon Zest', quantity: 1, unit: 'tbsp' },
      { name: 'Flaxseeds', quantity: 2, unit: 'tbsp' }
    ],
    prepSteps: [
      'Preheat oven to 175°C (350°F) and line baking pan.',
      'Mix all listed ingredients together in a bowl until well combined.',
      'Press firmly into pan and bake 18–22 minutes. Cool completely before slicing into bars.'
    ],
    image: 'https://images.unsplash.com/photo-1584365685547-9a5fb6f3a70c?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'ds-21',
    category: 'Desserts, Snacks & Bites',
    name: 'Date and Walnut Granola Bars',
    servingSize: '1 bar (Serves 1)',
    servingGrams: 65,
    calories: 210,
    protein: 5,
    carbs: 31,
    fat: 8,
    fiber: 4,
    dietaryTag: 'veg',
    cuisine: 'Bakery',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Rolled Oats', quantity: 2, unit: 'cups' },
      { name: 'Soft Pitted Dates (mashed)', quantity: 1, unit: 'cup' },
      { name: 'Chopped Walnuts', quantity: 0.5, unit: 'cup' },
      { name: 'Almond Butter', quantity: 0.25, unit: 'cup' },
      { name: 'Honey', quantity: 2, unit: 'tbsp' }
    ],
    prepSteps: [
      'Preheat oven to 175°C (350°F) and line baking pan.',
      'Mix all listed ingredients together in a bowl until well combined.',
      'Press firmly into pan and bake 18–22 minutes. Cool completely before slicing.'
    ],
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  }
];
