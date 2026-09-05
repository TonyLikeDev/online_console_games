import type { NextConfig } from "next";
import os from "node:os";

/** Every non-loopback IPv4 address of this machine, so phones on the same network can use the dev server. */
function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

const nextConfig: NextConfig = {
  // In development Next.js refuses its own dev-only endpoints (the live-reload socket and the
  // router's compile pings) for any origin other than localhost. Opened from a phone through the
  // LAN address, the app then hangs on its first client-side navigation. Allow this machine's
  // addresses plus the private ranges, so the dev server works from any device on the network.
  allowedDevOrigins: [...lanAddresses(), "192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;
