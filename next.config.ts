import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MCP route streams responses; keep it on the Node.js runtime.
  serverExternalPackages: ["@neondatabase/serverless"],
};

export default nextConfig;
