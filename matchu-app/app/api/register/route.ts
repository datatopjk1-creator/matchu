import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { nama, email, tanggal_lahir, jenis_kelamin } = await req.json();

    if (!nama || !email) {
      return NextResponse.json({ success: false, error: 'Data tidak lengkap.' }, { status: 400 });
    }

    // Cek apakah email sudah terdaftar
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      await supabase.from('users').update({ email_verified: true }).eq('email', email);
      return NextResponse.json({ success: true, userId: existing.id });
    }

    // Insert user baru
    const { data, error } = await supabase
      .from('users')
      .insert({ nama, email, tanggal_lahir, jenis_kelamin, email_verified: true })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, userId: data.id });
  } catch (error: any) {
    console.error('register error:', error);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}