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
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId wajib diisi.' },
        { status: 400 }
      );
    }

    // Pastikan user memang ada (mencegah update ke id sembarangan)
    const { data: existing, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (findError || !existing) {
      return NextResponse.json(
        { success: false, error: 'User tidak ditemukan.' },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        bulan_lahir: body.bulan_lahir ?? null,
        tahun_lahir: body.tahun_lahir ?? null,
        status_nikah: body.status_nikah || null,

        // Field pendidikan ini menimpa data awal dari proses register (jika ada)
        universitas: body.universitas || null,
        program_studi: body.program_studi || null,
        jenjang: body.jenjang || null,
        tahun_masuk: body.tahun_masuk ?? null,
        status_pendidikan: body.status_pendidikan || null,

        status_kerja: body.status_kerja || null,
        profesi: body.profesi || null,
        perusahaan: body.perusahaan || null,

        kota_domisili: body.kota_domisili || null,
        kota_asal: body.kota_asal || null,

        tinggi_badan: body.tinggi_badan ?? null,
        berat_badan: body.berat_badan ?? null,

        agama: body.agama || null,
        target_menikah: body.target_menikah || null,

        kepribadian: body.kepribadian || null,
        mbti: body.mbti || null,

        hobi: body.hobi || null,
        bahasa: body.bahasa || null,
        bio: body.bio || null,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('UPDATE PROFILE ERROR:', updateError);
      return NextResponse.json(
        {
          success: false,
          error: 'Gagal menyimpan profil: ' + updateError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('UPDATE PROFILE SERVER ERROR:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error.' },
      { status: 500 }
    );
  }
}

/*
  ⚠️ PENTING — sebelum endpoint ini dipakai, pastikan tabel `users` di Supabase
  sudah punya SEMUA kolom berikut (tambahkan dulu lewat Table Editor kalau belum ada):

  bulan_lahir          integer
  tahun_lahir          integer
  status_nikah         text
  status_pendidikan    text
  status_kerja         text
  profesi              text
  perusahaan           text
  kota_domisili        text
  kota_asal            text
  tinggi_badan         integer
  berat_badan          integer
  agama                text
  target_menikah       text
  kepribadian          text
  mbti                 text
  hobi                 text
  bahasa               text
  bio                  text

  Kolom universitas, program_studi, jenjang, tahun_masuk seharusnya sudah ada
  dari proses register awal (verify-otp).
*/