import { ApiClient } from './apiClient';

export class ProductService {
  public static async getCategories() {
    const response = await ApiClient.request('/products/categories');
    return response.data || [];
  }

  public static async getProducts(categoryId?: string, isFMCG?: boolean, isTepache?: boolean) {
    const params = new URLSearchParams();
    if (categoryId) params.append('categoryId', categoryId);
    if (isFMCG !== undefined) params.append('isFMCG', String(isFMCG));
    if (isTepache !== undefined) params.append('isTepache', String(isTepache));

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await ApiClient.request(`/products${queryString}`);
    return response.data || [];
  }

  public static async getProductBySlug(slug: string) {
    const response = await ApiClient.request(`/products/${slug}`);
    return response.data;
  }
}
