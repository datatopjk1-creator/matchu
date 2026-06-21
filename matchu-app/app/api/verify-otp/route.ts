import { NextResponse } from "next/server";
import { supabase } from "../../../src/lib/supabase";

export async function POST(req: Request) {
  try {
    const { email, otp } = await req.json();

    // Ambil OTP terbaru untuk email ini
    const { data, error } = await supabase
      .from("email_otps")
      .select("*")
      .eq("email", email)
      .eq("otp", otp)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: false,
        message: "OTP tidak valid",
      });
    }

    const record = data[0];

    // Cek terlalu banyak percobaan
    if (record.attempts >= 3) {
      await supabase
        .from("email_otps")
        .delete()
        .eq("uuid", record.uuid);

      return NextResponse.json({
        success: false,
        message: "Terlalu banyak percobaan, minta OTP baru",
      });
    }

    // Cek apakah OTP sudah kadaluarsa (pakai UTC)
    const expiresAtMs = new Date(record.expires_at + "Z").getTime();
    const nowMs = Date.now();

    if (expiresAtMs < nowMs) {
      // Hapus OTP yang sudah expired
      await supabase
        .from("email_otps")
        .delete()
        .eq("uuid", record.uuid);

      return NextResponse.json({
        success: false,
        message: "OTP sudah kadaluarsa",
      });
    }

    // OTP valid — hapus supaya tidak bisa dipakai lagi
    await supabase
      .from("email_otps")
      .delete()
      .eq("uuid", record.uuid);

    return NextResponse.json({
      success: true,
      message: "OTP valid",
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan" },
      { status: 500 }
    );
  }
}