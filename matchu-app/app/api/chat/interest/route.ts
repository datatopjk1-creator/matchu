import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { roomId, userId } = await req.json();

    if (!roomId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Data tidak lengkap'
        },
        {
          status: 400
        }
      );
    }

    const { data: room, error } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (error || !room) {
      return NextResponse.json(
        {
          success: false,
          error: 'Room tidak ditemukan'
        },
        {
          status: 404
        }
      );
    }

    let updateData: any = {};

    if (room.user_a_id === userId) {
      updateData.user_a_interest = true;
    } else if (room.user_b_id === userId) {
      updateData.user_b_interest = true;
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Bukan anggota room'
        },
        {
          status: 403
        }
      );
    }

    await supabase
      .from('chat_rooms')
      .update(updateData)
      .eq('id', roomId);

    const { data: latest } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    const mutual =
      latest.user_a_interest &&
      latest.user_b_interest;

    if (mutual && !latest.mutual_interest) {

      await supabase
        .from('chat_rooms')
        .update({
          mutual_interest: true
        })
        .eq('id', roomId);

    }

    return NextResponse.json({
      success: true,
      mutualInterest: mutual
    });

  } catch (err) {

    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: 'Server Error'
      },
      {
        status: 500
      }
    );

  }
}