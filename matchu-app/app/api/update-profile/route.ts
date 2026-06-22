// app/api/update-profile/route.ts
// Dipanggil dari register-step3.html setelah user isi form profil
// Yang dilakukan:
//   1. Validasi userId dari pending_registrations
//   2. Update data profil ke tabel pending_registrations
//   3. Return success agar frontend lanjut ke step 4

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, ...profileData } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId wajib diisi.' },
        { status: 400 }
      );
    }

    // ── Cari pending registration berdasarkan userId ───────
    // userId dari /api/register adalah "pending_<email>"
    const email = userId.replace('pending_', '');

    const { data: pending, error: fetchError } = await supabase
      .from('pending_registrations')
      .select('id, email')
      .eq('email', email)
      .limit(1);

    if (fetchError || !pending || pending.length === 0) {
      return NextResponse.json(
        { success: false, error: 'User tidak ditemukan.' },
        { status: 404 }
      );
    }

    // ── Update data profil di pending_registrations ────────
    const { error: updateError } = await supabase
      .from('pending_registrations')
      .update({
        step: 3, // sudah selesai step 3
        // Simpan semua data profil sebagai JSON di kolom profile_data
        profile_data: profileData,
      })
      .eq('email', email);

    if (updateError) {
      console.error('update-profile error:', updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('update-profile error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}