import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const VISIBLE_LIMIT = 3; // jumlah surat yang terbuka tanpa premium

// ── GET: surat masuk (incoming) ATAU surat terkirim (sent) ──
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const type = searchParams.get('type') || 'incoming'; // incoming | sent

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId wajib diisi.' }, { status: 400 });
    }

    // ── Ambil info siklus (dipakai untuk disclaimer countdown) ──
    const { data: meProfile } = await supabase
      .from('profiles')
      .select('candidate_cycle_reset_at')
      .eq('id', userId)
      .single();

    const cycleResetAt = meProfile?.candidate_cycle_reset_at || null;
    const daysLeft = cycleResetAt
      ? Math.max(0, Math.ceil((new Date(cycleResetAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    // ═══════════════════════════════════════════════════════
    // TYPE: SENT — semua surat yang dikirim user (semua status)
    // ═══════════════════════════════════════════════════════
    if (type === 'sent') {
      const { data: rows, error } = await supabase
        .from('introduction_requests')
        .select('id, receiver_id, message, match_score, status, created_at, responded_at')
        .eq('sender_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[INTRO-REQ] GET sent error:', error);
        return NextResponse.json({ success: false, error: 'Gagal mengambil data.' }, { status: 500 });
      }

      const receiverIds = (rows || []).map(r => r.receiver_id);
      let profilesMap: Record<string, any> = {};
      if (receiverIds.length > 0) {
        const { data: receivers } = await supabase
          .from('profiles')
          .select('id, nama_panggilan, universitas, program_studi, profesi, kota_domisili, education_score_given')
          .in('id', receiverIds);
        profilesMap = (receivers || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as Record<string, any>);
      }

      const sent = (rows || []).map(r => {
        const p = profilesMap[r.receiver_id];
        return {
          id: r.id,
          receiverId: r.receiver_id,
          matchScore: r.match_score,
          status: r.status,
          createdAt: r.created_at,
          respondedAt: r.responded_at,
          namaPanggilan: p?.nama_panggilan || 'Tanpa nama',
          universitas: p?.universitas || null,
          programStudi: p?.program_studi || null,
          profesi: p?.profesi || null,
          kotaDomisili: p?.kota_domisili || null,
          terverifikasi: !!p?.education_score_given,
        };
      });

      const stats = {
        total: sent.length,
        waiting: sent.filter(s => s.status === 'pending').length,
        accepted: sent.filter(s => s.status === 'accepted').length,
        rejected: sent.filter(s => s.status === 'rejected').length,
      };

      return NextResponse.json({ success: true, sent, stats, cycle: { resetAt: cycleResetAt, daysLeft } });
    }

    // ═══════════════════════════════════════════════════════
    // TYPE: INCOMING — surat masuk yang masih pending
    // ═══════════════════════════════════════════════════════

    // ── Cek premium aktif ────────────────────────────────────
    const nowIso = new Date().toISOString();
    const { data: activeSub } = await supabase
      .from('premium_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .limit(1);

    const isPremium = !!(activeSub && activeSub.length > 0);

    const { data: rows, error } = await supabase
      .from('introduction_requests')
      .select('id, sender_id, message, match_score, status, created_at')
      .eq('receiver_id', userId)
      .eq('status', 'pending')
      .order('match_score', { ascending: false });

    if (error) {
      console.error('[INTRO-REQ] GET error:', error);
      return NextResponse.json({ success: false, error: 'Gagal mengambil data.' }, { status: 500 });
    }

    const senderIds = (rows || []).map(r => r.sender_id);
    let profilesMap: Record<string, any> = {};
    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from('profiles')
        .select('id, nama_panggilan, universitas, program_studi, profesi, kota_domisili, education_score_given')
        .in('id', senderIds);
      profilesMap = (senders || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as Record<string, any>);
    }

    const total = rows?.length || 0;
    const visibleCount = isPremium ? total : Math.min(VISIBLE_LIMIT, total);

    const visible = (rows || []).slice(0, visibleCount).map(r => {
      const p = profilesMap[r.sender_id];
      return {
        id: r.id,
        matchScore: r.match_score,
        message: r.message,
        createdAt: r.created_at,
        namaPanggilan: p?.nama_panggilan || 'Tanpa nama',
        universitas: p?.universitas || null,
        programStudi: p?.program_studi || null,
        profesi: p?.profesi || null,
        kotaDomisili: p?.kota_domisili || null,
        terverifikasi: !!p?.education_score_given,
        blurred: false,
      };
    });

    const hiddenCount = total - visible.length;

    return NextResponse.json({
      success: true,
      isPremium,
      total,
      visible,
      hiddenCount,
      cycle: { resetAt: cycleResetAt, daysLeft },
    });

  } catch (err) {
    console.error('[INTRO-REQ] GET error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}

// ── POST: kirim surat perkenalan baru ───────────────────────
export async function POST(req: NextRequest) {
  try {
    const { senderId, receiverId, message } = await req.json();

    if (!senderId || !receiverId) {
      return NextResponse.json({ success: false, error: 'Data tidak lengkap.' }, { status: 400 });
    }

    // ── Pastikan receiver memang salah satu kandidat aktif sender ──
    const { data: candRow } = await supabase
      .from('weekly_candidates')
      .select('match_score')
      .eq('user_id', senderId)
      .eq('candidate_id', receiverId)
      .eq('match_type', 'weekly')
      .limit(1);

    if (!candRow || candRow.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Kandidat ini bukan bagian dari rekomendasi aktif kamu.' },
        { status: 400 }
      );
    }

    // ── Cegah kirim dobel ke orang yang sama dalam siklus ini ──
    const { data: existing } = await supabase
      .from('introduction_requests')
      .select('id')
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Kamu sudah pernah mengirim surat perkenalan ke orang ini.' },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase
      .from('introduction_requests')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        message: message || null,
        match_score: candRow[0].match_score,
        status: 'pending',
      });

    if (insertError) {
      console.error('[INTRO-REQ] POST error:', insertError);
      return NextResponse.json({ success: false, error: 'Gagal mengirim surat.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Surat perkenalan berhasil dikirim.' });

  } catch (err) {
    console.error('[INTRO-REQ] POST error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}

// ── PATCH: terima / tolak surat ─────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const { requestId, userId, action } = await req.json(); // action: 'accept' | 'reject'

    if (!requestId || !userId || !['accept', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Parameter tidak valid.' }, { status: 400 });
    }

    const { data: reqRow, error: fetchError } = await supabase
      .from('introduction_requests')
      .select('id, sender_id, receiver_id, status')
      .eq('id', requestId)
      .single();

    if (fetchError || !reqRow) {
      return NextResponse.json({ success: false, error: 'Surat tidak ditemukan.' }, { status: 404 });
    }

    if (reqRow.receiver_id !== userId) {
      return NextResponse.json({ success: false, error: 'Tidak berhak memproses surat ini.' }, { status: 403 });
    }

    if (reqRow.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Surat ini sudah diproses sebelumnya.' }, { status: 400 });
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';

    const { error: updateError } = await supabase
      .from('introduction_requests')
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq('id', requestId);

    if (updateError) {
      console.error('[INTRO-REQ] PATCH error:', updateError);
      return NextResponse.json({ success: false, error: 'Gagal memperbarui surat.' }, { status: 500 });
    }

    if (action === 'accept') {
      // ── Catat di chat_history → exclusion permanen kedua arah ──
      await supabase.from('chat_history').insert({
        user_id: reqRow.sender_id,
        partner_id: reqRow.receiver_id,
        started_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[INTRO-REQ] PATCH error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}