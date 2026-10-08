import { ApiClient } from './apiClient';
import type { ApiProduct, ApiProductCategory } from './commerceTypes';

/** Public storefront catalog. All methods throw ApiRequestError on failure (no silent mock fallback). */
export class ProductService {
  public static async getCategories(): Promise<ApiProductCategory[]> {
    return (await ApiClient.requestData<ApiProductCategory[]>('/products/categories')) || [];
  }

  public static async getProducts(categoryId?: string, isFMCG?: boolean, isTepache?: boolean): Promise<ApiProduct[]> {
    const params = new URLSearchParams();
    if (categoryId) params.append('categoryId', categoryId);
    if (isFMCG !== undefined) params.append('isFMCG', String(isFMCG));
    if (isTepache !== undefined) params.append('isTepache', String(isTepache));

    const queryString = params.toString() ? `?${params.toString()}` : '';
    return (await ApiClient.requestData<ApiProduct[]>(`/products${queryString}`)) || [];
  }

  public static async getProductBySlug(slug: string): Promise<ApiProduct> {
    return await ApiClient.requestData<ApiProduct>(`/products/${slug}`);
  }
}
