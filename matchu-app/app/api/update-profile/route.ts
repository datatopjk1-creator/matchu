// app/api/update-profile/route.ts
// +30 poin diberikan di sini (profil lengkap dari complete-profile.html)
// Syarat dapat +30: SEMUA field wajib terisi

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Field wajib yang harus semua terisi untuk dapat +30
// Sesuai field required (*) di complete-profile.html
const REQUIRED_FIELDS = [
  'bulan_lahir',
  'tahun_lahir',
  'status_nikah',
  'universitas',
  'program_studi',
  'jenjang',
  'tahun_masuk',
  'status_pendidikan',
  'status_kerja',
  'kota_domisili',
  'tinggi_badan',
  'agama',
  'target_menikah',
  'kepribadian',
  'mbti',
  'hobi',
  'bio',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, ...profileData } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId wajib ada.' },
        { status: 400 }
      );
    }

    // ── Validasi field wajib ──────────────────────────────────
    for (const field of REQUIRED_FIELDS) {
      if (!profileData[field]) {
        return NextResponse.json(
          { success: false, error: `Field ${field} wajib diisi.` },
          { status: 400 }
        );
      }
    }

    // ── Ambil profil saat ini ─────────────────────────────────
    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('id, trust_score, profile_score_given, registration_step')
      .eq('id', userId)
      .single();

    if (fetchErr || !profile) {
      return NextResponse.json(
        { success: false, error: 'User tidak ditemukan.' },
        { status: 404 }
      );
    }

    // ── Hitung trust_score ────────────────────────────────────
    // +30 hanya SATU KALI (flag profile_score_given)
    // Syarat: semua REQUIRED_FIELDS terisi (sudah divalidasi di atas)
    const scoreGained = !profile.profile_score_given ? 30 : 0;
    const newScore = profile.trust_score + scoreGained;

    // ── Update profiles ───────────────────────────────────────
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        bulan_lahir:       profileData.bulan_lahir,
        tahun_lahir:       profileData.tahun_lahir,
        status_nikah:      profileData.status_nikah,
        universitas:       profileData.universitas?.trim(),
        program_studi:     profileData.program_studi?.trim(),
        jenjang:           profileData.jenjang,
        tahun_masuk:       profileData.tahun_masuk,
        status_pendidikan: profileData.status_pendidikan,
        status_kerja:      profileData.status_kerja,
        profesi:           profileData.profesi?.trim() || null,
        perusahaan:        profileData.perusahaan?.trim() || null,
        kota_domisili:     profileData.kota_domisili?.trim(),
        kota_asal:         profileData.kota_asal?.trim() || null,
        tinggi_badan:      profileData.tinggi_badan || null,
        berat_badan:       profileData.berat_badan || null,
        agama:             profileData.agama,
        target_menikah:    profileData.target_menikah,
        kepribadian:       profileData.kepribadian,
        mbti:              profileData.mbti,
        hobi:              profileData.hobi,
        bahasa:            profileData.bahasa || null,
        bio:               profileData.bio?.trim(),
        trust_score:       newScore,
        // Flag: sudah dapat poin profil, tidak bisa dobel
        ...(scoreGained > 0 && { profile_score_given: true }),
        registration_step: 4,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('update-profile error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Gagal menyimpan profil.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      trust_score: newScore,
      score_gained: scoreGained,
    });

  } catch (err) {
    console.error('update-profile catch:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}