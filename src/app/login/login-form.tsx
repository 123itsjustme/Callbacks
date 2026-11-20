"use client";

import { useActionState, useState } from "react";
import { authAction, type AuthState } from "./actions";
import { Button, Input, Label } from "@/components/ui";
import { cn } from "@/lib/utils";

export function LoginForm({ next, initialMode }: { next: string; initialMode: "signin" | "signup" }) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [state, action, pending] = useActionState<AuthState, FormData>(authAction, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 rounded-full border border-line bg-paper p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setMode(m)}
            className={cn("rounded-full py-1.5 transition", mode === m ? "bg-surface font-medium shadow-sm" : "text-muted")}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} />
      </div>
      {state.error && <p className="text-sm text-warn">{state.error}</p>}
      {state.message && <p className="rounded-lg bg-accent-soft p-3 text-sm text-accent">{state.message}</p>}
      <Button className="w-full" name="intent" value={mode} disabled={pending}>
        {pending ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
      </Button>
      <div className="relative py-1 text-center text-xs text-muted">
        <span className="bg-surface px-2">or</span>
        <div className="absolute inset-x-0 top-1/2 -z-0 h-px bg-line" style={{ zIndex: -1 }} />
      </div>
      <Button className="w-full" variant="secondary" name="intent" value="magic" disabled={pending} formNoValidate>
        Email me a magic link
      </Button>
    </form>
  );
}
