export const MAX_ROLLOUT_RECORD_BYTES = 16 * 1_024 * 1_024;

const CANDIDATE_RECORD_TYPES = [
  "function_call",
  "function_call_output",
  "custom_tool_call",
  "custom_tool_call_output",
].map((value) => Buffer.from(value));
const CANDIDATE_MARKER_OVERLAP = Math.max(...CANDIDATE_RECORD_TYPES.map((value) => value.length)) - 1;

export function isCandidateRecordLine(line) {
  return (
    line.indexOf(CANDIDATE_RECORD_TYPES[0]) !== -1 ||
    line.indexOf(CANDIDATE_RECORD_TYPES[1]) !== -1 ||
    line.indexOf(CANDIDATE_RECORD_TYPES[2]) !== -1 ||
    line.indexOf(CANDIDATE_RECORD_TYPES[3]) !== -1
  );
}

export async function consumeLines(stream, onLine, onChunk, onOversized) {
  let fragments = [];
  let fragmentBytes = 0;
  let oversized = false;
  let oversizedCandidate = false;
  let candidateTail = Buffer.alloc(0);

  const scanOversizedPiece = (piece) => {
    if (oversizedCandidate || piece.length === 0) return;
    const window = candidateTail.length === 0 ? piece : Buffer.concat([candidateTail, piece]);
    oversizedCandidate = isCandidateRecordLine(window);
    if (!oversizedCandidate) {
      candidateTail = Buffer.from(window.subarray(Math.max(0, window.length - CANDIDATE_MARKER_OVERLAP)));
    }
  };
  const append = (piece) => {
    if (piece.length === 0) return;
    if (oversized) {
      scanOversizedPiece(piece);
      return;
    }
    if (fragmentBytes + piece.length > MAX_ROLLOUT_RECORD_BYTES) {
      oversized = true;
      for (const fragment of fragments) scanOversizedPiece(fragment);
      scanOversizedPiece(piece);
      fragments = [];
      fragmentBytes = 0;
      return;
    }
    fragments.push(piece);
    fragmentBytes += piece.length;
  };
  const reset = () => {
    fragments = [];
    fragmentBytes = 0;
    oversized = false;
    oversizedCandidate = false;
    candidateTail = Buffer.alloc(0);
  };
  const emit = (piece) => {
    append(piece);
    if (oversized) {
      onOversized(oversizedCandidate);
      reset();
      return;
    }
    let line = fragments.length === 0
      ? Buffer.alloc(0)
      : fragments.length === 1
        ? fragments[0]
        : Buffer.concat(fragments, fragmentBytes);
    if (line[line.length - 1] === 13) line = line.subarray(0, line.length - 1);
    onLine(line);
    reset();
  };

  for await (const chunk of stream) {
    onChunk(chunk.length);
    let start = 0;
    let newline = chunk.indexOf(10, start);
    while (newline !== -1) {
      emit(chunk.subarray(start, newline));
      start = newline + 1;
      newline = chunk.indexOf(10, start);
    }
    if (start < chunk.length) {
      append(chunk.subarray(start));
    }
  }

  if (fragments.length > 0 || oversized) emit(Buffer.alloc(0));
}
