import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response = NextResponse.next({
            request,
          });
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const type = searchParams.get('type');

  // Auto-forward any request containing PKCE code or recovery type to /auth/callback
  if ((code || type === 'recovery') && !pathname.startsWith('/auth/callback')) {
    const callbackUrl = new URL('/auth/callback', request.url);
    callbackUrl.search = searchParams.toString();
    if (!searchParams.has('next')) {
      callbackUrl.searchParams.set('next', '/reset-password');
    }
    return NextResponse.redirect(callbackUrl);
  }

  // Static assets, public verification route /t/*, auth callback, reset password, and API skip
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/t/') ||
    pathname.startsWith('/auth/callback') ||
    pathname === '/reset-password' ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return response;
  }

  // 1. Unauthenticated users trying to access protected routes
  if (!user && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Determine user's authoritative role from public.profiles
  let role = 'CLIENT_USER';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role) {
      role = profile.role;
    } else {
      // Fallback: metadata can ONLY supply non-privileged roles. SUPERADMIN/ADMIN require profiles.role.
      const metaRole = user.user_metadata?.role;
      if (metaRole && ['OPERATOR', 'DRIVER', 'CLIENT_USER'].includes(metaRole)) {
        role = metaRole;
      } else {
        role = 'CLIENT_USER';
      }
    }
  }

  // Check feature flag: COMPANY_PORTAL_ENABLED (Default: false)
  let companyPortalEnabled = false;
  try {
    const { data: portalSetting } = await supabase
      .from('user_permissions')
      .select('permission_key')
      .like('permission_key', 'COMPANY_PORTAL_CFG:%')
      .order('created_at', { ascending: false })
      .limit(1);

    if (portalSetting && portalSetting.length > 0) {
      companyPortalEnabled = portalSetting[0].permission_key.replace('COMPANY_PORTAL_CFG:', '') === 'true';
    }
  } catch (err) {
    console.warn('Middleware error fetching COMPANY_PORTAL_CFG:', err);
  }

  const getHomeRoute = (r: string): string => {
    if (['SUPERADMIN', 'ADMIN'].includes(r)) return '/admin';
    if (['SUPERVISOR', 'OPERATOR'].includes(r)) return '/operations';
    if (r === 'DRIVER') return '/driver';
    if (r === 'CLIENT_USER') {
      return companyPortalEnabled ? '/company/account' : '/login?reason=portal_disabled';
    }
    return '/login';
  };

  // 2. Authenticated users trying to access login page
  if (user && pathname === '/login') {
    const homeRoute = getHomeRoute(role);
    if (homeRoute.startsWith('/login')) {
      return response;
    }
    return NextResponse.redirect(new URL(homeRoute, request.url));
  }

  // 3. Protection for Corporate Portal Routes (/company/*)
  if (pathname.startsWith('/company')) {
    if (!companyPortalEnabled) {
      // Feature flag is OFF: Block access for external corporate portal
      const target = getHomeRoute(role);
      return NextResponse.redirect(new URL(target, request.url));
    }

    if (role !== 'CLIENT_USER' && !['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(role)) {
      const target = getHomeRoute(role);
      return NextResponse.redirect(new URL(target, request.url));
    }
  }

  // 4. RBAC Protection on Admin/Operational Routes
  if (user && (pathname.startsWith('/admin') || pathname.startsWith('/operations') || pathname.startsWith('/clients') || pathname.startsWith('/tickets') || pathname.startsWith('/drivers') || pathname.startsWith('/driver') || pathname.startsWith('/reports'))) {
    if (pathname.startsWith('/reports') && !['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(role)) {
      const target = getHomeRoute(role);
      return NextResponse.redirect(new URL(target, request.url));
    }

    if (pathname.startsWith('/admin/permissions') && !['SUPERADMIN', 'ADMIN'].includes(role)) {
      const target = getHomeRoute(role);
      return NextResponse.redirect(new URL(target, request.url));
    }

    if ((pathname.startsWith('/admin/users') || pathname.startsWith('/admin/companies')) && !['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(role)) {
      const target = getHomeRoute(role);
      return NextResponse.redirect(new URL(target, request.url));
    }

    if (pathname.startsWith('/admin') && !['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(role)) {
      const target = getHomeRoute(role);
      return NextResponse.redirect(new URL(target, request.url));
    }

    if ((pathname.startsWith('/operations') || pathname.startsWith('/clients') || pathname.startsWith('/drivers')) && !['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR'].includes(role)) {
      const target = getHomeRoute(role);
      return NextResponse.redirect(new URL(target, request.url));
    }

    if (pathname.startsWith('/tickets') && !['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'OPERATOR', 'DRIVER'].includes(role)) {
      const target = getHomeRoute(role);
      return NextResponse.redirect(new URL(target, request.url));
    }

    if (pathname.startsWith('/driver') && !['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'DRIVER'].includes(role)) {
      const target = getHomeRoute(role);
      return NextResponse.redirect(new URL(target, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
