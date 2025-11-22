import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EdgeFunctionFlag {
  function_name: string;
  is_enabled: boolean;
}

export const useEdgeFunctionFlags = () => {
  return useQuery({
    queryKey: ["edge-function-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edge_function_flags")
        .select("function_name, is_enabled");

      if (error) throw error;

      // Create a map for easy lookup
      const flagsMap = new Map<string, boolean>();
      data?.forEach((flag) => {
        flagsMap.set(flag.function_name, flag.is_enabled);
      });

      return flagsMap;
    },
    staleTime: 30000, // Cache for 30 seconds
  });
};

export const useIsFunctionEnabled = (functionName: string) => {
  const { data: flags } = useEdgeFunctionFlags();
  return flags?.get(functionName) ?? true; // Default to enabled if not found
};
