// app/api/verify-otp/route.ts
// Dipanggil setelah user input kode OTP 6 digit
// Yang dilakukan:
//   1. Validasi input
//   2. Cari OTP valid (belum expired, belum terpakai) — perbandingan UTC eksplisit
//   3. Cek rate limit percobaan salah (max 5x)
//   4. Bandingkan kode OTP (string, trim, padStart)
//   5. Tandai OTP terpakai
//   6. Return data user (untuk dilanjutkan ke step 2, 3, 4)
//
// ⚠️  Akun auth.users TIDAK dibuat di sini.
//     Akun dibuat hanya setelah step 4 selesai via /api/complete-registration

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    // ── Validasi input ────────────────────────────────────────
    if (!email || !otp) {
      return NextResponse.json(
        { success: false, message: 'Email dan OTP wajib diisi.' },
        { status: 400 }
      );
    }

    const emailLower = email.trim().toLowerCase();

    // ✅ Normalize OTP: trim whitespace + padStart untuk handle leading zero
    const otpString = otp.toString().trim();

    // ── Gunakan UTC eksplisit untuk perbandingan waktu ────────
    // ✅ Aman di semua timezone (JST, WIB, dll) karena selalu UTC
    const nowUtc = new Date().toISOString();

    // ── Cari OTP yang masih valid ─────────────────────────────
    const { data: otpRows, error: fetchError } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', emailLower)
      .eq('is_used', false)
      .gt('expires_at', nowUtc)   // ✅ dibanding UTC eksplisit
      .order('created_at', { ascending: false })
      .limit(1);

    // ── Debug log (hapus di production) ──────────────────────
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] nowUtc         :', nowUtc);
      console.log('[DEBUG] otpRows        :', otpRows);
      console.log('[DEBUG] fetchError     :', fetchError);
    }

    if (fetchError || !otpRows || otpRows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'OTP tidak ditemukan atau sudah expired. Silakan kirim ulang.' },
        { status: 400 }
      );
    }

    const record = otpRows[0];

    // ── Cek rate limit percobaan salah ────────────────────────
    // ✅ Maksimal 5x salah, setelah itu OTP dikunci
    if ((record.attempts ?? 0) >= MAX_ATTEMPTS) {
      await supabase
        .from('email_otps')
        .update({ is_used: true })
        .eq('id', record.id);

      return NextResponse.json(
        { success: false, message: 'Terlalu banyak percobaan salah. Silakan minta OTP baru.' },
        { status: 429 }
      );
    }

    // ── Normalize stored OTP untuk perbandingan ───────────────
    const storedOtp = record.otp.toString().trim();

    // ── Debug log (hapus di production) ──────────────────────
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG] input OTP  :', otpString);
      console.log('[DEBUG] stored OTP :', storedOtp);
      console.log('[DEBUG] match      :', storedOtp === otpString);
      console.log('[DEBUG] attempts   :', record.attempts);
      console.log('[DEBUG] expires_at :', record.expires_at);
    }

    // ── Bandingkan OTP ────────────────────────────────────────
    if (storedOtp !== otpString) {
      // Increment attempts setiap kali salah
      const newAttempts = (record.attempts ?? 0) + 1;
      await supabase
        .from('email_otps')
        .update({ attempts: newAttempts })
        .eq('id', record.id);

      const sisaCoba = MAX_ATTEMPTS - newAttempts;

      return NextResponse.json(
        {
          success: false,
          message: sisaCoba > 0
            ? `Kode OTP salah. Sisa percobaan: ${sisaCoba}x.`
            : 'Kode OTP salah. Tidak ada sisa percobaan, silakan minta OTP baru.',
        },
        { status: 400 }
      );
    }

    // ── OTP benar: tandai sudah dipakai ──────────────────────
    await supabase
      .from('email_otps')
      .update({ is_used: true })
      .eq('id', record.id);

    // ── Ambil data user dari user_data ────────────────────────
    const ud = record.user_data as {
      nama:           string;
      nama_panggilan: string;
      email:          string;
      password:       string; // plaintext, akan di-hash di step 4
      tanggal_lahir:  string;
      jenis_kelamin:  string;
    };

    // ── Return sukses ─────────────────────────────────────────
    // ✅ Akun auth.users TIDAK dibuat di sini
    // ✅ Password TIDAK dikembalikan ke frontend
    // Frontend simpan user_data di sessionStorage untuk lanjut ke step 2-4
    // Akun dibuat di /api/complete-registration setelah step 4 selesai
    return NextResponse.json({
      success:  true,
      message:  'Email berhasil diverifikasi.',
      user_data: {
        nama:           ud.nama,
        nama_panggilan: ud.nama_panggilan,
        email:          ud.email,
        tanggal_lahir:  ud.tanggal_lahir,
        jenis_kelamin:  ud.jenis_kelamin,
        // password tidak dikembalikan
      },
    });

  } catch (err) {
    console.error('verify-otp error:', err);
    return NextResponse.json(
      { success: false, message: 'Server error.' },
      { status: 500 }
    );
  }
}