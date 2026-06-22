// app/api/get-candidates/route.ts
// Ambil kandidat mingguan untuk user
// Jika belum ada atau expired, generate baru

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ success: false, error: 'userId wajib.' }, { status: 400 });

    // ── Cek status premium ────────────────────────────────
    const { data: premData } = await supabase
      .from('premium_subscriptions')
      .select('status, expires_at, package')
      .eq('user_id', userId)
      .limit(1);

    const now = new Date();
    const premRow = premData?.[0];
    const isPremium = premRow?.status === 'active' && premRow?.expires_at && new Date(premRow.expires_at) > now;

    // ── Ambil profil user ─────────────────────────────────
    const { data: userRows } = await supabase
      .from('profiles')
      .select('jenis_kelamin, kota_domisili, universitas, profesi, status_kerja')
      .eq('id', userId)
      .limit(1);

    const me = userRows?.[0];
    if (!me) return NextResponse.json({ success: false, error: 'Profil tidak ditemukan.' }, { status: 404 });

    // ── Cek weekly_candidates masih valid ─────────────────
    const { data: existing } = await supabase
      .from('weekly_candidates')
      .select('*, profiles!weekly_candidates_candidate_id_fkey(*)')
      .eq('user_id', userId)
      .gt('expires_at', now.toISOString())
      .order('match_score', { ascending: false });

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        candidates: existing,
        is_premium: isPremium,
        premium_info: isPremium ? premRow : null,
        source: 'cached',
      });
    }

    // ── Generate kandidat baru ────────────────────────────
    // Ambil lawan jenis yang aktif, punya foto, bukan user sendiri
    const lawanJenis = me.jenis_kelamin === 'Pria' ? 'Wanita' : 'Pria';

    const { data: pool } = await supabase
      .from('profiles')
      .select('id, nama_panggilan, nama, jenis_kelamin, kota_domisili, universitas, profesi, status_kerja, foto_url_1, education_score_given, trust_score, mbti, agama, target_menikah, hobi, jenjang, program_studi, tanggal_lahir')
      .eq('jenis_kelamin', lawanJenis)
      .eq('status', 'aktif')
      .neq('id', userId)
      .not('foto_url_1', 'is', null)
      .gte('trust_score', 40); // minimal trust score 40

    if (!pool || pool.length === 0) {
      return NextResponse.json({ success: true, candidates: [], is_premium: isPremium, source: 'empty' });
    }

    // ── Hitung skor kecocokan ─────────────────────────────
    const scored = pool.map(c => {
      let score = 0;
      let matchType = 'general';

      // Lokasi sama +40
      if (me.kota_domisili && c.kota_domisili &&
          me.kota_domisili.toLowerCase().includes(c.kota_domisili.toLowerCase().split(' ')[0])) {
        score += 40; matchType = 'lokasi';
      }
      // Universitas sama +30
      if (me.universitas && c.universitas &&
          me.universitas.toLowerCase().includes(c.universitas.toLowerCase().split(' ')[0])) {
        score += 30; if (matchType === 'general') matchType = 'kampus';
      }
      // Profesi / bidang sama +30
      if (me.profesi && c.profesi &&
          me.profesi.toLowerCase().split(' ')[0] === c.profesi.toLowerCase().split(' ')[0]) {
        score += 30; if (matchType === 'general') matchType = 'profesi';
      }
      // Trust score bonus
      score += Math.floor((c.trust_score || 0) / 10);
      // Education verified bonus
      if (c.education_score_given) score += 10;

      return { ...c, match_score: score, match_type: matchType };
    });

    // ── Pilih kandidat untuk user gratis (3) atau premium (10) ──
    let selected: typeof scored = [];

    if (isPremium) {
      // Premium: top 10 by score
      selected = scored.sort((a, b) => b.match_score - a.match_score).slice(0, 10);
      selected.forEach(c => { c.match_type = c.match_type || 'general'; });
    } else {
      // Gratis: 1 lokasi, 1 kampus, 1 profesi (atau top 3 jika tidak ada match spesifik)
      const byLokasi = scored.filter(c => c.match_type === 'lokasi').sort((a,b) => b.match_score - a.match_score);
      const byKampus = scored.filter(c => c.match_type === 'kampus').sort((a,b) => b.match_score - a.match_score);
      const byProfesi = scored.filter(c => c.match_type === 'profesi').sort((a,b) => b.match_score - a.match_score);
      const byGeneral = scored.sort((a,b) => b.match_score - a.match_score);

      const pickedIds = new Set<string>();
      const pick = (arr: typeof scored) => {
        const found = arr.find(c => !pickedIds.has(c.id));
        if (found) { pickedIds.add(found.id); selected.push(found); }
      };

      pick(byLokasi); pick(byKampus); pick(byProfesi);
      // Jika kurang dari 3, isi dari general
      if (selected.length < 3) {
        byGeneral.forEach(c => { if (selected.length >= 3) return; if (!pickedIds.has(c.id)) { pickedIds.add(c.id); selected.push(c); } });
      }
    }

    // ── Hapus weekly_candidates lama ──────────────────────
    await supabase.from('weekly_candidates').delete().eq('user_id', userId);

    // ── Simpan ke weekly_candidates ───────────────────────
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const inserts = selected.map(c => ({
      user_id:      userId,
      candidate_id: c.id,
      match_type:   c.match_type,
      match_score:  c.match_score,
      expires_at:   expiresAt,
    }));

    if (inserts.length > 0) {
      await supabase.from('weekly_candidates').insert(inserts);
    }

    // ── Return dengan data profil kandidat ───────────────
    const result = selected.map(c => ({
      candidate_id: c.id,
      match_type:   c.match_type,
      match_score:  c.match_score,
      expires_at:   expiresAt,
      profiles:     c,
    }));

    return NextResponse.json({
      success:      true,
      candidates:   result,
      is_premium:   isPremium,
      premium_info: isPremium ? premRow : null,
      source:       'generated',
      reset_at:     expiresAt,
    });

  } catch (err) {
    console.error('get-candidates error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}