import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ success: false }, { status: 400 });

  // 1. Ambil rooms dulu — TANPA nested order (penyebab error 500)
  const { data: rooms, error } = await supabase
  .from('chat_rooms')
  .select(`
    id,
    expires_at,
    created_at,
    user_a_id,
    user_b_id,
    letter_id
  `)
  .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
  .order('created_at', { ascending: false });

  if (error) {
    console.error('[rooms] fetch error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!rooms || rooms.length === 0) {
    return NextResponse.json({ success: true, rooms: [] });
  }

  // 2. Enrich tiap room secara paralel
  const enriched = await Promise.all(rooms.map(async (room) => {
    const partnerId = room.user_a_id === userId ? room.user_b_id : room.user_a_id;
    const isUserA   = room.user_a_id === userId;

    // Ambil semua secara paralel agar cepat
    const [partnerRes, lastMsgRes, unreadRes] = await Promise.all([

      // Profil partner
      supabase
        .from('profiles')
        .select('id, nama_panggilan, profesi, universitas, foto_url_1')
        .eq('id', partnerId)
        .single(),

      // Last message — query terpisah, bukan nested order
      supabase
        .from('chat_messages')
        .select('message, created_at, sender_id')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Unread count
      supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .eq('is_read', false)
        .neq('sender_id', userId),
    ]);
          if (partnerRes.error) {
        console.error('partner error:', partnerRes.error);
      }

      if (lastMsgRes.error) {
        console.error('lastMsg error:', lastMsgRes.error);
      }

      if (unreadRes.error) {
        console.error('unread error:', unreadRes.error);
      }
    // Hitung sisa hari
    const msLeft   = new Date(room.expires_at).getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

    // Hitung max_days dari created_at → expires_at
    const msTotal  = new Date(room.expires_at).getTime() - new Date(room.created_at).getTime();
    const maxDays  = Math.round(msTotal / (1000 * 60 * 60 * 24));

    return {
          id: room.id,
          created_at: room.created_at,
          expires_at: room.expires_at,

          user_a_id: room.user_a_id,
          user_b_id: room.user_b_id,
          letter_id: room.letter_id,

          partner: partnerRes.data ?? null,
          last_message: lastMsgRes.data ?? null,

          days_left: daysLeft,
          max_days: maxDays,
          is_expired: new Date(room.expires_at) <= new Date(),

          unread_count: unreadRes.count ?? 0,
    };
  }));

  return NextResponse.json({ success: true, rooms: enriched });
}