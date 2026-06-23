import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import type { NextRequest } from "next/server";

const middleware = createMiddleware(routing);

export function proxy(request: NextRequest) {
  // Captura la petición y redirige a /[locale]/ruta
  return middleware(request);
}

export const config = {
  // Aplica el proxy a todas las rutas excepto estáticos, APIs o imágenes
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
