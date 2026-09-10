# Agentic engineering: reliable over time, pleasant in use

_Research read and source verification: 2026-08-26. GitHub repositories are pinned to the commits listed in the reading list._

Status: `adopt` for the test-only EvidenceSpine contract; production adapters
remain `lab-test`. Consumer: the EvidenceSpine regression and future
delivery-loop integration decisions. Owner: `source-to-decision` with the
EvidenceSpine test seam. Verified: 2026-09-10.

## Pytanie decyzyjne

Co powinno sprawić, że harness agentic engineeringu dowozi przez wiele godzin i
restartów, a jednocześnie nie zamienia pracy inżyniera w obsługę ceremonii?

## Executive synthesis

**Źródła mówią:** długi horyzont wymaga przeniesienia stanu poza bieżące okno
kontekstu: do repozytorium, ticketów, artefaktów, logów albo trwałej sesji.
Potrzebne są małe granice pracy, obserwowalny feedback, możliwość restartu i
mechanizmy, które sprawdzają wynik, nie tylko intencję agenta. OpenAI akcentuje
repo jako system of record i mechaniczne invariants; Anthropic — artefakty
między sesjami, zewnętrzny evaluator oraz rozdzielenie sesji, harnessu i sandboxa;
Symphony — tracker jako control plane.

**Nasza synteza:** reliability i przyjemność nie są przeciwieństwami. Pleasant
harness minimalizuje liczbę decyzji, które człowiek musi podejmować ręcznie, ale
nie ukrywa stanu, dowodu ani następnego kroku. Najlepszy kształt to cienki
domyślny loop plus skalowane warstwy: research/spec dla niepewności, gates dla
ryzyka i orkiestracja dopiero wtedy, gdy sesje lub workspaces stają się
bottleneckiem.

## Porównanie podejść

