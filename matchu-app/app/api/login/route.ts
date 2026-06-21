// matchu-app/app/api/login/route.ts
// Login bisa pakai email ATAU nama_panggilan (username) + password

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: 'Email/username dan password wajib diisi.' },
        { status: 400 }
      );
    }

    let loginEmail = identifier.trim();

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail);

    if (!isEmail) {
      // Anggap input adalah nama_panggilan -> cari emailnya
      const { data: userByUsername, error: findError } = await supabaseAdmin
        .from('users')
        .select('email')
        .ilike('nama_panggilan', loginEmail) // ilike = tidak peduli huruf besar/kecil
        .maybeSingle();

      if (findError || !userByUsername) {
        return NextResponse.json({ success: false, error: 'Email/username atau password salah.' });
      }

      loginEmail = userByUsername.email;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json({ success: false, error: 'Email/username atau password salah.' });
    }

    const userId = data.user.id;

    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('id, nama_lengkap, nama_panggilan, email, jenis_kelamin, tanggal_lahir, kampus, status')
      .eq('id', userId)
      .maybeSingle();

    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('foto_utama, foto_kedua, instagram')
      .eq('id', userId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: data.user.email,
        ...userProfile,
        ...profileData,
      },
      access_token: data.session?.access_token,
    });

  } catch (error: any) {
    console.error('login error:', error);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}