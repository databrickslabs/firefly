import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.BUILD_DIR || ".next",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
