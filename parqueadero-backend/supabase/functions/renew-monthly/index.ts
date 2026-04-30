import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPIRING_THRESHOLD_DAYS = 5;

interface MonthlyPlanRow {
  id: string;
  vehicle_plate: string;
  customer_id: string;
  plan_type: string;
  start_date: string;
  end_date: string;
  amount_cents: number;
  auto_renew: boolean;
  payment_token_id: string | null;
}

Deno.serve(async (req: Request) => {
  // Allow manual invocation via POST; cron also calls with POST
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Yesterday in YYYY-MM-DD (Colombia UTC-5, approximate via server UTC)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // Find plans that expired yesterday with auto_renew = true
  const { data: plans, error: fetchErr } = await supabase
    .from('monthly_plans')
    .select('id, vehicle_plate, customer_id, plan_type, start_date, end_date, amount_cents, auto_renew, payment_token_id')
    .eq('status', 'expired')
    .eq('auto_renew', true)
    .eq('_deleted', false)
    .eq('end_date', yesterdayStr);

  if (fetchErr) {
    console.error('Error fetching expired plans:', fetchErr.message);
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = (plans ?? []) as MonthlyPlanRow[];
  const results: { plate: string; newPlanId: string }[] = [];
  const errors: { plate: string; error: string }[] = [];

  for (const plan of rows) {
    try {
      // Calculate new period with same duration
      const oldStart = new Date(plan.start_date);
      const oldEnd = new Date(plan.end_date);
      const durationDays = Math.round((oldEnd.getTime() - oldStart.getTime()) / 86_400_000);

      const newStart = new Date(yesterday);
      newStart.setDate(newStart.getDate() + 1); // today
      const newEnd = new Date(newStart);
      newEnd.setDate(newEnd.getDate() + durationDays);

      const newStartStr = newStart.toISOString().slice(0, 10);
      const newEndStr = newEnd.toISOString().slice(0, 10);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((newEnd.getTime() - today.getTime()) / 86_400_000);
      const status = daysLeft <= EXPIRING_THRESHOLD_DAYS ? 'expiring' : 'active';

      const payload: Record<string, unknown> = {
        vehicle_plate: plan.vehicle_plate,
        customer_id: plan.customer_id,
        plan_type: plan.plan_type,
        start_date: newStartStr,
        end_date: newEndStr,
        amount_cents: plan.amount_cents,
        status,
        auto_renew: true,
      };
      if (plan.payment_token_id) payload['payment_token_id'] = plan.payment_token_id;

      const { data: newPlan, error: insertErr } = await supabase
        .from('monthly_plans')
        .insert(payload)
        .select('id')
        .single();

      if (insertErr) {
        errors.push({ plate: plan.vehicle_plate, error: insertErr.message });
        continue;
      }

      // audit_log is written automatically by trg_monthly_plans_audit trigger
      results.push({ plate: plan.vehicle_plate, newPlanId: newPlan.id });
    } catch (err) {
      errors.push({ plate: plan.vehicle_plate, error: String(err) });
    }
  }

  const summary = {
    processed: rows.length,
    renewed: results.length,
    failed: errors.length,
    results,
    errors,
    date: yesterdayStr,
  };

  console.log('renew-monthly summary:', JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
