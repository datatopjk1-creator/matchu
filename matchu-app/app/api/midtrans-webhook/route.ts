// app/api/midtrans-webhook/route.ts
// Webhook dari Midtrans — aktifkan premium setelah bayar

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import crypto from 'crypto';

const PACKAGES: Record<string, number> = {
  '7hari': 7, '14hari': 14, '21hari': 21, '30hari': 30,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[WEBHOOK] Midtrans:', JSON.stringify(body));

    const { order_id, transaction_status, fraud_status, gross_amount, signature_key } = body;

    // ── Verifikasi signature ──────────────────────────────
    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    const statusCode = body.status_code;
    const expectedSig = crypto
      .createHash('sha512')
      .update(`${order_id}${statusCode}${gross_amount}${serverKey}`)
      .digest('hex');

    if (signature_key !== expectedSig) {
      console.error('[WEBHOOK] Invalid signature');
      return NextResponse.json({ success: false, error: 'Invalid signature.' }, { status: 403 });
    }

    // ── Cari order ────────────────────────────────────────
    const { data: orders } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('order_id', order_id)
      .limit(1);

    const order = orders?.[0];
    if (!order) return NextResponse.json({ success: false, error: 'Order tidak ditemukan.' }, { status: 404 });

    // ── Cek status pembayaran ─────────────────────────────
    const isSuccess =
      transaction_status === 'settlement' ||
      (transaction_status === 'capture' && fraud_status === 'accept');

    const isFailed =
      transaction_status === 'cancel' ||
      transaction_status === 'deny' ||
      transaction_status === 'expire';

    if (isSuccess) {
      // ── Update payment_orders ─────────────────────────
      await supabase.from('payment_orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('order_id', order_id);

      // ── Aktifkan / perpanjang premium ─────────────────
      const days = PACKAGES[order.package] || 7;
      const now = new Date();

      // Cek apakah sudah ada premium aktif (perpanjang dari tanggal expired)
      const { data: existingPrem } = await supabase
        .from('premium_subscriptions')
        .select('expires_at, status')
        .eq('user_id', order.user_id)
        .limit(1);

      const existing = existingPrem?.[0];
      let startDate = now;
      if (existing?.status === 'active' && existing?.expires_at && new Date(existing.expires_at) > now) {
        // Perpanjang dari tanggal expired sekarang
        startDate = new Date(existing.expires_at);
      }

      const expiresAt = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

      await supabase.from('premium_subscriptions').upsert({
        user_id:    order.user_id,
        status:     'active',
        package:    order.package,
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        order_id:   order_id,
      }, { onConflict: 'user_id' });

      // ── Reset weekly_candidates agar dapat kandidat baru ─
      await supabase.from('weekly_candidates').delete().eq('user_id', order.user_id);

      console.log(`[WEBHOOK] Premium aktif untuk ${order.user_id} sampai ${expiresAt}`);
    }

    if (isFailed) {
      await supabase.from('payment_orders')
        .update({ status: 'failed' })
        .eq('order_id', order_id);
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[WEBHOOK] error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}