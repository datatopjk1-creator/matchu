import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// ── GET: ambil list verifikasi + stats + riwayat ──────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'pending'; // pending | approved | rejected | all
    const search = (searchParams.get('search') || '').toLowerCase();

    // ── List utama (sesuai filter status) ───────────────────────
    let listQuery = supabase
      .from('education_verifications')
      .select('id, user_id, email, kampus, jurusan, jenjang, screenshot_url, status, rejection_reason, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      listQuery = listQuery.eq('status', status);
    }

    const { data: rows, error: listError } = await listQuery;

    if (listError) {
      console.error('[ADMIN-EDU-VERIF] list error:', listError);
      return NextResponse.json({ success: false, error: 'Gagal mengambil data.' }, { status: 500 });
    }

    // ── Ambil nama & trust_score dari profiles ──────────────────
    const userIds = (rows || []).map(r => r.user_id).filter(Boolean);
    let profilesMap: Record<string, { nama: string; trust_score: number }> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nama, trust_score')
        .in('id', userIds);

      profilesMap = (profiles || []).reduce((acc, p) => {
        acc[p.id] = { nama: p.nama, trust_score: p.trust_score };
        return acc;
      }, {} as Record<string, { nama: string; trust_score: number }>);
    }

    // ── Generate signed URL untuk screenshot (bucket privat) ────
    let list = await Promise.all((rows || []).map(async (r) => {
      let signedUrl: string | null = null;
      if (r.screenshot_url) {
        const { data: signed } = await supabase.storage
          .from('education-screenshots')
          .createSignedUrl(r.screenshot_url, 3600); // berlaku 1 jam
        signedUrl = signed?.signedUrl || null;
      }
      return {
        ...r,
        nama: profilesMap[r.user_id]?.nama || r.email,
        trust_score: profilesMap[r.user_id]?.trust_score ?? 0,
        screenshot_url: signedUrl,
      };
    }));

    // ── Filter search (nama / email / kampus / jurusan) ─────────
    if (search) {
      list = list.filter(r =>
        (r.nama || '').toLowerCase().includes(search) ||
        (r.email || '').toLowerCase().includes(search) ||
        (r.kampus || '').toLowerCase().includes(search) ||
        (r.jurusan || '').toLowerCase().includes(search)
      );
    }

    // ── Stats jumlah per status ──────────────────────────────────
    const { count: pendingCount } = await supabase
      .from('education_verifications').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const { count: approvedCount } = await supabase
      .from('education_verifications').select('*', { count: 'exact', head: true }).eq('status', 'approved');
    const { count: rejectedCount } = await supabase
      .from('education_verifications').select('*', { count: 'exact', head: true }).eq('status', 'rejected');

    // ── Riwayat terbaru (approved + rejected, 10 terakhir) ──────
    const { data: riwayatRows } = await supabase
      .from('education_verifications')
      .select('user_id, email, kampus, status, updated_at')
      .in('status', ['approved', 'rejected'])
      .order('updated_at', { ascending: false })
      .limit(10);

    const riwayat = (riwayatRows || []).map(r => ({
      ...r,
      nama: profilesMap[r.user_id]?.nama || r.email,
    }));

    // ── Top kampus (berdasarkan jumlah yang approved) ───────────
    const { data: approvedAll } = await supabase
      .from('education_verifications')
      .select('kampus')
      .eq('status', 'approved');

    const kampusCount: Record<string, number> = {};
    (approvedAll || []).forEach(r => {
      if (r.kampus) kampusCount[r.kampus] = (kampusCount[r.kampus] || 0) + 1;
    });
    const topKampus = Object.entries(kampusCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([nama, jumlah]) => ({ nama, jumlah }));

    return NextResponse.json({
      success: true,
      list,
      stats: {
        pending: pendingCount || 0,
        approved: approvedCount || 0,
        rejected: rejectedCount || 0,
      },
      riwayat,
      topKampus,
    });

  } catch (err) {
    console.error('[ADMIN-EDU-VERIF] error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}

// ── PATCH: approve / reject ─────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const { id, action, reason, adminId } = await req.json();
    // action: 'approve' | 'reject'

    if (!id || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Parameter tidak valid.' }, { status: 400 });
    }

    if (action === 'reject' && !reason?.trim()) {
      return NextResponse.json({ success: false, error: 'Alasan penolakan wajib diisi.' }, { status: 400 });
    }

    const { data: verifRow, error: fetchError } = await supabase
      .from('education_verifications')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !verifRow) {
      return NextResponse.json({ success: false, error: 'Data verifikasi tidak ditemukan.' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // ── Update baris verifikasi ──────────────────────────────────
    const { error: updateVerifError } = await supabase
      .from('education_verifications')
      .update({
        status: newStatus,
        rejection_reason: action === 'reject' ? reason.trim() : null,
        reviewed_at: nowIso,
        reviewed_by: adminId || null,
        updated_at: nowIso,
      })
      .eq('id', id);

    if (updateVerifError) {
      console.error('[ADMIN-EDU-VERIF] update error:', updateVerifError);
      return NextResponse.json({ success: false, error: 'Gagal memperbarui status.' }, { status: 500 });
    }

    if (action === 'approve') {
      // ── Cek apakah poin pendidikan sudah pernah diberikan ──────
      const { data: profile } = await supabase
        .from('profiles')
        .select('trust_score, education_score_given')
        .eq('id', verifRow.user_id)
        .single();

      const scoreGained = profile && !profile.education_score_given ? 30 : 0;
      const newScore = (profile?.trust_score || 0) + scoreGained;

      await supabase
        .from('profiles')
        .update({
          education_verified: true,
          education_verification_status: 'approved',
          education_rejection_reason: null,
          trust_score: newScore,
          ...(scoreGained > 0 && { education_score_given: true }),
        })
        .eq('id', verifRow.user_id);

    } else {
      // ── Reject: tidak ada perubahan trust_score ────────────────
      await supabase
        .from('profiles')
        .update({
          education_verified: false,
          education_verification_status: 'rejected',
          education_rejection_reason: reason.trim(),
        })
        .eq('id', verifRow.user_id);
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[ADMIN-EDU-VERIF PATCH] error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}