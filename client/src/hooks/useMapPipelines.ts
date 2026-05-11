import { useQuery } from "@tanstack/react-query";

export interface MapPipeline {
  id: string;
  name: string;
  positions: [number, number][]; // [[lat, lng], [lat, lng], ...]
  color: string;
  status: string;
}

export const useMapPipelines = () => {
  const {
    data: pipelines = [],
    isLoading,
    error,
    refetch,
  } = useQuery<MapPipeline[]>({
    queryKey: ["map_pipelines"],
    queryFn: async () => {
      // Pipelines functionality is slated for future release
      // Returning empty natively prevents UI crashes
      return [];
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  return {
    pipelines,
    loading: isLoading,
    error:
      error instanceof Error ? error.message : error ? String(error) : null,
    refresh: refetch,
  };
};
