import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma 7 + driver adapter se ejecutan solo en el servidor.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
