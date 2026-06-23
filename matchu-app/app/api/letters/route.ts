import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ success: false, error: 'userId wajib.' }, { status: 400 });

    // ── 1. Ambil surat DIKIRIM ────────────────────────────
    const { data: sentRaw, error: sentErr } = await supabase
      .from('introduction_letters')
      .select('id, message, status, reject_reason, chat_room_id, created_at, responded_at, receiver_id')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false });

    if (sentErr) {
      console.error('sentErr:', sentErr);
      return NextResponse.json({ success: false, error: sentErr.message }, { status: 500 });
    }

    // ── 2. Ambil surat DITERIMA ───────────────────────────
    const { data: receivedRaw, error: receivedErr } = await supabase
      .from('introduction_letters')
      .select('id, message, status, reject_reason, chat_room_id, created_at, responded_at, sender_id')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false });

    if (receivedErr) {
      console.error('receivedErr:', receivedErr);
      return NextResponse.json({ success: false, error: receivedErr.message }, { status: 500 });
    }

    // ── 3. Ambil semua profile yang dibutuhkan ────────────
    const receiverIds = (sentRaw || []).map(s => s.receiver_id).filter(Boolean);
    const senderIds   = (receivedRaw || []).map(r => r.sender_id).filter(Boolean);
    const allIds      = [...new Set([...receiverIds, ...senderIds])];

    let profilesMap: Record<string, any> = {};

    if (allIds.length > 0) {
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, nama_panggilan, nama, universitas, program_studi, jenjang, profesi, kota_domisili, foto_url_1, trust_score, education_score_given, tanggal_lahir, agama, target_menikah')
        .in('id', allIds);

      if (profErr) {
        console.error('profErr:', profErr);
      }

      (profiles || []).forEach(p => { profilesMap[p.id] = p; });
    }

    // ── 4. Gabungkan data ─────────────────────────────────
    const sent = (sentRaw || []).map(s => ({
      ...s,
      receiver: profilesMap[s.receiver_id] || null,
    }));

    const received = (receivedRaw || []).map(r => ({
      ...r,
      sender: profilesMap[r.sender_id] || null,
    }));

    // ── 5. Stats ──────────────────────────────────────────
    const stats = {
      total_sent:   sent.length,
      pending:      sent.filter(s => s.status === 'pending').length,
      accepted:     sent.filter(s => s.status === 'accepted').length,
      rejected:     sent.filter(s => s.status === 'rejected').length,
      incoming_new: received.filter(r => r.status === 'pending').length,
    };

    return NextResponse.json({ success: true, sent, received, stats });

  } catch(err) {
    console.error('letters GET error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}

// ── POST: kirim surat baru ────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { senderId, receiverId, message } = await req.json();

    if (!senderId || !receiverId || !message?.trim()) {
      return NextResponse.json({ success: false, error: 'Data tidak lengkap.' }, { status: 400 });
    }
    if (message.trim().length < 20) {
      return NextResponse.json({ success: false, error: 'Surat minimal 20 karakter.' }, { status: 400 });
    }

    // Cek apakah sudah pernah kirim
    const { data: existing } = await supabase
      .from('introduction_letters')
      .select('id, status')
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Kamu sudah pernah mengirim surat ke kandidat ini (status: ${existing[0].status}).`,
      }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('introduction_letters')
      .insert({ sender_id: senderId, receiver_id: receiverId, message: message.trim() })
      .select()
      .limit(1);

    if (error) throw error;

    return NextResponse.json({ success: true, letter: data?.[0] });

  } catch(err) {
    console.error('letters POST error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}