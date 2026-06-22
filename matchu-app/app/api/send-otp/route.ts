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
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email dan OTP wajib diisi',
        },
        {
          status: 400,
        }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // Cari OTP
    const { data: otpData, error: otpError } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', cleanEmail)
      .eq('otp', otp)
      .single();

    if (otpError || !otpData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Kode OTP tidak valid',
        },
        {
          status: 400,
        }
      );
    }

    // Cek expired
    if (new Date(otpData.expires_at) < new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Kode OTP sudah kadaluarsa',
        },
        {
          status: 400,
        }
      );
    }

    // Ambil data registrasi
    const userData = otpData.user_data;

    if (!userData) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Data registrasi tidak ditemukan. Silakan daftar ulang.',
        },
        {
          status: 400,
        }
      );
    }

    // Cek email sudah ada
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email sudah terdaftar',
        },
        {
          status: 400,
        }
      );
    }

    // Buat user di Supabase Auth
    const { data: authUser, error: authError } =
      await supabase.auth.admin.createUser({
        email: cleanEmail,
        password: userData.password,
        email_confirm: true,
      });

    if (authError) {
      return NextResponse.json(
        {
          success: false,
          error: authError.message,
        },
        {
          status: 400,
        }
      );
    }

    const userId = authUser.user.id;

    // Simpan ke public.users
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: cleanEmail,

        nama_lengkap:
          userData.nama ??
          userData.nama_lengkap ??
          null,

        nama_panggilan:
          userData.nama_panggilan ?? null,

        tanggal_lahir:
          userData.tanggal_lahir ?? null,

        jenis_kelamin:
          userData.jenis_kelamin ?? null,

        universitas:
          userData.universitas ?? null,

        program_studi:
          userData.program_studi ?? null,

        jenjang:
          userData.jenjang ?? null,

        tahun_masuk:
          userData.tahun_masuk ?? null,

        status_pendidikan:
          userData.status_pendidikan ?? null,

        bulan_lahir:
          userData.bulan_lahir ?? null,

        tahun_lahir:
          userData.tahun_lahir ?? null,

        status_nikah:
          userData.status_nikah ?? null,

        status_kerja:
          userData.status_kerja ?? null,

        profesi:
          userData.profesi ?? null,

        perusahaan:
          userData.perusahaan ?? null,

        kota_domisili:
          userData.kota_domisili ?? null,

        kota_asal:
          userData.kota_asal ?? null,

        tinggi_badan:
          userData.tinggi_badan ?? null,

        berat_badan:
          userData.berat_badan ?? null,

        agama:
          userData.agama ?? null,

        target_menikah:
          userData.target_menikah ?? null,

        kepribadian:
          userData.kepribadian ?? null,

        mbti:
          userData.mbti ?? null,

        hobi:
          userData.hobi ?? null,

        bahasa:
          userData.bahasa ?? null,

        bio:
          userData.bio ?? null,

        foto_utama:
          userData.foto_utama ?? null,

        foto_kedua:
          userData.foto_kedua ?? null,

        instagram:
          userData.instagram ?? null,

        trust_score: 0,
        status: 'pending',
      });

    if (profileError) {
      // rollback auth user
      await supabase.auth.admin.deleteUser(userId);

      return NextResponse.json(
        {
          success: false,
          error: profileError.message,
        },
        {
          status: 400,
        }
      );
    }

    // Hapus OTP
    await supabase
      .from('email_otps')
      .delete()
      .eq('email', cleanEmail);

    return NextResponse.json({
      success: true,
      user_id: userId,
    });
  } catch (error: any) {
    console.error('complete-register error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Server error',
      },
      {
        status: 500,
      }
    );
  }
}