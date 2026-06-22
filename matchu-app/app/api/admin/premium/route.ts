import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const nowIso = new Date().toISOString();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // ── 1. Premium aktif (join ke profiles untuk nama/email) ──────
    const { data: activeSubsRaw } = await supabase
      .from('premium_subscriptions')
      .select('id, user_id, package, started_at, expires_at, status, order_id')
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .order('started_at', { ascending: false });

    const userIds = [...new Set((activeSubsRaw || []).map(s => s.user_id))];
    let profilesMap: Record<string, { nama: string; email: string }> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, nama, email')
        .in('id', userIds);
      profilesMap = (profiles || []).reduce((acc, p) => {
        acc[p.id] = { nama: p.nama, email: p.email };
        return acc;
      }, {} as Record<string, { nama: string; email: string }>);
    }

    // ── Ambil harga dari payment_orders berdasarkan order_id ──────
    const orderIds = (activeSubsRaw || []).map(s => s.order_id).filter(Boolean);
    let amountMap: Record<string, number> = {};
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from('payment_orders')
        .select('order_id, amount')
        .in('order_id', orderIds);
      amountMap = (orders || []).reduce((acc, o) => {
        acc[o.order_id] = o.amount;
        return acc;
      }, {} as Record<string, number>);
    }

    const activePremium = (activeSubsRaw || []).map(s => ({
      id: s.id,
      user_id: s.user_id,
      nama: profilesMap[s.user_id]?.nama || '-',
      email: profilesMap[s.user_id]?.email || '-',
      package: s.package,
      started_at: s.started_at,
      expires_at: s.expires_at,
      amount: amountMap[s.order_id] || null,
    }));

    // ── 2. Premium akan berakhir (≤14 hari) ───────────────────────
    const in14Days = new Date();
    in14Days.setDate(in14Days.getDate() + 14);

    const expiringSoon = activePremium
      .filter(p => new Date(p.expires_at) <= in14Days)
      .map(p => {
        const daysLeft = Math.ceil((new Date(p.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return { ...p, days_left: daysLeft };
      })
      .sort((a, b) => a.days_left - b.days_left);

    // ── 3. Riwayat pembayaran premium (10 terakhir, status paid) ──
    const { data: paymentRows } = await supabase
      .from('payment_orders')
      .select('id, user_id, order_id, package, amount, status, paid_at, created_at')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(10);

    const payUserIds = [...new Set((paymentRows || []).map(p => p.user_id))];
    let payProfilesMap: Record<string, { nama: string; email: string }> = {};
    if (payUserIds.length > 0) {
      const { data: payProfiles } = await supabase
        .from('profiles')
        .select('id, nama, email')
        .in('id', payUserIds);
      payProfilesMap = (payProfiles || []).reduce((acc, p) => {
        acc[p.id] = { nama: p.nama, email: p.email };
        return acc;
      }, {} as Record<string, { nama: string; email: string }>);
    }

    const paymentHistory = (paymentRows || []).map(p => ({
      ...p,
      nama: payProfilesMap[p.user_id]?.nama || '-',
      email: payProfilesMap[p.user_id]?.email || '-',
    }));

    // ── 4. Stats ───────────────────────────────────────────────────
    const premiumAktif = activePremium.length;

    const { data: paidThisMonth } = await supabase
      .from('payment_orders')
      .select('amount')
      .eq('status', 'paid')
      .gte('paid_at', startOfMonth.toISOString());
    const pendapatanBulanIni = (paidThisMonth || []).reduce((s, r) => s + (r.amount || 0), 0);

    const { count: upgradeHariIni } = await supabase
      .from('premium_subscriptions')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', startOfToday.toISOString());

    const { data: allPaid } = await supabase
      .from('payment_orders')
      .select('amount')
      .eq('status', 'paid');
    const lifetimeRevenue = (allPaid || []).reduce((s, r) => s + (r.amount || 0), 0);

    // ── 5. Revenue 6 bulan terakhir ─────────────────────────────────
    const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const monthlyRevenue: { month: string; total: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      d.setHours(0, 0, 0, 0);
      const nextMonth = new Date(d);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const { data: rows } = await supabase
        .from('payment_orders')
        .select('amount')
        .eq('status', 'paid')
        .gte('paid_at', d.toISOString())
        .lt('paid_at', nextMonth.toISOString());

      const total = (rows || []).reduce((s, r) => s + (r.amount || 0), 0);
      monthlyRevenue.push({ month: monthNames[d.getMonth()], total });
    }

    return NextResponse.json({
      success: true,
      stats: { premiumAktif, pendapatanBulanIni, upgradeHariIni: upgradeHariIni || 0, lifetimeRevenue },
      activePremium,
      expiringSoon,
      paymentHistory,
      monthlyRevenue,
    });

  } catch (err) {
    console.error('[ADMIN-PREMIUM] error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}