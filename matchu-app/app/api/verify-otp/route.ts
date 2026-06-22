// app/api/verify-otp/route.ts
// Dipanggil dari: verify-email.html
// Cek OTP → buat akun Supabase Auth → insert ke tabel users → return userId

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, message: 'Data tidak lengkap.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // ── 1. Ambil OTP terbaru untuk email ini ──
    const { data: records, error: fetchError } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', cleanEmail)
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    if (!records || records.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Kode tidak ditemukan. Silakan minta kode baru.',
      });
    }

    const record = records[0];
    const rowId = record.id; // ✅ kolom PK di tabel email_otps adalah 'id'

    // ── 2. Cek batas percobaan (maks 3x) ──
    if (record.attempts >= 3) {
      await supabase.from('email_otps').delete().eq('id', rowId);
      return NextResponse.json({
        success: false,
        message: 'Terlalu banyak percobaan. Silakan minta kode baru.',
      });
    }

    // ── 3. Cek expired ──
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await supabase.from('email_otps').delete().eq('id', rowId);
      return NextResponse.json({
        success: false,
        message: 'Kode sudah kadaluarsa. Silakan minta kode baru.',
      });
    }

    // ── 4. Cek OTP cocok ──
    if (record.otp !== otp) {
      await supabase
        .from('email_otps')
        .update({ attempts: record.attempts + 1 })
        .eq('id', rowId);
      return NextResponse.json({
        success: false,
        message: 'Kode verifikasi salah.',
      });
    }

    // ── 5. OTP valid — ambil data user dari user_data ──
    const ud = record.user_data;

    if (!ud || !ud.email || !ud.password) {
      await supabase.from('email_otps').delete().eq('id', rowId);
      return NextResponse.json({
        success: false,
        message: 'Data pendaftaran tidak lengkap. Silakan daftar ulang.',
      });
    }

    // ── 6. Buat akun di Supabase Auth ──
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:         ud.email,
      password:      ud.password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      console.error('createUser error:', authError);
      return NextResponse.json(
        { success: false, message: authError?.message || 'Gagal membuat akun.' },
        { status: 500 }
      );
    }

    const userId = authData.user.id;

    // ── 7. Insert ke tabel users ──
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id:             userId,
        email:          ud.email,
        nama_lengkap:   ud.nama,
        nama_panggilan: ud.nama_panggilan,
        tanggal_lahir:  ud.tanggal_lahir || null,
        jenis_kelamin:  ud.jenis_kelamin || null,
        trust_score:    20,
        status:         'aktif',
      });

    if (userError) {
      console.error('insert users error:', userError);
      // Rollback auth user agar tidak orphan
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { success: false, message: 'Gagal menyimpan akun: ' + userError.message },
        { status: 500 }
      );
    }

    // ── 8. Hapus OTP ──
    await supabase.from('email_otps').delete().eq('id', rowId);

    // ── 9. Return userId ke client ──
    return NextResponse.json({ success: true, userId });

  } catch (error: any) {
    console.error('verify-otp error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Server error.' },
      { status: 500 }
    );
  }
}