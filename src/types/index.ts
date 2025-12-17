export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
}

export interface Subscription {
  plan: "free" | "pro";
  status: "active" | "inactive" | "canceled" | "past_due";
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface UserData {
  user: User;
  subscription: Subscription;
  usage: {
    messagesUsedToday: number;
    tokensUsedToday: number;
  };
}
