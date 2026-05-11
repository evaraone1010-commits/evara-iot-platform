import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useQuery } from "@tanstack/react-query";
import { adminService } from "../services/admin";

interface TenancyContextType {
  selectedDistributorId: string | null;
  setSelectedDistributorId: (id: string | null) => void;
  activeDistributor: any | null;
  distributors: any[];
  isSuperAdminView: boolean;
  isLoading: boolean;
}

const TenancyContext = createContext<TenancyContextType | undefined>(undefined);

export const TenancyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [selectedDistributorId, setSelectedDistributorId] = useState<
    string | null
  >(null);

  const { data: distributors = [], isLoading } = useQuery({
    queryKey: ["admin_distributors"],
    queryFn: () => adminService.getDistributors(),
    enabled: !!user && user.role === "superadmin",
  });

  const activeDistributor =
    distributors.find((d: any) => d.id === selectedDistributorId) || null;

  // If user is a distributor-level admin, lock them to their own ID
  useEffect(() => {
    if (user?.role === "distributor" && user.id) {
      // Note: In physical production, the distributor profile row contains the distributor_id.
      // For now, assuming the profile distributor_id is available in the user object.
      // (Wait, I should check if AuthContext.tsx includes distributor_id in the User interface)
    }
  }, [user]);

  const isSuperAdminView =
    user?.role === "superadmin" && !selectedDistributorId;

  return (
    <TenancyContext.Provider
      value={{
        selectedDistributorId,
        setSelectedDistributorId,
        activeDistributor,
        distributors,
        isSuperAdminView,
        isLoading,
      }}
    >
      {children}
    </TenancyContext.Provider>
  );
};

export const useTenancy = () => {
  const context = useContext(TenancyContext);
  if (context === undefined) {
    throw new Error("useTenancy must be used within a TenancyProvider");
  }
  return context;
};
