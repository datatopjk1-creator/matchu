// app/api/save-profile/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, ...fields } = body;

    console.log('[SAVE] userId:', userId);
    console.log('[SAVE] fields:', JSON.stringify(fields));

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId wajib.' }, { status: 400 });
    }

    const allowed = [
      'nama_panggilan','bio','agama','target_menikah','kepribadian','mbti',
      'hobi','bahasa','kota_domisili','kota_asal','tinggi_badan','berat_badan',
      'profesi','perusahaan','status_kerja','instagram',
      'universitas','program_studi','jenjang','status_pendidikan',
      'status_nikah','bulan_lahir','tahun_lahir','tahun_masuk',
    ];

    const updateData: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in fields) {
        // Konversi string kosong ke null, angka tetap angka
        const val = fields[key];
        updateData[key] = (val === '' || val === undefined) ? null : val;
      }
    }

    console.log('[SAVE] updateData:', JSON.stringify(updateData));

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'Tidak ada data untuk disimpan.' }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select(); // ✅ select() agar return data yang diupdate

    console.log('[SAVE] result:', JSON.stringify(data));
    console.log('[SAVE] error:', error?.message || 'null');

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // ── Hitung ulang trust score ──────────────────────────
    const updated = data?.[0];
    if (updated) {
      let trustScore = 0;
      if (updated.email_verified) trustScore += 20;
      if (updated.education_score_given) trustScore += 30;

      const profilFields = ['bio','agama','mbti','kepribadian','hobi','kota_domisili','tinggi_badan','target_menikah','status_nikah'];
      const terisi = profilFields.filter(f => updated[f]).length;
      trustScore += Math.round((terisi / profilFields.length) * 30);

      if (updated.foto_url_1) trustScore += 5;
      if (updated.foto_url_2) trustScore += 5;
      if (updated.instagram) trustScore += 10;

      // Update trust_score
      await supabase.from('profiles').update({ trust_score: trustScore }).eq('id', userId);
      updated.trust_score = trustScore;
    }

    return NextResponse.json({ success: true, profile: updated });

  } catch (err) {
    console.error('[SAVE] error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}