// app/api/get-candidates/route.ts
// Algoritma matching v2:
// 1. Lawan jenis otomatis
// 2. Prioritas: kampus > profesi > kota > lainnya
// 3. Rotasi setiap 3 hari
// 4. Exclude yang pernah chat

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const RESET_DAYS = 3; // rotasi setiap 3 hari
const MAX_FREE    = 3;
const MAX_PREMIUM = 10;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ success: false, error: 'userId wajib.' }, { status: 400 });

    // ── Cek premium ──────────────────────────────────────
    const { data: premData } = await supabase
      .from('premium_subscriptions')
      .select('status, expires_at, package')
      .eq('user_id', userId)
      .limit(1);

    const now = new Date();
    const premRow = premData?.[0];
    const isPremium = premRow?.status === 'active'
      && premRow?.expires_at
      && new Date(premRow.expires_at) > now;

    // ── Ambil profil user ─────────────────────────────────
    const { data: meRows } = await supabase
      .from('profiles')
      .select('jenis_kelamin, kota_domisili, universitas, profesi, program_studi, agama, target_menikah, mbti, kepribadian')
      .eq('id', userId)
      .limit(1);

    const me = meRows?.[0];
    if (!me) return NextResponse.json({ success: false, error: 'Profil tidak ditemukan.' }, { status: 404 });

    // ── Tentukan lawan jenis ──────────────────────────────
    const lawanJenis = me.jenis_kelamin === 'Pria' ? 'Wanita'
                     : me.jenis_kelamin === 'Wanita' ? 'Pria'
                     : 'Pria'; // default jika belum diisi

    // ── Cek cache weekly_candidates masih valid ───────────
    const { data: existing } = await supabase
      .from('weekly_candidates')
      .select(`
        candidate_id, match_type, match_score, expires_at,
        profiles!weekly_candidates_candidate_id_fkey(
          id, nama_panggilan, jenis_kelamin, kota_domisili, kota_asal,
          universitas, program_studi, profesi, jenjang, agama,
          target_menikah, mbti, kepribadian, tanggal_lahir,
          foto_url_1, foto_url_2, trust_score, education_score_given,
          hobi, bahasa, bio, tinggi_badan, berat_badan
        )
      `)
      .eq('user_id', userId)
      .gt('expires_at', now.toISOString())
      .order('match_score', { ascending: false });

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success:      true,
        candidates:   existing,
        is_premium:   isPremium,
        premium_info: isPremium ? premRow : null,
        reset_at:     existing[0].expires_at,
        source:       'cached',
        gender_info:  { my_gender: me.jenis_kelamin, showing: lawanJenis },
      });
    }

    // ── Ambil daftar yang pernah chat (exclude) ───────────
    const { data: chatted } = await supabase
      .from('chat_history')
      .select('partner_id')
      .eq('user_id', userId);

    const excludeIds = new Set<string>([
      userId, // exclude diri sendiri
      ...(chatted || []).map(c => c.partner_id),
    ]);

    // ── Ambil pool kandidat ───────────────────────────────
    const { data: pool } = await supabase
      .from('profiles')
      .select(`
        id, nama_panggilan, jenis_kelamin, kota_domisili, kota_asal,
        universitas, program_studi, profesi, jenjang, agama,
        target_menikah, mbti, kepribadian, tanggal_lahir,
        foto_url_1, foto_url_2, trust_score, education_score_given,
        hobi, bahasa, bio, tinggi_badan, berat_badan
      `)
      .eq('jenis_kelamin', lawanJenis)
      .eq('status', 'aktif')
      .not('foto_url_1', 'is', null)
      .gte('trust_score', 30); // minimal trust score 30

    if (!pool || pool.length === 0) {
      return NextResponse.json({
        success:     true,
        candidates:  [],
        is_premium:  isPremium,
        source:      'empty',
        gender_info: { my_gender: me.jenis_kelamin, showing: lawanJenis },
      });
    }

    // ── Hitung skor kecocokan ─────────────────────────────
    // Prioritas: kampus (50) > profesi (35) > kota (40) > agama (20)
    // > target menikah (15) > kepribadian (10) > mbti (10) > trust bonus (max 10)
    const scored = pool
      .filter(c => !excludeIds.has(c.id))
      .map(c => {
        let score = 0;
        let primaryMatch = 'general'; // untuk label badge

        // 1. KAMPUS — prioritas tertinggi
        const sameKampus = me.universitas && c.universitas &&
          me.universitas.toLowerCase().trim() === c.universitas.toLowerCase().trim();
        if (sameKampus) { score += 50; primaryMatch = 'kampus'; }

        // 2. PROFESI / BIDANG KERJA
        const sameProfesi = me.profesi && c.profesi &&
          me.profesi.toLowerCase().split(' ')[0] === c.profesi.toLowerCase().split(' ')[0];
        if (sameProfesi) {
          score += 35;
          if (primaryMatch === 'general') primaryMatch = 'profesi';
        }

        // 3. KOTA DOMISILI
        const kota1 = (me.kota_domisili || '').toLowerCase().trim();
        const kota2 = (c.kota_domisili || '').toLowerCase().trim();
        const sameKota = kota1 && kota2 && (
          kota1 === kota2 ||
          kota1.includes(kota2.split(' ')[0]) ||
          kota2.includes(kota1.split(' ')[0])
        );
        if (sameKota) {
          score += 40;
          if (primaryMatch === 'general') primaryMatch = 'lokasi';
        }

        // 4. AGAMA
        if (me.agama && c.agama && me.agama === c.agama) score += 20;

        // 5. TARGET MENIKAH
        if (me.target_menikah && c.target_menikah && me.target_menikah === c.target_menikah) score += 15;

        // 6. KEPRIBADIAN (introvert/ekstrovert — sering saling melengkapi)
        if (me.kepribadian && c.kepribadian) {
          if (me.kepribadian === c.kepribadian) score += 8; // sama
          else score += 10; // berbeda bisa saling melengkapi (ambivert bonus)
        }

        // 7. MBTI COMPATIBILITY
        if (me.mbti && c.mbti) {
          const compatible = getMBTICompat(me.mbti, c.mbti);
          score += compatible * 10;
        }

        // 8. TRUST SCORE BONUS (max +10)
        score += Math.min(10, Math.floor((c.trust_score || 0) / 10));

        // 9. EDUCATION VERIFIED BONUS
        if (c.education_score_given) score += 8;

        // 10. FOTO LENGKAP BONUS
        if (c.foto_url_2) score += 3;

        // Normalisasi persentase (max teoritis ~161)
        const pct = Math.min(99, Math.max(50, Math.round((score / 161) * 100)));

        return { ...c, match_score: pct, match_type: primaryMatch, raw_score: score };
      });

    // Sort by score descending
    scored.sort((a, b) => b.raw_score - a.raw_score);

    // ── Pilih kandidat ────────────────────────────────────
    let selected: typeof scored = [];

    if (isPremium) {
      // Premium: top 10
      selected = scored.slice(0, MAX_PREMIUM);
    } else {
      // Gratis: ambil yang paling cocok dari tiap kategori utama
      // lalu top 3 overall (tidak boleh duplikat)
      const pickedIds = new Set<string>();

      const pickBest = (type: string) => {
        const found = scored.find(c => c.match_type === type && !pickedIds.has(c.id));
        if (found) { pickedIds.add(found.id); selected.push(found); }
      };

      // Prioritas: kampus, lokasi, profesi
      pickBest('kampus');
      pickBest('lokasi');
      pickBest('profesi');

      // Jika belum 3, isi dari top overall
      scored.forEach(c => {
        if (selected.length >= MAX_FREE) return;
        if (!pickedIds.has(c.id)) { pickedIds.add(c.id); selected.push(c); }
      });

      // Sort ulang by score
      selected.sort((a, b) => b.raw_score - a.raw_score);
    }

    // ── Simpan ke weekly_candidates ───────────────────────
    await supabase.from('weekly_candidates').delete().eq('user_id', userId);

    const resetAt = new Date(Date.now() + RESET_DAYS * 24 * 60 * 60 * 1000).toISOString();

    if (selected.length > 0) {
      await supabase.from('weekly_candidates').insert(
        selected.map(c => ({
          user_id:      userId,
          candidate_id: c.id,
          match_type:   c.match_type,
          match_score:  c.match_score,
          expires_at:   resetAt,
        }))
      );
    }

    // ── Format response ───────────────────────────────────
    const result = selected.map(c => ({
      candidate_id: c.id,
      match_type:   c.match_type,
      match_score:  c.match_score,
      expires_at:   resetAt,
      profiles:     c,
    }));

    return NextResponse.json({
      success:      true,
      candidates:   result,
      is_premium:   isPremium,
      premium_info: isPremium ? premRow : null,
      reset_at:     resetAt,
      source:       'generated',
      gender_info:  { my_gender: me.jenis_kelamin, showing: lawanJenis },
    });

  } catch(err) {
    console.error('get-candidates error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}

// ── MBTI COMPATIBILITY ────────────────────────────────────
// Pasangan MBTI yang dikenal kompatibel
function getMBTICompat(a: string, b: string): number {
  const pairs: Record<string, string[]> = {
    'INTJ': ['ENFP','ENTP','INFP','ENTJ'],
    'INTP': ['ENTJ','ESTJ','ENFJ','ENFP'],
    'ENTJ': ['INFP','INTP','ENFP','ENTP'],
    'ENTP': ['INFJ','INTJ','ENFJ','ENTJ'],
    'INFJ': ['ENFP','ENTP','INTJ','INFP'],
    'INFP': ['ENFJ','ENTJ','INFJ','INTJ'],
    'ENFJ': ['INFP','ISFP','INTJ','INTP'],
    'ENFP': ['INFJ','INTJ','ENTJ','ENFJ'],
    'ISTJ': ['ESFP','ESTP','ISFJ','ESTJ'],
    'ISFJ': ['ESFP','ESTP','ISTJ','ESTJ'],
    'ESTJ': ['ISFP','ISTP','ISTJ','ISFJ'],
    'ESFJ': ['ISFP','ISTP','ESFP','ESTP'],
    'ISTP': ['ESFJ','ESTJ','ISFP','ESTP'],
    'ISFP': ['ESFJ','ESTJ','ISFJ','ENFJ'],
    'ESTP': ['ISFJ','ISTJ','ESFP','ESTP'],
    'ESFP': ['ISFJ','ISTJ','ESFJ','ESTJ'],
  };
  if (a === b) return 0.5; // sama tipe — netral
  return (pairs[a] || []).includes(b) ? 1 : 0.3;
}