// matchu-app/app/api/register-user/route.ts
// Dipanggil dari register-step4.html (upload foto + instagram)
// Menyimpan foto dan instagram ke tabel profiles di Supabase

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Ambil semua field dari body — nama bisa dari userData yang di-spread
    const {
      userId,
      nama,
      nama_panggilan,
      email,
      tanggal_lahir,
      jenis_kelamin,
      instagram,
      foto1,
      foto2,
    } = body;

    // Log untuk debug
    console.log('register-user body:', {
      userId,
      nama,
      email,
      instagram,
      hasFoto1: !!foto1,
    });

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId tidak ditemukan.' }, { status: 400 });
    }

    // ── 1. Update tabel users dengan data yang mungkin belum tersimpan ──
    // (nama_lengkap wajib ada — ambil dari body atau fallback ke email)
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        nama_lengkap:   nama || email || 'User',   // fallback agar tidak null
        nama_panggilan: nama_panggilan || nama || 'User',
        instagram:      instagram || null,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('update users error:', updateError);
      // Lanjutkan meskipun update gagal — mungkin kolom instagram belum ada
    }

    // ── 2. Upload foto ke Supabase Storage (bucket: photos) ──
    let foto1Url = null;
    let foto2Url = null;

    if (foto1) {
      // foto1 adalah base64 string "data:image/jpeg;base64,..."
      const base64Data = foto1.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `${userId}/foto1_${Date.now()}.jpg`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('photos')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (!uploadError) {
        const { data: urlData } = supabaseAdmin.storage
          .from('photos')
          .getPublicUrl(fileName);
        foto1Url = urlData.publicUrl;
      } else {
        console.error('upload foto1 error:', uploadError);
      }
    }

    if (foto2) {
      const base64Data = foto2.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `${userId}/foto2_${Date.now()}.jpg`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('photos')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (!uploadError) {
        const { data: urlData } = supabaseAdmin.storage
          .from('photos')
          .getPublicUrl(fileName);
        foto2Url = urlData.publicUrl;
      }
    }

    // ── 3. Simpan URL foto ke tabel profiles ──
    // Cek apakah sudah ada row untuk user ini
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      // Update
      await supabaseAdmin
        .from('profiles')
        .update({
          foto_utama: foto1Url,
          foto_kedua: foto2Url,
          instagram:  instagram || null,
        })
        .eq('id', userId);
    } else {
      // Insert baru
      await supabaseAdmin
        .from('profiles')
        .insert({
          id:         userId,
          foto_utama: foto1Url,
          foto_kedua: foto2Url,
          instagram:  instagram || null,
        });
    }

    return NextResponse.json({
      success: true,
      userId,
      foto1Url,
    });

  } catch (error: any) {
    console.error('register-user error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}