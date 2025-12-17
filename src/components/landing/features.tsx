import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, CreditCard, Bot, Mail } from "lucide-react";

const features = [
  {
    icon: Lock,
    title: "Authentication",
    description: "Secure login with email/password and OAuth providers like GitHub and Google.",
  },
  {
    icon: CreditCard,
    title: "Payments",
    description: "Stripe integration for subscriptions and billing management.",
  },
  {
    icon: Bot,
    title: "AI Chat",
    description: "Built-in AI chat powered by Claude with streaming responses.",
  },
  {
    icon: Mail,
    title: "Email",
    description: "Transactional emails via Resend for notifications and password resets.",
  },
];

export function Features() {
  return (
    <section className="container py-24">
      <h2 className="mb-12 text-center text-3xl font-bold">Everything You Need</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <feature.icon className="h-10 w-10 text-primary" />
              <CardTitle className="mt-4">{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{feature.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
