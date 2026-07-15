# Behavior Proof

Choose the smallest independent observer that can disagree with the production
change. More assertions are not more proof when they observe the same contract.

## Choose The Seam

Prefer the highest stable interface that exposes the acceptance requirement:

1. user-visible command, page, or API;
2. domain module interface;
3. parser, repository, migration, or authority boundary;
4. transport adapter only when transport behavior is the requirement.

Do not add a production seam only to make internals mockable.

## A Valuable Falsifier

- drives a real public path;
- receives its expected result from acceptance, a worked example, or another
  independent authority;
- fails for the intended reason before the fix when proving a bug;
- survives internal refactoring;
- distinguishes the changed risk from a nearby generic failure.

## Proof Theater

- collaborator call-order and private-method tests;
- snapshots when one field proves the behavior;
- expected values recomputed with the production algorithm;
- file counts, export lists, command lists, prose, or folder topology;
- many malformed variants when the consumer has one `invalid` state;
- tests added only because code moved or a name changed.

Mock true external variability: network, time, randomness, process exit,
filesystem, or a database when a real test database is not the seam. Exercise
owned modules through their public interface.

Record the red command when red was required, the green command, and what the
result does not prove.
