import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {

  try {

    const { searchParams } = new URL(req.url);

    const roomId = searchParams.get('roomId');
    const userId = searchParams.get('userId');

    if (!roomId || !userId) {

      return NextResponse.json(
        {
          success: false,
          error: 'Parameter tidak lengkap'
        },
        {
          status: 400
        }
      );

    }

    const { data: room } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (!room) {

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

    if (
      room.user_a_id !== userId &&
      room.user_b_id !== userId
    ) {

      return NextResponse.json(
        {
          success: false,
          error: 'Tidak memiliki akses'
        },
        {
          status: 403
        }
      );

    }

    const partnerId =
      room.user_a_id === userId
        ? room.user_b_id
        : room.user_a_id;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', partnerId)
      .single();

    if (!profile) {

      return NextResponse.json(
        {
          success: false,
          error: 'Profil tidak ditemukan'
        },
        {
          status: 404
        }
      );

    }

    // BELUM MUTUAL
    if (!room.mutual_interest) {

      return NextResponse.json({

        success: true,

        unlocked: false,

        profile: {

          nama_panggilan: profile.nama_panggilan,

          universitas: profile.universitas,

          profesi: profile.profesi,

          foto_url_1: profile.foto_url_1,

          trust_score: profile.trust_score,

          foto_url_2: null,

          foto_url_3: null,

          instagram: null,

          nama_lengkap: null,

          bio: null,

          mbti: null,

          hobi: null,

          tinggi_badan: null,

          target_menikah: null

        }

      });

    }

    // SUDAH MUTUAL

    return NextResponse.json({

      success: true,

      unlocked: true,

      profile

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