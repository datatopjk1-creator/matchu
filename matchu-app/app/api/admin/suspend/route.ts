import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(req: NextRequest) {
  try {
    const { userId, suspend } = await req.json();

    if (!userId || typeof suspend !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Parameter tidak valid.' },
        { status: 400 }
      );
    }

    const newStatus = suspend ? 'suspended' : 'aktif';

    const { error } = await supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', userId);

    if (error) {
      console.error('[ADMIN-SUSPEND] update error:', error);
      return NextResponse.json(
        { success: false, error: 'Gagal memperbarui status user.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[ADMIN-SUSPEND] error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}