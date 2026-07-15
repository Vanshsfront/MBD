const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
] as const;

export function amountInWordsInr(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  const rupeeWords = numberToIndianWords(rupees) || "Zero";
  if (paise > 0) {
    return `Rupees ${rupeeWords} and Paise ${numberToIndianWords(paise)} Only`;
  }
  return `Rupees ${rupeeWords} Only`;
}

function numberToIndianWords(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n] ?? "";
  if (n < 100) {
    return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
  }
  if (n < 1000) {
    return [ONES[Math.floor(n / 100)], "Hundred", numberToIndianWords(n % 100)]
      .filter(Boolean)
      .join(" ");
  }

  const parts: Array<[number, string]> = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ];
  for (const [value, label] of parts) {
    if (n >= value) {
      return [
        numberToIndianWords(Math.floor(n / value)),
        label,
        numberToIndianWords(n % value),
      ]
        .filter(Boolean)
        .join(" ");
    }
  }
  return "";
}
