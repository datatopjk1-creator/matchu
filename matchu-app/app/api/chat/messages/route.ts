import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const roomId = req.nextUrl.searchParams.get('roomId');
    const userId = req.nextUrl.searchParams.get('userId');

    if (!roomId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'roomId atau userId tidak ditemukan',
        },
        { status: 400 }
      );
    }

    // Pastikan user memang anggota room
    const { data: room, error: roomError } = await supabase
      .from('chat_rooms')
      .select('id,user_a_id,user_b_id')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        {
          success: false,
          error: 'Room tidak ditemukan',
        },
        { status: 404 }
      );
    }

    if (room.user_a_id !== userId && room.user_b_id !== userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tidak memiliki akses',
        },
        { status: 403 }
      );
    }

    // Ambil seluruh pesan
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    // Tandai pesan lawan sudah dibaca
    await supabase
      .from('chat_messages')
      .update({
        is_read: true,
      })
      .eq('room_id', roomId)
      .neq('sender_id', userId)
      .eq('is_read', false);

    return NextResponse.json({
      success: true,
      messages,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}