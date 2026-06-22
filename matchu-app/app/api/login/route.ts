import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: 'Email/username dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const identifierClean = identifier.trim().toLowerCase();
    let emailToUse = identifierClean;

    const isEmail = identifierClean.includes('@');

    if (!isEmail) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('email')
        .ilike('nama_panggilan', identifier.trim())
        .limit(1);

      if (!profileData || profileData.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Username atau password salah.' },
          { status: 401 }
        );
      }
      emailToUse = profileData[0].email;
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: password,
    });

    if (authError || !authData?.user) {
      return NextResponse.json(
        { success: false, error: 'Email/username atau password salah.' },
        { status: 401 }
      );
    }

    // ── Cek apakah user ini admin ─────────────────────────
    const { data: adminRows } = await supabase
      .from('admins')
      .select('id, role')
      .eq('id', authData.user.id)
      .limit(1);

    const isAdmin = !!(adminRows && adminRows.length > 0);

    // ── Kalau bukan admin, lanjut ambil profil biasa ──────
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, nama, nama_panggilan, email, status, trust_score, foto_url_1')
      .eq('id', authData.user.id)
      .limit(1);

    const userProfile = profileRows?.[0] || null;

    if (!isAdmin && userProfile?.status === 'suspended') {
      return NextResponse.json(
        { success: false, error: 'Akun kamu telah dinonaktifkan.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      access_token: authData.session?.access_token || '',
      refresh_token: authData.session?.refresh_token || '',
      userId: authData.user.id,
      email: emailToUse,
      nama_panggilan: userProfile?.nama_panggilan || '',
      nama: userProfile?.nama || '',
      trust_score: userProfile?.trust_score || 0,
      foto_url_1: userProfile?.foto_url_1 || null,
      isAdmin,                              // ✅ baru
      adminRole: adminRows?.[0]?.role || null,  // ✅ baru
    });

  } catch (err) {
    console.error('[LOGIN] error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}