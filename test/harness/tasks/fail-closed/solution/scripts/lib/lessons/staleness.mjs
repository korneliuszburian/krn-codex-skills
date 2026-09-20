export function stalenessExit({ marker, current }) {
  return marker === current ? 0 : 1;
}
