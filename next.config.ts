import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/helpdesk",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Limit build workers for resource-constrained CloudLinux hosting.
    cpus: 1,
    // Also render pages serially within the static-generation worker.
    staticGenerationMaxConcurrency: 1,
    // Keep the Windows Webpack build in-process after observed worker EPERM.
    // Nested .next directory creation can still fail intermittently on Windows.
    webpackBuildWorker: process.platform !== "win32",
  },
};

export default nextConfig;
