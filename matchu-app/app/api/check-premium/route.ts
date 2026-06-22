// app/api/check-premium/route.ts
// Cek status premium user

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ success: false, error: 'userId wajib.' }, { status: 400 });

    const { data } = await supabase
      .from('premium_subscriptions')
      .select('status, expires_at, package, started_at')
      .eq('user_id', userId)
      .limit(1);

    const row = data?.[0];
    const now = new Date();
    const isActive = row?.status === 'active' && row?.expires_at && new Date(row.expires_at) > now;

    // Auto-deactivate jika expired
    if (row?.status === 'active' && !isActive) {
      await supabase.from('premium_subscriptions').update({ status: 'inactive' }).eq('user_id', userId);
    }

    return NextResponse.json({
      success:    true,
      is_premium: isActive,
      status:     isActive ? 'active' : 'inactive',
      expires_at: row?.expires_at || null,
      package:    row?.package || null,
    });

  } catch (err) {
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}