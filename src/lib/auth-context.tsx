"use client";

import { createContext, useContext, ReactNode } from "react";
import type { getAuthInstance } from "./auth-dynamic";

type AuthInstance = Awaited<ReturnType<typeof getAuthInstance>>;

const AuthContext = createContext<AuthInstance | null>(null);

export function AuthProvider({
  children,
  authInstance,
}: {
  children: ReactNode;
  authInstance: AuthInstance;
}) {
  return (
    <AuthContext.Provider value={authInstance}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
