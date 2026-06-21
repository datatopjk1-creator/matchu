import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    console.log("EMAIL:", email);
    console.log("SUPABASE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log("RESEND KEY EXISTS:", !!process.env.RESEND_API_KEY);

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString();

    // simpan OTP ke Supabase
    const { error } = await supabase
      .from("email_otps")
      .insert({
        email,
        otp,
        expires_at: expiresAt,
      });

    if (error) {
      throw error;
    }

    await resend.emails.send({
      from: "verify@matchu.id",
      to: email,
      subject: "Kode Verifikasi Matchu",
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2>Verifikasi Email Matchu</h2>

          <p>Kode verifikasi Anda:</p>

          <h1 style="
            letter-spacing:4px;
            color:#7A2236;
          ">
            ${otp}
          </h1>

          <p>Kode berlaku selama 10 menit.</p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
    });

  } catch (error: any) {
  console.error("=== SEND OTP ERROR ===");
  console.error(error);

  return NextResponse.json(
    {
      success: false,
      error: error?.message || error,
    },
    { status: 500 }
  );
}
}