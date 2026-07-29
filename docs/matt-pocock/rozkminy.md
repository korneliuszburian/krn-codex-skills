# Rozkminy — jak polepszyć repo

To jest nasza przestrzeń do myślenia, nie decyzje. Każdy pomysł ma kwalifikację
zgodną z kontraktem źródłowym repo: **adopt** (przyjąć), **lab-test** (sprawdzić
na jednym konsumencie), **defer** (odłożyć do dowodu), **reject** (odrzucić).
Wnioski wchodzą potem do decision-ledgerów (`../SOURCES.md`,
`../matt-skills-coverage.md`) przez `source-to-decision`.

Punktem wyjścia jest [`pipeline-audit.md`](pipeline-audit.md): runtime-core jest
kompletny i lepiej zintegrowany niż u Matta, ale przednia połowa pipeline'u
(spec → tickety → triage) nie ma właściciela-skill'a, a ~7 wysoko-sygnałowych
źródeł nie jest jeszcze w ledgerach.

## 1. Wypełnić lub jawnie obwarować przednią połowę pipeline'u

To największa luka. Trzy brakujące etapy (`to-spec`, `to-tickets`, `triage`)
czytają się teraz jako niedopowiedziana granica zakresu, a nie decyzja.

- **✅ slice 1** — Jawna decyzja o granicy zapisana w `matt-skills-coverage.md`
  ("Front-half scope boundary"); macierz `pipeline-audit.md` odwrócona do ⏸️/✅.
  Uwaga: po promocji `slice-work` (poniżej) etap slicing ma już właściciela —
  granica zawęziła się do spec + triage.
- **✅ lab-earned → promowany** — `slice-work` (explicit-only): lab ze ślepym
  judge'em (slice-work 15 : 4 vs obecny setup) + czyste `npm run validate`
  (15 skill'i, 42 case'y). Produkuje listę pionowych, blokujących się plastrów
  rozmiaru "jedna świeża sesja" dla `implement`; nie wykonuje ich (brak kolizji
  z `implement`/`delivery-loop`). Ciągły falsyfikator: codzienne użycie — jeśli
  zacznie produkować plastry poziome lub dublować `delivery-loop`, cofamy.
  `triage` nadal świadomie bez właściciela.
- **✅ slice 1 (front-half adopt)** — `to-spec` promowany po lekturze faktycznego
  `ask-matt` Matta: kompresuje ustalony wątek w destination-first spec bez
  interviewu, publikuje do skonfigurowanego trackera, nie dubluje `slice-work`
  (krojenie) ani `domain-modeling` (słownik). Czyste `npm run validate` (17
  skill'i, 47 case'ów). Falsyfikator porównawczy (czy spec z `to-spec` daje
  czystszy pierwszy plaster niż implement prosto z wątku?) — pending jeden
  real-konsument run. Pierwszy slice programu adoptowania kształtu loopa Matta.
- **defer** — `triage` jako osobny skill. Backlog-maintenance jest rzadszy i
  mocno tracker-zależny; nie zasługuje na globalnego właściciela, dopóki nie
  pokaże się powtarzalny konsument. Zostaje domeną repo-lokalnego kontraktu.

**Ryzyko (rozstrzygnięte):** `slice-work` ograniczony do *produkcji* listy dla
`implement` — nie wykonuje plasterków, nie owns lifecycle (`delivery-loop`) ani
vocab (`domain-modeling`). Kolizja własności uniknięta; lab to potwierdził.

## 2. Dodać brakujące źródła do ledgerów

`sources.md` ma ~7 wysoko-sygnałowych źródeł nieujętych w decyzjach. To czysty
`source-to-decision`, tani i zwracający audytowalność.

- **✅ slice 1** — Ledger-entry dla **Building Great Agent Skills: The Missing
  Manual** w `SOURCES.md`. Wniosek: adopt — `writing-great-skills` już spełnia
  rubrykę Trigger/Structure/Steering/Pruning (KRN ostrzejszy na direct-reference).
- **✅ slice 1** — Ledger-entry dla **AGENTS.md guide** + **plan-mode rules** w
  `SOURCES.md`. `config/AGENTS.md` już to spełnia — zgodność audytowalna.
