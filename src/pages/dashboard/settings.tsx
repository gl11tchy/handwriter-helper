import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubscriptionCard } from "@/components/dashboard/subscription-card";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { refetch } = useSubscription();
  const [searchParams] = useSearchParams();
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);

  useEffect(() => {
    const status = searchParams.get("checkout");
    if (status) {
      setCheckoutStatus(status);
      // Refetch subscription data on successful checkout
      if (status === "success") {
        refetch();
      }
      const timer = setTimeout(() => setCheckoutStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, refetch]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <h1 className="mb-8 text-3xl font-bold">Settings</h1>

        {checkoutStatus === "success" && (
          <div className="mb-6 rounded-lg bg-green-500/10 p-4 text-green-600">
            Successfully subscribed to Pro! Welcome aboard.
          </div>
        )}

        {checkoutStatus === "cancelled" && (
          <div className="mb-6 rounded-lg bg-yellow-500/10 p-4 text-yellow-600">
            Checkout was cancelled. You can try again anytime.
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your account information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" defaultValue={user?.name || ""} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" defaultValue={user?.email || ""} disabled />
              </div>
              <Button disabled>Update Profile (Coming Soon)</Button>
            </CardContent>
          </Card>

          <SubscriptionCard />
        </div>
      </main>
    </div>
  );
}
