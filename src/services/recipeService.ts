import { ApiClient } from './apiClient';
import { RecipeItem } from '../types';

export interface RecipeQueryParams {
  page?: number;
  limit?: number;
  category?: string;
  dietaryTag?: string;
  dietary?: string;
  cuisine?: string;
  spiceLevel?: string;
  search?: string;
  q?: string;
  minCalories?: number;
  maxCalories?: number;
  minProtein?: number;
  maxProtein?: number;
  isPublished?: boolean;
}

export interface PaginatedRecipeResponse {
  items: RecipeItem[];
  recipes: RecipeItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class RecipeService {
  /**
   * Fetch public published recipes with filtering and pagination
   */
  public static async getPublicRecipes(params: RecipeQueryParams = {}): Promise<PaginatedRecipeResponse> {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.category) query.append('category', params.category);
    if (params.dietaryTag || params.dietary) query.append('dietaryTag', (params.dietaryTag || params.dietary)!);
    if (params.cuisine) query.append('cuisine', params.cuisine);
    if (params.spiceLevel) query.append('spiceLevel', params.spiceLevel);
    if (params.search || params.q) query.append('search', (params.search || params.q)!);
    if (params.minCalories) query.append('minCalories', params.minCalories.toString());
    if (params.maxCalories) query.append('maxCalories', params.maxCalories.toString());
    if (params.minProtein) query.append('minProtein', params.minProtein.toString());
    if (params.maxProtein) query.append('maxProtein', params.maxProtein.toString());

    const queryString = query.toString();
    const endpoint = `/recipes${queryString ? `?${queryString}` : ''}`;
    const response = await ApiClient.request(endpoint);
    
    return {
      items: response.data || [],
      recipes: response.data || [],
      total: response.pagination?.total || (response.data || []).length,
      page: response.pagination?.page || 1,
      limit: response.pagination?.limit || 20,
      totalPages: response.pagination?.totalPages || 1,
    };
  }

  /**
   * Get distinct categories for published recipes
   */
  public static async getCategories(): Promise<Array<{ category: string; count: number }>> {
    const response = await ApiClient.request('/recipes/categories');
    return response.data || [];
  }

  /**
   * Get public recipe by ID or Code
   */
  public static async getRecipeById(idOrCode: string): Promise<RecipeItem> {
    const response = await ApiClient.request(`/recipes/${idOrCode}`);
    return response.data;
  }

  /**
   * Fetch staff recipe catalog (Requires auth token)
   */
  public static async getStaffRecipes(params: RecipeQueryParams = {}): Promise<PaginatedRecipeResponse> {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.category) query.append('category', params.category);
    if (params.dietaryTag) query.append('dietaryTag', params.dietaryTag);
    if (params.search) query.append('search', params.search);
    if (params.isPublished !== undefined) query.append('isPublished', params.isPublished.toString());

    const queryString = query.toString();
    const response = await ApiClient.request(`/recipes/staff/all${queryString ? `?${queryString}` : ''}`);

    return {
      items: response.data || [],
      recipes: response.data || [],
      total: response.pagination?.total || (response.data || []).length,
      page: response.pagination?.page || 1,
      limit: response.pagination?.limit || 20,
      totalPages: response.pagination?.totalPages || 1,
    };
  }

  /**
   * Staff recipe creation (CHEF -> Draft, SUPER_ADMIN -> Published/Draft)
   */
  public static async createRecipe(recipeData: Partial<RecipeItem>): Promise<RecipeItem> {
    const response = await ApiClient.request('/recipes', {
      method: 'POST',
      body: JSON.stringify(recipeData),
    });
    return response.data;
  }

  /**
   * Staff recipe edit
   */
  public static async updateRecipe(id: string, recipeData: Partial<RecipeItem>): Promise<RecipeItem> {
    const response = await ApiClient.request(`/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(recipeData),
    });
    return response.data;
  }

  /**
   * SUPER_ADMIN toggle recipe publish status
   */
  public static async publishRecipe(id: string, isPublished: boolean): Promise<RecipeItem> {
    const response = await ApiClient.request(`/recipes/${id}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublished }),
    });
    return response.data;
  }
}
