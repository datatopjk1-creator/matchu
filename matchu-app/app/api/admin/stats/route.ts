import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // ── Total user ────────────────────────────────────────
    const { count: totalUser } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // ── User baru hari ini ────────────────────────────────
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { count: userBaruHariIni } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfToday.toISOString());

    // ── User premium aktif ────────────────────────────────
    // Asumsi: status = 'active' DAN belum expired
    const nowIso = new Date().toISOString();
    const { count: userPremium } = await supabase
      .from('premium_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .gt('expires_at', nowIso);

    // ── Pendapatan ─────────────────────────────────────────
    // Asumsi: status = 'paid' dihitung sebagai pendapatan sukses
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const { data: paymentsThisMonth } = await supabase
      .from('payment_orders')
      .select('amount, paid_at')
      .eq('status', 'paid')
      .gte('paid_at', startOfMonth.toISOString());

    const { data: paymentsThisWeek } = await supabase
      .from('payment_orders')
      .select('amount, paid_at')
      .eq('status', 'paid')
      .gte('paid_at', startOfWeek.toISOString());

    const { data: paymentsToday } = await supabase
      .from('payment_orders')
      .select('amount, paid_at')
      .eq('status', 'paid')
      .gte('paid_at', startOfToday.toISOString());

    const sumAmount = (rows: { amount: number }[] | null) =>
      (rows || []).reduce((sum, r) => sum + (r.amount || 0), 0);

    const pendapatanBulanIni = sumAmount(paymentsThisMonth);
    const pendapatanMingguIni = sumAmount(paymentsThisWeek);
    const pendapatanHariIni = sumAmount(paymentsToday);

    // ── Verifikasi pendidikan menunggu ─────────────────────
    const { count: verifikasiMenunggu } = await supabase
      .from('education_verifications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    return NextResponse.json({
      success: true,
      stats: {
        totalUser: totalUser || 0,
        userBaruHariIni: userBaruHariIni || 0,
        userPremium: userPremium || 0,
        pendapatanHariIni,
        pendapatanMingguIni,
        pendapatanBulanIni,
        verifikasiMenunggu: verifikasiMenunggu || 0,
      },
    });

  } catch (err) {
    console.error('[ADMIN-STATS] error:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal mengambil statistik.' },
      { status: 500 }
    );
  }
}