import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { adminService } from '../services/admin';

export interface UseDeviceMutationsReturn {
  createDevice: UseMutationResult<any, Error, any, unknown>;
  updateDevice: UseMutationResult<any, Error, { id: string } & Partial<any>, unknown>;
  deleteDevice: UseMutationResult<void, Error, string, unknown>;
}

export const useDeviceMutations = (): UseDeviceMutationsReturn => {
  const queryClient = useQueryClient();

  const createDevice = useMutation({
    mutationFn: async (deviceData: any) => {
      const data = await adminService.createDevice(deviceData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      queryClient.invalidateQueries({ queryKey: ['unified_devices'] });
    },
  });

  const updateDevice = useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & Partial<any>) => {
      // Assuming a generic update endpoint or direct firestore via service
      // For now, if no specific endpoint, we'll need to add it or use firestore
      // Let's assume we have or will have a patch endpoint
      // For now, let's keep it simple
      return {} as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      queryClient.invalidateQueries({ queryKey: ['unified_devices'] });
    },
  });

  const deleteDevice = useMutation({
    mutationFn: async (id: string) => {
      // await adminService.deleteDevice(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      queryClient.invalidateQueries({ queryKey: ['unified_devices'] });
    },
  });

  return {
    createDevice,
    updateDevice,
    deleteDevice
  };
};
