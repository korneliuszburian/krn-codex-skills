export function contractBudgetErrors({ label, text, maxLineChars, maxWords }) {
  const errors = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (line.length > maxLineChars) {
      errors.push(`${label}:${index + 1} has ${line.length} characters; the cap is ${maxLineChars}`);
    }
  });
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > maxWords) {
    errors.push(`${label} has ${words} words; the cap is ${maxWords}`);
  }
  return errors;
}
