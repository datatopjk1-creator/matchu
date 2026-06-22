// app/api/create-payment/route.ts
// Buat order Midtrans Snap untuk upgrade premium

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const PACKAGES: Record<string, { label: string; days: number; price: number }> = {
  '7hari':  { label: 'Premium 7 Hari',  days: 7,  price: 40000 },
  '14hari': { label: 'Premium 14 Hari', days: 14, price: 50000 },
  '21hari': { label: 'Premium 21 Hari', days: 21, price: 60000 },
  '30hari': { label: 'Premium 30 Hari', days: 30, price: 80000 },
};

export async function POST(req: NextRequest) {
  try {
    const { userId, package: pkg } = await req.json();

    if (!userId || !pkg) return NextResponse.json({ success: false, error: 'userId dan package wajib.' }, { status: 400 });

    const pack = PACKAGES[pkg];
    if (!pack) return NextResponse.json({ success: false, error: 'Package tidak valid.' }, { status: 400 });

    // ── Ambil data user ───────────────────────────────────
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('nama, email')
      .eq('id', userId)
      .limit(1);

    const profile = profileRows?.[0];
    if (!profile) return NextResponse.json({ success: false, error: 'User tidak ditemukan.' }, { status: 404 });

    // ── Buat order_id unik ────────────────────────────────
    const orderId = `MATCHU-${userId.slice(0, 8)}-${Date.now()}`;

    // ── Simpan ke payment_orders ──────────────────────────
    await supabase.from('payment_orders').insert({
      user_id:  userId,
      order_id: orderId,
      package:  pkg,
      amount:   pack.price,
      status:   'pending',
    });

    // ── Buat Snap Token via Midtrans ──────────────────────
    const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
    const isProduction = process.env.MIDTRANS_ENV === 'production';
    const snapUrl = isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const auth = Buffer.from(serverKey + ':').toString('base64');

    const snapRes = await fetch(snapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        transaction_details: {
          order_id:     orderId,
          gross_amount: pack.price,
        },
        customer_details: {
          first_name: profile.nama || 'Member',
          email:      profile.email,
        },
        item_details: [{
          id:       pkg,
          price:    pack.price,
          quantity: 1,
          name:     pack.label,
        }],
        callbacks: {
          finish: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/premium.html?status=success`,
        },
      }),
    });

    const snapData = await snapRes.json();
    console.log('[PAYMENT] Midtrans response:', JSON.stringify(snapData));

    if (!snapData.token) {
      return NextResponse.json({ success: false, error: 'Gagal membuat token pembayaran.', detail: snapData }, { status: 500 });
    }

    // ── Simpan snap_token ─────────────────────────────────
    await supabase.from('payment_orders').update({ snap_token: snapData.token }).eq('order_id', orderId);

    return NextResponse.json({
      success:    true,
      snap_token: snapData.token,
      order_id:   orderId,
      package:    pack,
    });

  } catch (err) {
    console.error('create-payment error:', err);
    return NextResponse.json({ success: false, error: 'Server error.' }, { status: 500 });
  }
}