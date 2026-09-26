import { RecipeItem } from '../../types';

export const QUINOA_AND_RICE_RECIPES: RecipeItem[] = [
  // ==========================================
  // QUINOA BOWLS (5)
  // ==========================================
  {
    id: 'qb-1',
    category: 'Quinoa Bowls',
    name: 'Lemon Chicken Quinoa Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 300,
    calories: 380,
    protein: 32,
    carbs: 28,
    fat: 16,
    fiber: 4,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Cooked Quinoa', quantity: 0.75, unit: 'cup' },
      { name: 'Grilled Chicken Breast', quantity: 115, unit: 'g' },
      { name: 'Diced Cucumber', quantity: 0.5, unit: 'cup' },
      { name: 'Extra Virgin Olive Oil', quantity: 1, unit: 'tbsp' },
      { name: 'Fresh Lemon Juice', quantity: 0.5, unit: 'lemon' }
    ],
    prepSteps: [
      'Layer quinoa in a bowl.',
      'Top with grilled chicken and diced cucumber.',
      'Drizzle with fresh lemon juice and extra virgin olive oil.',
      'Note: Lemon supports digestion and reduces heaviness.'
    ],
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'qb-2',
    category: 'Quinoa Bowls',
    name: 'Egg & Avocado Quinoa Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 280,
    calories: 360,
    protein: 18,
    carbs: 28,
    fat: 20,
    fiber: 6,
    dietaryTag: 'egg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Cooked Quinoa', quantity: 0.75, unit: 'cup' },
      { name: 'Soft-Boiled Eggs', quantity: 2, unit: 'units' },
      { name: 'Sliced Avocado', quantity: 0.25, unit: 'unit' },
      { name: 'Olive Oil Drizzle', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Top warm cooked quinoa with sliced soft-boiled eggs and avocado.',
      'Drizzle lightly with extra virgin olive oil and fresh black pepper.',
      'Note: Healthy fats help control cravings later in the day.'
    ],
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'qb-3',
    category: 'Quinoa Bowls',
    name: 'Tofu & Red Bell Pepper Quinoa Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 290,
    calories: 310,
    protein: 18,
    carbs: 32,
    fat: 12,
    fiber: 5,
    dietaryTag: 'vegan',
    cuisine: 'Asian / Fusion',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Cooked Quinoa', quantity: 0.75, unit: 'cup' },
      { name: 'Baked Tofu', quantity: 115, unit: 'g' },
      { name: 'Sliced Red Bell Pepper', quantity: 0.5, unit: 'cup' },
      { name: 'Sesame Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Bake pressed tofu cubes until golden crisp.',
      'Toss warm quinoa with sliced red bell peppers, sesame oil and baked tofu.',
      'Note: Press tofu before baking for better crispy texture.'
    ],
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'qb-4',
    category: 'Quinoa Bowls',
    name: 'Salmon & Arugula Quinoa Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 280,
    calories: 370,
    protein: 26,
    carbs: 26,
    fat: 18,
    fiber: 4,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Cooked Quinoa', quantity: 0.75, unit: 'cup' },
      { name: 'Baked Salmon Fillet', quantity: 85, unit: 'g' },
      { name: 'Fresh Arugula', quantity: 1, unit: 'cup' },
      { name: 'Extra Virgin Olive Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Flake baked salmon over warm quinoa.',
      'Toss gently with fresh arugula leaves and olive oil.',
      'Note: Omega-3 fats help reduce inflammation.'
    ],
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'qb-5',
    category: 'Quinoa Bowls',
    name: 'Lentil & Broccoli Quinoa Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 320,
    calories: 320,
    protein: 16,
    carbs: 48,
    fat: 7,
    fiber: 11,
    dietaryTag: 'vegan',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Cooked Quinoa', quantity: 0.75, unit: 'cup' },
      { name: 'Cooked Lentils', quantity: 0.5, unit: 'cup' },
      { name: 'Steamed Broccoli Florets', quantity: 1, unit: 'cup' },
      { name: 'Olive Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Mix cooked lentils and steamed broccoli into warm quinoa.',
      'Drizzle with olive oil, salt and herbs.',
      'Note: Fiber supports healthy digestion over time.'
    ],
    image: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=600&q=80',
    rating: 4.75
  },

  // ==========================================
  // RICE BOWLS (5)
  // ==========================================
  {
    id: 'rb-1',
    category: 'Rice Bowls',
    name: 'Avocado Chicken Rice Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 350,
    calories: 490,
    protein: 38,
    carbs: 45,
    fat: 18,
    fiber: 7,
    dietaryTag: 'non-veg',
    cuisine: 'Continental / Fusion',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Grilled Chicken Breast', quantity: 150, unit: 'g' },
      { name: 'Sliced Avocado', quantity: 0.5, unit: 'unit' },
      { name: 'Cooked White or Jasmine Rice', quantity: 1, unit: 'cup' },
      { name: 'Cherry Tomatoes & Cucumber', quantity: 80, unit: 'g' },
      { name: 'Lime Juice', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Add cooked rice to a bowl.',
      'Top with grilled chicken and fresh vegetables.',
      'Add fresh avocado slices and squeeze lime over the top.'
    ],
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'rb-2',
    category: 'Rice Bowls',
    name: 'Southwest Chicken Rice Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 360,
    calories: 510,
    protein: 42,
    carbs: 62,
    fat: 10,
    fiber: 8,
    dietaryTag: 'non-veg',
    cuisine: 'Tex-Mex',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Grilled Chicken Breast', quantity: 150, unit: 'g' },
      { name: 'Black Beans', quantity: 0.5, unit: 'cup' },
      { name: 'Sweet Corn', quantity: 0.5, unit: 'cup' },
      { name: 'Cooked Rice', quantity: 1, unit: 'cup' },
      { name: 'Fresh Salsa', quantity: 3, unit: 'tbsp' }
    ],
    prepSteps: [
      'Add cooked rice to the bowl.',
      'Top with sliced grilled chicken.',
      'Add black beans, sweet corn and fresh salsa. Serve immediately.'
    ],
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'rb-3',
    category: 'Rice Bowls',
    name: 'Broccoli Rice Chicken Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 330,
    calories: 420,
    protein: 38,
    carbs: 48,
    fat: 7,
    fiber: 4,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Chicken Breast', quantity: 150, unit: 'g' },
      { name: 'Steamed Broccoli', quantity: 1, unit: 'cup' },
      { name: 'Cooked Rice', quantity: 1, unit: 'cup' },
      { name: 'Garlic Powder & Lemon Juice', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Cook chicken breast and steam broccoli florets.',
      'Add cooked rice to the bowl.',
      'Top with chicken and broccoli, drizzle with lemon juice and garlic powder.'
    ],
    image: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'rb-4',
    category: 'Rice Bowls',
    name: 'Sweet Potato Chicken Bowl',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 340,
    calories: 440,
    protein: 38,
    carbs: 38,
    fat: 15,
    fiber: 7,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Grilled Chicken Breast', quantity: 150, unit: 'g' },
      { name: 'Roasted Sweet Potato Cubes', quantity: 1, unit: 'small' },
      { name: 'Fresh Baby Spinach', quantity: 1, unit: 'cup' },
      { name: 'Sliced Avocado', quantity: 0.25, unit: 'unit' }
    ],
    prepSteps: [
      'Roast sweet potato cubes with olive oil.',
      'Add fresh spinach base to the bowl.',
      'Top with grilled chicken breast and roasted sweet potato cubes.',
      'Add avocado slices and serve.'
    ],
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'rb-5',
    category: 'Rice Bowls',
    name: 'Herb Chicken with Garlic Sauce & Potatoes',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 380,
    calories: 540,
    protein: 46,
    carbs: 52,
    fat: 16,
    fiber: 5,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Chicken Breast (Herb Seasoned)', quantity: 200, unit: 'g' },
      { name: 'Dijon Mustard & Lemon Juice', quantity: 2, unit: 'tbsp' },
      { name: 'Baby Potatoes (Boiled / Roasted)', quantity: 200, unit: 'g' },
      { name: 'Chicken Broth & Garlic', quantity: 0.5, unit: 'cup' },
      { name: 'Cooked White Rice', quantity: 1, unit: 'cup' },
      { name: 'Olive Oil', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Rinse 1/2 cup raw rice, cook with 1 cup water until fluffy.',
      'Season chicken breast with salt, pepper and herbs. Sear in olive oil 4–5 min per side until golden.',
      'In same pan, cook minced garlic, add broth, Dijon mustard and lemon juice scraping browned bits.',
      'Simmer sauce 5-7 mins, toss potatoes with olive oil & parsley. Serve chicken over rice with sauce drizzled on top.'
    ],
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },

  // ==========================================
  // FLAVOURED RICE (6)
  // ==========================================
  {
    id: 'fr-1',
    category: 'Flavoured Rice',
    name: 'Spanish Rice',
    servingSize: '1 cup cooked (Serves 1)',
    servingGrams: 180,
    calories: 220,
    protein: 4,
    carbs: 38,
    fat: 6,
    fiber: 2,
    dietaryTag: 'vegan',
    cuisine: 'Spanish / Mexican',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Olive Oil', quantity: 2, unit: 'tbsp' },
      { name: 'Long-Grain White Rice', quantity: 1, unit: 'cup' },
      { name: 'Chopped Onion & Minced Garlic', quantity: 50, unit: 'g' },
      { name: 'Tomato Sauce', quantity: 1, unit: 'cup' },
      { name: 'Chicken/Veg Broth', quantity: 1.25, unit: 'cups' },
      { name: 'Cumin, Paprika, Chilli Powder', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Heat olive oil in a pot; add rice and cook until lightly toasted.',
      'Sauté in onion, garlic, cumin, paprika and chilli powder.',
      'Stir in tomato sauce, broth, salt and pepper. Bring to boil, cover and lower heat.',
      'Simmer for 18–20 minutes. Fluff with fork and stir in fresh cilantro and lime juice before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'fr-2',
    category: 'Flavoured Rice',
    name: 'Cilantro Lime Rice',
    servingSize: '1 cup cooked (Serves 1)',
    servingGrams: 175,
    calories: 195,
    protein: 3,
    carbs: 35,
    fat: 5,
    fiber: 1,
    dietaryTag: 'vegan',
    cuisine: 'Mexican / Fusion',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Olive Oil', quantity: 2, unit: 'tbsp' },
      { name: 'White Rice', quantity: 1.5, unit: 'cups' },
      { name: 'Minced Garlic', quantity: 1, unit: 'clove' },
      { name: 'Water', quantity: 2.25, unit: 'cups' },
      { name: 'Fresh Lime Zest & Juice', quantity: 1, unit: 'lime' },
      { name: 'Chopped Cilantro', quantity: 1, unit: 'cup' }
    ],
    prepSteps: [
      'Heat oil in saucepan, add garlic and rice, sauté briefly.',
      'Add water and salt; bring to a boil.',
      'Cover, reduce heat, and cook until fluffy, about 15–18 minutes.',
      'Stir in fresh lime zest, lime juice and chopped cilantro.'
    ],
    image: 'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'fr-3',
    category: 'Flavoured Rice',
    name: 'Garlic Butter Rice',
    servingSize: '1 cup cooked (Serves 1)',
    servingGrams: 180,
    calories: 240,
    protein: 4,
    carbs: 38,
    fat: 8,
    fiber: 1,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'White Rice', quantity: 2, unit: 'cups' },
      { name: 'Chicken or Vegetable Broth', quantity: 3.5, unit: 'cups' },
      { name: 'Butter', quantity: 4, unit: 'tbsp' },
      { name: 'Minced Garlic', quantity: 6, unit: 'cloves' },
      { name: 'Salt & Black Pepper', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Melt butter in a pot and sauté minced garlic until fragrant.',
      'Add white rice, chicken broth, salt and black pepper.',
      'Bring to boil, cover and simmer for 18 minutes.',
      'Fluff with fork and garnish with chopped green onions.'
    ],
    image: 'https://images.unsplash.com/photo-1596560548464-f010549b84d7?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'fr-4',
    category: 'Flavoured Rice',
    name: 'Coconut Rice',
    servingSize: '1 cup cooked (Serves 1)',
    servingGrams: 185,
    calories: 260,
    protein: 4,
    carbs: 42,
    fat: 9,
    fiber: 2,
    dietaryTag: 'vegan',
    cuisine: 'Asian / Coastal',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'White Rice', quantity: 2, unit: 'cups' },
      { name: 'Coconut Milk', quantity: 400, unit: 'ml' },
      { name: 'Water', quantity: 1, unit: 'cup' },
      { name: 'Sea Salt', quantity: 0.5, unit: 'tsp' },
      { name: 'Toasted Coconut Flakes & Cilantro', quantity: 2, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine rice, coconut milk, water, sea salt and optional sugar in a pot.',
      'Bring to boil over medium heat, then cover and lower heat.',
      'Simmer for 18 minutes until rice is tender and liquid absorbed.',
      'Fluff and garnish with cilantro and toasted coconut flakes.'
    ],
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'fr-5',
    category: 'Flavoured Rice',
    name: 'Yellow Turmeric Rice',
    servingSize: '1 cup cooked (Serves 1)',
    servingGrams: 180,
    calories: 215,
    protein: 4,
    carbs: 36,
    fat: 6,
    fiber: 1,
    dietaryTag: 'veg',
    cuisine: 'Asian / Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Butter', quantity: 3, unit: 'tbsp' },
      { name: 'White Rice', quantity: 1.5, unit: 'cups' },
      { name: 'Chicken or Veg Broth', quantity: 2, unit: 'cups' },
      { name: 'Ground Turmeric', quantity: 1, unit: 'tsp' },
      { name: 'Garlic & Onion Powder', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Melt butter in pot and toast rice with turmeric, garlic and onion powder for 1–2 minutes.',
      'Pour in broth, salt and pepper. Bring to boil.',
      'Cover and simmer for 18–20 minutes on low heat.',
      'Fluff with fork and garnish with chopped cilantro.'
    ],
    image: 'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'fr-6',
    category: 'Flavoured Rice',
    name: 'Parmesan Cream Rice',
    servingSize: '1 cup cooked (Serves 1)',
    servingGrams: 190,
    calories: 310,
    protein: 8,
    carbs: 36,
    fat: 15,
    fiber: 1,
    dietaryTag: 'veg',
    cuisine: 'Italian / Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'White Rice', quantity: 1, unit: 'cup' },
      { name: 'Chicken Broth', quantity: 2, unit: 'cups' },
      { name: 'Butter', quantity: 2, unit: 'tbsp' },
      { name: 'Minced Garlic', quantity: 1, unit: 'clove' },
      { name: 'Heavy Cream', quantity: 0.5, unit: 'cup' },
      { name: 'Grated Parmesan Cheese', quantity: 0.5, unit: 'cup' }
    ],
    prepSteps: [
      'In a pot, melt 1 tbsp butter, add garlic, rice, chicken broth, salt and pepper.',
      'Cover and simmer for 18 minutes until cooked through.',
      'Remove from heat and stir in remaining butter, heavy cream and Parmesan cheese until creamy.',
      'Garnish with fresh chopped parsley before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1596560548464-f010549b84d7?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  }
];
