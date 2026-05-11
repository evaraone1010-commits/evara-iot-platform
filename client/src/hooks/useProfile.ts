import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { adminService } from "../services/admin";

export const useProfile = () => {
  const { user } = useAuth();

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return await adminService.getCustomer(user.id);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 15, // Cache profile for 15 mins
  });

  return {
    profile,
    loading: isLoading,
    error,
  };
};
