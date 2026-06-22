// app/api/register-user/route.ts
// +10 poin diberikan di sini (2 foto diupload)
// Instagram tidak ada poinnya di step ini — +10 instagram via verifikasi terpisah

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function uploadBase64Image(
  base64DataUrl: string,
  bucket: string,
  filePath: string
): Promise<string | null> {
  const matches = base64DataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const ext = mimeType.split('/')[1] || 'jpg';
  const fullPath = `${filePath}.${ext}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fullPath, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    console.error(`Upload error (${filePath}):`, error);
    return null;
  }
  return data.path;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, instagram, foto1, foto2 } = body;

    if (!userId || !foto1 || !instagram) {
      return NextResponse.json(
        { success: false, error: 'userId, foto utama, dan instagram wajib ada.' },
        { status: 400 }
      );
    }

    // ── Ambil profil saat ini ─────────────────────────────────
    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('id, trust_score, foto_score_given')
      .eq('id', userId)
      .single();

    if (fetchErr || !profile) {
      return NextResponse.json(
        { success: false, error: 'User tidak ditemukan.' },
        { status: 404 }
      );
    }

    // ── Upload foto1 (wajib) ──────────────────────────────────
    const foto1Path = await uploadBase64Image(
      foto1, 'foto-profil', `${userId}/foto1-${Date.now()}`
    );
    if (!foto1Path) {
      return NextResponse.json(
        { success: false, error: 'Gagal upload foto utama.' },
        { status: 500 }
      );
    }

    // ── Upload foto2 (opsional) ───────────────────────────────
    let foto2Path: string | null = null;
    if (foto2) {
      foto2Path = await uploadBase64Image(
        foto2, 'foto-profil', `${userId}/foto2-${Date.now()}`
      );
    }

    // ── Hitung trust_score ────────────────────────────────────
    // +10 diberikan hanya SATU KALI (flag foto_score_given)
    // Syarat: minimal foto1 ada (wajib)
    // Catatan: +10 instagram diberikan terpisah saat admin verifikasi Instagram
    const scoreGained = !profile.foto_score_given ? 10 : 0;
    const newScore = profile.trust_score + scoreGained;

    // ── Update profiles — finalisasi registrasi ───────────────
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        foto_url_1:        foto1Path,
        foto_url_2:        foto2Path,
        instagram:         instagram.replace('@', '').trim(),
        trust_score:       newScore,
        ...(scoreGained > 0 && { foto_score_given: true }),
        status:            'aktif',
        registration_step: 5, // 5 = selesai
      })
      .eq('id', userId);

    if (updateError) {
      console.error('register-user update error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Gagal menyelesaikan pendaftaran.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      userId,
      trust_score: newScore,
      score_gained: scoreGained,
    });

  } catch (err) {
    console.error('register-user catch:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}