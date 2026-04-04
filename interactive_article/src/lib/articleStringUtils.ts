export function stripWhitespaceAndPunctuation(str: string): string {
  return str.toLowerCase().replace(/[^\w\s'.!?]|_/g, '').replace(/\s+/g, ' ').trim();
}
