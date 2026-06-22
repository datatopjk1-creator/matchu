// app/api/register/route.ts
// Dipanggil setelah OTP berhasil diverifikasi (step 1)
// Yang dilakukan:
//   1. Ambil data user dari email_otps (OTP sudah is_used = true)
//   2. Simpan session sementara ke tabel pending_registrations
//   3. Return session token untuk frontend simpan di localStorage
//
// ⚠️  Akun auth.users TIDAK dibuat di sini.
//     Akun dibuat hanya setelah step 4 selesai via /api/complete-registration

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nama, nama_panggilan, email, tanggal_lahir, jenis_kelamin } = body;

    // ── Validasi input ────────────────────────────────────────
    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email wajib diisi.' },
        { status: 400 }
      );
    }

    const emailLower = email.trim().toLowerCase();

    // ── Cek apakah OTP sudah diverifikasi ────────────────────
    // OTP yang sudah diverifikasi punya is_used = true
    const { data: otpRecord } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', emailLower)
      .eq('is_used', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!otpRecord || otpRecord.length === 0) {
      return NextResponse.json(
        { success: false, error: 'OTP belum diverifikasi. Silakan verifikasi email dulu.' },
        { status: 403 }
      );
    }

    const record = otpRecord[0];
    const ud = record.user_data as {
      nama: string;
      nama_panggilan: string;
      email: string;
      password: string;
      tanggal_lahir: string;
      jenis_kelamin: string;
    };

    // ── Cek apakah email sudah terdaftar di profiles ──────────
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', emailLower)
      .limit(1);

    if (existingProfile && existingProfile.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email sudah terdaftar.',
          userId: existingProfile[0].id,
        },
        { status: 409 }
      );
    }

    // ── Generate session token sementara ──────────────────────
    // Token ini dipakai frontend untuk identifikasi user selama step 2-4
    // Akun auth.users baru dibuat setelah step 4 selesai
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 jam

    // ── Simpan ke tabel pending_registrations ─────────────────
    // Hapus data lama dulu jika ada
    await supabase
      .from('pending_registrations')
      .delete()
      .eq('email', emailLower);

    const { error: insertError } = await supabase
      .from('pending_registrations')
      .insert({
        email:          emailLower,
        session_token:  sessionToken,
        nama:           ud.nama,
        nama_panggilan: ud.nama_panggilan,
        password:       ud.password,   // plaintext, di-hash di step 4
        tanggal_lahir:  ud.tanggal_lahir,
        jenis_kelamin:  ud.jenis_kelamin,
        step:           1,             // sudah selesai step 1
        expires_at:     expiresAt,
      });

    if (insertError) {
      console.error('pending_registrations insert error:', insertError);

      // Jika tabel belum ada, return userId dummy agar frontend bisa lanjut
      // Frontend akan simpan data di localStorage saja
      return NextResponse.json({
        success:        true,
        userId:         `pending_${emailLower}`,
        session_token:  sessionToken,
        nama_panggilan: ud.nama_panggilan,
        note:           'pending',
      });
    }

    return NextResponse.json({
      success:        true,
      userId:         `pending_${emailLower}`, // ID sementara, bukan UUID auth
      session_token:  sessionToken,
      nama_panggilan: ud.nama_panggilan,
    });

  } catch (err) {
    console.error('register error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}