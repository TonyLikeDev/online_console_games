import Link from "next/link";
import { JoinCodeForm } from "@/components/ui/join-code-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="text-center">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-muted">Big screen · phones as controllers</p>
        <h1 className="font-display text-5xl leading-none text-accent sm:text-7xl">Console Games</h1>
        <p className="mt-4 max-w-md text-balance text-muted">
          Open a screen on the TV or laptop, scan the QR code with your phone, race your friends.
        </p>
      </div>

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <Link
          href="/screen/new"
          className="flex flex-col gap-2 rounded-2xl border border-panel-border bg-panel p-6 transition hover:border-accent"
        >
          <span className="text-xs uppercase tracking-widest text-muted">On the TV or laptop</span>
          <span className="text-2xl font-bold">Open a screen</span>
          <span className="text-sm text-muted">Creates a room and shows the QR code.</span>
        </Link>
        <div className="flex flex-col gap-2 rounded-2xl border border-panel-border bg-panel p-6">
          <span className="text-xs uppercase tracking-widest text-muted">On your phone</span>
          <span className="text-2xl font-bold">Join a room</span>
          <JoinCodeForm />
        </div>
      </div>
    </main>
  );
}
