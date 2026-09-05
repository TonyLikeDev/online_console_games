"use client";

import { useState } from "react";
import { loadPlayerName } from "@/lib/client-id";
import { NAME_MAX_LENGTH, sanitizeName } from "@/lib/protocol";

export function JoinForm({ code, onJoin }: { code: string; onJoin: (name: string) => void }) {
  // Only rendered after the client connects, so localStorage is available.
  const [name, setName] = useState(() => loadPlayerName());
  const clean = sanitizeName(name);
  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) onJoin(clean);
      }}
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted">Your name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX_LENGTH}
          autoComplete="nickname"
          autoFocus
          enterKeyHint="go"
          className="rounded-xl border border-panel-border bg-panel px-4 py-4 text-2xl outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={!clean}
        className="rounded-xl bg-accent px-5 py-4 text-xl font-bold text-background disabled:opacity-40"
      >
        Join room {code}
      </button>
    </form>
  );
}
