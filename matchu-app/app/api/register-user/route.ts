// matchu-app/app/api/register-user/route.ts
// Tugas: simpan foto dan instagram SAJA
// Nama sudah tersimpan di step complete-register sebelumnya

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
    const { userId, instagram, foto1, foto2 } = body;

    console.log('register-user called, userId:', userId, 'ig:', instagram);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId tidak ditemukan.' },
        { status: 400 }
      );
    }

    // ── Upload foto ke Supabase Storage ──────────────────────────────────
    let foto1Url = null;
    let foto2Url = null;

    if (foto1) {
      try {
        const base64Data = foto1.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `${userId}/foto1_${Date.now()}.jpg`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from('photos')
          .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

        if (!uploadError) {
          const { data } = supabaseAdmin.storage.from('photos').getPublicUrl(fileName);
          foto1Url = data.publicUrl;
        } else {
          console.error('upload foto1 error:', uploadError.message);
        }
      } catch (e) {
        console.error('foto1 processing error:', e);
      }
    }

    if (foto2) {
      try {
        const base64Data = foto2.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `${userId}/foto2_${Date.now()}.jpg`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from('photos')
          .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

        if (!uploadError) {
          const { data } = supabaseAdmin.storage.from('photos').getPublicUrl(fileName);
          foto2Url = data.publicUrl;
        }
      } catch (e) {
        console.error('foto2 processing error:', e);
      }
    }

    // ── Simpan instagram + foto ke tabel profiles ─────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('profiles')
        .update({
          foto_utama: foto1Url,
          foto_kedua: foto2Url,
          instagram:  instagram || null,
        })
        .eq('id', userId);
    } else {
      await supabaseAdmin
        .from('profiles')
        .insert({
          id:         userId,
          foto_utama: foto1Url,
          foto_kedua: foto2Url,
          instagram:  instagram || null,
        });
    }

    // ── Update status di tabel users (tandai registrasi selesai) ─────────
    await supabaseAdmin
      .from('users')
      .update({ status: 'aktif' })
      .eq('id', userId);

    return NextResponse.json({ success: true, userId, foto1Url });

  } catch (error: any) {
    console.error('register-user error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}