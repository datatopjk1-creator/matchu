import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

console.log('SEND OTP ROUTE HIT');
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

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
try {
const body = await req.json();


const {
  nama,
  nama_panggilan,
  email,
  password,
  tanggal_lahir,
  jenis_kelamin,
} = body;

if (
  !nama ||
  !nama_panggilan ||
  !email ||
  !password
) {
  return NextResponse.json(
    {
      success: false,
      error: 'Data pendaftaran tidak lengkap.',
    },
    {
      status: 400,
    }
  );
}

const cleanEmail = email.trim().toLowerCase();

// cek email sudah ada
const { data: existingUser } = await supabase
  .from('users')
  .select('id')
  .eq('email', cleanEmail)
  .maybeSingle();

if (existingUser) {
  return NextResponse.json(
    {
      success: false,
      error: 'Email sudah terdaftar.',
    },
    {
      status: 400,
    }
  );
}

// generate otp
const otp = Math.floor(
  100000 + Math.random() * 900000
).toString();

const expiresAt = new Date(
  Date.now() + 10 * 60 * 1000
).toISOString();

// hapus otp lama
await supabase
  .from('email_otps')
  .delete()
  .eq('email', cleanEmail);

const userData = {
  nama,
  nama_panggilan,
  email: cleanEmail,
  password,
  tanggal_lahir: tanggal_lahir || null,
  jenis_kelamin: jenis_kelamin || null,
};

console.log(
  'REGISTER USER DATA:',
  JSON.stringify(userData)
);

// simpan otp
const { data: insertedOtp, error: insertError } =
  await supabase
    .from('email_otps')
    .insert({
      email: cleanEmail,
      otp,
      expires_at: expiresAt,
      attempts: 0,
      user_data: userData,
    })
    .select()
    .single();

if (insertError) {
  console.error(
    'OTP INSERT ERROR:',
    insertError
  );

  return NextResponse.json(
    {
      success: false,
      error:
        'Gagal menyimpan data OTP: ' +
        insertError.message,
    },
    {
      status: 500,
    }
  );
}

console.log(
  'OTP SAVED:',
  JSON.stringify(insertedOtp)
);

// kirim email
const { error: emailError } =
  await resend.emails.send({
    from: 'Matchu <verify@matchu.id>',
    to: cleanEmail,
    subject: 'Kode Verifikasi Matchu',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:30px;">
        <h2>MATCHU</h2>
        <p>Halo <strong>${nama_panggilan}</strong>,</p>

        <p>
          Gunakan kode berikut untuk menyelesaikan pendaftaran:
        </p>

        <div style="
          text-align:center;
          font-size:42px;
          font-weight:bold;
          letter-spacing:10px;
          margin:30px 0;
        ">
          ${otp}
        </div>

        <p>
          Kode berlaku selama 10 menit.
        </p>
      </div>
    `,
  });

if (emailError) {
  console.error(
    'RESEND ERROR:',
    emailError
  );

  return NextResponse.json(
    {
      success: false,
      error: 'Gagal mengirim email OTP.',
    },
    {
      status: 500,
    }
  );
}

return NextResponse.json({
  success: true,
  message: 'OTP berhasil dikirim.',
});


} catch (error: any) {
console.error(
'SEND OTP ERROR:',
error
);

return NextResponse.json(
  {
    success: false,
    error:
      error?.message || 'Server error.',
  },
  {
    status: 500,
  }
);

}
}
