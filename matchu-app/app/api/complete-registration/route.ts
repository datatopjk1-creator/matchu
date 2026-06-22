// app/api/complete-registration/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, instagram, foto1, foto2 } = body;

    if (!userId || !foto1) {
      return NextResponse.json(
        { success: false, error: 'Data tidak lengkap.' },
        { status: 400 }
      );
    }

    const email = userId.replace('pending_', '');

    // ── Ambil data dari pending_registrations ─────────────
    const { data: pending, error: fetchError } = await supabase
      .from('pending_registrations')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (fetchError || !pending || pending.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Data registrasi tidak ditemukan. Mulai ulang dari awal.' },
        { status: 404 }
      );
    }

    const reg = pending[0];
    const profileData = reg.profile_data || {};

    // ✅ Log password untuk debug — HAPUS setelah fix
    console.log('[REG] password plaintext yang dipakai:', reg.password);

    // ── Upload foto ke Supabase Storage ───────────────────
    let foto1Url = null;
    let foto2Url = null;

    async function uploadFoto(base64: string, filename: string) {
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const ext = base64.includes('png') ? 'png' : 'jpg';
      const path = `${email}/${filename}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('user-photos')
        .upload(path, buffer, { contentType: `image/${ext}`, upsert: true });
      if (error) { console.error('Upload error:', error); return null; }
      return supabase.storage.from('user-photos').getPublicUrl(path).data.publicUrl;
    }

    foto1Url = await uploadFoto(foto1, 'foto1');
    if (foto2) foto2Url = await uploadFoto(foto2, 'foto2');

    // ── Buat akun di auth.users ───────────────────────────
    // ✅ PENTING: password harus PLAINTEXT — Supabase Auth akan hash sendiri
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:         email,
      password:      reg.password, // ✅ plaintext dari form registrasi
      email_confirm: true,
      user_metadata: {
        nama:           reg.nama,
        nama_panggilan: reg.nama_panggilan,
      },
    });

    if (authError || !authData.user) {
      if (authError?.message?.includes('already registered')) {
        return NextResponse.json(
          { success: false, error: 'Email sudah terdaftar. Silakan login.' },
          { status: 409 }
        );
      }
      console.error('[REG] Create auth error:', authError);
      return NextResponse.json(
        { success: false, error: 'Gagal membuat akun.' },
        { status: 500 }
      );
    }

    const authUserId = authData.user.id;
    console.log('[REG] akun dibuat, id:', authUserId);

    // ── Hitung trust score awal ───────────────────────────
    const fotoPoin = (foto1Url ? 5 : 0) + (foto2Url ? 5 : 0);
    const igPoin   = instagram ? 10 : 0;
    const trustScore = 20 + fotoPoin + igPoin; // email +20, foto, ig

    // ── Insert ke profiles ────────────────────────────────
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id:                authUserId,
        nama:              reg.nama,
        nama_panggilan:    reg.nama_panggilan,
        email:             email,
        jenis_kelamin:     reg.jenis_kelamin,
        tanggal_lahir:     reg.tanggal_lahir,

        // Data profil dari step 3
        bulan_lahir:       profileData.bulan_lahir       || null,
        tahun_lahir:       profileData.tahun_lahir       || null,
        status_nikah:      profileData.status_nikah      || null,
        universitas:       profileData.universitas       || null,
        program_studi:     profileData.program_studi     || null,
        jenjang:           profileData.jenjang           || null,
        tahun_masuk:       profileData.tahun_masuk       || null,
        status_pendidikan: profileData.status_pendidikan || null,
        status_kerja:      profileData.status_kerja      || null,
        profesi:           profileData.profesi           || null,
        perusahaan:        profileData.perusahaan        || null,
        kota_domisili:     profileData.kota_domisili     || null,
        kota_asal:         profileData.kota_asal         || null,
        tinggi_badan:      profileData.tinggi_badan      || null,
        berat_badan:       profileData.berat_badan       || null,
        agama:             profileData.agama             || null,
        target_menikah:    profileData.target_menikah    || null,
        kepribadian:       profileData.kepribadian       || null,
        mbti:              profileData.mbti              || null,
        hobi:              profileData.hobi              || null,
        bahasa:            profileData.bahasa            || null,
        bio:               profileData.bio               || null,

        // Data dari step 4
        foto_url_1:        foto1Url,
        foto_url_2:        foto2Url,
        instagram:         instagram ? instagram.replace('@', '') : null,

        trust_score:       trustScore,
        email_verified:    true,
        education_score_given: false,
        profile_score_given:   false,
        foto_score_given:      false,
        instagram_score_given: false,
        status:            'aktif', // ✅ sesuai constraint DB
        registration_step: 4,
      });

    if (profileError) {
      console.error('[REG] Profile insert error:', profileError);
      await supabase.auth.admin.deleteUser(authUserId); // rollback
      return NextResponse.json(
        { success: false, error: profileError.message },
        { status: 500 }
      );
    }

    // ── Simpan verifikasi pendidikan ──────────────────────
    if (reg.kampus || profileData.universitas) {
      await supabase.from('education_verifications').insert({
        user_id: authUserId,
        email:   email,
        kampus:  reg.kampus  || profileData.universitas || null,
        jurusan: reg.jurusan || profileData.program_studi || null,
        jenjang: reg.jenjang || profileData.jenjang || null,
        status:  'pending',
      }).select();
    }

    // ── Hapus data sementara ──────────────────────────────
    await supabase.from('pending_registrations').delete().eq('email', email);

    return NextResponse.json({
      success:        true,
      userId:         authUserId,
      nama_panggilan: reg.nama_panggilan,
      email:          email,
      trust_score:    trustScore,
    });

  } catch (err) {
    console.error('[REG] complete-registration error:', err);
    return NextResponse.json(
      { success: false, error: 'Server error.' },
      { status: 500 }
    );
  }
}