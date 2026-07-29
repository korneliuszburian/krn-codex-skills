# Claude Research Campaign

Use this for source investigation that must cover more than one bounded excerpt.
Complete the entrypoint's artifact-directory step first and store the manifest
as `/absolute/printed/pass-dir/campaign.json`. Run every shard from the root of
the clean repository named by its `repository` source. The runner verifies the
campaign parent against `pass-context.json`; an arbitrary private directory is
not a research pass.

## Campaign manifest

Use schema version `1`. IDs use lowercase letters, digits, and single hyphens.
Every source has explicit provenance: a full Git commit for the current
repository, a SHA-256 for a local artifact such as a transcript, or a declared
source version, commit, video ID, or retrieval date for an HTTPS URL. Repository
and artifact revisions are mechanically checked; URL provenance is recorded but
does not freeze remote bytes. `required: true` means the result must mark the
source `used` or `unavailable`, never silently omit it. Put a local artifact in
its own bounded source directory; the runner rejects filesystem root, home,
shared temp root, agent configuration, secret-shaped files, and symlinks rather
than granting a broad `--add-dir`.

```json
{
  "campaign_version": "1",
  "campaign_id": "skill-system-research",
  "objective": "Derive evidence-backed skill mechanisms from the named corpus.",
  "sources": [
    {
      "id": "current-repository",
      "kind": "repository",
      "locator": ".",
      "revision": "FULL_COMMIT_OID",
      "authority": "local",
      "purpose": "Compare external mechanisms with the current implementation.",
      "required": true
    },
    {
      "id": "practitioner-repository",
      "kind": "url",
      "locator": "https://github.com/example/skills/tree/FULL_COMMIT_OID",
      "revision": "FULL_COMMIT_OID",
      "authority": "practitioner",
      "purpose": "Derive reusable skill-authoring mechanisms.",
      "required": true
    },
    {
      "id": "video-transcript",
      "kind": "artifact",
      "locator": "/absolute/bounded/transcript.txt",
      "revision": "LOWERCASE_SHA256",
      "authority": "practitioner",
      "purpose": "Derive the workflow demonstrated in the video.",
      "required": true
    }
  ],
  "shards": [
    {
      "id": "repository-structure",
      "kind": "research",
      "objective": "Inventory the practitioner repository and derive its structural mechanisms.",
      "source_ids": ["current-repository", "practitioner-repository"],
      "depends_on": [],
      "deliverable": "Complete repository coverage and mechanism ledger."
    },
    {
      "id": "video-mechanisms",
      "kind": "research",
      "objective": "Derive mechanisms and caveats from the fixed transcript.",
      "source_ids": ["video-transcript"],
      "depends_on": [],
      "deliverable": "Transcript mechanism ledger with gaps."
    },
    {
      "id": "synthesis",
      "kind": "synthesis",
      "objective": "Reconcile the validated ledgers into one decision-ready comparison.",
      "source_ids": [
        "current-repository",
        "practitioner-repository",
        "video-transcript"
      ],
      "depends_on": ["repository-structure", "video-mechanisms"],
      "deliverable": "Cross-source comparisons, contradictions, falsifiers, and non-proof."
    }
  ],
  "human_decisions": ["Product and irreversible trade-offs remain local."],
  "does_not_prove": ["Source coverage does not prove factual or product correctness."]
}
```

Validate before spending model budget:

```bash
node ~/.agents/skills/second-opinion-review/scripts/research-campaign.mjs \
  validate /absolute/printed/pass-dir/campaign.json
```

## Launch

Run independent `research` shards separately; they may execute concurrently
because each writes its own job and result. Run a `synthesis` shard only after
all named dependencies have validated results:

```bash
node ~/.agents/skills/second-opinion-review/scripts/run-research.mjs \
  /absolute/printed/pass-dir/campaign.json repository-structure

node ~/.agents/skills/second-opinion-review/scripts/run-research.mjs \
  /absolute/printed/pass-dir/campaign.json synthesis
```

Research shards allow only `Read`, `Glob`, `Grep`, and `WebFetch`. Synthesis
runs from the private pass directory with only `Read`, consuming validated
dependency results rather than reopening the repository, artifacts, or web.
Both use `dontAsk`, safe mode, no session persistence, and structured output. The runner refuses
a dirty repository, stale repository commit, changed artifact hash, missing
synthesis dependency, repeated job path, or existing result. It defaults to
`opus`, effort `max`, 30 minutes, and USD 8. Override bounded runs with
`SECOND_OPINION_MODEL`, `SECOND_OPINION_RESEARCH_EFFORT`,
`SECOND_OPINION_RESEARCH_TIMEOUT_SECONDS`, or
`SECOND_OPINION_RESEARCH_MAX_BUDGET_USD`. Use `unlimited` budget only with
explicit operator authority.

Each pass creates:

- `jobs/<shard-id>.job.json` — running, complete, or failed transport state;
- `results/<shard-id>.research.json` — only an atomically published, validated
  result bound to the campaign hash, clean repository commit/tree, and local
  artifact hashes.

Revalidate freshness before using a result. This fails if the campaign,
repository, artifact, dependency result, or structured output has changed:

```bash
node ~/.agents/skills/second-opinion-review/scripts/run-research.mjs \
  check /absolute/printed/pass-dir/campaign.json synthesis
```

For a very large corpus, split by independent source family or coverage unit.
Do not create arbitrary token-sized shards: every shard needs an observable
coverage boundary. The synthesis reads only validated dependency results; it
does not replace missing source work with inference.

## Local disposition

Treat mechanisms and recommendations as hypotheses. Verify evidence claims
against current code or authoritative sources, then write `disposition.md` in
the pass directory with supported, contradicted, missing-evidence, follow-up,
and human-decision items. Hand the validated ledger and disposition to
`$source-to-decision`; only that workflow records `adopt`, `reject`, `lab-test`,
or `defer` for the local consumer. Retain the manifest, terminal job files,
validated results, bounded provenance, and disposition. Do not retain
downloaded source corpora, Claude transport envelopes, caches, or raw
copyrighted transcripts.
