// matchu-app/app/api/login/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Pakai anon key untuk login biasa
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email dan password wajib diisi.' }, { status: 400 });
    }

    // Login via Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return NextResponse.json({ success: false, error: 'Email atau password salah.' });
    }

    // Ambil data profil dari tabel users
    const { data: userProfile } = await supabase
      .from('users')
      .select('id, nama_lengkap, nama_panggilan, email, jenis_kelamin, status')
      .eq('email', email)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        ...userProfile,
      },
      // Kirim session token agar bisa dipakai untuk request berikutnya
      access_token: data.session?.access_token,
    });

  } catch (error: any) {
    console.error('login error:', error);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}