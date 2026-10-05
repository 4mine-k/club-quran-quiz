// grading.js — Arabic text normalization + fair grading of open answers

// Remove Arabic diacritics (tashkeel) and tatweel
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED\u0640]/g;

// Convert Arabic-Indic digits to Latin digits
function arabicDigitsToLatin(str) {
  const map = {
    "\u0660": "0", "\u0661": "1", "\u0662": "2", "\u0663": "3", "\u0664": "4",
    "\u0665": "5", "\u0666": "6", "\u0667": "7", "\u0668": "8", "\u0669": "9",
  };
  return str.replace(/[\u0660-\u0669]/g, (d) => map[d]);
}

function normalizeArabic(input) {
  if (input == null) return "";
  let s = String(input).trim();
  s = arabicDigitsToLatin(s);
  s = s.replace(DIACRITICS, "");
  // Normalize alef variants -> ا
  s = s.replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627");
  // Normalize alef maqsura -> ya
  s = s.replace(/\u0649/g, "\u064A");
  // Normalize ta marbuta -> ha
  s = s.replace(/\u0629/g, "\u0647");
  // Remove hamza on its own and waw/ya hamza seats -> keep base
  s = s.replace(/\u0624/g, "\u0648").replace(/\u0626/g, "\u064A").replace(/\u0621/g, "");
  // Remove the definite article "ال" at word starts to be lenient
  s = s.replace(/\bال/g, "");
  // Collapse whitespace and remove punctuation
  s = s.replace(/[^\u0600-\u06FF0-9a-zA-Z\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// Grade an open-ended answer: true if the normalized user answer matches
// any accepted variant (exact normalized match or contains it).
function gradeOpen(userAnswer, acceptedList) {
  const u = normalizeArabic(userAnswer);
  if (!u) return false;
  for (const acc of acceptedList) {
    const a = normalizeArabic(acc);
    if (!a) continue;
    if (u === a) return true;
    // lenient: user answer contains the accepted key word(s)
    if (u.includes(a) || a.includes(u)) return true;
  }
  return false;
}

module.exports = { normalizeArabic, gradeOpen };
