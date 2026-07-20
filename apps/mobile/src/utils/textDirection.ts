export type TextDirection = 'rtl' | 'ltr';
const hebrew = /[\u0590-\u05ff]/g;
const latin = /[A-Za-z]/g;
export function getTextDirection(text: string): TextDirection {
  const firstHebrew = text.search(hebrew);
  const firstLatin = text.search(latin);
  if (firstHebrew < 0) return 'ltr';
  if (firstLatin < 0) return 'rtl';
  return firstHebrew < firstLatin ? 'rtl' : 'ltr';
}
