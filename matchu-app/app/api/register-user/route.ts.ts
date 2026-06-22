import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

async function uploadFoto(userId: string, base64: string, label: string) {
  const matches = base64.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error(`Format ${label} tidak valid.`);

  const mimeType = matches[1];
  const ext = mimeType.split('/')[1] || 'jpg';
  const buffer = Buffer.from(matches[2], 'base64');
  const fileName = `${userId}/${label}-${Date.now()}.${ext}`;

  // ⚠️ Pastikan bucket "profile-photos" sudah dibuat di Supabase Storage
  const { error } = await supabase.storage
    .from('profile-photos')
    .upload(fileName, buffer, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Gagal upload ${label}: ${error.message}`);

  const { data } = supabase.storage.from('profile-photos').getPublicUrl(fileName);
  return data.publicUrl;
}

export async function POST(req: Request) {
  try {
    const { userId, instagram, foto1, foto2 } = await req.json();

    if (!userId || !instagram || !foto1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Data tidak lengkap (foto utama & instagram wajib diisi).',
        },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'User tidak ditemukan.' },
        { status: 404 }
      );
    }

    const foto1Url = await uploadFoto(userId, foto1, 'foto1');
    const foto2Url = foto2 ? await uploadFoto(userId, foto2, 'foto2') : null;

    const { error: updateError } = await supabase
      .from('users')
      .update({
        instagram,
        foto_utama_url: foto1Url,
        foto_kedua_url: foto2Url,
        status: 'aktif',
        profile_completed: true,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('REGISTER USER UPDATE ERROR:', updateError);
      return NextResponse.json(
        {
          success: false,
          error: 'Gagal menyelesaikan pendaftaran: ' + updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, userId });
  } catch (error: any) {
    console.error('REGISTER USER SERVER ERROR:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error.' },
      { status: 500 }
    );
  }
}

/*
  ⚠️ PENTING — sebelum endpoint ini dipakai, pastikan:

  1. Storage bucket bernama "profile-photos" sudah dibuat di Supabase Storage.

  2. Tabel `users` punya kolom tambahan:
     instagram          text
     foto_utama_url     text
     foto_kedua_url     text
     profile_completed  boolean (default false)
*/