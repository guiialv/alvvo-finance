-- Importações vindas do Open Finance
alter table public.import_batches drop constraint if exists import_batches_source_check;
alter table public.import_batches add constraint import_batches_source_check check (source = any (array['fatura_pdf', 'extrato_pdf', 'csv', 'ofx', 'planilha', 'open_finance']));
