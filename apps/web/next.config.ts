import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.join(__dirname, "../..");
const isProd = process.env.NODE_ENV === "production";

function apiUploadPatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const patterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
    ...(isProd
      ? []
      : [
          {
            protocol: "http" as const,
            hostname: "localhost",
            port: "4000",
            pathname: "/api/v1/**",
          },
        ]),
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
      if (isProd) {
        throw new Error("NEXT_PUBLIC_API_BASE_URL is not a valid URL/path.");
      }
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

const apiProxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/$/, "");
const publicApiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "/api/v1";
const usesSameOriginProxy = publicApiBase.startsWith("/");

if (isProd && usesSameOriginProxy && !apiProxyTarget) {
  throw new Error(
    "API_PROXY_TARGET is required in production when NEXT_PUBLIC_API_BASE_URL is relative (recommended: /api/v1).",
  );
}

if (apiProxyTarget) {
  let parsed: URL;
  try {
    parsed = new URL(apiProxyTarget);
  } catch {
    throw new Error("API_PROXY_TARGET must be an absolute http(s) URL.");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("API_PROXY_TARGET must use http or https.");
  }
  if (
    isProd &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  ) {
    throw new Error("API_PROXY_TARGET must not point to localhost in production.");
  }
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  images: {
    remotePatterns: apiUploadPatterns(),
  },
  async redirects() {
    if (!isProd) return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "gospots.eu" }],
        destination: "https://www.gospots.eu/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "gospots.pl" }],
        destination: "https://www.gospots.pl/:path*",
        permanent: true,
      },
    ];
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
