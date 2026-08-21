# Evidence-lab A/B protocol capsule

Frozen target: `0d77ac18945658d4fbc8e279575b9bb2e3c6b31e`

Owner: `source-to-decision`

Consumer: `maintainer/eval loop`

Question: does an explicit fast/slow gate plus an `evidence-lab.md` reference
improve slow-path routing and decision quality without regressing fast routing,
hard-negative abstention, composition, or cost?

The comparison used 12 prompts and two arms: the existing skill baseline and
one treatment differing only in `source-to-decision/SKILL.md` and its linked
`references/evidence-lab.md`. Categories were three fast positives, three slow
positives, four hard negatives, one composed slow positive, and one composed
ordinary positive.

Adopt required a repeatable slow-path gain with no material fast,
hard-negative, composed-routing, or cost regression. A mechanism that helped
but gated too broadly or narrowly would be revised. No repeatable advantage or
any material regression required rejection.

Snapshot identities:

- common state: `0517c8d26e4cb4a0040e29f70808af68efb2609ef59ac0c67e42bfb54632d0fe`;
- causal patch: `25e48dda5e49d45ece2710ec852c6c2e18ccd0db24ce12476e6a6831384942a6`;
- baseline skill: `59f4593f1a87d693e00181eb5137aefb233c667a6b4fc2a805cd43e2d203a205`;
- treatment skill: `4a83e984dc43394d981d0b65cecde5a635bfb898baf90de3eea5b8ee80d7c643`;
- treatment reference: `c5132bf45af96b2c080aca9beff472bf7cbff9a3e81abab4d386a0e1147721d3`;
- trigger apparatus: `ea1a747d8962961cb783b382ddb592a7c2d14704927ccfa098e6a1e50005a913`.

This capsule was imported after completion. It summarizes the frozen protocol;
it is not the original preregistration artifact.
