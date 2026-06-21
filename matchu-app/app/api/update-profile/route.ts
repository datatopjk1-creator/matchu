import { NextResponse } from 'next/server';
import { supabase } from '../../../src/lib/supabase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, ...profileData } = body;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId tidak ditemukan.' }, { status: 400 });
    }

    const allowedFields = [
      'bulan_lahir', 'tahun_lahir', 'status_nikah',
      'universitas', 'program_studi', 'jenjang', 'tahun_masuk', 'status_pendidikan',
      'status_kerja', 'profesi', 'perusahaan',
      'kota_domisili', 'kota_asal', 'tinggi_badan', 'berat_badan',
      'agama', 'target_menikah',
      'kepribadian', 'mbti', 'hobi', 'bahasa', 'bio',
    ];

    // Filter hanya field yang diizinkan
    const updateData: Record<string, any> = {};
    allowedFields.forEach(field => {
      if (profileData[field] !== undefined && profileData[field] !== '') {
        updateData[field] = profileData[field];
      }
    });

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('update-profile error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error.' }, { status: 500 });
  }
}