// app/api/upload-profile-photo/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const userId = formData.get('userId')?.toString();
    const slot = formData.get('slot')?.toString();
    const file = formData.get('photo') as File;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId wajib diisi.' },
        { status: 400 }
      );
    }

    if (!slot || !['1', '2'].includes(slot)) {
      return NextResponse.json(
        { success: false, error: 'Slot foto tidak valid.' },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File foto belum dipilih.' },
        { status: 400 }
      );
    }

    // Maksimal 5 MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Ukuran foto maksimal 5 MB.' },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';

    const fileName = `${userId}_${slot}_${Date.now()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload ke Storage
    const { error: uploadError } = await supabase.storage
      .from('user-photos')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { success: false, error: uploadError.message },
        { status: 500 }
      );
    }

    // Ambil Public URL
    const { data } = supabase.storage
      .from('user-photos')
      .getPublicUrl(fileName);

    const photoUrl = data.publicUrl;

    const updateData =
      slot === '1'
        ? { foto_url_1: photoUrl }
        : { foto_url_2: photoUrl };

    // Update database
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: photoUrl,
    });

  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: 'Server error.',
      },
      {
        status: 500,
      }
    );
  }
}