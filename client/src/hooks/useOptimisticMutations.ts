import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { adminService } from '../services/admin';

export interface OptimisticDeviceMutationsReturn {
  createDevice: UseMutationResult<any, Error, any, any>;
  updateDevice: UseMutationResult<any, Error, { id: string } & any, any>;
  deleteDevice: UseMutationResult<void, Error, string, any>;
}

export const useOptimisticDeviceMutations = (): OptimisticDeviceMutationsReturn => {
  const queryClient = useQueryClient();

  const createDevice = useMutation({
    mutationFn: async (deviceData: any) => {
      return await adminService.createDevice(deviceData);
    },
    onMutate: async (newDevice) => {
      await queryClient.cancelQueries({ queryKey: ['unified_devices'] });
      const previousDevices = queryClient.getQueryData<any[]>(['unified_devices']);

      const optimisticDevice = {
        ...newDevice,
        id: `temp-${Date.now()}`,
        created_at: new Date().toISOString()
      };

      queryClient.setQueryData<any[]>(['unified_devices'], old =>
        old ? [...old, optimisticDevice] : [optimisticDevice]
      );

      return { previousDevices };
    },
    onError: (err, newDevice, context) => {
      if (context?.previousDevices) {
        queryClient.setQueryData(['unified_devices'], context.previousDevices);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['unified_devices'] });
    }
  });

  const updateDevice = useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & any) => {
      // Assuming backend patch endpoint
      return {} as any;
    },
    onMutate: async ({ id, ...updateData }) => {
      await queryClient.cancelQueries({ queryKey: ['unified_devices'] });
      const previousDevices = queryClient.getQueryData<any[]>(['unified_devices']);

      queryClient.setQueryData<any[]>(['unified_devices'], old =>
        old?.map(d => d.id === id ? { ...d, ...updateData } : d)
      );

      return { previousDevices };
    },
    onError: (err, variables, context) => {
      if (context?.previousDevices) {
        queryClient.setQueryData(['unified_devices'], context.previousDevices);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['unified_devices'] });
    }
  });

  const deleteDevice = useMutation({
    mutationFn: async (id: string) => {
      // await adminService.deleteDevice(id);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['unified_devices'] });
      const previousDevices = queryClient.getQueryData<any[]>(['unified_devices']);

      queryClient.setQueryData<any[]>(['unified_devices'], old =>
        old?.filter(d => d.id !== id)
      );

      return { previousDevices };
    },
    onError: (err, id, context) => {
      if (context?.previousDevices) {
        queryClient.setQueryData(['unified_devices'], context.previousDevices);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['unified_devices'] });
    }
  });

  return {
    createDevice,
    updateDevice,
    deleteDevice
  };
};
