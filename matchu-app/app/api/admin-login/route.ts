import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: 'Email dan password wajib diisi.' },
        { status: 400 }
      );
    }

    const emailToUse = identifier.trim().toLowerCase();

    // ── Login via Supabase Auth ───────────────────────────
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    });

    if (authError || !authData?.user) {
      return NextResponse.json(
        { success: false, error: 'Email atau password salah.' },
        { status: 401 }
      );
    }

    // ── Cek apakah user ini terdaftar sebagai admin ───────
    const { data: adminRows, error: adminError } = await supabase
      .from('admins')
      .select('id, email, nama, role')
      .eq('id', authData.user.id)
      .limit(1);

    if (adminError || !adminRows || adminRows.length === 0) {
      // Bukan admin → tolak walau login Supabase Auth-nya valid
      await supabase.auth.signOut();
      return NextResponse.json(
        { success: false, error: 'Akun ini tidak memiliki akses admin.' },
        { status: 403 }
      );
    }

    const admin = adminRows[0];

    return NextResponse.json({
      success: true,
      access_token: authData.session?.access_token || '',
      refresh_token: authData.session?.refresh_token || '',
      adminId: admin.id,
      email: admin.email,
      nama: admin.nama,
      role: admin.role,
    });

  } catch (err) {
    console.error('[ADMIN-LOGIN] error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}