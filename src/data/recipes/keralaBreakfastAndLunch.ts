import { RecipeItem } from '../../types';

export const KERALA_BREAKFAST_AND_LUNCH_RECIPES: RecipeItem[] = [
  // ==========================================
  // AUTHENTIC KERALA BREAKFAST (4)
  // ==========================================
  {
    id: 'kb-1',
    category: 'Authentic Kerala Breakfast',
    name: 'Classic Batter (Idly & Dosa)',
    servingSize: '2 Dosas or 3 Idlis (Serves 1)',
    servingGrams: 180,
    calories: 220,
    protein: 6,
    carbs: 44,
    fat: 1.5,
    fiber: 3,
    dietaryTag: 'vegan',
    cuisine: 'Kerala / South Indian',
    flourGrainPreference: 'Idly Rice & Urad Dal',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Urad Dal (Whole White)', quantity: 50, unit: 'g' },
      { name: 'Idly Rice / Parboiled Rice', quantity: 150, unit: 'g' },
      { name: 'Fenugreek Seeds', quantity: 0.5, unit: 'tsp' },
      { name: 'Salt', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Soak urad dal with fenugreek seeds in one bowl, and rice in another bowl, for 4–6 hours.',
      'Grind urad dal until light and fluffy. Grind rice into a slightly coarse paste.',
      'Combine both batters with salt and let it ferment overnight (8–12 hours) in a warm spot.',
      'For idly: pour fermented batter into oiled idly moulds and steam for 10–12 minutes.',
      'For dosa: dilute batter slightly with water, pour onto hot griddle, spread thin, drizzle oil/ghee and cook until golden brown.'
    ],
    image: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'kb-2',
    category: 'Authentic Kerala Breakfast',
    name: 'Puttu (Rice, Ragi or Wheat)',
    servingSize: '1 Steamed Puttu (Serves 1)',
    servingGrams: 180,
    calories: 280,
    protein: 6,
    carbs: 52,
    fat: 6,
    fiber: 4,
    dietaryTag: 'vegan',
    cuisine: 'Kerala / South Indian',
    flourGrainPreference: 'Roasted Rice Flour / Ragi / Wheat',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Puttu Flour (Rice/Ragi/Wheat)', quantity: 1, unit: 'cup' },
      { name: 'Warm Salt Water', quantity: 0.5, unit: 'cup' },
      { name: 'Freshly Grated Coconut', quantity: 0.5, unit: 'cup' }
    ],
    prepSteps: [
      'Gradually sprinkle warm salt water over flour while mixing with fingertips until crumbly texture.',
      'In a puttu maker (steamer), add 1 tbsp grated coconut at bottom, followed by spoonfuls of moistened flour. Repeat layers.',
      'Steam over boiling water for 6–8 minutes until steam vents freely from top.'
    ],
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'kb-3',
    category: 'Authentic Kerala Breakfast',
    name: 'Idiyappam (Rice, Ragi or Wheat)',
    servingSize: '4 Pieces (Serves 1)',
    servingGrams: 160,
    calories: 240,
    protein: 4,
    carbs: 50,
    fat: 2,
    fiber: 2,
    dietaryTag: 'vegan',
    cuisine: 'Kerala / South Indian',
    flourGrainPreference: 'Roasted Rice / Ragi / Wheat Flour',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Roasted Rice Flour', quantity: 1, unit: 'cup' },
      { name: 'Boiling Water', quantity: 1, unit: 'cup' },
      { name: 'Salt', quantity: 0.5, unit: 'tsp' },
      { name: 'Coconut Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Add salt and oil to boiling water. Slowly pour into flour and knead into soft, smooth dough once cool.',
      'Fill dough into an idiyappam press fitted with a thin-hole plate.',
      'Squeeze noodle strands onto oiled idly plates or banana leaves and steam for 8–10 minutes.'
    ],
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'kb-4',
    category: 'Authentic Kerala Breakfast',
    name: 'Whole Wheat Chapati',
    servingSize: '2 Chapatis (Serves 1)',
    servingGrams: 120,
    calories: 210,
    protein: 7,
    carbs: 42,
    fat: 1.5,
    fiber: 6,
    dietaryTag: 'vegan',
    cuisine: 'North / South Indian',
    flourGrainPreference: 'Whole Wheat Atta',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Whole Wheat Flour (Atta)', quantity: 1, unit: 'cup' },
      { name: 'Warm Water', quantity: 0.4, unit: 'cup' },
      { name: 'Salt', quantity: 0.5, unit: 'tsp' }
    ],
    prepSteps: [
      'Mix flour and salt. Gradually add warm water and knead for 5–7 minutes until smooth, soft dough.',
      'Cover and rest for 15–20 minutes.',
      'Divide into small balls, roll thin, and cook on dry tawa for 30–45 sec per side pressing gently until puffed with light brown spots.'
    ],
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
    rating: 4.75
  },

  // ==========================================
  // AUTHENTIC KERALA LUNCH (10)
  // ==========================================
  {
    id: 'kl-1',
    category: 'Authentic Kerala Lunch',
    name: 'Steamed White Rice (Sona Masoori or Ponni)',
    servingSize: '1.5 cups cooked (Serves 1)',
    servingGrams: 200,
    calories: 205,
    protein: 4,
    carbs: 45,
    fat: 1,
    fiber: 1,
    dietaryTag: 'vegan',
    cuisine: 'Kerala / South Indian',
    flourGrainPreference: 'Sona Masoori / Ponni / Jasmine Rice',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Raw White Rice', quantity: 1, unit: 'cup' },
      { name: 'Water', quantity: 2, unit: 'cups' },
      { name: 'Salt', quantity: 0.5, unit: 'tsp' },
      { name: 'Ghee or Oil', quantity: 0.5, unit: 'tsp' }
    ],
    prepSteps: [
      'Wash rice under cool water 2–3 times until water runs clear.',
      'Soak in fresh water for 15 minutes, then drain completely.',
      'In a medium saucepan, combine rice, 2 cups water, salt and oil. Bring to rolling boil.',
      'Reduce heat to low, cover with tight lid, and simmer 12–15 minutes until liquid is absorbed. Fluff gently before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'kl-2',
    category: 'Authentic Kerala Lunch',
    name: 'Kerala Matta Rice (Rosematta Red Rice)',
    servingSize: '1.5 cups cooked (Serves 1)',
    servingGrams: 200,
    calories: 195,
    protein: 5,
    carbs: 42,
    fat: 1.5,
    fiber: 3,
    dietaryTag: 'vegan',
    cuisine: 'Kerala / South Indian',
    flourGrainPreference: 'Kerala Matta / Parboiled Red Rice',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Kerala Matta Rice', quantity: 1, unit: 'cup' },
      { name: 'Water', quantity: 4.5, unit: 'cups' },
      { name: 'Salt', quantity: 0.5, unit: 'tsp' }
    ],
    prepSteps: [
      'Thoroughly wash rice 3–4 times. Soak in warm water for 30–60 minutes.',
      'Pressure cooker method: combine drained rice with 4.5–5 cups water. Cook on medium-high for 5–6 whistles, then low heat for 5 mins.',
      'Allow pressure to release naturally. Drain excess starch water if needed and serve warm.'
    ],
    image: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'kl-3',
    category: 'Authentic Kerala Lunch',
    name: 'Classic Kerala Thoran (Coconut Stir-Fry)',
    servingSize: '1 portion (Serves 2)',
    servingGrams: 150,
    calories: 130,
    protein: 3,
    carbs: 9,
    fat: 9,
    fiber: 4,
    dietaryTag: 'vegan',
    cuisine: 'Kerala / South Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Fresh Grated Coconut', quantity: 1, unit: 'cup' },
      { name: 'Main Vegetable (Beetroot/Beans/Carrots/Spinach/Van Payar)', quantity: 250, unit: 'g' },
      { name: 'Coconut Oil', quantity: 1, unit: 'tbsp' },
      { name: 'Mustard Seeds', quantity: 0.5, unit: 'tsp' },
      { name: 'Small Shallots', quantity: 4, unit: 'units' },
      { name: 'Green Chillies', quantity: 3, unit: 'units' },
      { name: 'Curry Leaves', quantity: 1, unit: 'sprig' }
    ],
    prepSteps: [
      'Gently pulse coconut, cumin seeds, turmeric, green chillies, shallots and garlic together without water until coarsely crushed.',
      'Heat coconut oil in pan, add mustard seeds, dry red chillies and curry leaves.',
      'Add prepared main vegetable with salt and 2-3 tbsp water. Cover and cook until tender.',
      'Add ground coconut mixture, mound in centre, steam 2-3 mins, then stir well to dry out remaining moisture.'
    ],
    image: 'https://images.unsplash.com/photo-1610057099443-f63a15291b86?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'kl-4',
    category: 'Authentic Kerala Lunch',
    name: 'Pineapple Pachadi',
    servingSize: '1 portion (Serves 2)',
    servingGrams: 150,
    calories: 160,
    protein: 4,
    carbs: 18,
    fat: 8,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Kerala / South Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Thick Whisked Curd / Yogurt', quantity: 1, unit: 'cup' },
      { name: 'Finely Chopped Pineapple', quantity: 1, unit: 'cup' },
      { name: 'Turmeric Powder', quantity: 0.25, unit: 'tsp' },
      { name: 'Red Chilli Powder', quantity: 0.5, unit: 'tsp' },
      { name: 'Jaggery or Sugar', quantity: 1, unit: 'tsp' },
      { name: 'Grated Coconut Paste', quantity: 0.75, unit: 'cup' },
      { name: 'Coconut Oil (for tempering)', quantity: 1, unit: 'tbsp' }
    ],
    prepSteps: [
      'Simmer chopped pineapple in 1/2 cup water with turmeric, red chilli powder, sugar/jaggery and salt until soft.',
      'Stir in ground coconut-mustard paste and simmer for 2–3 minutes.',
      'Remove from heat and fold in whisked curd.',
      'Heat coconut oil in small pan, add mustard seeds, dry red chillies and curry leaves; pour tempering over pachadi.'
    ],
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    rating: 4.85
  },
  {
    id: 'kl-5',
    category: 'Authentic Kerala Lunch',
    name: 'Cucumber Pachadi (Vellarikka Pachadi)',
    servingSize: '1 portion (Serves 2)',
    servingGrams: 150,
    calories: 140,
    protein: 4,
    carbs: 10,
    fat: 9,
    fiber: 2,
    dietaryTag: 'veg',
    cuisine: 'Kerala / South Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Thick Whisked Curd / Yogurt', quantity: 1, unit: 'cup' },
      { name: 'Finely Chopped Cucumber', quantity: 1, unit: 'cup' },
      { name: 'Grated Coconut Paste', quantity: 0.75, unit: 'cup' },
      { name: 'Mustard Seeds', quantity: 0.5, unit: 'tsp' },
      { name: 'Coconut Oil', quantity: 1, unit: 'tbsp' },
      { name: 'Curry Leaves', quantity: 1, unit: 'sprig' }
    ],
    prepSteps: [
      'Mix chopped cucumber with ground coconut-mustard paste and salt.',
      'Fold this into whisked curd.',
      'Heat coconut oil in a small pan, add mustard seeds, dry red chillies and curry leaves; let splutter, then pour tempering over pachadi.'
    ],
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'kl-6',
    category: 'Authentic Kerala Lunch',
    name: 'Beetroot Pachadi',
    servingSize: '1 portion (Serves 2)',
    servingGrams: 150,
    calories: 150,
    protein: 4,
    carbs: 13,
    fat: 9,
    fiber: 3,
    dietaryTag: 'veg',
    cuisine: 'Kerala / South Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Thick Whisked Curd / Yogurt', quantity: 1, unit: 'cup' },
      { name: 'Finely Grated Beetroot', quantity: 1, unit: 'cup' },
      { name: 'Grated Coconut Paste', quantity: 0.75, unit: 'cup' },
      { name: 'Coconut Oil', quantity: 1, unit: 'tbsp' },
      { name: 'Mustard Seeds', quantity: 0.5, unit: 'tsp' },
      { name: 'Curry Leaves', quantity: 1, unit: 'sprig' }
    ],
    prepSteps: [
      'Cook grated beetroot with a splash of water and a pinch of salt until tender.',
      'Stir in ground coconut-mustard paste and cook for 2 minutes.',
      'Remove from heat and fold in whisked curd.',
      'Pour coconut oil tempering over pachadi before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    rating: 4.9
  },
  {
    id: 'kl-7',
    category: 'Authentic Kerala Lunch',
    name: 'Classic Kerala Avial',
    servingSize: '1 portion (Serves 2)',
    servingGrams: 180,
    calories: 180,
    protein: 4,
    carbs: 16,
    fat: 12,
    fiber: 5,
    dietaryTag: 'veg',
    cuisine: 'Kerala / South Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Mixed Vegetables (drumstick, raw banana, ash gourd, carrot, chena, beans)', quantity: 250, unit: 'g' },
      { name: 'Grated Coconut', quantity: 1, unit: 'cup' },
      { name: 'Cumin Seeds', quantity: 0.5, unit: 'tsp' },
      { name: 'Green Chillies', quantity: 4, unit: 'units' },
      { name: 'Shallots', quantity: 3, unit: 'units' },
      { name: 'Whisked Sour Curd', quantity: 0.5, unit: 'cup' },
      { name: 'Raw Coconut Oil', quantity: 1, unit: 'tbsp' },
      { name: 'Fresh Curry Leaves', quantity: 1, unit: 'sprig' }
    ],
    prepSteps: [
      'Place vegetable batons in wide pot with 1/2 cup water, turmeric and salt. Cover and cook until tender.',
      'Coarsely grind coconut, cumin seeds, green chillies and shallots.',
      'Add coconut paste on top of vegetables, cover, and steam 3-4 minutes on low heat.',
      'Fold in whisked sour curd gently without boiling. Turn off heat, drizzle raw coconut oil & scatter fresh curry leaves. Rest 10 mins.'
    ],
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    rating: 4.95
  },
  {
    id: 'kl-8',
    category: 'Authentic Kerala Lunch',
    name: 'Payar Mezhukkupuratti (Sautéed Long Beans)',
    servingSize: '1 portion (Serves 2)',
    servingGrams: 140,
    calories: 120,
    protein: 4,
    carbs: 10,
    fat: 7,
    fiber: 4,
    dietaryTag: 'vegan',
    cuisine: 'Kerala / South Indian',
    spiceLevel: 'Medium',
    ingredientsList: [
      { name: 'Long Green Beans (Achinga Payar)', quantity: 250, unit: 'g' },
      { name: 'Shallots (coarsely crushed)', quantity: 10, unit: 'units' },
      { name: 'Garlic Cloves (crushed)', quantity: 3, unit: 'cloves' },
      { name: 'Crushed Red Chilli Flakes', quantity: 1, unit: 'tsp' },
      { name: 'Coconut Oil', quantity: 1.5, unit: 'tbsp' },
      { name: 'Curry Leaves', quantity: 1, unit: 'sprig' }
    ],
    prepSteps: [
      'Boil chopped beans in 1/4 cup water with salt and turmeric until 80% tender; drain.',
      'Heat coconut oil in pan, add crushed shallots, garlic and red chilli flakes; sauté until golden brown.',
      'Add cooked beans and curry leaves. Sauté on medium-low heat for 5–7 minutes until lightly roasted.'
    ],
    image: 'https://images.unsplash.com/photo-1564834724105-918b73d1b9e0?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  },
  {
    id: 'kl-9',
    category: 'Authentic Kerala Lunch',
    name: 'Boiled Van Payar (Red Cowpea)',
    servingSize: '1 cup cooked (Serves 2)',
    servingGrams: 160,
    calories: 180,
    protein: 11,
    carbs: 31,
    fat: 2,
    fiber: 9,
    dietaryTag: 'vegan',
    cuisine: 'Kerala / South Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Red Cowpea (Van Payar)', quantity: 1, unit: 'cup' },
      { name: 'Water', quantity: 3.5, unit: 'cups' },
      { name: 'Salt', quantity: 0.5, unit: 'tsp' },
      { name: 'Turmeric Powder', quantity: 0.5, unit: 'tsp' },
      { name: 'Fresh Coconut Oil', quantity: 1, unit: 'tsp' },
      { name: 'Curry Leaves', quantity: 1, unit: 'sprig' }
    ],
    prepSteps: [
      'Soak red cowpea for 4 hours.',
      'Pressure cook with water, salt and turmeric for 4–5 whistles until fully soft.',
      'Stir in fresh coconut oil and curry leaves before serving.'
    ],
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    rating: 4.75
  },
  {
    id: 'kl-10',
    category: 'Authentic Kerala Lunch',
    name: 'Boiled Cherupayar (Green Gram)',
    servingSize: '1 cup cooked (Serves 2)',
    servingGrams: 160,
    calories: 190,
    protein: 12,
    carbs: 33,
    fat: 2,
    fiber: 10,
    dietaryTag: 'vegan',
    cuisine: 'Kerala / South Indian',
    spiceLevel: 'Mild',
    ingredientsList: [
      { name: 'Whole Green Gram (Cherupayar)', quantity: 1, unit: 'cup' },
      { name: 'Water', quantity: 3, unit: 'cups' },
      { name: 'Salt', quantity: 0.5, unit: 'tsp' },
      { name: 'Turmeric Powder', quantity: 0.25, unit: 'tsp' },
      { name: 'Raw Coconut Oil', quantity: 1, unit: 'tsp' }
    ],
    prepSteps: [
      'Rinse green gram (soaking is optional, about 30 minutes).',
      'Pressure cook with water, turmeric and salt for 3 whistles until tender but still holding shape.',
      'Serve drizzled with a teaspoon of raw coconut oil or alongside freshly grated coconut.'
    ],
    image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80',
    rating: 4.8
  }
];
