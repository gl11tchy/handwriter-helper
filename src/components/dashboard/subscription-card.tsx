import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/hooks/use-subscription";
import { Zap, Check } from "lucide-react";

export function SubscriptionCard() {
  const { subscription, usage, isPro, upgrade, manage, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>Loading...</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Subscription</CardTitle>
          <Badge variant={isPro ? "default" : "secondary"}>
            {isPro ? "Pro" : "Free"}
          </Badge>
        </div>
        <CardDescription>
          {isPro ? "You have full access to all features" : "Upgrade to unlock more features"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Messages today: {usage?.messagesUsedToday || 0} / {isPro ? "1,000" : "10"}
          </p>
          <div className="h-2 w-full rounded-full bg-secondary">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{
                width: `${Math.min(((usage?.messagesUsedToday || 0) / (isPro ? 1000 : 10)) * 100, 100)}%`,
              }}
            />
          </div>
        </div>

        {isPro ? (
          <div className="space-y-2">
            {subscription?.cancelAtPeriodEnd && (
              <p className="text-sm text-muted-foreground">
                Cancels at end of period
              </p>
            )}
            <Button variant="outline" onClick={manage}>
              Manage Subscription
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                1,000 messages per day
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                Priority support
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                Advanced features
              </li>
            </ul>
            <Button onClick={upgrade} className="w-full">
              <Zap className="mr-2 h-4 w-4" />
              Upgrade to Pro
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
