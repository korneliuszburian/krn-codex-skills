# prototype

Build one throwaway prototype to answer a single design question that resists paper.

## Use

When a design question needs a runnable answer before committing — whether a state
model or logic feels right (a tiny terminal app driven by hand) or what a UI should
look like (several radically different variants on one route, switched from a floating
bar). It produces the cheapest artifact that settles the question, then is thrown away.

## Boundary

It is throwaway from day one and never a production build. `$implement` owns the real
build, `$diagnosing-bugs` owns broken things, and `$code-review` owns review. The
validated decision folds into real code under `implement`; the prototype itself is
committed to a throwaway branch as a primary source, never shipped.

## Inputs

One design question, and the surrounding code that decides the branch (backend module
→ logic terminal app; page or component → UI variants).

## Output

A runnable prototype behind one command, a recorded verdict (the answer and the
question it settled), and the validated decision folded into real code — with the full
prototype preserved on a throwaway branch for reference.

## Composition

Used by `$wayfinder` prototype tickets and feeds `$to-spec` as decision evidence; the
winning decision is rebuilt under `$implement`.
