import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/helpdesk",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Keep the Windows Webpack build in-process after observed worker EPERM.
    // Nested .next directory creation can still fail intermittently on Windows.
    webpackBuildWorker: process.platform !== "win32",
  },
};

export default nextConfig;
