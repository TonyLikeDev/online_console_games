"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from "@/lib/room-code";

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = isValidRoomCode(code);
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/play/${code}`);
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
        placeholder="CODE"
        maxLength={ROOM_CODE_LENGTH}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-xl border border-panel-border bg-background px-4 py-3 font-mono text-2xl uppercase tracking-[0.4em] outline-none focus:border-accent"
        aria-label="Room code"
      />
      <button
        type="submit"
        disabled={!valid}
        className="rounded-xl bg-accent px-5 font-bold text-background disabled:opacity-40"
      >
        Go
      </button>
    </form>
  );
}
