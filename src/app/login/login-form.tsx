"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { password } });
      // Full navigation so the app shell renders with the new session.
      window.location.assign(nextPath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t sign in. Please try again.");
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
        {error && (
          <p id="login-error" role="alert" className="text-meta text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending || !password} className="h-10">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}
