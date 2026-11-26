import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MemberDto } from "@stellwall/shared";
import { ApiError, api } from "./api.ts";

export function useMe() {
  return useQuery<MemberDto | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api<MemberDto>("/api/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useSetupStatus() {
  return useQuery({ queryKey: ["setup"], queryFn: () => api<{ needed: boolean }>("/api/setup/status"), retry: false });
}

export function useSetMe() {
  const qc = useQueryClient();
  return (m: MemberDto | null) => {
    qc.setQueryData(["me"], m);
    if (m) qc.setQueryData(["setup"], { needed: false });
  };
}
