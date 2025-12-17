import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useSubscription() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["user"],
    queryFn: api.getUser,
    staleTime: 1000 * 60,
  });
  const [actionError, setActionError] = useState<string | null>(null);

  const upgrade = async () => {
    try {
      setActionError(null);
      const { url } = await api.createCheckoutSession();
      window.location.href = url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to start checkout");
    }
  };

  const manage = async () => {
    try {
      setActionError(null);
      const { url } = await api.createPortalSession();
      window.location.href = url;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to open billing portal");
    }
  };

  return {
    subscription: data?.subscription,
    usage: data?.usage,
    isLoading,
    error: error || actionError,
    refetch,
    upgrade,
    manage,
    isPro: data?.subscription?.plan === "pro" && (
      data?.subscription?.status === "active" ||
      ((data?.subscription?.status === "canceled" || data?.subscription?.status === "past_due") &&
        data?.subscription?.currentPeriodEnd != null &&
        data.subscription.currentPeriodEnd > Math.floor(Date.now() / 1000))
    ),
  };
}
