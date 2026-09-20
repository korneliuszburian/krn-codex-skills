export function stalenessExit({ marker, current }) {
  if (marker !== current) {
    process.stderr.write("warning: stale marker
");
  }
  return 0;
}
