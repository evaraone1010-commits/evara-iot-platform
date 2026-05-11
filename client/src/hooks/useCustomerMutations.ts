import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { adminService } from '../services/admin';
import type { Customer } from '../types/entities';

export interface UseCustomerMutationsReturn {
  createCustomer: UseMutationResult<Customer, Error, any, unknown>;
  updateCustomer: UseMutationResult<Customer, Error, { id: string } & Partial<Customer>, unknown>;
  deleteCustomer: UseMutationResult<void, Error, string, unknown>;
}

export const useCustomerMutations = (): UseCustomerMutationsReturn => {
  const queryClient = useQueryClient();

  const createCustomer = useMutation({
    mutationFn: async (customerData: any) => {
      return await adminService.createCustomer(customerData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
      queryClient.invalidateQueries({ queryKey: ['admin_hierarchy'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    },
  });

  const updateCustomer = useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & Partial<Customer>) => {
      return {} as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
      queryClient.invalidateQueries({ queryKey: ['admin_hierarchy'] });
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: async (id: string) => {
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_customers'] });
      queryClient.invalidateQueries({ queryKey: ['admin_hierarchy'] });
    },
  });

  return {
    createCustomer,
    updateCustomer,
    deleteCustomer
  };
};
