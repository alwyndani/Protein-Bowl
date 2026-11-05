import React, { useState, useMemo } from 'react';
import { RecipeItem } from '../../types';
import { RecipeService, type RecipeWritePayload } from '../../services/recipeService';
import { ApiRequestError } from '../../services/apiClient';
import {
  ChefHat,
  Utensils,
  Plus,
  Edit3,
  Search,
  Trash2,
  X,
  Filter
} from 'lucide-react';
import { KitchenQueue } from './kitchen/KitchenQueue';
import { MessKitchenPanel } from './kitchen/MessKitchenPanel';

interface ChefDashboardProps {
  /** The kitchen queue reports a dead session here (the host shows the sign-in flow). */
  onSessionExpired?: () => void;
}

export const ChefDashboard: React.FC<ChefDashboardProps> = ({
  onSessionExpired
}) => {
  // P8: the production workspace is the real Kitchen Queue + Kerala Mess kitchen + Recipes.
  const [activeTab, setActiveTab] = useState<'kitchen' | 'mess_kitchen' | 'recipes'>('kitchen');

  // Recipe Database Versioning State
  // The recipe catalogue is the server's: no static fallback list (an unreachable API shows an error, not made-up recipes).
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const loadRecipes = React.useCallback(async () => {
    try {
      const res = await RecipeService.getStaffRecipes({ limit: 100 });
      setRecipes(res.items ?? []);
      setRecipesError(null);
    } catch {
      setRecipesError('The recipe catalogue could not be loaded. Please try again.');
    }
  }, []);
  React.useEffect(() => {
    void loadRecipes();
  }, [loadRecipes]);

  // Modal State for Edit or Create Recipe
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingRecipe, setEditingRecipe] = useState<RecipeItem | null>(null);

  // Form State for Add / Edit Recipe
  // A new recipe starts EMPTY: nutrition facts, ingredients and steps are never pre-filled with sample values the chef might save unknowingly.
  const [formRecipe, setFormRecipe] = useState<Partial<RecipeItem>>({ name: '', ingredientsList: [], prepSteps: [] });
  const [recipeFormError, setRecipeFormError] = useState<string | null>(null);
  const [recipeSaving, setRecipeSaving] = useState(false);

  // Modal State for Viewing Prep Steps
  const [viewPrepRecipe, setViewPrepRecipe] = useState<RecipeItem | null>(null);

  // Handle Edit Click on Recipe Card
  const handleOpenEditRecipeModal = (recipe: RecipeItem) => {
    setModalMode('edit');
    setEditingRecipe(recipe);
    setRecipeFormError(null);
    setFormRecipe({
      ...recipe,
      ingredientsList: recipe.ingredientsList?.length ? [...recipe.ingredientsList] : [],
      prepSteps: recipe.prepSteps?.length ? [...recipe.prepSteps] : []
    });
    setShowRecipeModal(true);
  };

  // Handle Create New Menu Click
  const handleOpenAddRecipeModal = () => {
    setModalMode('add');
    setEditingRecipe(null);
    setRecipeFormError(null);
    setFormRecipe({ name: '', ingredientsList: [], prepSteps: [] });
    setShowRecipeModal(true);
  };

  // Save a recipe THROUGH THE API. Every nutrition value must be entered by the chef (nothing is defaulted), and the list only changes after the
  // server accepted the save: a failed save keeps the form open with an error and never shows as saved.
  const handleSaveRecipeForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recipeSaving) return;
    const f = formRecipe;
    const num = (v: unknown): number | null => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
    const calories = num(f.calories), protein = num(f.protein), carbs = num(f.carbs), fat = num(f.fat), fiber = num(f.fiber), grams = num(f.servingGrams);
    if (!f.name?.trim() || f.name.trim().length < 2) return setRecipeFormError('Enter the dish name (at least 2 characters).');
    if (!f.category) return setRecipeFormError('Choose a menu category.');
    if (!f.servingSize?.trim() || !grams || grams <= 0) return setRecipeFormError('Enter the portion label and its weight in grams.');
    if (calories === null || calories <= 0 || protein === null || carbs === null || fat === null || fiber === null || [protein, carbs, fat, fiber].some((x) => (x as number) < 0)) {
      return setRecipeFormError('Enter every nutrition value for one portion (calories above 0; protein, carbs, fat and fiber 0 or more).');
    }
    if (!f.dietaryTag) return setRecipeFormError('Choose the dietary tag.');
    if (!f.cuisine?.trim()) return setRecipeFormError('Enter the cuisine style.');

    const payload: RecipeWritePayload = {
      title: f.name.trim(),
      category: f.category,
      servingSize: f.servingSize.trim(),
      servingGrams: Math.round(grams),
      calories: Math.round(calories),
      proteinGrams: protein,
      carbsGrams: carbs,
      fatGrams: fat,
      fiberGrams: fiber,
      dietaryTag: f.dietaryTag,
      cuisine: f.cuisine.trim(),
      ingredientsList: (f.ingredientsList ?? []).map((i) => ({ name: i.name.trim(), quantity: Number(i.quantity), unit: i.unit })),
      prepSteps: (f.prepSteps ?? []).map((s) => s.trim()).filter(Boolean),
      ...(f.image ? { image: f.image } : {})
    };

    setRecipeSaving(true);
    setRecipeFormError(null);
    try {
      if (modalMode === 'add') await RecipeService.createRecipe(payload);
      else if (editingRecipe) await RecipeService.updateRecipe(editingRecipe.id, payload);
      await loadRecipes(); // show what the server actually stored
      setShowRecipeModal(false);
    } catch (err) {
      setRecipeFormError(err instanceof ApiRequestError && err.status === 403 ? 'You are not allowed to save recipes.' : err instanceof ApiRequestError && err.status === 422 ? 'The server rejected some values. Please check the form.' : 'The recipe could not be saved. Please try again.');
    } finally {
      setRecipeSaving(false);
    }
  };

  // Dynamic Ingredient Row Helpers
  const handleAddIngredientRow = () => {
    setFormRecipe({
      ...formRecipe,
      ingredientsList: [
        ...(formRecipe.ingredientsList || []),
        { name: '', quantity: 50, unit: 'g' }
      ]
    });
  };

  const handleUpdateIngredientRow = (index: number, field: string, value: any) => {
    const list = [...(formRecipe.ingredientsList || [])];
    list[index] = { ...list[index], [field]: value };
    setFormRecipe({ ...formRecipe, ingredientsList: list });
  };

  const handleRemoveIngredientRow = (index: number) => {
    const list = [...(formRecipe.ingredientsList || [])];
    list.splice(index, 1);
    setFormRecipe({ ...formRecipe, ingredientsList: list });
  };

  // Dynamic Prep Steps Helpers
  const handleAddPrepStepRow = () => {
    setFormRecipe({
      ...formRecipe,
      prepSteps: [...(formRecipe.prepSteps || []), '']
    });
  };

  const handleUpdatePrepStepRow = (index: number, value: string) => {
    const steps = [...(formRecipe.prepSteps || [])];
    steps[index] = value;
    setFormRecipe({ ...formRecipe, prepSteps: steps });
  };

  const handleRemovePrepStepRow = (index: number) => {
    const steps = [...(formRecipe.prepSteps || [])];
    steps.splice(index, 1);
    setFormRecipe({ ...formRecipe, prepSteps: steps });
  };

  // Recipe Catalog Filter
  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const matchesSearch = r.name.toLowerCase().includes(recipeSearch.toLowerCase()) ||
                            r.category.toLowerCase().includes(recipeSearch.toLowerCase()) ||
                            r.cuisine.toLowerCase().includes(recipeSearch.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || r.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [recipes, recipeSearch, selectedCategory]);

  const categories = ['All', 'Choice of Chicken – Air Fried', 'Choice of Salads – Non-Veg', 'Choice of Quinoa', 'Kerala Breakfast', 'Yogurt Bowls', 'Desserts & Protein Truffles'];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-950 via-stone-900 to-amber-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-orange-900/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-xs font-bold uppercase tracking-wider">
              <ChefHat className="w-3.5 h-3.5" />
              <span>Executive Chef & Kitchen Operations ERP</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black mt-2">
              Kitchen
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-2xl leading-relaxed">
              Work the live kitchen queue for your branch and browse the recipe catalogue.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 shrink-0 text-center">
            <div>
              <span className="text-[10px] text-amber-200 font-bold uppercase block">Menu Catalog</span>
              <span className="text-2xl font-black text-amber-300">{recipes.length} Dishes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-stone-200 pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'kitchen', label: 'Kitchen Queue', icon: ChefHat },
          { id: 'mess_kitchen', label: 'Kerala Mess kitchen', icon: ChefHat },
          { id: 'recipes', label: `📖 Recipe Database & Versioning (${recipes.length})`, icon: Utensils }
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              aria-current={active ? 'page' : undefined}
              className={`px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
                active
                  ? 'bg-orange-950 text-white shadow-lg'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* P8: the real, backend-derived kitchen queue (production default) */}
      {activeTab === 'kitchen' && <KitchenQueue onSessionExpired={onSessionExpired} />}

      {/* P10B: the real Kerala Mess demand + PREPARING/READY batches (production) */}
      {activeTab === 'mess_kitchen' && (
        <div className="bg-stone-950 rounded-3xl p-4 sm:p-6">
          <MessKitchenPanel onSessionExpired={onSessionExpired} />
        </div>
      )}

      {/* TAB 2: Recipe Database & Versioning */}
      {activeTab === 'recipes' && (
        <div className="space-y-6 bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-sm">

          {recipesError && (
            <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {recipesError} <button type="button" className="underline" onClick={() => void loadRecipes()}>Retry</button>
            </p>
          )}

          {/* Header & Add Recipe Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-stone-900 flex items-center gap-2">
                <Utensils className="w-5 h-5 text-orange-700" />
                <span>Recipe Database, Ingredients & Version Control</span>
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Click the <strong>Pencil icon</strong> to edit ingredient quantities, portion size & preparation notes, or click <strong>Add New Menu Item</strong>.
              </p>
            </div>

            <button
              onClick={handleOpenAddRecipeModal}
              className="bg-orange-950 hover:bg-stone-900 text-white font-black px-5 py-3 rounded-2xl text-xs transition-all shadow-md flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4 text-orange-400" />
              <span>Add New Menu Item / Recipe</span>
            </button>
          </div>

          {/* Search & Category Dropdown Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-stone-100">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                placeholder="Search recipe name, ingredient, or cuisine..."
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-10 pr-4 py-2 text-xs font-bold text-stone-900 outline-none focus:border-orange-800"
              />
            </div>

            {/* Category Select Dropdown */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="recipe-category-dropdown" className="text-xs font-bold text-stone-600 flex items-center gap-1.5 whitespace-nowrap">
                <Filter className="w-3.5 h-3.5 text-orange-800" />
                <span>Category:</span>
              </label>
              <select
                id="recipe-category-dropdown"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full sm:w-64 bg-stone-50 border border-stone-300 text-stone-900 font-extrabold text-xs rounded-2xl px-3.5 py-2 outline-none focus:border-orange-800 focus:ring-2 focus:ring-orange-800/10 cursor-pointer shadow-2xs"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? 'All Categories (Full Catalog)' : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Recipe Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((r) => (
              <div
                key={r.id}
                className="p-5 rounded-3xl border border-stone-200 bg-stone-50/80 hover:bg-white transition-all space-y-4 flex flex-col justify-between shadow-2xs hover:shadow-md relative group"
              >
                <div className="space-y-3">
                  {/* Category & Edit Pencil Icon */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-900 bg-orange-100 px-2.5 py-0.5 rounded-md border border-orange-200">
                      {r.category}
                    </span>

                    {/* PENCIL EDIT ICON FOR EXISTING RECIPES */}
                    <button
                      onClick={() => handleOpenEditRecipeModal(r)}
                      className="p-2 bg-white text-stone-700 hover:text-orange-900 hover:bg-orange-100 rounded-xl border border-stone-200 transition-all shadow-xs flex items-center gap-1 text-xs font-bold"
                      title="Edit Menu Recipe, Portion Size & Quantities"
                    >
                      <Edit3 className="w-4 h-4 text-orange-800" />
                      <span className="hidden group-hover:inline text-[11px]">Edit Recipe</span>
                    </button>
                  </div>

                  {/* Title & Serving Size */}
                  <div>
                    <h4 className="font-black text-stone-900 text-base leading-snug">{r.name}</h4>
                    {r.isPublished === false && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase">Draft: awaiting Super Admin publication</span>
                    )}
                    <p className="text-xs text-stone-500 font-medium mt-0.5">
                      Cuisine: <strong className="text-stone-700">{r.cuisine}</strong> • Portion: <strong className="text-orange-950 font-extrabold">{r.servingSize}</strong>
                    </p>
                  </div>

                  {/* Macros Pill Box */}
                  <div className="bg-white p-3 rounded-2xl border border-stone-200 grid grid-cols-5 text-center text-xs font-bold gap-1">
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Cal</span>
                      <span className="text-orange-950 font-black">{r.calories}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Prot</span>
                      <span className="text-emerald-800 font-black">{r.protein}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Carb</span>
                      <span className="text-amber-800 font-black">{r.carbs}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Fat</span>
                      <span className="text-blue-800 font-black">{r.fat}g</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-stone-400 block uppercase">Fib</span>
                      <span className="text-teal-800 font-black">{r.fiber}g</span>
                    </div>
                  </div>

                  {/* SPECIFIED INGREDIENT QUANTITIES LIST */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                      Ingredients & Quantities Needed:
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {r.ingredientsList?.map((ing, i) => (
                        <span
                          key={i}
                          className="bg-white text-stone-800 text-[11px] font-extrabold px-2.5 py-1 rounded-lg border border-stone-200 flex items-center gap-1 shadow-2xs"
                        >
                          <span className="text-orange-900">•</span>
                          <span>{ing.name}:</span>
                          <span className="text-orange-950 bg-amber-100 px-1.5 py-0.2 rounded text-[10px]">
                            {ing.quantity} {ing.unit}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom View Prep Action */}
                <div className="pt-2 border-t border-stone-200 flex items-center gap-2">
                  <button
                    onClick={() => setViewPrepRecipe(r)}
                    className="w-full bg-white hover:bg-stone-100 border border-stone-300 text-stone-900 font-extrabold py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Utensils className="w-3.5 h-3.5 text-stone-600" />
                    <span>View Preparation Method ({r.prepSteps?.length || 0} Steps)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* VIEW PREPARATION METHOD STEPS MODAL */}
      {viewPrepRecipe && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-xl w-full space-y-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-900 bg-orange-100 px-2.5 py-0.5 rounded">
                  {viewPrepRecipe.category}
                </span>
                <h3 className="text-xl font-black text-stone-900 mt-1">{viewPrepRecipe.name}</h3>
                <p className="text-xs text-stone-500">Portion: {viewPrepRecipe.servingSize} ({viewPrepRecipe.servingGrams}g)</p>
              </div>
              <button
                onClick={() => setViewPrepRecipe(null)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ingredients with Quantities */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider">Required Ingredients & Quantities:</h4>
              <div className="flex flex-wrap gap-2">
                {viewPrepRecipe.ingredientsList?.map((ing, i) => (
                  <span key={i} className="bg-stone-100 text-stone-800 font-extrabold text-xs px-3 py-1.5 rounded-xl border border-stone-200">
                    {ing.name} - <strong className="text-orange-950">{ing.quantity} {ing.unit}</strong>
                  </span>
                ))}
              </div>
            </div>

            {/* Prep Steps List */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider">Chef Preparation Instructions:</h4>
              <ol className="list-decimal list-inside space-y-2 text-xs text-stone-800 font-medium leading-relaxed bg-orange-50/60 p-4 rounded-2xl border border-orange-200">
                {viewPrepRecipe.prepSteps?.map((step, i) => (
                  <li key={i} className="pl-1">{step}</li>
                ))}
              </ol>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setViewPrepRecipe(null)}
                className="px-5 py-2.5 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800"
              >
                Close Preparation Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT / CREATE RECIPE MODAL */}
      {showRecipeModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto">

            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-xl font-black text-stone-900">
                  {modalMode === 'add' ? 'Create New Menu Item & Recipe' : 'Edit Recipe & Version Control'}
                </h3>
                <p className="text-xs text-stone-500">Define menu title, portion size, ingredient quantities, and preparation method.</p>
              </div>
              <button
                onClick={() => setShowRecipeModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecipeForm} className="space-y-5 text-xs font-bold">

              {/* Recipe Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 mb-1">Recipe Dish Name</label>
                  <input
                    type="text"
                    required
                    value={formRecipe.name || ''}
                    onChange={(e) => setFormRecipe({ ...formRecipe, name: e.target.value })}
                    placeholder="e.g. Air-Fried Garlic Herb Chicken Breast"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Menu Category</label>
                  <select
                    required
                    value={formRecipe.category || ''}
                    onChange={(e) => setFormRecipe({ ...formRecipe, category: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800 cursor-pointer"
                  >
                    <option value="">Choose a category…</option>
                    {categories.filter((c) => c !== 'All').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Portion Size & Cuisine & Dietary Tag */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-stone-700 mb-1">Portion Weight (g)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    aria-label="Portion weight in grams"
                    value={formRecipe.servingGrams ?? ''}
                    onChange={(e) => setFormRecipe({ ...formRecipe, servingGrams: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Portion Label</label>
                  <input
                    type="text"
                    required
                    value={formRecipe.servingSize || ''}
                    onChange={(e) => setFormRecipe({ ...formRecipe, servingSize: e.target.value })}
                    placeholder="e.g. 1 Portion (250g)"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Cuisine Style</label>
                  <input
                    type="text"
                    value={formRecipe.cuisine || ''}
                    onChange={(e) => setFormRecipe({ ...formRecipe, cuisine: e.target.value })}
                    placeholder="e.g. Kerala Traditional"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 mb-1">Dietary Tag</label>
                  <select
                    required
                    value={formRecipe.dietaryTag || ''}
                    onChange={(e) => setFormRecipe({ ...formRecipe, dietaryTag: e.target.value as RecipeItem['dietaryTag'] })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-stone-900 outline-none focus:ring-2 focus:ring-orange-800 cursor-pointer"
                  >
                    <option value="">Choose…</option>
                    <option value="non-veg">Non-Veg</option>
                    <option value="veg">Vegetarian</option>
                    <option value="egg">Eggitarian</option>
                    <option value="vegan">Vegan</option>
                    <option value="keto">Keto</option>
                    <option value="high-protein">High Protein</option>
                  </select>
                </div>
              </div>

              {/* Nutrition Macros */}
              <div className="bg-orange-50/60 p-4 rounded-2xl border border-orange-200 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-orange-950 block">
                  Per Portion Nutrition Facts:
                </span>
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase block">Calories</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formRecipe.calories ?? ''}
                      onChange={(e) => setFormRecipe({ ...formRecipe, calories: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase">Protein (g)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={formRecipe.protein ?? ''}
                      onChange={(e) => setFormRecipe({ ...formRecipe, protein: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black text-emerald-800"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase">Carbs (g)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={formRecipe.carbs ?? ''}
                      onChange={(e) => setFormRecipe({ ...formRecipe, carbs: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black text-amber-800"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase">Fat (g)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={formRecipe.fat ?? ''}
                      onChange={(e) => setFormRecipe({ ...formRecipe, fat: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black text-blue-800"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-stone-500 uppercase">Fiber (g)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={formRecipe.fiber ?? ''}
                      onChange={(e) => setFormRecipe({ ...formRecipe, fiber: Number(e.target.value) })}
                      className="w-full bg-white border border-stone-300 rounded-lg p-1 text-center font-black text-teal-800"
                    />
                  </div>
                </div>
              </div>

              {/* DYNAMIC INGREDIENT LIST BUILDER WITH QUANTITIES */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    Ingredients & Quantities Required (Per Portion):
                  </label>
                  <button
                    type="button"
                    onClick={handleAddIngredientRow}
                    className="text-xs font-extrabold text-orange-950 bg-orange-100 hover:bg-orange-200 px-3 py-1 rounded-xl border border-orange-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Ingredient Row</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {formRecipe.ingredientsList?.map((ing, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-200">
                      <input
                        type="text"
                        required
                        placeholder="Ingredient Name (e.g. Chicken Breast)"
                        value={ing.name}
                        onChange={(e) => handleUpdateIngredientRow(idx, 'name', e.target.value)}
                        className="flex-1 bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none"
                      />
                      <input
                        type="number"
                        required
                        min="0.1"
                        step="any"
                        placeholder="Qty"
                        value={ing.quantity}
                        onChange={(e) => handleUpdateIngredientRow(idx, 'quantity', Number(e.target.value))}
                        className="w-20 bg-white border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center outline-none"
                      />
                      <select
                        value={ing.unit}
                        onChange={(e) => handleUpdateIngredientRow(idx, 'unit', e.target.value)}
                        className="w-20 bg-white border border-stone-300 rounded-lg px-2 py-1.5 text-xs font-bold outline-none cursor-pointer"
                      >
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="liters">liters</option>
                        <option value="tbsp">tbsp</option>
                        <option value="tsp">tsp</option>
                        <option value="pcs">pcs</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredientRow(idx)}
                        className="p-1 text-stone-400 hover:text-rose-600 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* DYNAMIC PREP METHOD STEPS BUILDER */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    Preparation Method Instructions (Step-by-Step):
                  </label>
                  <button
                    type="button"
                    onClick={handleAddPrepStepRow}
                    className="text-xs font-extrabold text-orange-950 bg-orange-100 hover:bg-orange-200 px-3 py-1 rounded-xl border border-orange-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Step Note</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {formRecipe.prepSteps?.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-stone-400 w-5">{idx + 1}.</span>
                      <input
                        type="text"
                        required
                        placeholder="Describe chef step or notes on preparation method..."
                        value={step}
                        onChange={(e) => handleUpdatePrepStepRow(idx, e.target.value)}
                        className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-medium outline-none focus:ring-1 focus:ring-orange-800"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePrepStepRow(idx)}
                        className="p-1 text-stone-400 hover:text-rose-600 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {recipeFormError && (
                <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{recipeFormError}</p>
              )}

              {/* Submit Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowRecipeModal(false)}
                  disabled={recipeSaving}
                  className="px-4 py-2.5 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold hover:bg-stone-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recipeSaving}
                  className="px-6 py-2.5 bg-orange-950 text-white rounded-xl text-xs font-black hover:bg-stone-900 shadow-md disabled:opacity-60"
                >
                  {recipeSaving ? 'Saving…' : modalMode === 'add' ? 'Save New Menu Item' : 'Save Recipe Updates'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
