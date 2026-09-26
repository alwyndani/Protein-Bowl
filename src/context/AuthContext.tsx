import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthService, LoginParams, RegisterParams } from '../services/authService';
import { ApiClient } from '../services/apiClient';
import { UserRole } from '../types';

export function mapBackendRoleToUserRole(backendRoles?: string[]): UserRole {
  if (!backendRoles || backendRoles.length === 0) return 'customer';

  const roleMap: Record<string, UserRole> = {
    CUSTOMER: 'customer',
    MESS_CUSTOMER: 'mess_customer',
    MD: 'md',
    CHEF: 'chef',
    NUTRITIONIST: 'nutritionist',
    TRAINER: 'trainer',
    PROCUREMENT: 'procurement',
    DELIVERY: 'delivery',
    POS: 'pos',
    BAKERY_FMCG: 'bakery_fmcg',
    TEPACHE_ERP: 'tepache_erp',
    SWIGGY_ZOMATO: 'swiggy_zomato',
    SUPER_ADMIN: 'md'
  };

  for (const role of backendRoles) {
    if (roleMap[role]) {
      return roleMap[role];
    }
  }

  return 'customer';
}

export interface BackendUser {
  id: string;
  email: string;
  phone?: string | null;
  status: string;
  roles: string[];
  customerProfile?: {
    id: string;
    fullName: string;
    referralCode: string;
    referredByCode?: string | null;
    walletBalance: number;
    deliveryAddress?: string | null;
  } | null;
  employeeProfile?: {
    id: string;
    employeeCode: string;
    fullName: string;
    designation: string;
    assignedBranchId?: string | null;
    isOnline: boolean;
  } | null;
  createdAt: string;
}

interface AuthContextType {
  user: BackendUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (params: LoginParams) => Promise<{ success: boolean; message?: string; roles?: string[] }>;
  register: (params: RegisterParams) => Promise<{ success: boolean; message?: string; roles?: string[] }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<BackendUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const refreshSession = async (): Promise<boolean> => {
    try {
      const res = await AuthService.refresh();
      if (res.success && res.data?.accessToken) {
        ApiClient.setAccessToken(res.data.accessToken);
        const meRes = await AuthService.getMe();
        if (meRes.success && meRes.data?.user) {
          setUser(meRes.data.user);
          setIsAuthenticated(true);
          return true;
        }
      }
    } catch (_err) {
      // Session restoration failed gracefully
    }
    setUser(null);
    setIsAuthenticated(false);
    ApiClient.setAccessToken(null);
    return false;
  };

  useEffect(() => {
    let isMounted = true;
    const restore = async () => {
      await refreshSession();
      if (isMounted) {
        setIsLoading(false);
      }
    };
    restore();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (params: LoginParams) => {
    setError(null);
    const res = await AuthService.login(params);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      setIsAuthenticated(true);
      return { success: true, roles: res.data.user.roles };
    } else {
      const errMsg = res.message || 'Login failed. Please check your credentials.';
      setError(errMsg);
      return { success: false, message: errMsg };
    }
  };

  const register = async (params: RegisterParams) => {
    setError(null);
    const res = await AuthService.register(params);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      setIsAuthenticated(true);
      return { success: true, roles: res.data.user.roles };
    } else {
      const errMsg = res.message || 'Registration failed. Please check your inputs.';
      setError(errMsg);
      return { success: false, message: errMsg };
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
    } catch (_err) {
      // Ignore network errors on logout
    }
    setUser(null);
    setIsAuthenticated(false);
    ApiClient.setAccessToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        error,
        login,
        register,
        logout,
        refreshSession,
        clearError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
