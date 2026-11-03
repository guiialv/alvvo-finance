#!/usr/bin/env python3
"""
Gera um SQL com os dados das suas planilhas, para rodar no SQL Editor do Supabase
DEPOIS de criar a família na plataforma.

Uso:
  python3 scripts/importar_planilhas.py "Planilha de Orçamento Familiar - 2026.xlsx" [ano] > supabase/seed_privado.sql

- Aba "Orçamento Pessoal": cada valor mensal vira um lançamento (origem "planilha") no ciclo do mês.
  O cabeçalho da planilha mostra 2027, mas os valores são de 2026 (batem com a fatura de jan/2026),
  por isso o ano padrão é 2026.
- Abas "Controle NFs AAAA": cada linha vira uma nota fiscal do PJ.

O arquivo gerado contém dados pessoais: ele está no .gitignore e não deve ir para o GitHub.
"""
import sys
import datetime as dt
import openpyxl

GROUPS = {"Fixas", "Variáveis", "Extras", "Adicionais"}

# (grupo da planilha, subgrupo, nome) -> (escopo, grp, subgroup, nome na plataforma)
RENAME = {
    ("Receitas", "", "Salário (25/mês)"): ("pessoal", "Receitas", "", "Salário / Retirada PJ"),
    ("Receitas", "", "Aluguel"): ("pessoal", "Receitas", "", "Aluguel recebido"),
    ("Receitas", "", "Maína"): ("pessoal", "Receitas", "", "Maína"),
    ("Receitas", "", "Bônus/Comissão/PLR"): ("pessoal", "Receitas", "", "Bônus/Comissão/PLR"),
    ("Receitas", "", "13º salário"): ("pessoal", "Receitas", "", "13º salário"),
    ("Receitas", "", "Férias"): ("pessoal", "Receitas", "", "Férias"),
    ("Receitas", "", "Outros"): ("pessoal", "Receitas", "", "Outras receitas"),
    ("Fixas", "Transporte", "Estacionamento"): ("pessoal", "Fixas", "Transporte", "Estacionamento fixo"),
    ("Fixas", "Outros", "Contabilizei"): ("pj", "Custos PJ", "", "Contabilizei"),
    ("Fixas", "Outros", "Taxas (CNPJ)"): ("pj", "Impostos", "", "Taxas (CNPJ)"),
    ("Variáveis", "Habitação", "Outros"): ("pessoal", "Variáveis", "Habitação", "Outras assinaturas"),
    ("Variáveis", "Alimentação", "Convêniencia"): ("pessoal", "Variáveis", "Alimentação", "Conveniência"),
    ("Variáveis", "Cuidados pessoais", "Outros"): ("pessoal", "Variáveis", "Cuidados pessoais", "Outros cuidados"),
    ("Variáveis", "Impostos", "DARF INSS"): ("pj", "Impostos", "", "DARF INSS"),
    ("Variáveis", "Impostos", "SIMPLES NACIONAL"): ("pj", "Impostos", "", "Simples Nacional"),
    ("Extras", "Manutenção/ prevenção", "Carro"): ("pessoal", "Extras", "Manutenção/prevenção", "Carro"),
    ("Extras", "Manutenção/ prevenção", "Apartamento"): ("pessoal", "Extras", "Manutenção/prevenção", "Apartamento"),
    ("Extras", "Manutenção/ prevenção", "Outros"): ("pessoal", "Extras", "Manutenção/prevenção", "Outras manutenções"),
    ("Extras", "Gastos Corp + Bianca", "ZTE Reembolso"): ("pessoal", "Extras", "Reembolsáveis", "Reembolsos Corporativo"),
    ("Extras", "Gastos Corp + Bianca", "Bianca Reembolso"): ("pessoal", "Extras", "Reembolsáveis", "Reembolsos Corporativo"),
    ("Adicionais", "Lazer", "Outros"): ("pessoal", "Adicionais", "Lazer", "Outros lazer"),
}
INVEST = {"Ações": "Ações", "Tesouro Direto": "Tesouro Direto", "Renda fixa": "Renda fixa",
          "Previdência Privada": "Previdência Privada", "Outros": "Outros investimentos"}


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) > 0.004


