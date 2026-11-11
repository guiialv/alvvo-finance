-- Faturas lidas como no PDF: final do cartão em cada lançamento e
-- "Compras parceladas - próximas faturas" guardadas na importação.
alter table public.transactions add column if not exists card_last4 text;
alter table public.import_batches add column if not exists current_total numeric(14,2);
alter table public.import_batches add column if not exists card_totals jsonb not null default '{}'::jsonb;
alter table public.import_batches add column if not exists future_items jsonb not null default '[]'::jsonb;
create index if not exists transactions_batch_card_idx on public.transactions(import_batch_id, card_last4);
