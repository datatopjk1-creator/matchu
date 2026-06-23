// app/api/letters/route.ts
// GET  → ambil semua surat (dikirim + diterima) user
// POST → kirim surat baru

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// ── GET: ambil semua surat user ───────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ success: false, error: 'userId wajib.' }, { status: 400 });

    // Surat yang DIKIRIM user ini
    const { data: sent } = await supabase
      .from('introduction_letters')
      .select(`
        id, message, status, reject_reason, chat_room_id, created_at, responded_at,
        receiver:receiver_id (
          id, nama_panggilan, nama, universitas, program_studi, jenjang,
          profesi, kota_domisili, foto_url_1, trust_score, education_score_given,
          tanggal_lahir, agama, target_menikah
        )
      `)
      .eq('sender_id', userId)
      .order('created_at', { ascending: false });

    // Surat yang DITERIMA user ini
    const { data: received } = await supabase
      .from('introduction_letters')
      .select(`
        id, message, status, reject_reason, chat_room_id, created_at, responded_at,
        sender:sender_id (
          id, nama_panggilan, nama, universitas, program_studi, jenjang,
          profesi, kota_domisili, foto_url_1, trust_score, education_score_given,
          tanggal_lahir, agama, target_menikah
        )
      `)
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false });

    // Hitung stats
    const stats = {
      total_sent:     sent?.length || 0,
      pending:        sent?.filter(s => s.status === 'pending').length || 0,
      accepted:       sent?.filter(s => s.status === 'accepted').length || 0,
      rejected:       sent?.filter(s => s.status === 'rejected').length || 0,
      incoming_new:   received?.filter(r => r.status === 'pending').length || 0,
    };

    return NextResponse.json({
      success:  true,
      sent:     sent || [],
      received: received || [],
      stats,
    });

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