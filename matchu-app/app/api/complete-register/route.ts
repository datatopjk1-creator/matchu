// matchu-app/app/api/complete-register/route.ts
// Dipanggil SETELAH OTP berhasil diverifikasi
// Menerima semua data user termasuk password, lalu simpan ke Supabase Auth + tabel users

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Pakai SERVICE ROLE KEY (bukan anon key) agar bisa insert ke auth.users
// Simpan di .env.local sebagai SUPABASE_SERVICE_ROLE_KEY
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const { nama, nama_panggilan, email, password, tanggal_lahir, jenis_kelamin } = await req.json();

    if (!email || !password || !nama) {
      return NextResponse.json({ success: false, error: 'Data tidak lengkap.' }, { status: 400 });
    }

    // ── 1. Buat user di Supabase Auth ──────────────────────────────────────
    // Ini yang memungkinkan user login dengan email + password lewat Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // langsung verified karena kita sudah OTP manual
    });

    if (authError) {
      // Jika email sudah ada di auth, coba update password saja
      if (authError.message.includes('already been registered')) {
        return NextResponse.json({ success: false, error: 'Email sudah terdaftar.' });
      }
      throw authError;
    }

    const authUserId = authData.user.id;

    // ── 2. Cek apakah sudah ada di tabel users (dari pendaftaran sebelumnya) ──
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      // Update saja jika sudah ada
      await supabaseAdmin
        .from('users')
        .update({ email_verified: true })
        .eq('email', email);

      return NextResponse.json({ success: true, userId: existingUser.id });
    }

    // ── 3. Insert ke tabel users ────────────────────────────────────────────
    const { data: userData, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUserId,          // samakan id dengan Supabase Auth agar mudah di-join
        nama_lengkap: nama,
        nama_panggilan: nama_panggilan || nama,
        email,
        tanggal_lahir: tanggal_lahir || null,
        jenis_kelamin: jenis_kelamin || null,
        email_verified: true,
        trust_score: 20,
        status: 'aktif',
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, userId: userData.id });

  } catch (error: any) {
    console.error('complete-register error:', error);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}