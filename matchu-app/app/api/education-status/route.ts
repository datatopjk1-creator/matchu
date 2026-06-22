import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId wajib diisi.' },
        { status: 400 }
      );
    }

    const { data: row, error } = await supabase
      .from('education_verifications')
      .select('kampus, jurusan, jenjang, status, rejection_reason, screenshot_url, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[EDUCATION-STATUS] error:', error);
      return NextResponse.json(
        { success: false, error: 'Gagal mengambil status verifikasi.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      verification: row || null, // null = belum pernah submit
    });

  } catch (err) {
    console.error('[EDUCATION-STATUS] error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}