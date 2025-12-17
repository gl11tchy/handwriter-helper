import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="container flex flex-col items-center gap-8 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        Welcome to Handwriter Helper
      </h1>
      <p className="max-w-2xl text-lg text-muted-foreground">
        Your app is ready with authentication, payments, AI chat, and email built in.
        Start building your product today.
      </p>
      <div className="flex gap-4">
        <Button size="lg" asChild>
          <Link to="/signup">
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/login">Sign In</Link>
        </Button>
      </div>
    </section>
  );
}
