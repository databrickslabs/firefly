import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.BUILD_DIR || ".next",
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    "/api/sso-spn/authoring-tools/*": ["./databricks-apps/**/*"],
  },
  async headers() {
    return [
      {
        // Apply COOP/COEP headers to notebooks page for SharedArrayBuffer support
        source: "/databricks-idp/notebooks",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
        ],
      },
      {
        // Apply these headers to ALL JupyterLite files (including nested paths)
        source: "/jupyterlite/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, HEAD, OPTIONS",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
