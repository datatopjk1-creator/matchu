import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

// Buat client langsung di sini, tidak import dari lib
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email wajib diisi.' }, { status: 400 });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Hapus OTP lama
    await supabase.from('email_otps').delete().eq('email', email);

    // Simpan OTP baru
    const { error: insertError } = await supabase
      .from('email_otps')
      .insert({ email, otp, expires_at: expiresAt });

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    // Kirim email via Resend
    await resend.emails.send({
      from: 'verify@matchu.id', // SEMENTARA pakai domain resend dulu
      to: email,
      subject: 'Kode Verifikasi Matchu',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;background:#fff;border-radius:16px;">
          <h2 style="color:#7A2236;">MATCHU</h2>
          <p style="color:#555;margin-top:16px;">Kode verifikasi email kamu:</p>
          <h1 style="letter-spacing:10px;color:#7A2236;font-size:42px;margin:24px 0;">${otp}</h1>
          <p style="color:#888;font-size:13px;">Kode berlaku selama <strong>10 menit</strong>.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('=== SEND OTP ERROR ===', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}