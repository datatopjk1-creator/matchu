// app/api/save-education/route.ts
// Dipakai untuk: (1) submit pertama kali saat registrasi, (2) submit ulang
// setelah ditolak admin. Tidak lagi memberi +30 poin otomatis di sini —
// poin baru diberikan saat admin APPROVE di /api/admin/education-verifications.

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, kampus, jurusan, jenjang, education_screenshot, tahun_masuk, status_pendidikan } = body;

    if (!userId || !kampus || !jurusan || !jenjang) {
      return NextResponse.json(
        { success: false, error: 'Data pendidikan tidak lengkap.' },
        { status: 400 }
      );
    }

    // ── Ambil profil saat ini ─────────────────────────────────
    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('id, email, education_screenshot_url')
      .eq('id', userId)
      .single();

    if (fetchErr || !profile) {
      return NextResponse.json(
        { success: false, error: 'User tidak ditemukan.' },
        { status: 404 }
      );
    }

    // ── Upload screenshot PDDikti (kalau ada yang baru) ───────
    let screenshotUrl: string | null = profile.education_screenshot_url || null;

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

    if (!screenshotUrl) {
      return NextResponse.json(
        { success: false, error: 'Screenshot PDDikti wajib diupload.' },
        { status: 400 }
      );
    }

    // ── Update data pendidikan di profiles ────────────────────
    // Status verifikasi di-reset ke 'pending', alasan tolak (jika ada) dihapus
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({
        kampus: kampus.trim(),
        jurusan: jurusan.trim(),
        jenjang,
        // ✅ disinkronkan juga ke kolom yang dibaca profil.html
        universitas: kampus.trim(),
        program_studi: jurusan.trim(),
        ...(tahun_masuk && { tahun_masuk }),
        ...(status_pendidikan && { status_pendidikan }),
        education_screenshot_url: screenshotUrl,
        education_verification_status: 'pending',
        education_rejection_reason: null,
        registration_step: 3,
      })
      .eq('id', userId);

    if (updateProfileError) {
      console.error('Update profile education error:', updateProfileError);
      return NextResponse.json(
        { success: false, error: 'Gagal menyimpan data pendidikan.' },
        { status: 500 }
      );
    }

    // ── Upsert ke tabel education_verifications (untuk admin review) ──
    const { error: upsertError } = await supabase
      .from('education_verifications')
      .upsert(
        {
          user_id: userId,
          email: profile.email,
          kampus: kampus.trim(),
          jurusan: jurusan.trim(),
          jenjang,
          screenshot_url: screenshotUrl,
          status: 'pending',
          rejection_reason: null,
          reviewed_at: null,
          reviewed_by: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('Upsert education_verifications error:', upsertError);
      return NextResponse.json(
        { success: false, error: 'Gagal mengirim data untuk verifikasi.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Data pendidikan berhasil dikirim. Tim kami akan verifikasi dalam 1x24 jam.',
    });

  } catch (err) {
    console.error('save-education error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}