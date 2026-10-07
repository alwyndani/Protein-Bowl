import { ApiClient } from './apiClient';

export interface CustomerAddressItem {
  id: string;
  customerProfileId: string;
  title: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
  isActive: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CreateAddressDto {
  title?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  isDefault?: boolean;
}

export class AddressService {
  public static async getAddresses(): Promise<CustomerAddressItem[]> {
    const response = await ApiClient.request('/customers/me/addresses');
    return response.data || [];
  }

  public static async createAddress(data: CreateAddressDto): Promise<CustomerAddressItem> {
    const response = await ApiClient.request('/customers/me/addresses', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return response.data;
  }

  public static async updateAddress(addressId: string, data: Partial<CreateAddressDto>): Promise<CustomerAddressItem> {
    const response = await ApiClient.request(`/customers/me/addresses/${addressId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return response.data;
  }

  public static async deleteAddress(addressId: string): Promise<{ success: boolean; message: string }> {
    const response = await ApiClient.request(`/customers/me/addresses/${addressId}`, {
      method: 'DELETE'
    });
    return response.data;
  }
}
