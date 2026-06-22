// app/api/get-filter-options/route.ts
// Ambil opsi filter dinamis dari database profiles

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // Ambil jenis kelamin user untuk filter lawan jenis
    let lawanJenis = null;
    if (userId) {
      const { data: me } = await supabase
        .from('profiles')
        .select('jenis_kelamin')
        .eq('id', userId)
        .limit(1);
      const myGender = me?.[0]?.jenis_kelamin;
      lawanJenis = myGender === 'Pria' ? 'Wanita' : 'Pria';
    }

    // Query base
    let query = supabase
      .from('profiles')
      .select('kota_domisili, profesi, jenjang, agama, status_kerja')
      .eq('status', 'aktif')
      .not('kota_domisili', 'is', null);

    if (lawanJenis) query = query.eq('jenis_kelamin', lawanJenis);

    const { data } = await query;

    if (!data) return NextResponse.json({ success: true, kota: [], profesi: [], jenjang: [], agama: [] });

    // Extract unik dan sort
    const kota = [...new Set(data.map(r => r.kota_domisili).filter(Boolean))].sort();
    const profesi = [...new Set(data.map(r => r.profesi).filter(Boolean))].sort();
    const jenjang = [...new Set(data.map(r => r.jenjang).filter(Boolean))].sort();
    const agama = [...new Set(data.map(r => r.agama).filter(Boolean))].sort();

    return NextResponse.json({ success: true, kota, profesi, jenjang, agama });

  } catch (err) {
    console.error('get-filter-options error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}