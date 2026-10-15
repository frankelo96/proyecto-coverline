import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma 7 + driver adapter se ejecutan solo en el servidor.
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },
  poweredByHeader: false,
  // Cabeceras de seguridad: nada de incrustar el sistema en otra página, ni adivinar tipos de archivo.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
