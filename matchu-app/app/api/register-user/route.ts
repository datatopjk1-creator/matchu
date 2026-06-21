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
      nama_lengkap, nama_panggilan, email, tanggal_lahir, jenis_kelamin,
      // Pendidikan (dari verify-education)
      kampus, jurusan, jenjang,
      education_screenshot,
      // Profil (dari complete-profile)
      status_kerja, pekerjaan, perusahaan, kota, tinggi_badan,
      status_nikah, agama, target_menikah, kepribadian, mbti, hobi, bahasa, bio,
      // Foto & sosmed (dari upload-photo)
      instagram, foto1, foto2,
    } = body;

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email tidak ditemukan.' }, { status: 400 });
    }

    // Cek email sudah terdaftar
    const { data: existing } = await supabase
      .from('users').select('id').eq('email', email).maybeSingle();
    if (existing) {
      return NextResponse.json({ success: false, error: 'Email sudah terdaftar.' }, { status: 400 });
    }

    // Hitung trust score
    let trust_score = 20; // base: email OTP verified
    if (instagram) trust_score += 10;
    if (foto1 && foto2) trust_score += 10;
    else if (foto1) trust_score += 5;
    if (kota && pekerjaan && bio && tinggi_badan && agama && mbti && hobi) trust_score += 30;
    // Pendidikan akan +30 setelah screenshot diverifikasi admin

    // Insert user
    const { data, error } = await supabase
      .from('users')
      .insert({
        nama_lengkap: nama_lengkap || null,
        nama_panggilan: nama_panggilan || null,
        email,
        tanggal_lahir: tanggal_lahir || null,
        jenis_kelamin: jenis_kelamin || null,
        email_verified: true,
        kampus: kampus || null,
        jurusan: jurusan || null,
        jenjang: jenjang || null,
        status_kerja: status_kerja || null,
        pekerjaan: pekerjaan || null,
        perusahaan: perusahaan || null,
        kota: kota || null,
        tinggi_badan: tinggi_badan ? parseInt(tinggi_badan) : null,
        status_nikah: status_nikah || null,
        agama: agama || null,
        target_menikah: target_menikah || null,
        kepribadian: kepribadian || null,
        mbti: mbti || null,
        hobi: hobi || null,
        bahasa: bahasa || null,
        bio: bio || null,
        instagram: instagram?.replace('@','').trim() || null,
        foto1: foto1 || null,
        foto2: foto2 || null,
        trust_score,
        education_verified: false,
        status: 'aktif',
      })
      .select('id, trust_score')
      .single();

    if (error) throw error;

    // Kalau ada screenshot PDDikti, simpan ke education_verifications
    if (education_screenshot && kampus && jurusan) {
      await supabase.from('education_verifications').insert({
        user_id: data.id,
        screenshot_url: education_screenshot,
        kampus_klaim: kampus,
        jurusan_klaim: jurusan,
        status: 'pending',
      });
    }

    return NextResponse.json({ success: true, userId: data.id, trust_score: data.trust_score });
  } catch (error: any) {
    console.error('register-user error:', error);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}