import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { nama, nama_panggilan, email, tanggal_lahir, jenis_kelamin } = await req.json();

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email tidak ditemukan.' }, { status: 400 });
    }

    // Cek apakah email sudah terdaftar
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      // Email sudah ada — update email_verified dan return userId
      // Ini terjadi kalau user daftar ulang atau OTP dikirim ulang
      await supabase
        .from('users')
        .update({ email_verified: true })
        .eq('email', email);
      return NextResponse.json({ success: true, userId: existing.id });
    }

    // Insert user baru
    const { data, error } = await supabase
      .from('users')
      .insert({
        nama_lengkap: nama || null,
        nama_panggilan: nama_panggilan || null,
        email,
        tanggal_lahir: tanggal_lahir || null,
        jenis_kelamin: jenis_kelamin || null,
        email_verified: true,
        trust_score: 20,
        status: 'aktif',
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, userId: data.id });
  } catch (error: any) {
    console.error('register error:', error);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}