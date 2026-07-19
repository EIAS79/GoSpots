import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.join(__dirname, "../..");

function apiUploadPatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const patterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
    {
      protocol: "http",
      hostname: "localhost",
      port: "4000",
      pathname: "/api/v1/**",
    },
    {
      protocol: "https",
      hostname: "images.unsplash.com",
      pathname: "/**",
    },
  ];

  const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/api\/v1\/?$/, "");
  if (publicBase && publicBase.startsWith("http")) {
    try {
      const u = new URL(publicBase);
      patterns.push({
        protocol: u.protocol.replace(":", "") as "http" | "https",
        hostname: u.hostname,
        port: u.port || undefined,
        pathname: "/api/v1/**",
      });
    } catch {
      /* ignore */
    }
  }

  if (process.env.VERCEL_URL) {
    patterns.push({
      protocol: "https",
      hostname: process.env.VERCEL_URL,
      pathname: "/api/v1/**",
    });
  }

  return patterns;
}

const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  images: {
    remotePatterns: apiUploadPatterns(),
  },
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiProxyTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
