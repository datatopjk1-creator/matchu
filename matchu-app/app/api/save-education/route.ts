// app/api/save-education/route.ts
// +30 poin diberikan di sini (data pendidikan lengkap)
// Syarat dapat +30: kampus, jurusan, jenjang, DAN screenshot semuanya ada

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, kampus, jurusan, jenjang, education_screenshot } = body;

    if (!userId || !kampus || !jurusan || !jenjang) {
      return NextResponse.json(
        { success: false, error: 'Data pendidikan tidak lengkap.' },
        { status: 400 }
      );
    }

    // ── Ambil profil saat ini ─────────────────────────────────
    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('id, trust_score, education_score_given')
      .eq('id', userId)
      .single();

    if (fetchErr || !profile) {
      return NextResponse.json(
        { success: false, error: 'User tidak ditemukan.' },
        { status: 404 }
      );
    }

    // ── Upload screenshot PDDikti ─────────────────────────────
    let screenshotUrl: string | null = null;

    if (education_screenshot) {
      const matches = education_screenshot.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const ext = mimeType.split('/')[1] || 'jpg';
        const fileName = `${userId}/education-${Date.now()}.${ext}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('education-screenshots')
          .upload(fileName, buffer, { contentType: mimeType, upsert: true });

        if (uploadError) {
          console.error('Upload screenshot error:', uploadError);
          return NextResponse.json(
            { success: false, error: 'Gagal upload screenshot.' },
            { status: 500 }
          );
        }
        screenshotUrl = uploadData.path;
      }
    }

    // ── Hitung trust_score ────────────────────────────────────
    // +30 hanya diberikan SATU KALI (cek flag education_score_given)
    // Syarat: kampus + jurusan + jenjang + screenshot semua terisi
    const hasAllEducationData = kampus && jurusan && jenjang && screenshotUrl;
    const scoreGained = hasAllEducationData && !profile.education_score_given ? 30 : 0;
    const newScore = profile.trust_score + scoreGained;

    // ── Update profiles ───────────────────────────────────────
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        kampus:                  kampus.trim(),
        jurusan:                 jurusan.trim(),
        jenjang,
        ...(screenshotUrl && { education_screenshot_url: screenshotUrl }),
        trust_score:             newScore,
        // Flag: sudah dapat poin pendidikan, tidak bisa dobel
        ...(scoreGained > 0 && { education_score_given: true }),
        registration_step:       3,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Update education error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Gagal menyimpan data pendidikan.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      trust_score: newScore,
      score_gained: scoreGained,
      // Jika screenshot tidak diupload, belum dapat +30
      note: !hasAllEducationData
        ? 'Upload screenshot PDDikti untuk mendapat +30 poin.'
        : null,
    });

  } catch (err) {
    console.error('save-education error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}