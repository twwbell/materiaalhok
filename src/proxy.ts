import { NextResponse, type NextRequest } from "next/server";

/** Shared-password Basic Auth for the admin page and its API. Fails closed when ADMIN_PASSWORD is unset. */
export function proxy(req: NextRequest) {
  const pass = process.env.ADMIN_PASSWORD;
  const header = req.headers.get("authorization") ?? "";
  let given = "";
  if (header.startsWith("Basic ")) {
    try { given = atob(header.slice(6)).split(":").slice(1).join(":"); } catch {}
  }
  if (pass && given === pass) return NextResponse.next();
  return new NextResponse("Login vereist", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Beheer"' } });
}

export const config = { matcher: ["/beheer/:path*", "/api/beheer/:path*"] };