- **✅ slice 3 (narrow adopt)** — **deepen-shallow-modules** z De-Slop: audit
  `codebase-design` już pokrywał większość mechanizmów. Dodane dwa realne luki do
  `architecture-audit.md`: smell „pure-fns wyekstrahowane tylko pod
  testowalność, bugi w kleju" + kadencja „surg = okno z dowodem" (kalendarz
  „co tydzień" odrzucony jako ceremonia bez dowodu tarcia). Ledger-entry De-Slop
  w `SOURCES.md`.
- **defer** — Całkowite przyjęcie modelu **7 Phases**. KRN ma już
  `delivery-loop` jako lifecycle-owner; 7 faz to inna granularyzacja i
  dublowałaby stan. Trzymamy `delivery-loop`.

## 3. Context-management jako jawny właściciel

Matt traktuje "smart/dumb zone" i dietę kontekstu jako kluczowy skill
(`Most devs don't understand context windows`, `Kill the bloat`). KRN ma to
implicite (cienkie instrukcje, progressive disclosure), ale bez właściciela i
bez ledger-entry.

- **defer** — Osobny skill `context-hygiene`. Ryzyko kolizji z managing-codex
  capabilities + z `writing-great-skills`. Mechanizm jest realny, ale na tym
  etapie lepiej jako sekcja w `managing-codex-capabilities` niż nowa workflow.
- **✅ slice 4** — Ledger-entry „Context diet and the smart zone" w `SOURCES.md`:
  thin `AGENTS.md` + progressive disclosure + `managing-codex-capabilities` to
  realizacja smart-zone'u. Osobny skill `context-hygiene` nadal *defer*.

## 4. divergencje filozoficzne — przemyśleć na nowo czy utrzymać

- **proof budget (0/1/N) vs TDD.** Utrzymać (**reject** zmiany na mandatory
  TDD). Ale: rozważyć (**lab-test**) czy przy *nowej* public-seam logice nie
  warto wymagać najtańszego falsifiera bardziej naciskiem niż dziś — to
  subtelna kalibracja, nie zmiana paradygmatu.
- **native goals + tracker vs Wayfinder.** **✅ slice 2 (front-half adopt)** —
  rozstrzygnięte: `wayfinder` promowany (explicit-only) po lekturze `ask-matt`
  Matta. `slice-work` już istniał (warunek z poprzedniej wersji tej notki), a
  powtarzalny, wyraźny popyt operatora był consumer-evidence. Chartuje mglisty
  multi-session effort jako `wayfinder:map` + decision tickets na skonfigurowanym
  trackerze, plan-don't-do, nie dubluje `slice-work`/`to-spec`/`delivery-loop`.
  Czyste `npm run validate` (18 skill'i, 49 case'ów). Falsyfikator porównawczy
  (czy mapa zmniejsza mid-build przerwania "co dalej"?) — pending real-konsument.
  Warunek "rodzina mała → brak routera" poniżej nadal spełniony (ask-matt nadal
  `defer`).
- **brak routera (ask-matt).** Utrzymać dopóki rodzina skill'i jest mała. Jeśli
  pkt. 1 dołoży 1–2 skill'e explicit-only, nadal poniżej progu routera.

## 5. Drobne, czysto opisowe

- **adopt** — `README.md` tego huba + link z głównego `docs/SOURCES.md`, żeby
  research nie był odizolowany.
- **adopt** — Utrzymywać aktualny HEAD mattpocock/skills jako punkt
  referencyjny w `matt-skills-coverage.md`; obecnie `2ab9580` pozostaje
  strukturalnie zgodny z pinem `9603c1c`, więc świeżość nie wymaga przebudowy
  ledgera.
- **reject** — Vendoring jakiegokolwiek korpusu Matta (transkrypty, teksty
  kursu). Już w kontrakcie, tu tylko przypomnienie.

## Kolejność sugerowana (od najtańszego/dowodu)

1. Jawne obwarowanie granicy zakresu spec/slice/triage (adopt, zero kodu).
2. Ledger-entries dla Missing Manual + AGENTS.md-rules (adopt, czysta
   `source-to-decision`).
3. `slice-work` jako lab-test (jeden konsument, jeden falsyfikator).
4. Reszta wg potrzeby.

Każdy powyższy punkt, jeśli go zrealizujemy, trafia osobno przez normalny
production-loop (`implement` + `code-review`), a nie zbiorczym "hub commit".
