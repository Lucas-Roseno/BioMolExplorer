import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  httpAgentOptions: {
    keepAlive: true,
  },
  serverExternalPackages: [],
};

export default nextConfig;
