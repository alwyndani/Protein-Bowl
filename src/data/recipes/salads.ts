import { RecipeItem } from '../../types';

export const SALAD_RECIPES: RecipeItem[] = [
  // ==========================================
  // SALADS (13)
  // ==========================================
  {
    id: 'sl-1',
    category: 'Salads',
    name: 'Chickpea Power Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 260,
    calories: 290,
    protein: 14,
    carbs: 38,
    fat: 10,
    fiber: 9,
    dietaryTag: 'veg',
    cuisine: 'Mediterranean',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Cooked Chickpeas', quantity: 1, unit: 'cup' },
      { name: 'Diced Red Bell Pepper', quantity: 0.5, unit: 'cup' },
      { name: 'Sliced Cucumber', quantity: 0.5, unit: 'cup' },
      { name: 'Crumbled Feta Cheese', quantity: 2, unit: 'tbsp' },
      { name: 'Lemon Vinaigrette', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine chickpeas, bell pepper and cucumber in a bowl.',
      'Top with crumbled feta cheese and toss with lemon vinaigrette.'
    ],
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'sl-2',
    category: 'Salads',
    name: 'Broccoli & Chickpea Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 240,
    calories: 260,
    protein: 10,
    carbs: 28,
    fat: 12,
    fiber: 8,
    dietaryTag: 'vegan',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Roasted Chickpeas', quantity: 0.5, unit: 'cup' },
      { name: 'Steamed Broccoli Florets', quantity: 1, unit: 'cup' },
      { name: 'Diced Carrot', quantity: 0.5, unit: 'cup' },
      { name: 'Extra Virgin Olive Oil', quantity: 1, unit: 'tbsp' },
      { name: 'Garlic Powder', quantity: 0.5, unit: 'tsp' }
    ],
    prepSteps: [
      'Combine roasted chickpeas, steamed broccoli florets and diced carrot.',
      'Toss with olive oil and a pinch of garlic powder.'
    ],
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'sl-3',
    category: 'Salads',
    name: 'Spicy Chicken Fat Loss Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 320,
    calories: 280,
    protein: 36,
    carbs: 18,
    fat: 6,
    fiber: 6,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Spicy',
    ingredientsList: [
      { name: 'Chicken Breast (cooked & shredded)', quantity: 150, unit: 'g' },
      { name: 'Shredded Cabbage', quantity: 200, unit: 'g' },
      { name: 'Shredded Carrot', quantity: 100, unit: 'g' },
      { name: 'Sliced Green Onion', quantity: 20, unit: 'g' },
      { name: 'Hot Sauce & Lemon Juice', quantity: 1, unit: 'tbsp' },
      { name: 'Olive Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Cook the chicken and shred into small pieces.',
      'Finely shred cabbage and carrots.',
      'Mix olive oil, hot sauce and lemon juice.',
      'Toss everything together and let it sit 5 minutes before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'sl-4',
    category: 'Salads',
    name: 'Mediterranean Chicken Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 300,
    calories: 360,
    protein: 39,
    carbs: 12,
    fat: 18,
    fiber: 4,
    dietaryTag: 'non-veg',
    cuisine: 'Mediterranean',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Grilled Chicken Breast', quantity: 150, unit: 'g' },
      { name: 'Fresh Spinach', quantity: 2, unit: 'cups' },
      { name: 'Cherry Tomatoes', quantity: 100, unit: 'g' },
      { name: 'Sliced Cucumber', quantity: 100, unit: 'g' },
      { name: 'Feta Cheese', quantity: 30, unit: 'g' },
      { name: 'Olive Oil & Lemon Juice', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Grill chicken breast and slice into thin strips.',
      'Chop vegetables evenly.',
      'Add feta cheese on top.',
      'Drizzle with extra virgin olive oil and fresh lemon juice, then toss.'
    ],
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'sl-5',
    category: 'Salads',
    name: 'Crunchy Lemon Chicken Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 310,
    calories: 270,
    protein: 36,
    carbs: 11,
    fat: 8,
    fiber: 4,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Grilled Chicken Breast', quantity: 150, unit: 'g' },
      { name: 'Romaine Lettuce', quantity: 2, unit: 'cups' },
      { name: 'Cucumber', quantity: 150, unit: 'g' },
      { name: 'Cherry Tomatoes', quantity: 100, unit: 'g' },
      { name: 'Red Onion', quantity: 20, unit: 'g' },
      { name: 'Olive Oil & Lemon Juice', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Grill or pan-cook chicken until fully cooked, then slice into thin strips.',
      'Chop lettuce, cucumber, tomatoes and onion into bite-sized pieces.',
      'Add everything to a bowl with olive oil, lemon juice, salt and black pepper.',
      'Toss well and let sit for 5 minutes before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'sl-6',
    category: 'Salads',
    name: 'High Protein Avocado Chicken Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 320,
    calories: 380,
    protein: 40,
    carbs: 12,
    fat: 19,
    fiber: 6,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Chicken Breast (cooked & shredded)', quantity: 150, unit: 'g' },
      { name: 'Mixed Greens', quantity: 2, unit: 'cups' },
      { name: 'Sliced Avocado', quantity: 0.5, unit: 'unit' },
      { name: 'Cucumber', quantity: 100, unit: 'g' },
      { name: 'Greek Yogurt Dressing', quantity: 2, unit: 'tbsp' },
      { name: 'Lime Juice', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Cook and shred chicken breast while still warm.',
      'Dice avocado and cucumber into small chunks.',
      'Mix Greek yogurt with lime juice, salt and pepper.',
      'Combine everything and toss gently.'
    ],
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'sl-7',
    category: 'Salads',
    name: 'Chicken Apple Crunch Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 300,
    calories: 340,
    protein: 38,
    carbs: 22,
    fat: 12,
    fiber: 5,
    dietaryTag: 'non-veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Grilled Chicken Breast', quantity: 150, unit: 'g' },
      { name: 'Mixed Greens', quantity: 2, unit: 'cups' },
      { name: 'Fresh Apple (thinly sliced)', quantity: 1, unit: 'small' },
      { name: 'Chopped Walnuts', quantity: 15, unit: 'g' },
      { name: 'Greek Yogurt & Apple Cider Vinegar', quantity: 2, unit: 'tbsp' }
    ],
    prepSteps: [
      'Cook and slice chicken into bite-sized pieces.',
      'Thinly slice apple and chop walnuts.',
      'Mix Greek yogurt with apple cider vinegar.',
      'Toss everything together and serve fresh.'
    ],
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'sl-8',
    category: 'Salads',
    name: 'Tofu Sesame Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 230,
    calories: 230,
    protein: 12,
    carbs: 8,
    fat: 17,
    fiber: 3,
    dietaryTag: 'vegan',
    cuisine: 'Asian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Pan-Seared Tofu Cubes', quantity: 100, unit: 'g' },
      { name: 'Baby Spinach', quantity: 1, unit: 'cup' },
      { name: 'Halved Cherry Tomatoes', quantity: 80, unit: 'g' },
      { name: 'Toasted Sesame Seeds', quantity: 1, unit: 'tsp' },
      { name: 'Olive Oil Dressing', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Pan-sear tofu cubes until golden.',
      'Toss spinach, cherry tomatoes and tofu together.',
      'Finish with toasted sesame seeds and an olive oil dressing.'
    ],
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'sl-9',
    category: 'Salads',
    name: 'Lentil Crunch Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 240,
    calories: 240,
    protein: 14,
    carbs: 30,
    fat: 6,
    fiber: 8,
    dietaryTag: 'vegan',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Tofu Cubes', quantity: 60, unit: 'g' },
      { name: 'Cooked Red Lentils', quantity: 0.5, unit: 'cup' },
      { name: 'Shredded Purple Cabbage', quantity: 0.5, unit: 'cup' },
      { name: 'Grated Carrot', quantity: 0.5, unit: 'cup' },
      { name: 'Lemon Vinaigrette', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Combine cooked red lentils, shredded cabbage and grated carrot.',
      'Top with tofu cubes and toss with fresh lemon vinaigrette.'
    ],
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    rating: 4.75
  },
  {
    id: 'sl-10',
    category: 'Salads',
    name: 'Paneer & Sprouts Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 230,
    calories: 260,
    protein: 17,
    carbs: 18,
    fat: 13,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'Indian Health',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Paneer Cubes', quantity: 75, unit: 'g' },
      { name: 'Mixed Sprouts', quantity: 1, unit: 'cup' },
      { name: 'Sliced Onion', quantity: 0.25, unit: 'cup' },
      { name: 'Halved Cherry Tomatoes', quantity: 0.5, unit: 'cup' },
      { name: 'Chaat Masala & Lemon Juice', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Combine paneer, sprouts, onion and cherry tomatoes in a bowl.',
      'Season with chaat masala and a squeeze of fresh lemon juice; toss well.'
    ],
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'sl-11',
    category: 'Salads',
    name: 'Mediterranean Paneer Salad',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 220,
    calories: 290,
    protein: 15,
    carbs: 8,
    fat: 22,
    fiber: 2,
    dietaryTag: 'veg',
    cuisine: 'Mediterranean',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Paneer Cubes', quantity: 100, unit: 'g' },
      { name: 'Black Olives', quantity: 1, unit: 'tbsp' },
      { name: 'Sliced Cucumber', quantity: 0.5, unit: 'cup' },
      { name: 'Halved Cherry Tomatoes', quantity: 0.5, unit: 'cup' },
      { name: 'Dried Oregano & Lemon Juice', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Combine paneer, black olives, cucumber and cherry tomatoes.',
      'Season with dried oregano and a squeeze of fresh lemon juice; toss with olive oil.'
    ],
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'sl-12',
    category: 'Salads',
    name: 'Paneer & Green Lentil Mix',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 240,
    calories: 310,
    protein: 20,
    carbs: 22,
    fat: 16,
    fiber: 6,
    dietaryTag: 'veg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Paneer Cubes', quantity: 100, unit: 'g' },
      { name: 'Cooked Green Lentils', quantity: 0.5, unit: 'cup' },
      { name: 'Sliced Cucumber', quantity: 0.5, unit: 'cup' },
      { name: 'Fresh Parsley', quantity: 2, unit: 'tbsp' },
      { name: 'Extra Virgin Olive Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Combine paneer, cooked lentils and sliced cucumber.',
      'Toss with chopped fresh parsley and a drizzle of extra virgin olive oil.'
    ],
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'sl-13',
    category: 'Salads',
    name: 'Egg Salad with Greek Yogurt',
    servingSize: '1 bowl (Serves 1)',
    servingGrams: 220,
    calories: 310,
    protein: 26,
    carbs: 5,
    fat: 20,
    fiber: 1,
    dietaryTag: 'egg',
    cuisine: 'Continental',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Hard-Boiled Eggs (chopped)', quantity: 4, unit: 'units' },
      { name: 'Greek Yogurt', quantity: 0.25, unit: 'cup' },
      { name: 'Dijon Mustard', quantity: 1, unit: 'tbsp' },
      { name: 'Diced Celery', quantity: 0.25, unit: 'cup' },
      { name: 'Salt & Black Pepper', quantity: 1, unit: 'pinch' }
    ],
    prepSteps: [
      'Combine chopped hard-boiled eggs, Greek yogurt, Dijon mustard and diced celery.',
      'Mix well, season with salt and pepper.',
      'Serve on crisp greens or whole grain bread.'
    ],
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  }
];
