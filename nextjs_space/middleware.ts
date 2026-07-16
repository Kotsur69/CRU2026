export { default } from "next-auth/middleware";

// Chroni wszystkie trasy poza logowaniem, API auth i zasobami statycznymi.
export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|fonts|favicon.ico).*)"],
};
