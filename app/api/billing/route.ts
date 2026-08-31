import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase, getExistingSession, withSessionCookie } from "@/../db";
import { apiError, withApiError } from "@/lib/api";
import { ensureSignupCredits, getGuestTrialBalance, getSignupPromoIdentityHashes } from "@/lib/credits";
import { CHECKOUT_AVAILABLE, publicCreditPacks, PURCHASE_CREDIT_VALIDITY_DAYS } from "@/lib/pricing";

interface OrderRow {
  id: string;
  pack_id: string;
  credits: number;
  amount_fen: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先登录或创建一份简历");
    const db = getDatabase();

    if (session.kind === "guest") {
      const trialBalance = await getGuestTrialBalance(db, session.userId);
      return withSessionCookie(NextResponse.json({
        accountKind: "guest",
        balance: { total: trialBalance, bonus: trialBalance, purchased: 0, nextExpiryAt: null },
        packs: publicCreditPacks(),
        orders: [],
        purchaseCreditValidityDays: PURCHASE_CREDIT_VALIDITY_DAYS,
        checkoutAvailable: CHECKOUT_AVAILABLE,
      }), session);
    }

    const signupIdentityHashes = await getSignupPromoIdentityHashes(
      db,
      session.userId,
      env.PROMO_REDEMPTION_PEPPER,
    );
    const [balance, orders] = await Promise.all([
      ensureSignupCredits(db, session.userId, { identityHashes: signupIdentityHashes }),
      db.prepare(`SELECT id, pack_id, credits, amount_fen, status, created_at, paid_at
        FROM credit_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`)
        .bind(session.userId)
        .all<OrderRow>(),
    ]);
    return withSessionCookie(NextResponse.json({
      accountKind: "user",
      balance,
      packs: publicCreditPacks(),
      orders: orders.results.map((order) => ({
        id: order.id,
        packId: order.pack_id,
        credits: order.credits,
        amountFen: order.amount_fen,
        status: order.status,
        createdAt: order.created_at,
        paidAt: order.paid_at,
      })),
      purchaseCreditValidityDays: PURCHASE_CREDIT_VALIDITY_DAYS,
      checkoutAvailable: CHECKOUT_AVAILABLE,
    }), session);
  } catch (error) {
    return withApiError(error);
  }
}
