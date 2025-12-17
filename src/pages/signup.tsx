import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create an account</CardTitle>
          <CardDescription>Get started with Handwriter Helper</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm onSuccess={() => navigate("/dashboard")} />
        </CardContent>
      </Card>
    </div>
  );
}
