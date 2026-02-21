import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Workaround for unstable dev manifest generation in this environment.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*'
};
