import type { MetadataRoute } from "next";

/** Permite instalar el sistema como app en la tablet o el celular (Agregar a pantalla de inicio). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coverline ERP",
    short_name: "Coverline",
    description: "Sistema de gestión de Coverline Uniformes",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F2ED",
    theme_color: "#17202B",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