| Podejście | Mechanizm | Zysk dla długiego horyzontu | Koszt / granica |
|---|---|---|---|
| **OpenAI Harness Engineering** | Repozytoryjny map, progressive disclosure, custom linty i structural tests, legible UI/logs/metrics, ciągłe “garbage collection”. ([źródło](https://openai.com/index/harness-engineering/)) | Agent może sam zebrać kontekst, uruchomić system i dostać feedback; reguły nie dryfują wyłącznie w promptach. | Wyniki są raportem z wewnętrznego projektu; skala i narzędzia nie generalizują automatycznie. |
| **Codex App Server** | Trwałe threads, konfiguracja, tools/skills oraz dwukierunkowy JSON-RPC stream między core a klientem. ([źródło](https://openai.com/index/unlocking-the-codex-harness/)) | Klient może odłączyć się i wrócić do eventów; jedna semantyka agenta zasila CLI, IDE, desktop i web. | To granica runtime/klienta, nie gotowa polityka engineeringowa ani dowód jakości kodu. |
| **Symphony** | Issue tracker jako control plane; per-issue workspace, bounded concurrency, retry/reconciliation, `WORKFLOW.md`, logi i status. ([blog](https://openai.com/index/open-source-codex-orchestration-symphony/), [spec](https://github.com/openai/symphony/blob/8001b52e3062495a16e520e4ceaf8f9de868c4d0/SPEC.md)) | Człowiek zarządza deliverables zamiast tabami sesji; praca może trwać po crashu i rozwijać się w DAG-u. | Draft/preview; trust, approval i sandbox są pozostawione implementacji. |
| **Anthropic long-running** | Initializer + incremental coding z artefaktami; później planner/generator/evaluator i granularne kontrakty testowalne przez Playwright. ([long-running](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [design](https://www.anthropic.com/engineering/harness-design-long-running-apps)) | Czyste handoffy, zewnętrzna krytyka i iteracja ograniczają samozadowolenie generatora. | Evaluator wymaga strojenia, nadal przepuszcza subtelne błędy; pełny harness jest wolniejszy i droższy. |
| **Anthropic Managed Agents** | Wirtualizuje `session` (append-only log), `harness` i `sandbox`; credentials poza sandboxem, sandbox tworzony dopiero gdy potrzebny. ([źródło](https://www.anthropic.com/engineering/managed-agents)) | Crash recovery, wymienność implementacji, mniejszy TTFT i mniejszy blast radius. | To infrastrukturalny model usługi; nie zastępuje lokalnego domain modelu ani acceptance proof. |
| **Matt Pocock skills** | Małe composable owners; rozdział user/model-invoked; grilling, shared language, TDD, diagnosis, deep modules, review i research. ([README](https://github.com/mattpocock/skills/blob/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/README.md), [research](https://github.com/mattpocock/skills/blob/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/engineering/research/SKILL.md)) | Człowiek steruje przez małe decyzje i dobiera tylko potrzebnego ownera; wspólny język skraca kolejne sesje. | Skills są procedurami i guidance, nie samodzielnym benchmarkiem poprawy. |
| **unlazy** | Ledger gates-before-work: `CHECK`/`EXPECT`, jawna approval, evidence, `--reverify`, Depth Tree, ownership leases i rolling dispatch. ([README](https://github.com/Leonxlnx/unlazy/blob/da0b00a3a6b706b471797cd4ef579ae1001ff6d7/README.md), [method](https://github.com/Leonxlnx/unlazy/blob/da0b00a3a6b706b471797cd4ef579ae1001ff6d7/references/method.md)) | Zmusza do rozróżnienia “sprawdzone” od “brzmi skończonego” i do integracji bottom-up. | Approval nie jest sandboxem; `CHECK` ma ambient credentials/network, a leases nie izolują procesu. |
| **ponytail** | Drabina YAGNI: potrzeba → reuse → stdlib → native → istniejąca zależność → minimalny kod; ochrona validation/security/accessibility. ([skill](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail/SKILL.md), [review](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/skills/ponytail-review/SKILL.md)) | Redukuje overbuilding zanim stanie się długiem i skraca diff oraz obciążenie poznawcze. | Nie rozwiązuje koordynacji ani dowodu ukończenia; benchmark jest mały i autorstwa projektu. |

## Mechanizmy, które się przenoszą

1. **Stan poza głową modelu.** Repozytoryjny map, wersjonowane decyzje, ticket,
   ledger lub append-only event log są restartowalnym interfejsem. Sama
   compaction nie wystarcza, jeśli odrzuca informacje potrzebne przyszłemu
   krokowi.
2. **Granice zamiast mikrozarządzania.** Dziel pracę po realnych domenach,
   publicznych seamach i kryteriach akceptacji. Wewnątrz granicy zostaw agentowi
   swobodę; na granicy wymuś invariant, test lub review.
3. **Zewnętrzny sceptycyzm.** Generator nie powinien być jedynym sędzią.
   Osobny evaluator, fixed-point review albo falsifier ma próbować obalić
   sukces; jego jakość trzeba stroić na realnych trace’ach.
4. **Skalowana ceremonia.** Mały task potrzebuje jednego ownera i najtańszego
   falsifiera. Tree, gates, leases, evaluator i daemon są uzasadnione dopiero
   przez wielkość, ryzyko lub równoległość.
5. **Bezpieczeństwo strukturalne.** Nie wystarczy prośba w promptcie: sekrety
   powinny być poza kodem agenta, a repo powinno mechanicznie pilnować granic,
   schematów i kryteriów.

## Ograniczenia i non-proofs

- Żadne z tych źródeł nie dowodzi, że KRN jest lepszy. To porównanie mechanizmów,
  nie benchmark KRN ani wspólna ewaluacja modeli.
- Liczby OpenAI i Anthropic pochodzą z ich własnych eksperymentów; zadania,
  modele, koszty i narzędzia są nieporównywalne. Anthropic wprost pokazuje, że
  evaluator nadal pomija część błędów, a dodatkowy harness może kosztować
  wielokrotnie więcej.
- Symphony jest draftem i preview; nie ustanawia jednej polityki sandboxa.
- `unlazy` potwierdza wykonanie opisanych komend, nie ich semantyczną
  poprawność, bezpieczeństwo transitive dependencies ani izolację systemową.
- `ponytail` pokazuje obiecującą heurystykę na małej próbie; mniej LOC nie jest
  samo w sobie dowodem maintainability, security ani poprawności.
- Mattowe skillsy nie są dowodem, że każda sesja powinna uruchamiać cały zestaw.

## Implikacje dla KRN

**Adopt:** utrzymać repo jako compiled context spine; jeden workflow owner,
fixed point, jawne outcome/publication states, 0/1/N falsifiers oraz progressive
disclosure. To łączy legibility OpenAI, shared language Matta i restartowalność
Anthropic bez centralnego mega-routera.

**Adopt selectively:** używać heurystyki ponytail na wejściu do implementacji i
review over-engineeringu; używać unlazy jako opt-in envelope dla długich,
wieloczęściowych outcome’ów. Gates są dowodem i koordynacją, nigdy granicą
zaufania. App Server/Symphony warto rozważyć dopiero, gdy tracker i przełączanie
między wieloma workspace’ami staną się realnym bottleneckiem.

**Measure before expanding:** w dogfoodzie mierzyć time-to-first-useful-output,
liczbę ręcznych przerw i handoffów, rework po review, tokeny/czas, koszt gates
oraz false-completion misses. Nie dodawać stałej ceremonii, jeśli nie poprawia
jednego z tych wyników.

## Case studies z pierwszej ręki

### MUZG — CANON Kernel + FCDH harness

**Źródłowe fakty.** MUZG opisuje się jako warstwa harnessu dla CANON Kernel i
FCDH (Falsifiable Cue-Delivery Harness), a nie jako gotowy router modeli,
system pamięci, gateway ani silnik dostarczania. Jego kodowy produkt jest
celowo wąski: `Claim`, `Packet` i `DecisionTrace`; osobno istnieje warstwa
workflowów, skillsów, testów, review i handoffów. Kontrakty nazywają
`TaskEnvelope`, ograniczony `ContextPacket`, deterministyczny
`RoutingDecision`, immutable `RunPlan`, `WorkEvent` i terminalny `RunReceipt`.
`DecisionPacket` jest w modelu domenowym wynikiem przyszłego/obecnego
ContextProvidera, nie dowodem na istnienie pełnego runtime'u pamięci. ([AGENTS.md](https://github.com/korneliuszburian/muzg/blob/f99ae497565204f6ed48db38030d609d62c98e7a/AGENTS.md), [CONTEXT.md](https://github.com/korneliuszburian/muzg/blob/f99ae497565204f6ed48db38030d609d62c98e7a/CONTEXT.md))

Operacyjnie prowadzi pracę przez orientację, grillowanie, specyfikację, tracer
bullet, implementację z feedbackiem, niezależny review, integrację dowodów i
handoff. Codex jest głównym wykonawcą; OpenCode jest opcjonalnym workerem i
Reviewerem B. Review board ma trzy role: Codex, świeży read-only OpenCode oraz
Perplexity/GitHub, z polityką P0/P1/P2. Repozytorium ma mierzone gate'y test,
typecheck, lint, format i oracles; e2e pozostaje `UNKNOWN`. ([review schema](https://github.com/korneliuszburian/muzg/blob/f99ae497565204f6ed48db38030d609d62c98e7a/docs/agents/finding.schema.json), [census](https://github.com/korneliuszburian/muzg/blob/f99ae497565204f6ed48db38030d609d62c98e7a/docs/agents/onboard-census.json))

**Porównanie i non-proofs.** MUZG jest najbliżej governance layer KRN: wzmacnia
granice autorstwa, fixed point, review i handoff, ale nie dostarcza jeszcze
DB-backed temporal memory ani autonomicznego schedulera jak mise-en-palace, i
nie ma executor-loopu mini-agi. To bardziej rygorystyczny proces nad
wykonawcą niż samodzielny agent. Dokumentacja odnotowuje brak skonfigurowanego
Codex GitHub review, a `e2e` jako nieznane; dlatego policyjny trzyosobowy board
nie jest w pełni dowodem runtime. Brakuje też szerokiego proofu jakości,
przenośności i redukcji kosztu. [Census przy pinned HEAD](https://github.com/korneliuszburian/muzg/blob/f99ae497565204f6ed48db38030d609d62c98e7a/docs/agents/onboard-census.json)
nie jest dowodem, że sam harness poprawia wyniki.

### mini-agi — executor loop, verifiable reward i eksperymenty

**Źródłowe fakty.** mini-agi to pojedynczy binarny kernel w Rust: enforcement-
bound memory, registry skillsów, checkpoint journal, eval, CLI i MCP. Jego
loop wybiera otwartą lukę, tworzy/claimuje ticket i spec, uruchamia workera,
ingestuje `run.json`, a `loop verify` zamyka sprawę dopiero przy własnym
`outcome.achieved` oraz przejściu deklarowanego deterministycznego
`verify_command` w `verify_target`. Ledger luk i lease są trwałe; zapisy do
pamięci i workflowów wymagają jawnego `approve`. `harness verify` robi
counterfactual before/after: kandydat musi usunąć wszystkie wcześniej
zaobserwowane failure'y, a phantom claim lub częściowa poprawa kończy się
odrzuceniem. ([README](https://github.com/korneliuszburian/mini-agi/blob/78a0f42853195fa2107b5531346d41594d309e2a/README.md), [loopcmd.rs](https://github.com/korneliuszburian/mini-agi/blob/78a0f42853195fa2107b5531346d41594d309e2a/crates/mini-agi-core/src/loopcmd.rs), [harness.rs](https://github.com/korneliuszburian/mini-agi/blob/78a0f42853195fa2107b5531346d41594d309e2a/crates/mini-agi-core/src/harness.rs))

Najciekawszy mechanizm to `codex --iterate N --blind-worker`: po porażce
deterministycznego verifiera świeży worker dostaje zwięzły failure register,
a próby są ograniczone budżetem i zapisane w łańcuchu. Eksperymenty EXP-012/
013 raportują na czterech klasach zadań przewagę verified-iteration nad plain
blind best-of-k (około 82,5–100% vs 25–50%, z niepokrywającymi się CI), po
wcześniejszych negatywnych kontrolach resamplingu. ([experiments](https://github.com/korneliuszburian/mini-agi/blob/78a0f42853195fa2107b5531346d41594d309e2a/docs/EXPERIMENTS.md), [verifiable-reward research](https://github.com/korneliuszburian/mini-agi/blob/78a0f42853195fa2107b5531346d41594d309e2a/docs/VERIFIABLE-REWARD-RESEARCH.md))

**Porównanie i non-proofs.** mini-agi owns the execution-and-verification
loop, podczas gdy MUZG/KRN owns governance or temporal selection. Jest
komplementarny do `unlazy` (deterministyczny verifier i kontrfaktyczny gate)
i bardziej wykonawczy niż Mattowe skillsy; nie rozwiązuje sam z siebie
temporalnej prawdziwości pamięci. Repo samo zaznacza częściowe kryteria
charteru: brak zmierzonego proofu, że overflow kontekstu nic nie gubi, oraz
niepełną walidację innych agentów. Wyniki EXP są wewnętrzne, zależne od klas
zadań, modelu i verifierów; historyczne trajektorie miały niepełne accounting
tokenów, a obecny checkout ma zmieniony checkpoint log. To dowodzi obiecującego
mechanizmu pod kontrolą konkretnych gate'ów, nie ogólnej przewagi produktu ani
causalnej wartości pamięci.

### mise-en-palace — DB-backed Memory Core i DecisionPacket loop

**Źródłowe fakty.** mise-en-palace jest najbliższym implementacyjnym
odpowiednikiem KRN: Codex wykonuje, a KRN wybiera aktualną, wspartą źródłami,
stale/rejected i falsifiable wiedzę oraz renderuje bounded `DecisionPacket`.
Przepływ obejmuje operator intent → task contract → rozpoznanie repozytorium i
aktywację temporalnej pamięci → filtrowanie authority → brief dla Codexa →
implementację → evidence → review/usefulness feedback → kandydatów do
governed promotion, demotion, rejection albo abstention. Beads owns task state,
dependencies, blockers i handoffy; runtime memory należy do store-backed DB,
nie do markdownu. ([AGENTS.md](https://github.com/korneliuszburian/mise-en-palace/blob/6be154e34beebd7b1f4cae71e8262d6dbe12296a6/AGENTS.md), [CONTEXT.md](https://github.com/korneliuszburian/mise-en-palace/blob/6be154e34beebd7b1f4cae71e8262d6dbe12296a6/CONTEXT.md), [roadmap](https://github.com/korneliuszburian/mise-en-palace/blob/6be154e34beebd7b1f4cae71e8262d6dbe12296a6/KRN_ROADMAP.md))

Paket jest związany z execution runem, checksumem, projektem, taskiem i
lifecycle revision. Store ma ścieżki źródeł, claims, task contracts, harness
plans, execution runs, memory candidates/records, issuances, evidence i
feedback; CLI wystawia także SQLite jako lokalny backend obok Postgresa.
Feedback usefulness jest przyjmowany tylko przy poprawnym packet bindingu,
idempotentnym replayu i jawnej persystencji. To daje realny readback loop,
którego nie ma w samym MUZG ani w mini-agi.

**Porównanie i non-proofs.** mise-en-palace jest praktycznym połączeniem
DecisionPacket, persistence, Beads i dogfoodingu: najbliżej docelowego KRN,
podczas gdy mini-agi centralizuje worker/verifier, a MUZG review/policy. Jego
roadmapa raportuje serię bounded paired-live trials (w tym wygrane, remisy i
różne sygnały kosztowe), a także dogfood, w którym feedback ujawnił błąd
selekcji i następny packet abstained. Jednocześnie repo explicite nazywa się
controlled internal alpha: brak dashboardu/API, szerokiego MCP, autonomicznego
daemonu, dużego ingestu, pełnego temporal consensus i szerokiego benchmarku;
nie ma też zewnętrznego proofu operator/product quality. ([roadmap](https://github.com/korneliuszburian/mise-en-palace/blob/6be154e34beebd7b1f4cae71e8262d6dbe12296a6/KRN_ROADMAP.md), [package scripts](https://github.com/korneliuszburian/mise-en-palace/blob/6be154e34beebd7b1f4cae71e8262d6dbe12296a6/packages/cli/package.json))

Obserwowany checkout jest aktywnie dirty: lokalne delty obejmują m.in.
SQLite lifecycle, packet diff, audit i Beads interactions. Nie są one
reproducible proofem dla pinned HEAD; stable citations powyżej dotyczą wyłącznie
commitowanej wersji. Wniosek dla KRN: przejąć model packet-bound usefulness i
DB readback, ale utrzymać alpha boundary oraz oddzielać proof harnessu od
proofu produktu.

## Deep synthesis: the missing evidence spine

Najważniejsza luka nie wygląda jak brak kolejnego workera ani kolejnej bazy.
Wygląda jak brak wspólnego, typowanego łańcucha tożsamości dowodu. Cztery
powierzchnie mają komplementarne odpowiedzialności:

| Powierzchnia | Odpowiedzialność | Granica władzy | Dane przekazywane dalej |
|---|---|---|---|
| **KRN skills** | Rozpoznać aktualną niepewność, dobrać ownera, doprecyzować task/spec, slice i falsifier. | Władza nad procedurą i kryteriami pracy; nie nad prawdziwością pamięci ani wynikiem workera. | Task contract, acceptance, context request, proof/review request. |
| **MUZG** | Admission, routing, immutable run plan, governance, review i handoff. | Władza nad tym, czy praca może przejść granicę procesu; nie nad samym wykonaniem ani promocją wiedzy. | `TaskEnvelope`, `ContextPacket`, `RoutingDecision`, `RunPlan`, `WorkEvent`, `RunReceipt`. |
| **mini-agi** | Uruchomić workera, zapisać próby, failure register i deterministyczny verifier. | Władza nad wynikiem konkretnego runu względem konkretnego `verify_target`; nie nad produkcyjną użytecznością ani pamięcią. | Attempt/run identity, artifacts, verifier result, failure chain. |
| **mise-en-palace** | Wydać bounded packet z temporal memory, przyjąć evidence i usefulness feedback, zarządzać promotion/demotion/rejection. | Władza nad aktualnością i statusem rekordu pamięci; nie nad tym, czy kod przeszedł test ani czy task jest opublikowany. | Packet identity/revision, evidence binding, feedback, memory candidate/record. |

Docelowy przepływ jest więc sekwencją, a nie wspólnym „mózgiem”: operator
intent → KRN task contract i request kontekstu → MUZG admission oraz immutable
`RunPlan` → worker/verifier mini-agi → evidence i terminalny `RunReceipt` →
MUZG review/handoff → mise-en-palace packet-bound feedback → governed memory
record, który może zasilić następny packet. To jest synteza z opisanych
kontraktów, nie twierdzenie, że te checkouty już realizują taki end-to-end
przepływ ([MUZG](https://github.com/korneliuszburian/muzg/blob/f99ae497565204f6ed48db38030d609d62c98e7a/AGENTS.md),
[mini-agi](https://github.com/korneliuszburian/mini-agi/blob/78a0f42853195fa2107b5531346d41594d309e2a/crates/mini-agi-core/src/harness.rs),
[mise-en-palace](https://github.com/korneliuszburian/mise-en-palace/blob/6be154e34beebd7b1f4cae71e8262d6dbe12296a6/CONTEXT.md)).

**Hipoteza syntezy, nie obecny fakt:** potrzebujemy małego `EvidenceSpine`
ABI, który wiąże `task_id + context_packet_id/revision → run_plan_id →
worker_run_id/attempt → evidence_digest + verifier_result → terminal_receipt →
feedback(packet_binding)`. Każdy adapter może przechowywać własne dane, ale
nie może wyemitować sukcesu do następnej warstwy bez tej identyfikacji. Retry
powinien zachować task i packet, a dostać nowy attempt; zmiana packetu powinna
unieważnić stary receipt dla celów feedbacku. To nie jest propozycja wspólnej
bazy ani centralnego routera: jest to przenośny envelope referencji, digestów i
statusów, który pozwala każdemu ownerowi powiedzieć „to jest dowód czego?”.

### Co musi pozostać osobne

- **Semantyka tasku i kontekst pamięci.** KRN/MUZG definiują, co ma zostać
  zrobione; mise-en-palace może dostarczyć kontekst, ale nie powinno dopisywać
  celu tasku przez samą selekcję wspomnień. Inaczej błędny rekord zmienia zakres
  pracy bez jawnej decyzji operatora.
- **Governance i wykonanie.** MUZG może odrzucić plan lub review, a mini-agi
  może pokazać, że verifier nie przeszedł. Worker nie może sam zatwierdzić
  własnego planu ani awansować artefaktu do pamięci.
- **Deterministyczny wynik i usefulness.** Zielony verifier mówi „ten target
  przeszedł”; nie mówi „ta wiedza będzie przydatna w następnym tasku”. To drugie
  należy do packet-bound feedbacku mise-en-palace i musi pozostać osobnym
  sygnałem.
- **Pamięć i publication.** Promocja rekordu w DB nie jest commitem, merge'em
  ani deployem. Pomieszanie tych przejść utrudni rollback i stworzy fałszywe
  poczucie, że trwała pamięć oznacza dostarczony produkt.

### Trzy alternatywy

| Alternatywa | Disposition | Dlaczego |
|---|---|---|
| Jeden wspólny runtime/DB dla wszystkich czterech powierzchni | **reject** | Skraca adaptery kosztem zlania authority, większego blast radius i braku niezależnego proofu. |
| Markdown/JSON i konwencje nazw bez obowiązkowego identity chain | **reject jako ABI** | Jest dobre dla ludzi i handoffów, ale pozwala połączyć evidence z niewłaściwym packetem albo retry. |
| Minimalny typed envelope + lokalne adaptery + terminal receipt | **lab-test** | Zachowuje ownership, daje punkt falsyfikacji i może działać przed wyborem wspólnego storage. |

### Jeden bounded experiment

**Setup.** W disposable fixture repo przygotować sześć identycznych trace'ów:
dwa poprawne sukcesy, dwa retry po porażce verifiera oraz dwa trace'y z celowo
zmienionym packet revision/digestem. Jeden deterministyczny worker i verifier,
jedna wersja task contractu oraz jeden sztuczny usefulness feedback. Uruchomić
control z obecnym tekstowym handoffem i treatment z `EvidenceSpine` envelope;
nie integrować produkcyjnych baz ani nie zmieniać żadnego z czterech repozytoriów.

**Acceptance criteria.** Wszystkie poprawne trace'y kończą się jednym receipt;
retry zachowuje task/packet, lecz ma nowy attempt; replay feedbacku jest
idempotentny. Oba złamane bindingi są odrzucone przed feedbackiem lub
promocją. Nie ma false acceptance, podwójnego feedbacku ani receiptu bez
verifier result. Treatment nie może zwiększyć rozmiaru przekazywanych danych o
więcej niż 20% ani dodać ręcznej decyzji na poprawnej ścieżce.

**Falsifiers i metryki.** Eksperyment obala hipotezę, jeśli choć jeden
niezgodny digest zostanie zaakceptowany, poprawny trace nie przejdzie replayu,
retry zgubi tożsamość albo adapter wymaga wspólnej bazy. Mierzyć: kompletność
łańcucha ID, odsetek wykrytych mismatchy, false acceptances, duplikaty,
interwencje człowieka, bytes/token overhead, czas od tasku do receiptu i czas do
następnego użytecznego packetu.

**Wynik bounded labu (2026-08-26).** Deterministyczne `6 traces × 2 arms`
potwierdziło seam, ale obnażyło też koszt pierwszego projektu. Control przyjął
6/6 receiptów, w tym oba celowo złamane bindingi, i nie potrafił potwierdzić
tożsamości retry (2 braki); replay zapisał 6 duplikatów. Compact typed treatment
przyjął 4/4 poprawnych trace'ów, odrzucił 2/2 mismatchy, zweryfikował 2/2 retry
z nowym attemptem i nie zapisał żadnego duplikatu feedbacku. Pierwszy verbose
envelope przekroczył budżet (+27.85%), więc został odrzucony w inner loopu;
wersjonowany compact wire shape zmniejszył payload z 2298 do 1938 bajtów
(-15.67%). Falsyfikatory są w
[`scripts/evidence-spine-lab.mjs`](../../scripts/evidence-spine-lab.mjs), a
regresja i deterministyczność w
[`scripts/evidence-spine-lab.test.mjs`](../../scripts/evidence-spine-lab.test.mjs).

**Decyzja po labie.** Adoptujemy wyłącznie test-only contract i compact wire
shape jako kandydacki publiczny seam. Produkcyjna integracja pozostaje
`lab-test`: najpierw adapter MUZG `RunPlan → attempt`, potem adapter
`RunReceipt → mise-en-palace feedback`, z mini-agi jako właścicielem verifiera.
Żaden adapter nie może awansować receipt bez packet/task bindingu, a promotion
do pamięci i publication pozostają osobnymi przejściami.

**Cleanup i non-proofs.** Po odczycie usunąć fixture, adaptery i transient run
artefacts; zachować wyłącznie wynik decyzji, jeśli będzie miał nazwanego
przyszłego consumera. Ten lab nie dowodzi jakości kodu, przewagi modelu,
usefulness pamięci na produkcji, bezpieczeństwa credentiali, skalowania,
interoperacyjności klientów ani causalnej wartości samego envelope.

### Stan implementacji po labie (2026-08-26)

Lab pozostał test-only, ale wszystkie cztery pierwsze pionowe slice'y mają już
izolowane seamy w swoich właścicielach:

- MUZG emituje `EvidenceSpineV1` z realnego, zweryfikowanego `RunPlan` i ma
  strict parser odrzucający duplicate keys;
- mini-agi niesie binding runu, wymaga raportu zgodnego z deklarowanym
  verifierem, rejestruje failed attempts i rozróżnia replay od reuse conflict;
- mise-en-palace przyjmuje plan source, terminalny receipt i exact evidence
  payload, wiąże je z issued `DecisionPacket` i buduje istniejący
  `CreateEvidenceFeedbackOnceInput` z deterministycznym capture identity;
- wszystkie trzy porty konsumują identyczny golden `p/a/q` fixture.

Świeże gate'y tych worktree'ów są zielone, w tym pełne testy MUZG i mise oraz
`scripts/verify.sh` mini-agi. To dowodzi kontraktów, odrzucania mismatchy i
kształtu wejścia do atomowego writera; nie dowodzi jeszcze realnego procesu
MUZG → mini-agi → mise, wykonania komendy przez sam adapter ani live DB race,
restartu i readbacku. Te granice pozostają S5.

### What is next

Następnym krokiem jest disposable S5: uruchomić proces/CLI trace od MUZG przez
mini-agi do mise, a następnie wykonać rzeczywisty packet-bound
`createEvidenceFeedbackOnce` z replayem, konfliktem i readbackiem. Dopiero
przejście tych falsyfikatorów uzasadniałoby promocję seam'u do produkcyjnego
`delivery-loop`.

### Integration slices after the lab

To jest plan spięcia, nie zgoda na równoległy refactor trzech checkoutów.
Wybrany kształt to vertical slices: każdy etap ma własny obserwowalny seam,
może zostać zreviewowany osobno i nie wymaga wspólnej bazy. MUZG jest
rekomendowanym właścicielem wersjonowanego wire contractu, bo kontroluje
admission, `RunPlan` i terminalny `RunReceipt`; KRN przechowuje decyzję i
fixture, mini-agi jest właścicielem attempt/verifiera, a mise-en-palace
feedbacku związanego z packetem. Jeśli S1 ujawni lepszy seam domenowy, zmiana
właściciela jest jawna i unieważnia kolejne slice'y.

| Slice | Caller → public seam → result | Blocks / blocked by | Fastest falsifier |
|---|---|---|---|
| S1 — `EvidenceSpineV1` vectors | MUZG `RunPlan` + context → versioned compact envelope → canonical parse/round-trip vectors | none; owns the contract decision for the remaining slices | mutate task, packet revision/digest, plan, attempt, verifier or evidence; any accepted invalid vector blocks the plan |
| S2 — MUZG admission adapter | accepted MUZG `RunPlan` → envelope emission → immutable task/packet/plan binding | blocked by S1; no mini-agi write required | missing binding or changed packet revision must be rejected before an attempt starts; replay of one plan is idempotent |
| S3 — mini-agi execution adapter | envelope → worker attempt + deterministic verifier → terminal `RunReceipt` | blocked by S1 and S2's emitted input shape | receipt without a passing verifier, reused attempt id, or retry that changes task/packet identity is rejected |
| S4 — mise feedback adapter | terminal receipt → packet-bound evidence/usefulness feedback → one idempotent DB write | blocked by S1 and S3; does not own verifier truth | stale packet digest/revision and replayed receipt must not create feedback or promotion duplicates |
| S5 — crash/replay integration fixture | S2 output → S3 process/CLI → S4 input → readback → complete trace | blocked by S2–S4; fixture remains disposable | kill/restart between each boundary, replay every message, and run the six lab scenarios; any lost chain or false acceptance stops production rollout |
| S6 — one real bounded dogfood slice | operator task → KRN/delivery-loop → MUZG → mini-agi → mise readback → governed publication decision | blocked by S5; delivery-loop coordinates lifecycle, never replaces owners | missing receipt, unbound feedback, extra human approval, or publication implied by memory promotion defers adoption |

The transport starts as an explicit versioned JSON artifact/CLI boundary, with
local persistence in each owner. No shared database, daemon, scheduler, or
automatic memory promotion belongs in S1–S5. S6 is the first point at which a
real product change may be considered; it still requires separate authority
for commit, push, merge, deployment and memory promotion. Ticket publication is
`NOT_REQUESTED` until an outcome owner names a tracker and grants publication
authority. The implementation owner for S5 is the delivery-loop integrator
across the three isolated target worktrees; `codebase-design` remains the
resolver if a real `RunPlan`/`RunReceipt`/feedback seam does not line up.
Publication and database authority remain separate transitions.

## Reading list

- [OpenAI — Harness engineering](https://openai.com/index/harness-engineering/) — opublikowano 2026-02-11; odczyt 2026-08-26.
- [OpenAI — Codex App Server](https://openai.com/index/unlocking-the-codex-harness/) — opublikowano 2026-02-04; odczyt 2026-08-26.
- [OpenAI — Symphony](https://openai.com/index/open-source-codex-orchestration-symphony/) — opublikowano 2026-04-27; [repo/spec at `8001b52`](https://github.com/openai/symphony/tree/8001b52e3062495a16e520e4ceaf8f9de868c4d0).
- [Anthropic — Effective harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — 2025-11-26; [design](https://www.anthropic.com/engineering/harness-design-long-running-apps) — 2026-03-24; [Managed Agents](https://www.anthropic.com/engineering/managed-agents) — 2026-04-08.
- [Matt Pocock — skills at `6654f6b`](https://github.com/mattpocock/skills/tree/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76).
- [unlazy at `da0b00a`](https://github.com/Leonxlnx/unlazy/tree/da0b00a3a6b706b471797cd4ef579ae1001ff6d7).
- [ponytail at `2ed6c52`](https://github.com/DietrichGebert/ponytail/tree/2ed6c52c9d7e5e56942508591085fd45dea277d3); its [agentic benchmark](https://github.com/DietrichGebert/ponytail/blob/2ed6c52c9d7e5e56942508591085fd45dea277d3/benchmarks/results/2026-06-18-agentic.md).
- [MUZG at `f99ae49`](https://github.com/korneliuszburian/muzg/tree/f99ae497565204f6ed48db38030d609d62c98e7a) — CANON Kernel + FCDH harness.
- [mini-agi at `78a0f42`](https://github.com/korneliuszburian/mini-agi/tree/78a0f42853195fa2107b5531346d41594d309e2a) — executor loop, verifier and experiments.
- [mise-en-palace at `6be154e`](https://github.com/korneliuszburian/mise-en-palace/tree/6be154e34beebd7b1f4cae71e8262d6dbe12296a) — DB-backed Memory Core and DecisionPacket loop.
