-- 0010: switch for online payments (card / FPX through the chosen gateway).
-- Off until the gateway is configured: see docs/INTEGRATIONS.md.
begin;

insert into app_settings (key, value, category, label, description, is_public) values
  ('finance.online_payments_enabled', 'false', 'finance', 'Online payments',
   'Shows "Pay online" on student invoices. Turn on only after the payment gateway and the create-payment-link function are configured.', true)
on conflict (key) do nothing;

commit;
