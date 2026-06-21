import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// POST /api/verify-education
// User submit screenshot PDDikti untuk verifikasi
export async function POST(req: Request) {
  try {
    const { userId, screenshot_url, kampus_klaim, jurusan_klaim } = await req.json();

    if (!userId || !screenshot_url) {
      return NextResponse.json({ success: false, error: 'Data tidak lengkap.' }, { status: 400 });
    }

    // Cek apakah sudah ada pengajuan pending
    const { data: existing } = await supabase
      .from('education_verifications')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: false,
        error: 'Pengajuan verifikasi kamu sedang diproses. Tunggu hasilnya terlebih dahulu.',
      }, { status: 400 });
    }

    // Insert pengajuan baru
    const { error } = await supabase
      .from('education_verifications')
      .insert({
        user_id: userId,
        screenshot_url,
        kampus_klaim,
        jurusan_klaim,
        status: 'pending',
      });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Pengajuan verifikasi pendidikan berhasil dikirim. Kami akan memeriksa dalam 1x24 jam.',
    });
  } catch (error: any) {
    console.error('verify-education error:', error);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}

// PATCH /api/verify-education
// Admin approve/reject — dipanggil dari admin panel
export async function PATCH(req: Request) {
  try {
    const { verificationId, status, catatan } = await req.json();

    if (!verificationId || !status) {
      return NextResponse.json({ success: false, error: 'Data tidak lengkap.' }, { status: 400 });
    }

    // Update status verifikasi
    const { data: verif, error } = await supabase
      .from('education_verifications')
      .update({ status, catatan, reviewed_at: new Date().toISOString() })
      .eq('id', verificationId)
      .select('user_id')
      .single();

    if (error) throw error;

    // Kalau approved, update user education_verified + trust_score
    if (status === 'approved' && verif?.user_id) {
      const { data: user } = await supabase
        .from('users')
        .select('trust_score')
        .eq('id', verif.user_id)
        .single();

      const newScore = Math.min((user?.trust_score || 20) + 30, 100);

      await supabase
        .from('users')
        .update({ education_verified: true, trust_score: newScore })
        .eq('id', verif.user_id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('approve-education error:', error);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}