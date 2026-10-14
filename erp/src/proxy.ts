import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/constants";

/**
 * Chequeo optimista: solo verifica que exista la cookie de sesión. La
 * validación real (token en base, vencimiento, usuario activo, permisos) la
 * hacen las páginas y Server Actions con requirePageUser / requireActionUser.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  // Extiende la cookie en cada navegación (la base renueva la sesión en getCurrentUser).
  // Solo en GET: los POST (Server Actions, ej. cerrar sesión) manejan su propia cookie.
  const response = NextResponse.next();
  if (request.method !== "GET") return response;
  response.cookies.set(SESSION_COOKIE, request.cookies.get(SESSION_COOKIE)!.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
