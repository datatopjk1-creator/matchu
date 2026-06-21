import { NextResponse } from 'next/server';
import { supabase } from '../../../src/lib/supabase';

export async function POST(req: Request) {
  try {
    const { userId, instagram, motivasi, foto_url } = await req.json();

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId tidak ditemukan.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('users')
      .update({
        instagram: instagram?.replace('@', '').trim(),
        motivasi,
        foto_url: foto_url || null,
        status_akun: 'menunggu_review',
      })
      .eq('id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('complete-register error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error.' }, { status: 500 });
  }
}