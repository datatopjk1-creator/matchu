// app/api/send-otp/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { randomInt } from 'crypto';

const MAX_RESEND_PER_HOUR = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nama, nama_panggilan, email, password, tanggal_lahir, jenis_kelamin } = body;

    // ── Validasi input ────────────────────────────────────────
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

    // ── Cek ghost account di auth.users ───────────────────────
    const { data: authList } = await supabase.auth.admin.listUsers();
    const authExists = authList?.users?.find(u => u.email === emailLower);

    if (authExists) {
      const { data: profileCheck } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authExists.id)
        .limit(1);

      if (profileCheck && profileCheck.length > 0) {
        return NextResponse.json(
          { success: false, error: 'Email sudah terdaftar. Silakan login.' },
          { status: 409 }
        );
      } else {
        // Ghost account → hapus
        await supabase.auth.admin.deleteUser(authExists.id);
      }
    }

    // ── Rate limiting: maks 5x per jam ───────────────────────
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
    const otp = randomInt(100000, 999999).toString();

    // ── expires_at dalam UTC (aman untuk semua timezone) ──────
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 menit

    // ── Simpan OTP ke database ────────────────────────────────
    const { error: insertError } = await supabase
      .from('email_otps')
      .insert({
        email:      emailLower,
        otp:        otp,
        user_data: {
          nama:           nama.trim(),
          nama_panggilan: nama_panggilan.trim(),
          email:          emailLower,
          password:       password, // plaintext, di-hash di step 4
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

    // ── Kirim email via Resend ────────────────────────────────
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error: emailError } = await resend.emails.send({
      from:    'Matchu <verify@matchu.id>',
      to:      emailLower,
      subject: `Kode Verifikasi Matchu: ${otp}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h1 style="color:#7A2236;font-size:36px;text-align:center;margin-bottom:0;">MATCHU</h1>
          <p style="text-align:center;color:#888;font-style:italic;margin-top:4px;">Beyond Matching. Toward Marriage.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="font-size:16px;">Halo <strong>${nama.trim()}</strong>,</p>
          <p style="font-size:15px;color:#444;">Masukkan kode verifikasi berikut untuk melanjutkan pendaftaran:</p>
          <div style="text-align:center;margin:32px 0;padding:24px;background:#FFF5F7;border-radius:12px;">
            <span style="font-size:44px;font-weight:700;letter-spacing:12px;color:#7A2236;">${otp}</span>
          </div>
          <p style="color:#888;font-size:13px;text-align:center;">
            Kode berlaku <strong>15 menit</strong>. Jangan bagikan ke siapapun.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#bbb;font-size:12px;text-align:center;">
            Jika kamu tidak merasa mendaftar di Matchu, abaikan email ini.
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return NextResponse.json(
        { success: false, error: 'Gagal mengirim email. Coba lagi.' },
        { status: 500 }
      );
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