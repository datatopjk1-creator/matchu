import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      // Step 1
      nama_lengkap, nama_panggilan, email, tanggal_lahir, jenis_kelamin,
      // Step 3 - profil
      kampus, jurusan, jenjang, tahun_masuk, status_pendidikan,
      pekerjaan, perusahaan, kota, tinggi_badan, status_nikah,
      agama, target_menikah, kepribadian, mbti, hobi, bahasa, bio,
      // Step 4 - foto & sosmed
      instagram, foto1, foto2,
    } = body;

    if (!nama_lengkap || !email) {
      return NextResponse.json({ success: false, error: 'Data tidak lengkap.' }, { status: 400 });
    }

    // Cek email sudah terdaftar
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: false, error: 'Email sudah terdaftar.' }, { status: 400 });
    }

    // Hitung trust score awal
    let trust_score = 20; // email verified
    if (instagram) trust_score += 10;
    if (foto1 && foto2) trust_score += 10;
    else if (foto1) trust_score += 5;
    if (kampus && jurusan && pekerjaan && kota && bio && tinggi_badan) trust_score += 30;

    // Insert user
    const { data, error } = await supabase
      .from('users')
      .insert({
        nama_lengkap, nama_panggilan, email,
        tanggal_lahir, jenis_kelamin,
        email_verified: true,
        kampus, jurusan, jenjang, tahun_masuk, status_pendidikan,
        pekerjaan, perusahaan, kota,
        tinggi_badan: tinggi_badan ? parseInt(tinggi_badan) : null,
        status_nikah, agama, target_menikah, kepribadian, mbti,
        hobi, bahasa, bio,
        instagram: instagram?.replace('@', '').trim(),
        foto1: foto1 || null,
        foto2: foto2 || null,
        trust_score,
        status: 'aktif',
      })
      .select('id, trust_score')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, userId: data.id, trust_score: data.trust_score });
  } catch (error: any) {
    console.error('register-user error:', error);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}