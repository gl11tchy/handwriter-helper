import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubscriptionCard } from "@/components/dashboard/subscription-card";
import { useAuth } from "@/hooks/use-auth";
import { MessageSquare, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-8">
        <h1 className="mb-8 text-3xl font-bold">Dashboard</h1>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Welcome back!</CardTitle>
              <CardDescription>{user?.email}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                You're signed in as {user?.name || user?.email}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <MessageSquare className="h-8 w-8 text-primary" />
              <CardTitle className="mt-2">AI Chat</CardTitle>
              <CardDescription>Chat with our AI assistant</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/dashboard/chat">Open Chat</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Settings className="h-8 w-8 text-primary" />
              <CardTitle className="mt-2">Settings</CardTitle>
              <CardDescription>Manage your account</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild className="w-full">
                <Link to="/dashboard/settings">View Settings</Link>
              </Button>
            </CardContent>
          </Card>

          <SubscriptionCard />
        </div>
      </main>
    </div>
  );
}
