import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const filter = searchParams.get('filter') || 'all'; // all | premium | free | verified | suspended
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    let query = supabase
      .from('profiles')
      .select('id, nama, nama_panggilan, email, status, trust_score, created_at, kampus, jurusan, education_score_given')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) {
      query = query.or(`nama.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (filter === 'suspended') {
      query = query.eq('status', 'suspended');
    } else if (filter === 'verified') {
      query = query.eq('education_score_given', true);
    }

    const { data: profiles, error } = await query;

    if (error) {
      console.error('[ADMIN-USERS] query error:', error);
      return NextResponse.json({ success: false, error: 'Gagal mengambil data user.' }, { status: 500 });
    }

    const nowIso = new Date().toISOString();
    const { data: activeSubs } = await supabase
      .from('premium_subscriptions')
      .select('user_id')
      .eq('status', 'active')
      .gt('expires_at', nowIso);

    const premiumUserIds = new Set((activeSubs || []).map(s => s.user_id));

    let users = (profiles || []).map(p => ({
      id: p.id,
      nama: p.nama,
      nama_panggilan: p.nama_panggilan,
      email: p.email,
      status: p.status,
      trust_score: p.trust_score,
      created_at: p.created_at,
      kampus: p.kampus,
      jurusan: p.jurusan,
      educationVerified: !!p.education_score_given,
      isPremium: premiumUserIds.has(p.id),
    }));

    if (filter === 'premium') {
      users = users.filter(u => u.isPremium);
    } else if (filter === 'free') {
      users = users.filter(u => !u.isPremium);
    }

    return NextResponse.json({ success: true, users });

  } catch (err) {
    console.error('[ADMIN-USERS] error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}