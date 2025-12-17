import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  forgetPassword,
  resetPassword,
} = authClient as ReturnType<typeof createAuthClient> & {
  forgetPassword: (opts: { email: string; redirectTo?: string }) => Promise<{ error: { message: string } | null }>;
  resetPassword: (opts: { token: string; newPassword: string }) => Promise<{ error: { message: string } | null }>;
};
