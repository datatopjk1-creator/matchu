import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { email, otp } = await req.json();
    if (!email || !otp) {
      return NextResponse.json({ success: false, message: 'Data tidak lengkap.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', email)
      .eq('otp', otp)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, message: 'OTP tidak valid.' });
    }

    const record = data[0];

    if (record.attempts >= 3) {
      await supabase.from('email_otps').delete().eq('uuid', record.uuid);
      return NextResponse.json({ success: false, message: 'Terlalu banyak percobaan. Minta OTP baru.' });
    }

    // Cek expired (UTC)
    const expiresAtMs = new Date(record.expires_at).getTime();
    if (expiresAtMs < Date.now()) {
      await supabase.from('email_otps').delete().eq('uuid', record.uuid);
      return NextResponse.json({ success: false, message: 'OTP sudah kadaluarsa.' });
    }

    // Valid — hapus OTP
    await supabase.from('email_otps').delete().eq('uuid', record.uuid);

    return NextResponse.json({ success: true, message: 'OTP valid.' });
  } catch (error: any) {
    console.error('verify-otp error:', error);
    return NextResponse.json({ success: false, message: 'Server error.' }, { status: 500 });
  }
}