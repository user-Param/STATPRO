'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../lib/api-client';

interface User {
  id: string;
  username: string;
  email: string;
  // Add other profile fields as needed from backend/src/schema.ts
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = (newToken: string, newUser: User) => {
    const trimmedToken = newToken.trim();
    localStorage.setItem('token', trimmedToken);
    setToken(trimmedToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const checkAuth = async () => {
    setIsLoading(true);
    const storedToken = localStorage.getItem('token')?.trim() ?? null;
    if (storedToken) {
      setToken(storedToken);
      try {
        const userData = await apiRequest<User>('/profile');
        setUser(userData);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        // Only logout on actual authentication errors (401)
        if (message === 'Unauthorized') {
          console.error('Auth check failed: Unauthorized', error);
          logout();
        } else {
          // For other errors (like 404 profile not found, network errors, etc),
          // keep the token but clear user data so we can retry later
          console.error('Auth check failed: Non-auth error', error);
          setUser(null);
        }
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, login, logout, checkAuth, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
