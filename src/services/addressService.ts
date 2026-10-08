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

/** Customer-owned delivery addresses (/customers/me/addresses). All methods throw ApiRequestError on failure. */
export class AddressService {
  public static async getAddresses(): Promise<CustomerAddressItem[]> {
    return (await ApiClient.requestData<CustomerAddressItem[]>('/customers/me/addresses')) || [];
  }

  public static async createAddress(data: CreateAddressDto): Promise<CustomerAddressItem> {
    return await ApiClient.requestData<CustomerAddressItem>('/customers/me/addresses', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public static async updateAddress(addressId: string, data: Partial<CreateAddressDto>): Promise<CustomerAddressItem> {
    return await ApiClient.requestData<CustomerAddressItem>(`/customers/me/addresses/${addressId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  public static async deleteAddress(addressId: string): Promise<void> {
    await ApiClient.requestData<unknown>(`/customers/me/addresses/${addressId}`, {
      method: 'DELETE'
    });
  }
}
