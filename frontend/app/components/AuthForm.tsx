'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { inputClass, submitButtonClass, errorBannerClass } from '@/lib/styles';

interface AuthFormProps {
  mode: 'signin' | 'signup';
}

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const isSignup = mode === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isSignup ? '/signup' : '/signin';
      const payload = isSignup
        ? { email, password, username }
        : { email, password };

      const data = await apiRequest<{ token: string; user: { id: string; username: string; email: string } }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!data.token || typeof data.token !== 'string' || data.token.trim() === '') {
        setError('Invalid token received from server');
        setLoading(false);
        return;
      }

      login(data.token, data.user);
      router.push('/spot');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || (isSignup ? 'An error occurred during signup' : 'Invalid email or password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="w-full max-w-md p-8 space-y-6 bg-zinc-900 rounded-xl border border-zinc-800 shadow-xl">
        <h1 className="text-3xl font-bold text-center text-white">
          {isSignup ? 'Create Account' : 'Welcome Back'}
        </h1>
        <p className="text-center text-zinc-400">
          {isSignup ? 'Join Statpro and start trading' : 'Enter your credentials to access your account'}
        </p>

        {error && (
          <div className={errorBannerClass}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClass}
              placeholder="name@example.com"
            />
          </div>

          {isSignup && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className={inputClass}
                placeholder="Choose a username"
              />
            </div>
          )}

          <div>
            {!isSignup ? (
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-zinc-300 mb-1">Password</label>
                <a href="/forgot-password" className="text-xs text-blue-400 hover:underline">Forgot?</a>
              </div>
            ) : (
              <label className="block text-sm font-medium text-zinc-300 mb-1">Password</label>
            )}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={submitButtonClass}
          >
            {loading
              ? (isSignup ? 'Creating account...' : 'Signing in...')
              : (isSignup ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div className="text-center text-sm text-zinc-500">
          {isSignup ? (
            <>Already have an account?{' '}<a href="/signin" className="text-blue-400 hover:text-blue-300 transition-colors">Sign In</a></>
          ) : (
            <>Don&apos;t have an account?{' '}<a href="/signup" className="text-blue-400 hover:text-blue-300 transition-colors">Sign Up</a></>
          )}
        </div>
      </div>
    </div>
  );
}
