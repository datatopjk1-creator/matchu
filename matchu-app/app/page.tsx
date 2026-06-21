"use client";

import { useState } from "react";

export default function Home() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    try {
      setLoading(true);

      const res = await fetch("/api/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert("OTP berhasil dikirim ke email");
        setOtpSent(true);
      } else {
        alert("Gagal mengirim OTP");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi error");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          otp,
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert("OTP valid ✅");
      } else {
        alert(data.message || "OTP tidak valid");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi error");
    }
  };

  return (
    <main className="min-h-screen bg-pink-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md space-y-4">
        <h1 className="text-3xl font-bold text-center text-pink-600">
          Matchu
        </h1>

        <p className="text-center text-gray-500">
          Daftar dan verifikasi email Anda
        </p>

        <input
          type="text"
          placeholder="Nama Lengkap"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-xl p-3"
        />

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-xl p-3"
        />

        {!otpSent && (
          <button
            onClick={sendOtp}
            disabled={loading}
            className="w-full bg-pink-600 text-white p-3 rounded-xl"
          >
            {loading ? "Mengirim..." : "Kirim OTP"}
          </button>
        )}

        {otpSent && (
          <>
            <input
              type="text"
              placeholder="Masukkan OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full border rounded-xl p-3"
            />

            <button
              onClick={verifyOtp}
              className="w-full bg-green-600 text-white p-3 rounded-xl"
            >
              Verifikasi OTP
            </button>
          </>
        )}
      </div>
    </main>
  );
}