import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

console.log('VERIFY OTP ROUTE HIT');
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
      message: 'Email dan kode OTP wajib diisi.',
    },
    { status: 400 }
  );
}

const cleanEmail = email.trim().toLowerCase();

// Ambil OTP terbaru
const { data: record, error: otpError } = await supabase
  .from('email_otps')
  .select('*')
  .eq('email', cleanEmail)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (otpError || !record) {
  return NextResponse.json(
    {
      success: false,
      message: 'Kode OTP tidak ditemukan.',
    },
    { status: 400 }
  );
}

// Maks 3 percobaan
if ((record.attempts || 0) >= 3) {
  await supabase
    .from('email_otps')
    .delete()
    .eq('id', record.id);

  return NextResponse.json(
    {
      success: false,
      message: 'Terlalu banyak percobaan. Silakan minta kode baru.',
    },
    { status: 400 }
  );
}

// Expired
if (new Date(record.expires_at).getTime() < Date.now()) {
  await supabase
    .from('email_otps')
    .delete()
    .eq('id', record.id);

  return NextResponse.json(
    {
      success: false,
      message: 'Kode OTP sudah kadaluarsa.',
    },
    { status: 400 }
  );
}

// OTP salah
if (record.otp !== otp) {
  await supabase
    .from('email_otps')
    .update({
      attempts: (record.attempts || 0) + 1,
    })
    .eq('id', record.id);

  return NextResponse.json(
    {
      success: false,
      message: 'Kode OTP salah.',
    },
    { status: 400 }
  );
}

// Ambil data registrasi
const ud = record.user_data;

if (!ud) {
  return NextResponse.json(
    {
      success: false,
      message:
        'user_data kosong. Periksa endpoint send-otp.',
    },
    { status: 400 }
  );
}

if (!ud.email || !ud.password) {
  return NextResponse.json(
    {
      success: false,
      message:
        'Email atau password tidak ditemukan di user_data.',
    },
    { status: 400 }
  );
}

// Cek email sudah ada
const { data: existing } = await supabase
  .from('users')
  .select('id')
  .eq('email', cleanEmail)
  .maybeSingle();

if (existing) {
  await supabase
    .from('email_otps')
    .delete()
    .eq('id', record.id);

  return NextResponse.json(
    {
      success: false,
      message: 'Email sudah terdaftar.',
    },
    { status: 400 }
  );
}

// Buat akun auth
const { data: authData, error: authError } =
  await supabase.auth.admin.createUser({
    email: ud.email,
    password: ud.password,
    email_confirm: true,
  });

if (authError || !authData.user) {
  console.error(authError);

  return NextResponse.json(
    {
      success: false,
      message:
        authError?.message ||
        'Gagal membuat akun auth.',
    },
    { status: 500 }
  );
}

const userId = authData.user.id;

// Simpan profil
const { error: profileError } = await supabase
  .from('users')
  .insert({
    id: userId,
    email: ud.email,

    nama_lengkap:
      ud.nama ||
      ud.nama_lengkap ||
      null,

    nama_panggilan:
      ud.nama_panggilan || null,

    tanggal_lahir:
      ud.tanggal_lahir || null,

    jenis_kelamin:
      ud.jenis_kelamin || null,

    universitas:
      ud.universitas || null,

    program_studi:
      ud.program_studi || null,

    jenjang:
      ud.jenjang || null,

    tahun_masuk:
      ud.tahun_masuk || null,

    trust_score: 20,
    status: 'aktif',
  });

if (profileError) {
  console.error(
    'PROFILE ERROR FULL:',
    JSON.stringify(profileError, null, 2)
  );

  await supabase.auth.admin.deleteUser(userId);

  return NextResponse.json(
    {
      success: false,
      message: profileError.message,
      details: profileError,
    },
    { status: 500 }
  );
}

// Hapus OTP
await supabase
  .from('email_otps')
  .delete()
  .eq('id', record.id);

return NextResponse.json({
  success: true,
  userId,
});


} catch (error: any) {
console.error(error);


return NextResponse.json(
  {
    success: false,
    message:
      error?.message || 'Server error.',
  },
  { status: 500 }
);


}
}
