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

export async function POST(req: Request) {
  try {
    const { id, screenshot_url, kampus_klaim, jurusan_klaim } = await req.json();

    if (!id || !screenshot_url || !kampus_klaim || !jurusan_klaim) {
      return NextResponse.json(
        { success: false, error: 'Data verifikasi tidak lengkap.' },
        { status: 400 }
      );
    }

    // screenshot_url dikirim sebagai data URL base64: data:image/png;base64,xxxxx
    const matches = screenshot_url.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { success: false, error: 'Format screenshot tidak valid.' },
        { status: 400 }
      );
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const ext = mimeType.split('/')[1] || 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${id}-${Date.now()}.${ext}`;

    // ⚠️ Pastikan bucket "education-docs" sudah dibuat di Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('education-docs')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error('UPLOAD SCREENSHOT ERROR:', uploadError);
      return NextResponse.json(
        {
          success: false,
          error: 'Gagal upload screenshot: ' + uploadError.message,
        },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from('education-docs')
      .getPublicUrl(fileName);

    // Simpan pengajuan verifikasi sebagai baris terpisah berstatus 'pending'.
    // Trust Score +30 / badge "Alumni Terverifikasi" baru diaktifkan setelah
    // status ini diubah admin menjadi 'approved' (proses manual 1x24 jam).
    const { error: insertError } = await supabase
      .from('education_verifications')
      .insert({
        user_id: id,
        kampus_klaim,
        jurusan_klaim,
        screenshot_url: publicUrlData.publicUrl,
        status: 'pending',
      });

    if (insertError) {
      console.error('INSERT VERIFICATION ERROR:', insertError);
      return NextResponse.json(
        {
          success: false,
          error: 'Gagal menyimpan pengajuan: ' + insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('VERIFY EDUCATION SERVER ERROR:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error.' },
      { status: 500 }
    );
  }
}

/*
  ⚠️ PENTING — sebelum endpoint ini dipakai, buat dulu di Supabase:

  1. Storage bucket bernama "education-docs" (set public read jika ingin
     getPublicUrl bisa diakses langsung, atau gunakan signed URL kalau privat).

  2. Tabel baru `education_verifications` dengan kolom:
     id              uuid (primary key, default gen_random_uuid())
     user_id         uuid (foreign key -> users.id)
     kampus_klaim    text
     jurusan_klaim   text
     screenshot_url  text
     status          text  (default 'pending')
     created_at      timestamptz (default now())
*/