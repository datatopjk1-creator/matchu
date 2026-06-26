// app/api/letters/respond/route.ts
// POST → terima atau tolak surat perkenalan

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { letterId, userId, action, rejectReason } = await req.json();
    // action: 'accept' | 'reject'

    if (!letterId || !userId || !action) {
      return NextResponse.json({ success: false, error: 'Data tidak lengkap.' }, { status: 400 });
    }

    // Ambil surat
    const { data: letters } = await supabase
      .from('introduction_letters')
      .select('*')
      .eq('id', letterId)
      .eq('receiver_id', userId) // pastikan user adalah penerima
      .limit(1);

    const letter = letters?.[0];
    if (!letter) {
      return NextResponse.json({ success: false, error: 'Surat tidak ditemukan.' }, { status: 404 });
    }
    if (letter.status !== 'pending') {
      return NextResponse.json({ success: false, error: 'Surat sudah direspon sebelumnya.' }, { status: 409 });
    }

    if (action === 'reject') {
      // Tolak surat
      await supabase
        .from('introduction_letters')
        .update({
          status:        'rejected',
          reject_reason: rejectReason?.trim() || null,
          responded_at:  new Date().toISOString(),
        })
        .eq('id', letterId);

      return NextResponse.json({ success: true, action: 'rejected' });
    }

    if (action === 'accept') {
      // Cek apakah sudah ada chat room
      const { data: existingRoom } = await supabase
        .from('chat_rooms')
        .select('id')
        .or(`and(user_a_id.eq.${letter.sender_id},user_b_id.eq.${userId}),and(user_a_id.eq.${userId},user_b_id.eq.${letter.sender_id})`)
        .limit(1);

      let roomId = existingRoom?.[0]?.id;

      if (!roomId) {
        // Cek apakah penerima premium (dapat chat 7 hari)
        const { data: premData } = await supabase
          .from('premium_subscriptions')
          .select('status, expires_at')
          .eq('user_id', userId)
          .limit(1);

        const isPremium = premData?.[0]?.status === 'active'
          && premData?.[0]?.expires_at
          && new Date(premData[0].expires_at) > new Date();

        const chatDays = isPremium ? 7 : 2;
        const expiresAt = new Date(Date.now() + chatDays * 24 * 60 * 60 * 1000).toISOString();

        // Buat chat room baru
        const { data: newRoom, error: roomErr } = await supabase
          .from('chat_rooms')
          .insert({
            user_a_id:  letter.sender_id,
            user_b_id:  userId,
            letter_id:  letterId,
            expires_at: expiresAt,
          })
          .select()
          .limit(1);

        if (roomErr) throw roomErr;
        roomId = newRoom?.[0]?.id;

        // Tambahkan ke chat_history (agar tidak muncul lagi di kandidat)
        await supabase.from('chat_history').upsert([
          { user_id: letter.sender_id, partner_id: userId },
          { user_id: userId, partner_id: letter.sender_id },
        ], { onConflict: 'user_id,partner_id' });
      }

      // Update surat
      await supabase
        .from('introduction_letters')
        .update({
          status:       'accepted',
          chat_room_id: roomId,
          responded_at: new Date().toISOString(),
        })
        .eq('id', letterId);

      return NextResponse.json({ success: true, action: 'accepted', chat_room_id: roomId });
    }

    return NextResponse.json({ success: false, error: 'Action tidak valid.' }, { status: 400 });

  } catch(err) {
    console.error('respond letter error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}