def budget_rows(ws, year):
    out = []
    section = None
    group = None
    subgroup = ""
    for r in range(1, ws.max_row + 1):
        a, b, c, d = (ws.cell(r, i).value for i in range(1, 5))
        if a == "Saldo":
            break
        if a == "Receitas":
            section, group, subgroup = "Receitas", "Receitas", ""
        elif a == "Investimentos":
            section, group, subgroup = "Investimentos", "Investimentos", ""
        elif a == "Despesas":
            section = "Despesas"
        if section == "Despesas" and isinstance(b, str) and b.strip() in GROUPS:
            group = b.strip()
        if section == "Despesas" and isinstance(c, str) and c.strip() and not c.strip().startswith(("Total", "%")):
            subgroup = c.strip()
        if not isinstance(d, str) or not d.strip() or d.strip() in ("Total", "Despesa", "Valor"):
            continue
        name = d.strip()
        if section == "Investimentos":
            # A primeira linha traz o texto explicativo em D; o nome do investimento vem na coluna E
            continue
        if section not in ("Receitas", "Despesas") or group is None:
            continue
        sg = "" if group == "Receitas" else subgroup
        target = RENAME.get((group, sg, name), ("pessoal", group, sg.replace("Manutenção/ prevenção", "Manutenção/prevenção"), name))
        for m in range(12):
            v = ws.cell(r, 5 + m).value
            if num(v):
                out.append((target, f"{year}-{m + 1:02d}", round(float(v), 2)))
    return out


def invoice_rows(wb):
    out = []
    for name in wb.sheetnames:
        if not name.startswith("Controle NFs"):
            continue
        ws = wb[name]
        for r in range(2, ws.max_row + 1):
            month, nf, sal, com, outros, obs = (ws.cell(r, i).value for i in range(1, 7))
            if not isinstance(month, dt.datetime) or not num(nf):
                continue
            out.append((month.date().replace(day=1).isoformat(), round(float(nf), 2),
                        round(float(sal or 0), 2) if num(sal) else 0,
                        round(float(com or 0), 2) if num(com) else 0,
                        round(float(outros or 0), 2) if num(outros) else 0,
                        obs if isinstance(obs, str) else None))
    return out


def main():
    path = sys.argv[1]
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026
    wb = openpyxl.load_workbook(path, data_only=True)
    rows = budget_rows(wb["Orçamento Pessoal"], year)
    invs = invoice_rows(wb)

    print("-- Gerado por scripts/importar_planilhas.py — contém dados pessoais, não versionar.")
    print("-- Rode no SQL Editor do Supabase depois de criar a família na plataforma.")
    print("do $$")
    print("declare hh uuid; cat uuid; b uuid; faltando text := '';")
    print("begin")
    print("  select id into hh from public.households order by created_at limit 1;")
    print("  if hh is null then raise exception 'Crie a família na plataforma antes de importar.'; end if;")
    print("  if exists (select 1 from public.import_batches where household_id = hh and source = 'planilha' and file_name = " + q(path.split('/')[-1]) + ") then")
    print("    raise exception 'Esta planilha já foi importada. Para reimportar, apague o lote em import_batches.';")
    print("  end if;")
    print(f"  insert into public.import_batches(household_id, source, file_name, tx_count) values (hh, 'planilha', {q(path.split('/')[-1])}, {len(rows)}) returning id into b;")
    for (scope, grp, sg, name), cycle, v in rows:
        print(f"  select id into cat from public.categories where household_id = hh and scope = {q(scope)} and grp = {q(grp)} and subgroup = {q(sg)} and name = {q(name)};")
        print(f"  if cat is null then faltando := faltando || {q(name)} || ', '; end if;")
        kind = "receita" if grp == "Receitas" else "despesa"
        print(f"  insert into public.transactions(household_id, scope, date, cycle, description, amount, kind, category_id, source, import_batch_id) "
              f"values (hh, {q(scope)}, {q(cycle + '-08')}, {q(cycle)}, {q('Planilha · ' + name)}, {v}, {q(kind)}, cat, 'planilha', b);")
    for month, total, sal, com, outros, obs in invs:
        print(f"  insert into public.pj_invoices(household_id, month, total, salary_part, commission_part, other_part, notes) "
              f"values (hh, {q(month)}, {total}, {sal}, {com}, {outros}, {q(obs) if obs else 'null'});")
    print("  if faltando <> '' then raise notice 'Categorias não encontradas (lançadas como A classificar): %', faltando; end if;")
    print(f"  raise notice 'Importados {len(rows)} lançamentos e {len(invs)} notas fiscais.';")
    print("end $$;")


if __name__ == "__main__":
    main()
