import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

export interface CustomerCreate {
    email: string;
    display_name: string;
    password: string;
    community_id: string;
    role?: string; // Default: "user"
}

export interface User {
    id: string;
    email: string;
    display_name: string;
    role: string;
    created_at: string;
}

/**
 * Hook to create a new customer with Supabase authentication
 * Requires authentication (superadmin only)
 * Endpoint: POST /api/v1/customers
 */
export const useCreateCustomer = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (customerData: CustomerCreate) => {
            try {
                const response = await api.post<User>('/customers', customerData);
                return response.data;
            } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
                console.error('[useCreateCustomer] Failed to create customer:', error);
                throw error;
            }
        },
        onSuccess: () => {
            // Invalidate any user-related queries
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });
};
