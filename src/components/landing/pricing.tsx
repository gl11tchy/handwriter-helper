import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "For getting started",
    features: [
      "10 AI messages per day",
      "Basic features",
      "Community support",
    ],
    cta: "Get Started",
    href: "/signup",
  },
  {
    name: "Pro",
    price: "$19",
    description: "For power users",
    features: [
      "1,000 AI messages per day",
      "All features",
      "Priority support",
      "Advanced analytics",
    ],
    cta: "Upgrade to Pro",
    href: "/signup",
    popular: true,
  },
];

export function Pricing() {
  return (
    <section className="container py-24">
      <h2 className="mb-4 text-center text-3xl font-bold">Simple Pricing</h2>
      <p className="mb-12 text-center text-muted-foreground">
        Choose the plan that works for you
      </p>
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.popular ? "border-primary" : ""}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <p className="mt-4 text-4xl font-bold">
                {plan.price}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={plan.popular ? "default" : "outline"}
                asChild
              >
                <Link to={plan.href}>{plan.cta}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
