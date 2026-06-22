// app/api/send-otp/route.ts
// Dipanggil dari register.html setelah user isi form Step 1
// Yang dilakukan:
//   1. Validasi input
//   2. Cek apakah email sudah terdaftar di profiles DAN auth.users
//   3. Generate OTP 6 digit (crypto-secure)
//   4. Simpan OTP + semua data user ke tabel email_otps (sementara)
//   5. Kirim email OTP via Nodemailer/SMTP
//
// ⚠️  Akun auth.users TIDAK dibuat di sini.
//     Akun baru dibuat hanya setelah registrasi selesai di Step 4.

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { randomInt } from 'crypto'; // ✅ crypto-secure, bukan Math.random()

const MAX_RESEND_PER_HOUR = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nama, nama_panggilan, email, password, tanggal_lahir, jenis_kelamin } = body;

    // ── Validasi input dasar ──────────────────────────────────
    if (!nama || !nama_panggilan || !email || !password || !tanggal_lahir || !jenis_kelamin) {
      return NextResponse.json(
        { success: false, error: 'Semua field wajib diisi.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password minimal 8 karakter.' },
        { status: 400 }
      );
    }

    const emailLower = email.trim().toLowerCase();

    // ── Cek di tabel profiles ─────────────────────────────────
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', emailLower)
      .limit(1);

    if (existingProfile && existingProfile.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Email sudah terdaftar. Silakan login.' },
        { status: 409 }
      );
    }

    // ── Cek di auth.users (mencegah ghost account) ────────────
    const { data: authList } = await supabase.auth.admin.listUsers();
    const authExists = authList?.users?.find(u => u.email === emailLower);

    if (authExists) {
      // Cek apakah profiles-nya juga ada
      const { data: profileCheck } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authExists.id)
        .limit(1);

      if (profileCheck && profileCheck.length > 0) {
        // Akun sudah lengkap → tolak
        return NextResponse.json(
          { success: false, error: 'Email sudah terdaftar. Silakan login.' },
          { status: 409 }
        );
      } else {
        // Ghost account (auth ada, profiles tidak) → hapus supaya bisa register ulang
        await supabase.auth.admin.deleteUser(authExists.id);
      }
    }

    // ── Rate limiting: maksimal 5x kirim OTP per jam ──────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('email_otps')
      .select('id', { count: 'exact', head: true })
      .eq('email', emailLower)
      .gte('created_at', oneHourAgo);

    if ((recentCount ?? 0) >= MAX_RESEND_PER_HOUR) {
      return NextResponse.json(
        { success: false, error: 'Terlalu banyak permintaan OTP. Coba lagi dalam 1 jam.' },
        { status: 429 }
      );
    }

    // ── Hapus OTP lama yang belum terpakai ───────────────────
    await supabase
      .from('email_otps')
      .delete()
      .eq('email', emailLower)
      .eq('is_used', false);

    // ── Generate OTP 6 digit (crypto-secure) ─────────────────
    const otp = randomInt(100000, 999999 + 1).toString(); // 100000–999999, tidak perlu padStart

    // ── Hitung expires_at dalam UTC eksplisit ─────────────────
    // ✅ Aman di semua timezone server (termasuk JST/WIB)
    const nowUtc     = Date.now();
    const expiresAt  = new Date(nowUtc + 15 * 60 * 1000).toISOString(); // +10 menit UTC

    // ── Simpan OTP + data user ke email_otps ─────────────────
    // Password disimpan plaintext di sini, di-hash nanti di step 4
    // ✅ Tidak di-hash di sini agar tidak ada bug double-hash
    const { error: insertError } = await supabase
      .from('email_otps')
      .insert({
        email:      emailLower,
        otp:        otp,           // text, 6 digit, padded
        user_data: {
          nama:           nama.trim(),
          nama_panggilan: nama_panggilan.trim(),
          email:          emailLower,
          password:       password,  // plaintext, hash di step 4
          tanggal_lahir,
          jenis_kelamin,
        },
        attempts:   0,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('Insert OTP error:', insertError);
      return NextResponse.json(
        { success: false, error: 'Gagal menyimpan OTP.' },
        { status: 500 }
      );
    }

    // ── Log OTP di development ────────────────────────────────
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n[DEV] OTP untuk ${emailLower}: ${otp}`);
      console.log(`[DEV] expires_at (UTC): ${expiresAt}\n`);
    }

    // ── Kirim email via Nodemailer ────────────────────────────
    const nodemailer = await import('nodemailer').catch(() => null);
    if (nodemailer && process.env.SMTP_HOST) {
      const transporter = nodemailer.default.createTransport({
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from:    `"Matchu" <${process.env.SMTP_USER}>`,
        to:      emailLower,
        subject: `Kode Verifikasi Matchu: ${otp}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;">
            <h1 style="color:#7A2236;font-size:36px;text-align:center;">MATCHU</h1>
            <p style="font-size:16px;">Halo <strong>${nama.trim()}</strong>,</p>
            <p>Masukkan kode verifikasi berikut di halaman Matchu:</p>
            <div style="text-align:center;margin:32px 0;">
              <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#7A2236;">${otp}</span>
            </div>
            <p style="color:#888;font-size:13px;">Kode berlaku <strong>10 menit</strong>. Jangan bagikan ke siapapun.</p>
            <p style="color:#888;font-size:13px;">Jika kamu tidak merasa mendaftar, abaikan email ini.</p>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('send-otp error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}