export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '\u2014';
  }
  return `\u20B9${value.toLocaleString('en-IN')}`;
}

export function computeContributionDiff(
  excelVal: number | null,
  challanVal: number | null
): number | null {
  if (excelVal === null || challanVal === null) {
    return null;
  }
  return excelVal - challanVal;
}

export function formatDiffINR(
  excelVal: number | null,
  challanVal: number | null
): { text: string; isBlankOrMissing: boolean; hasVariance: boolean } {
  if (excelVal === null && challanVal === null) {
    return { text: '\u2014', isBlankOrMissing: true, hasVariance: false };
  }
  if (excelVal === null) {
    return { text: 'Blank Excel', isBlankOrMissing: true, hasVariance: true };
  }
  if (challanVal === null) {
    return { text: '\u2014', isBlankOrMissing: true, hasVariance: false };
  }
  const diff = excelVal - challanVal;
  if (diff === 0) {
    return { text: `\u20B90`, isBlankOrMissing: false, hasVariance: false };
  }
  const absFormatted = Math.abs(diff).toLocaleString('en-IN');
  return {
    text: diff > 0 ? `+\u20B9${absFormatted}` : `-\u20B9${absFormatted}`,
    isBlankOrMissing: false,
    hasVariance: true,
  };
}