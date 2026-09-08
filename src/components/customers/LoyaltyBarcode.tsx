import { useMemo } from "react";

const L: Record<string, string> = {"0":"0001101","1":"0011001","2":"0010011","3":"0111101","4":"0100011","5":"0110001","6":"0101111","7":"0111011","8":"0110111","9":"0001011"};
const G: Record<string, string> = {"0":"0100111","1":"0110011","2":"0011011","3":"0100001","4":"0011101","5":"0111001","6":"0000101","7":"0010001","8":"0001001","9":"0010111"};
const R: Record<string, string> = {"0":"1110010","1":"1100110","2":"1101100","3":"1000010","4":"1011100","5":"1001110","6":"1010000","7":"1000100","8":"1001000","9":"1110100"};
const PARITY: Record<string, string> = {"0":"LLLLLL","1":"LLGLGG","2":"LLGGLG","3":"LLGGGL","4":"LGLLGG","5":"LGGLLG","6":"LGGGLL","7":"LGLGLG","8":"LGLGGL","9":"LGGLGL"};

function bitsFor(value: string) {
  if (!/^\d{13}$/.test(value)) return null;
  let bits = "101";
  const parity = PARITY[value[0]];
  for (let i = 1; i <= 6; i += 1) bits += parity[i - 1] === "G" ? G[value[i]] : L[value[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i += 1) bits += R[value[i]];
  return `${bits}101`;
}

export default function LoyaltyBarcode({ value }: { value: string }) {
  const bits = useMemo(() => bitsFor(value), [value]);
  if (!bits) return <div className="text-sm text-muted-foreground">باركود غير صالح</div>;
  const moduleWidth = 2;
  const quiet = 10;
  const width = (bits.length + quiet * 2) * moduleWidth;
  return (
    <svg viewBox={`0 0 ${width} 84`} className="w-full max-w-md" role="img" aria-label={`باركود العميل ${value}`} dir="ltr">
      <rect width={width} height="84" fill="white" />
      {bits.split("").map((bit, index) => bit === "1" ? <rect key={index} x={(index + quiet) * moduleWidth} y="4" width={moduleWidth} height="64" fill="black" /> : null)}
      <text x={width / 2} y="80" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="black" letterSpacing="2">{value}</text>
    </svg>
  );
}
