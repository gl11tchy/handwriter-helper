import { useSession, signIn, signUp, signOut, forgetPassword, resetPassword } from "@/lib/auth-client";
import type { User } from "@/types";

export function useAuth() {
  const { data: session, isPending: isLoading, error } = useSession();

  const user = session?.user as User | undefined;

  const login = async (email: string, password: string) => {
    const result = await signIn.email({ email, password });
    if (result.error) {
      throw new Error(result.error.message || "Login failed");
    }
    return result.data;
  };

  const loginWithGitHub = async () => {
    await signIn.social({ provider: "github", callbackURL: "/dashboard" });
  };

  const loginWithGoogle = async () => {
    await signIn.social({ provider: "google", callbackURL: "/dashboard" });
  };

  const register = async (email: string, password: string, name?: string) => {
    const result = await signUp.email({ email, password, name: name || "" });
    if (result.error) {
      throw new Error(result.error.message || "Registration failed");
    }
    return result.data;
  };

  const logout = async () => {
    await signOut();
  };

  const requestPasswordReset = async (email: string) => {
    const result = await forgetPassword({ email, redirectTo: "/reset-password" });
    if (result.error) {
      throw new Error(result.error.message || "Failed to send reset email");
    }
  };

  const performPasswordReset = async (token: string, newPassword: string) => {
    const result = await resetPassword({ token, newPassword });
    if (result.error) {
      throw new Error(result.error.message || "Failed to reset password");
    }
  };

  return {
    user,
    isLoading,
    error,
    login,
    loginWithGitHub,
    loginWithGoogle,
    register,
    logout,
    requestPasswordReset,
    performPasswordReset,
    isAuthenticated: !!user,
  };
}
