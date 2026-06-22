// app/api/get-profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId wajib.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .limit(1);

    if (error || !data || data.length === 0) {
      return NextResponse.json({ success: false, error: 'Profil tidak ditemukan.' }, { status: 404 });
    }

    const profile = data[0];

    // ── Hitung trust score otomatis ───────────────────────
    let trustScore = 0;
    const breakdown = {
      email:       { label: 'Email Terverifikasi',    poin: 0, max: 20, done: false },
      pendidikan:  { label: 'Verifikasi Pendidikan',  poin: 0, max: 30, done: false },
      profil:      { label: 'Profil Lengkap',         poin: 0, max: 30, done: false },
      foto:        { label: '2 Foto Profil',          poin: 0, max: 10, done: false },
      instagram:   { label: 'Instagram',              poin: 0, max: 10, done: false },
    };

    // +20 Email
    if (profile.email_verified) {
      breakdown.email.poin = 20;
      breakdown.email.done = true;
      trustScore += 20;
    }

    // +30 Pendidikan (education_score_given dari admin)
    if (profile.education_score_given) {
      breakdown.pendidikan.poin = 30;
      breakdown.pendidikan.done = true;
      trustScore += 30;
    }

    // +30 Profil lengkap (hitung dari field yang terisi)
    const profilFields = ['bio','agama','mbti','kepribadian','hobi','kota_domisili','tinggi_badan','target_menikah','status_nikah'];
    const profilTerisi = profilFields.filter(f => profile[f]).length;
    const profilPoin = Math.round((profilTerisi / profilFields.length) * 30);
    breakdown.profil.poin = profilPoin;
    breakdown.profil.done = profilTerisi >= profilFields.length;
    trustScore += profilPoin;

    // +10 Foto (max 10: 5 per foto)
    const fotoPoin = (profile.foto_url_1 ? 5 : 0) + (profile.foto_url_2 ? 5 : 0);
    breakdown.foto.poin = fotoPoin;
    breakdown.foto.done = fotoPoin >= 10;
    trustScore += fotoPoin;

    // +10 Instagram
    if (profile.instagram) {
      breakdown.instagram.poin = 10;
      breakdown.instagram.done = true;
      trustScore += 10;
    }

    // Update trust_score di DB jika berubah
    if (trustScore !== profile.trust_score) {
      await supabase.from('profiles').update({ trust_score: trustScore }).eq('id', userId);
    }

    return NextResponse.json({
      success: true,
      profile: { ...profile, trust_score: trustScore },
      trust_breakdown: breakdown,
    });

  } catch (err) {
    console.error('get-profile error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}