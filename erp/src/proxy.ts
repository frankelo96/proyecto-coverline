import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/constants";

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
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
