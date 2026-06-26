import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { roomId, senderId, content } = await req.json();

    if (!roomId || !senderId || !content?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Data tidak lengkap',
        },
        { status: 400 }
      );
    }

    // Pastikan room ada
    const { data: room, error: roomError } = await supabase
      .from('chat_rooms')
      .select('id, user_a_id, user_b_id, expires_at')
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

    // Pastikan user anggota room
    if (
      room.user_a_id !== senderId &&
      room.user_b_id !== senderId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tidak memiliki akses ke room ini',
        },
        { status: 403 }
      );
    }

    // Cek masa aktif chat
    if (new Date(room.expires_at) <= new Date()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Chat sudah berakhir',
        },
        { status: 403 }
      );
    }

    // Simpan pesan
    const { data: message, error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: roomId,
        sender_id: senderId,
        message: content.trim(),
        is_read: false,
      })
      .select()
      .single();

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

    return NextResponse.json({
      success: true,
      message,
    });

  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: 'Server Error',
      },
      { status: 500 }
    );
  }
}