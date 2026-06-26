import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { roomId, userId, message } = await req.json();
  if (!roomId || !userId || !message?.trim()) {
    return NextResponse.json({ success: false, error: 'Data tidak lengkap.' }, { status: 400 });
  }

  // Verifikasi room aktif dan user ada di dalamnya
  const { data: room } = await supabase
    .from('chat_rooms')
    .select('id, is_active, expires_at, user_a_id, user_b_id')
    .eq('id', roomId)
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .single();

  if (!room) return NextResponse.json({ success: false, error: 'Room tidak ditemukan.' }, { status: 404 });
  if (!room.is_active || new Date(room.expires_at) <= new Date()) {
    return NextResponse.json({ success: false, error: 'Chat sudah berakhir.' }, { status: 403 });
  }

  const { data: msg, error } = await supabase
    .from('chat_messages')
    .insert({ room_id: roomId, sender_id: userId, message: message.trim(), is_read: false })
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error }, { status: 500 });
  return NextResponse.json({ success: true, message: msg });
}