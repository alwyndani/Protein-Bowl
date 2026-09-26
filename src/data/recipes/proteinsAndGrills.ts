import { RecipeItem } from '../../types';

export const PROTEINS_AND_GRILLS_RECIPES: RecipeItem[] = [
  // ==========================================
  // CHICKEN MARINADES & GRILLS (9)
  // ==========================================
  {
    id: 'cg-1',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Lemon Garlic Chicken Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 200,
    calories: 240,
    protein: 38,
    carbs: 2,
    fat: 9,
    fiber: 0.5,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 250, unit: 'g' },
      { name: 'Extra Virgin Olive Oil', quantity: 1.5, unit: 'tbsp' },
      { name: 'Fresh Lemon Juice', quantity: 0.5, unit: 'unit' },
      { name: 'Minced Garlic', quantity: 2, unit: 'cloves' },
      { name: 'Oregano & Black Pepper', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Whisk olive oil, lemon juice, minced garlic, oregano, salt and pepper together.',
      'Coat chicken breast evenly and marinate at least 30 minutes.',
      'Grill or pan-sear on medium-high heat for 4–5 minutes per side until golden cooked through.'
    ],
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'cg-2',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Teriyaki Chicken Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 200,
    calories: 250,
    protein: 38,
    carbs: 10,
    fat: 6,
    fiber: 0,
    dietaryTag: 'non-veg',
    cuisine: 'Asian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 250, unit: 'g' },
      { name: 'Soy Sauce', quantity: 2, unit: 'tbsp' },
      { name: 'Brown Sugar', quantity: 1, unit: 'tbsp' },
      { name: 'Honey', quantity: 0.5, unit: 'tbsp' },
      { name: 'Grated Ginger & Minced Garlic', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Whisk soy sauce, brown sugar, honey, grated ginger and minced garlic together.',
      'Coat chicken and marinate at least 30 minutes before cooking.',
      'Pan-sear or grill until glazed and cooked through.'
    ],
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'cg-3',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Honey Mustard Chicken Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 200,
    calories: 260,
    protein: 38,
    carbs: 12,
    fat: 7,
    fiber: 0.5,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 250, unit: 'g' },
      { name: 'Honey', quantity: 1.5, unit: 'tbsp' },
      { name: 'Dijon Mustard', quantity: 1, unit: 'tbsp' },
      { name: 'Lemon Juice', quantity: 0.5, unit: 'tbsp' },
      { name: 'Olive Oil', quantity: 0.5, unit: 'tbsp' }
    ],
    prepSteps: [
      'Whisk honey, Dijon mustard, lemon juice, olive oil, salt and pepper.',
      'Coat chicken and marinate at least 30 minutes.',
      'Grill or pan-sear until golden brown.'
    ],
    image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'cg-4',
    category: 'Grills, Wraps & Protein Mains',
    name: 'BBQ Smoked Chicken Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 200,
    calories: 260,
    protein: 38,
    carbs: 14,
    fat: 6,
    fiber: 1,
    dietaryTag: 'non-veg',
    cuisine: 'American / BBQ',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 250, unit: 'g' },
      { name: 'BBQ Sauce', quantity: 0.25, unit: 'cup' },
      { name: 'Worcestershire Sauce', quantity: 0.5, unit: 'tbsp' },
      { name: 'Olive Oil', quantity: 0.5, unit: 'tbsp' },
      { name: 'Smoked Paprika', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Whisk BBQ sauce, Worcestershire, olive oil and smoked paprika.',
      'Coat chicken and marinate at least 30 minutes before cooking.',
      'Grill or pan-sear until caramelized and cooked through.'
    ],
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'cg-5',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Yogurt Herb Chicken Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 210,
    calories: 230,
    protein: 40,
    carbs: 3,
    fat: 6,
    fiber: 0.5,
    dietaryTag: 'non-veg',
    cuisine: 'Mediterranean',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 250, unit: 'g' },
      { name: 'Plain Yogurt / Curd', quantity: 0.5, unit: 'cup' },
      { name: 'Lemon Juice', quantity: 0.5, unit: 'tbsp' },
      { name: 'Minced Garlic', quantity: 1, unit: 'clove' },
      { name: 'Dried Oregano & Black Pepper', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Whisk plain yogurt, lemon juice, minced garlic, oregano, salt and pepper.',
      'Coat chicken breast and marinate at least 30 minutes.',
      'Pan-sear or grill on medium heat until tender and cooked through.'
    ],
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'cg-6',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Buffalo Chicken Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 200,
    calories: 240,
    protein: 38,
    carbs: 2,
    fat: 9,
    fiber: 0.5,
    dietaryTag: 'non-veg',
    cuisine: 'American',
    spiceLevel: 'Spicy',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 250, unit: 'g' },
      { name: 'Hot Sauce', quantity: 2, unit: 'tbsp' },
      { name: 'Melted Butter', quantity: 1, unit: 'tbsp' },
      { name: 'Garlic Powder', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Whisk hot sauce, melted butter, garlic powder and salt.',
      'Coat chicken and marinate at least 30 minutes before cooking.',
      'Grill or pan-sear on medium-high heat until golden and spicy.'
    ],
    image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'cg-7',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Mexican Lime Chicken Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 200,
    calories: 235,
    protein: 38,
    carbs: 3,
    fat: 8,
    fiber: 1,
    dietaryTag: 'non-veg',
    cuisine: 'Mexican',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 250, unit: 'g' },
      { name: 'Fresh Lime Juice', quantity: 1, unit: 'lime' },
      { name: 'Olive Oil', quantity: 1, unit: 'tbsp' },
      { name: 'Ground Cumin & Chili Powder', quantity: 1, unit: 'tsp' },
      { name: 'Minced Garlic', quantity: 1, unit: 'clove' }
    ],
    prepSteps: [
      'Whisk lime juice, olive oil, cumin, chili powder, minced garlic and salt.',
      'Coat chicken and marinate at least 30 minutes.',
      'Grill or pan-fry on medium-high heat until cooked through.'
    ],
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'cg-8',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Mediterranean Herb Chicken Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 200,
    calories: 245,
    protein: 38,
    carbs: 2,
    fat: 9,
    fiber: 0.5,
    dietaryTag: 'non-veg',
    cuisine: 'Mediterranean',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 250, unit: 'g' },
      { name: 'Extra Virgin Olive Oil', quantity: 1.5, unit: 'tbsp' },
      { name: 'Lemon Juice', quantity: 0.5, unit: 'lemon' },
      { name: 'Oregano & Thyme', quantity: 1, unit: 'tsp' },
      { name: 'Minced Garlic', quantity: 1.5, unit: 'cloves' }
    ],
    prepSteps: [
      'Whisk olive oil, lemon juice, oregano, thyme, garlic, salt and pepper.',
      'Coat chicken breast and marinate at least 30 minutes.',
      'Grill or pan-sear until golden brown.'
    ],
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'cg-9',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Tandoori Chicken Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 210,
    calories: 230,
    protein: 40,
    carbs: 3,
    fat: 6,
    fiber: 0.5,
    dietaryTag: 'non-veg',
    cuisine: 'North Indian',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 250, unit: 'g' },
      { name: 'Plain Yogurt / Curd', quantity: 0.5, unit: 'cup' },
      { name: 'Lemon Juice', quantity: 0.5, unit: 'tbsp' },
      { name: 'Ginger-Garlic Paste', quantity: 0.5, unit: 'tbsp' },
      { name: 'Turmeric, Paprika & Garam Masala', quantity: 1.5, unit: 'tsp' }
    ],
    prepSteps: [
      'Whisk yogurt, lemon juice, ginger-garlic paste and tandoori spices.',
      'Coat chicken breast and marinate at least 1 hour (ideally overnight).',
      'Grill over open flame or bake in preheated oven until charred.'
    ],
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },

  // ==========================================
  // EGG DISHES & WRAPS (7)
  // ==========================================
  {
    id: 'eg-1',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Spicy Sriracha Scrambled Eggs',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 150,
    calories: 180,
    protein: 13,
    carbs: 3,
    fat: 13,
    fiber: 0.5,
    dietaryTag: 'egg',
    cuisine: 'Continental',
    spiceLevel: 'Spicy',
    ingredientsList: [
      { name: 'Large Eggs', quantity: 2, unit: 'units' },
      { name: 'Sriracha Sauce', quantity: 1, unit: 'tbsp' },
      { name: 'Sliced Green Onion', quantity: 1, unit: 'unit' },
      { name: 'Olive Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Whisk eggs with Sriracha, salt and pepper.',
      'Cook in olive oil, scrambling to desired doneness.',
      'Top with green onions and serve warm.'
    ],
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'eg-2',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Classic Poached Eggs',
    servingSize: '2 Eggs (Serves 1)',
    servingGrams: 120,
    calories: 140,
    protein: 12,
    carbs: 1,
    fat: 10,
    fiber: 0,
    dietaryTag: 'egg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Fresh Large Eggs', quantity: 2, unit: 'units' },
      { name: 'Water & Salt', quantity: 1, unit: 'pinch' },
      { name: 'Fresh Black Pepper', quantity: 1, unit: 'pinch' }
    ],
    prepSteps: [
      'Simmer water gently. Stir to create a whirlpool.',
      'Crack eggs into bowls and slide into water.',
      'Cook 3–4 minutes until whites set. Remove with slotted spoon, season and serve.'
    ],
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'eg-3',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Spinach and Feta Omelette',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 240,
    protein: 17,
    carbs: 3,
    fat: 18,
    fiber: 1,
    dietaryTag: 'egg',
    cuisine: 'Continental / Mediterranean',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Large Eggs', quantity: 2, unit: 'units' },
      { name: 'Chopped Spinach', quantity: 1, unit: 'cup' },
      { name: 'Crumbled Feta Cheese', quantity: 0.25, unit: 'cup' },
      { name: 'Olive Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Sauté spinach in olive oil.',
      'Whisk eggs with salt and pepper.',
      'Pour eggs over spinach and add feta. Cook until set, fold, and serve hot.'
    ],
    image: 'https://images.unsplash.com/photo-1510693206972-df098062cb71?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'eg-4',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Egg and Spinach Quesadilla',
    servingSize: '1 quesadilla (Serves 1)',
    servingGrams: 220,
    calories: 340,
    protein: 20,
    carbs: 26,
    fat: 18,
    fiber: 4,
    dietaryTag: 'egg',
    cuisine: 'Mexican',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Whole-Wheat Tortilla', quantity: 1, unit: 'unit' },
      { name: 'Eggs', quantity: 2, unit: 'units' },
      { name: 'Spinach', quantity: 1, unit: 'cup' },
      { name: 'Shredded Cheese', quantity: 0.25, unit: 'cup' }
    ],
    prepSteps: [
      'Scramble eggs with spinach until wilted.',
      'Place egg-spinach mixture on tortilla, sprinkle with cheese and fold.',
      'Cook on pan until golden on both sides. Slice and serve with salsa.'
    ],
    image: 'https://images.unsplash.com/photo-1618040996337-56904b7850b9?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'eg-5',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Mediterranean Egg Wrap',
    servingSize: '1 wrap (Serves 1)',
    servingGrams: 230,
    calories: 330,
    protein: 18,
    carbs: 28,
    fat: 17,
    fiber: 4,
    dietaryTag: 'egg',
    cuisine: 'Mediterranean',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Whole-Grain Tortilla', quantity: 1, unit: 'unit' },
      { name: 'Eggs', quantity: 2, unit: 'units' },
      { name: 'Diced Tomatoes & Cucumbers', quantity: 0.5, unit: 'cup' },
      { name: 'Sliced Olives & Feta Cheese', quantity: 0.25, unit: 'cup' }
    ],
    prepSteps: [
      'Scramble eggs with seasoning.',
      'Place on tortilla with diced tomatoes, cucumbers, olives and feta cheese.',
      'Roll tightly and slice in half.'
    ],
    image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'eg-6',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Veggie-Packed Scrambled Eggs',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 190,
    protein: 13,
    carbs: 7,
    fat: 13,
    fiber: 2,
    dietaryTag: 'egg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Large Eggs', quantity: 2, unit: 'units' },
      { name: 'Diced Bell Pepper & Onion', quantity: 0.5, unit: 'cup' },
      { name: 'Halved Cherry Tomatoes', quantity: 0.25, unit: 'cup' },
      { name: 'Olive Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Sauté peppers and onions in skillet until soft.',
      'Add cherry tomatoes.',
      'Whisk eggs with seasoning, pour into skillet and scramble until set.'
    ],
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'eg-7',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Egg Muffins with Vegetables',
    servingSize: '2 muffins (Serves 1)',
    servingGrams: 160,
    calories: 190,
    protein: 15,
    carbs: 4,
    fat: 13,
    fiber: 1,
    dietaryTag: 'egg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Large Eggs', quantity: 6, unit: 'units' },
      { name: 'Mixed Vegetables (chopped)', quantity: 1, unit: 'cup' },
      { name: 'Shredded Cheese', quantity: 0.5, unit: 'cup' }
    ],
    prepSteps: [
      'Preheat oven to 175°C (350°F).',
      'Whisk eggs with salt and pepper, stir in vegetables and cheese.',
      'Pour into greased muffin tin and bake 20 minutes until set.'
    ],
    image: 'https://images.unsplash.com/photo-1510693206972-df098062cb71?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },

  // ==========================================
  // FISH PREPARATIONS (5)
  // ==========================================
  {
    id: 'fg-1',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Lemon Garlic Fish Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 210,
    protein: 32,
    carbs: 2,
    fat: 8,
    fiber: 0.5,
    dietaryTag: 'non-veg',
    cuisine: 'Continental / Coastal',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Fish Fillet (Sardine/Mackerel/Tuna/Seer)', quantity: 150, unit: 'g' },
      { name: 'Lemon Juice', quantity: 0.75, unit: 'tbsp' },
      { name: 'Minced Garlic', quantity: 0.5, unit: 'tbsp' },
      { name: 'Crushed Black Pepper & Oregano', quantity: 1, unit: 'tsp' },
      { name: 'Olive Oil', quantity: 0.5, unit: 'tbsp' }
    ],
    prepSteps: [
      'Pat fish fillets or steaks completely dry with paper towel.',
      'Combine marinade ingredients and rub evenly over fish.',
      'Rest 20–30 minutes to marinate.',
      'Pan-fry or grill 3–4 minutes per side on medium-high heat until tender.'
    ],
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'fg-2',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Tandoori Fish Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 200,
    protein: 33,
    carbs: 3,
    fat: 6,
    fiber: 0.5,
    dietaryTag: 'non-veg',
    cuisine: 'North Indian / Coastal',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Fish Fillet / Steak', quantity: 150, unit: 'g' },
      { name: 'Curd / Yogurt', quantity: 1, unit: 'tbsp' },
      { name: 'Red Chilli Powder & Garam Masala', quantity: 1, unit: 'tsp' },
      { name: 'Ginger-Garlic Paste & Lemon Juice', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Pat fish dry. Combine curd, red chilli powder, ginger-garlic paste, lemon juice and garam masala.',
      'Rub marinade over fish and rest for 20–30 minutes.',
      'Pan-fry, grill or bake at 200°C for 12–15 minutes until tender.'
    ],
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'fg-3',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Green Herb Fish Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 215,
    protein: 32,
    carbs: 3,
    fat: 8,
    fiber: 1,
    dietaryTag: 'non-veg',
    cuisine: 'Coastal',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Fish Fillet', quantity: 150, unit: 'g' },
      { name: 'Fresh Coriander & Mint', quantity: 0.33, unit: 'cup' },
      { name: 'Green Chilli & Garlic', quantity: 2, unit: 'units' },
      { name: 'Lemon Juice & Olive Oil', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Blend coriander, mint, green chilli, garlic, lemon juice and olive oil into smooth herb paste.',
      'Rub marinade over dry fish and rest 20–30 minutes.',
      'Grill or pan-fry 3–4 minutes per side.'
    ],
    image: 'https://images.unsplash.com/photo-1501595091296-3aa970afb3ff?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'fg-4',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Spicy Masala Fish Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 205,
    protein: 32,
    carbs: 3,
    fat: 7,
    fiber: 1,
    dietaryTag: 'non-veg',
    cuisine: 'Indian Coastal',
    spiceLevel: 'Spicy',
    ingredientsList: [
      { name: 'Fish Fillet / Steak', quantity: 150, unit: 'g' },
      { name: 'Red Chilli & Coriander Powder', quantity: 1, unit: 'tsp' },
      { name: 'Turmeric & Ginger-Garlic Paste', quantity: 0.75, unit: 'tsp' },
      { name: 'Lemon Juice', quantity: 0.5, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine red chilli, coriander, turmeric, ginger-garlic paste, lemon juice and salt.',
      'Rub marinade over fish fillets and rest 20-30 minutes.',
      'Pan-fry or grill on medium-high heat until golden brown.'
    ],
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'fg-5',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Black Pepper Fish Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 210,
    protein: 32,
    carbs: 2,
    fat: 8,
    fiber: 0.5,
    dietaryTag: 'non-veg',
    cuisine: 'Continental / Coastal',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Fish Fillet / Steak', quantity: 150, unit: 'g' },
      { name: 'Crushed Black Pepper', quantity: 1, unit: 'tsp' },
      { name: 'Minced Garlic', quantity: 1, unit: 'tsp' },
      { name: 'Lemon Juice & Olive Oil', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine crushed black pepper, minced garlic, lemon juice, olive oil and salt.',
      'Rub over dry fish and rest 20–30 minutes.',
      'Grill or pan-fry 3–4 minutes per side until flaky.'
    ],
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },

  // ==========================================
  // PANEER TIKKA & GRILLS (6)
  // ==========================================
  {
    id: 'pg-1',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Herb Garlic Paneer Tikka',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 150,
    calories: 260,
    protein: 16,
    carbs: 5,
    fat: 20,
    fiber: 1,
    dietaryTag: 'veg',
    cuisine: 'Indian / Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Paneer (cubed)', quantity: 120, unit: 'g' },
      { name: 'Hung Curd', quantity: 1, unit: 'tbsp' },
      { name: 'Minced Garlic', quantity: 0.5, unit: 'tbsp' },
      { name: 'Coriander & Parsley', quantity: 1.5, unit: 'tbsp' },
      { name: 'Lemon Juice & Mixed Herbs', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Combine marinade ingredients in a bowl.',
      'Add paneer cubes and coat evenly with marinade.',
      'Marinate for 20–30 minutes.',
      'Thread onto skewers and grill over open flame or pan-fry until lightly charred.'
    ],
    image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'pg-2',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Hariyali Paneer Tikka',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 150,
    calories: 255,
    protein: 16,
    carbs: 5,
    fat: 19,
    fiber: 1,
    dietaryTag: 'veg',
    cuisine: 'North Indian',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Paneer (cubed)', quantity: 120, unit: 'g' },
      { name: 'Hung Curd', quantity: 1, unit: 'tbsp' },
      { name: 'Fresh Coriander & Mint Paste', quantity: 0.25, unit: 'cup' },
      { name: 'Ginger, Garlic & Cumin', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Blend coriander, mint, green chilli, ginger and garlic.',
      'Mix with hung curd, roasted cumin powder and lemon juice.',
      'Coat paneer cubes, marinate 20–30 mins, and grill until charred.'
    ],
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'pg-3',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Malai Pepper Paneer Tikka',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 160,
    calories: 280,
    protein: 16,
    carbs: 6,
    fat: 22,
    fiber: 0.5,
    dietaryTag: 'veg',
    cuisine: 'North Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Paneer (cubed)', quantity: 120, unit: 'g' },
      { name: 'Hung Curd & Low-Fat Cream', quantity: 2, unit: 'tbsp' },
      { name: 'Crushed Black Pepper', quantity: 1, unit: 'tsp' },
      { name: 'Garlic Paste & Lemon Juice', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Combine hung curd, low-fat fresh cream, crushed black pepper, garlic paste, white pepper and lemon juice.',
      'Coat paneer cubes, marinate 20–30 minutes.',
      'Thread onto skewers and grill or pan-fry until golden brown.'
    ],
    image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'pg-4',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Kasuri Methi Paneer Tikka',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 150,
    calories: 265,
    protein: 16,
    carbs: 5,
    fat: 20,
    fiber: 1,
    dietaryTag: 'veg',
    cuisine: 'North Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Paneer (cubed)', quantity: 120, unit: 'g' },
      { name: 'Hung Curd & Cream', quantity: 1.5, unit: 'tbsp' },
      { name: 'Crushed Kasuri Methi', quantity: 1, unit: 'tsp' },
      { name: 'Ginger-Garlic Paste', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Combine hung curd, cream, crushed kasuri methi, ginger-garlic paste and black pepper.',
      'Coat paneer cubes, marinate for 20–30 minutes.',
      'Grill or pan-fry in a hot skillet 8–10 minutes.'
    ],
    image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'pg-5',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Achari Paneer Tikka',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 150,
    calories: 270,
    protein: 16,
    carbs: 5,
    fat: 21,
    fiber: 1,
    dietaryTag: 'veg',
    cuisine: 'North Indian',
    spiceLevel: 'Spicy',
    ingredientsList: [
      { name: 'Paneer (cubed)', quantity: 120, unit: 'g' },
      { name: 'Hung Curd', quantity: 1, unit: 'tbsp' },
      { name: 'Mustard Paste & Achar Masala', quantity: 1, unit: 'tsp' },
      { name: 'Ginger-Garlic Paste & Mustard Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Combine hung curd, mustard paste, pickle masala, ginger-garlic paste, red chilli powder and mustard oil.',
      'Coat paneer cubes, marinate 20–30 minutes.',
      'Grill over open flame or pan-fry until charred.'
    ],
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'pg-6',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Pesto Paneer Grill',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 150,
    calories: 285,
    protein: 17,
    carbs: 4,
    fat: 23,
    fiber: 1,
    dietaryTag: 'veg',
    cuisine: 'Italian / Fusion',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Paneer (cubed)', quantity: 120, unit: 'g' },
      { name: 'Basil Pesto', quantity: 1, unit: 'tbsp' },
      { name: 'Hung Curd', quantity: 1, unit: 'tbsp' },
      { name: 'Grated Parmesan Cheese', quantity: 0.5, unit: 'tbsp' },
      { name: 'Minced Garlic & Olive Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Combine basil pesto, hung curd, Parmesan, garlic, lemon juice and olive oil.',
      'Coat paneer cubes and marinate 20–30 minutes.',
      'Grill on skewers or skillet 8–10 minutes until lightly charred.'
    ],
    image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },

  // ==========================================
  // SOYA TANDOORI CHAAP (4)
  // ==========================================
  {
    id: 'sg-1',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Classic Tandoori Soya Chaap',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 240,
    protein: 26,
    carbs: 14,
    fat: 9,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'North Indian',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Soya Chaap', quantity: 180, unit: 'g' },
      { name: 'Curd / Yogurt', quantity: 2, unit: 'tbsp' },
      { name: 'Ginger-Garlic Paste', quantity: 0.5, unit: 'tbsp' },
      { name: 'Tandoori Spices & Mustard Oil', quantity: 1.5, unit: 'tsp' }
    ],
    prepSteps: [
      'Wash soya chaap sticks thoroughly, pat dry, and remove wooden sticks. Cut into bite pieces.',
      'Whisk curd, ginger-garlic paste, lemon juice, spices and mustard oil.',
      'Submerge chaap pieces, marinate 2–4 hours.',
      'Thread onto skewers and grill over open flame or bake until slightly charred.'
    ],
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'sg-2',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Hariyali Tandoori Soya Chaap',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 235,
    protein: 26,
    carbs: 14,
    fat: 8.5,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'North Indian',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Soya Chaap', quantity: 180, unit: 'g' },
      { name: 'Curd / Yogurt', quantity: 2, unit: 'tbsp' },
      { name: 'Coriander, Mint & Green Chilli Paste', quantity: 0.25, unit: 'cup' },
      { name: 'Ginger-Garlic & Mustard Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Wash soya chaap, dry, remove wooden sticks and cut into bite pieces.',
      'Blend coriander, mint and green chillies before mixing with curd and spices.',
      'Submerge chaap, marinate 2–4 hours, and grill on skewers until charred.'
    ],
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'sg-3',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Malai Tandoori Soya Chaap',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 190,
    calories: 270,
    protein: 26,
    carbs: 15,
    fat: 12,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'North Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Soya Chaap', quantity: 180, unit: 'g' },
      { name: 'Hung Curd & Fresh Cream', quantity: 3, unit: 'tbsp' },
      { name: 'Ginger-Garlic Paste & White Pepper', quantity: 1, unit: 'tsp' },
      { name: 'Kasuri Methi & Mustard Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Wash soya chaap sticks, pat dry, remove wooden sticks and slice.',
      'Whisk hung curd, cream, ginger-garlic paste, white pepper, spices, lemon juice and mustard oil.',
      'Submerge chaap pieces, marinate 2–4 hours, then grill or bake until golden charred.'
    ],
    image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'sg-4',
    category: 'Grills, Wraps & Protein Mains',
    name: 'Achari Tandoori Soya Chaap',
    servingSize: '1 portion (Serves 1)',
    servingGrams: 180,
    calories: 250,
    protein: 26,
    carbs: 15,
    fat: 10,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'North Indian',
    spiceLevel: 'Spicy',
    ingredientsList: [
      { name: 'Soya Chaap', quantity: 180, unit: 'g' },
      { name: 'Curd / Yogurt', quantity: 2, unit: 'tbsp' },
      { name: 'Achar (Pickle) Masala', quantity: 1, unit: 'tbsp' },
      { name: 'Ginger-Garlic Paste & Mustard Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Wash chaap sticks, pat dry, remove sticks and slice into pieces.',
      'Whisk curd with pickle masala, ginger-garlic paste, red chilli, kasuri methi and mustard oil.',
      'Marinate 2–4 hours, then grill over open flame or bake until slightly charred.'
    ],
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  }
];
