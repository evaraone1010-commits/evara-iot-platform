import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deviceService } from "../services/DeviceService";
import { useAuth } from "../context/AuthContext";
import { socket } from "../services/api";

const getNodeIdentity = (node: any) =>
  node?.hardwareId || node?.node_key || node?.id || node?.firestore_id || node?.uid || null;

const dedupeNodes = (nodes: any[]) => {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const identity = getNodeIdentity(node);
    if (!identity) return true;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

export const useNodes = (searchQuery: string = "") => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Unified real-time socket listener
  useEffect(() => {
    const handleUpdate = (data: any) => {
      const deviceId = data.device_id || data.node_id;
      if (!deviceId) return;

      // Invalidate all node-related queries to trigger a fresh fetch from cache/API
      // This ensures all UI components using useNodes stay perfectly in sync
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
    };

    socket.on("telemetry_update", handleUpdate);
    socket.on("node_update", handleUpdate);

    return () => {
      socket.off("telemetry_update", handleUpdate);
      socket.off("node_update", handleUpdate);
    };
  }, [queryClient]);

  const {
    data: nodes = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["nodes", searchQuery, user?.id, user?.role],
    queryFn: async () => {
      const isSuperAdmin = user?.role === "superadmin";
      const mappedNodes = await deviceService.getMapNodes(
        undefined,
        isSuperAdmin ? undefined : user?.customer_id,
      );

      const uniqueNodes = dedupeNodes(mappedNodes);

      if (!searchQuery) return uniqueNodes;

      const searchLower = searchQuery.toLowerCase();
      return uniqueNodes.filter(
        (n: any) =>
          (n.displayName || "").toLowerCase().includes(searchLower) ||
          (n.hardwareId || "").toLowerCase().includes(searchLower) ||
          (n.label || "").toLowerCase().includes(searchLower) ||
          (n.id || "").toLowerCase().includes(searchLower),
      );
    },
    refetchInterval: 12000, // Balanced: fetch every 12 seconds (not too aggressive)
    staleTime: 5000, // Data becomes stale after 5 seconds
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });

  return {
    nodes,
    loading: isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refresh: refetch,
  };
};
