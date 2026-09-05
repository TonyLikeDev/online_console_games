"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { generateRoomCode } from "@/lib/room-code";

export default function NewScreenPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/screen/${generateRoomCode()}`);
  }, [router]);
  return <main className="flex flex-1 items-center justify-center text-muted">Opening a room…</main>;
}
