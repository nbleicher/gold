/** Mirrors apps/api/src/domain/tiers.ts for client-side tier preview. */
export function seqFromIndex(idx) {
    let n = idx;
    let out = "";
    while (n >= 0) {
        out = String.fromCharCode(65 + (n % 26)) + out;
        n = Math.floor(n / 26) - 1;
    }
    return out || "A";
}
export function getTierIndex(weightGrams) {
    const tiers = [
        [0, 0.1],
        [0.1, 0.2],
        [0.2, 0.3],
        [0.3, 0.4],
        [0.4, 0.5],
        [0.5, 0.6],
        [0.6, 0.7],
        [0.7, 0.8],
        [0.8, 0.9],
        [0.9, 1.0],
        [1.0, 1.5],
        [1.5, 2.001]
    ];
    for (let i = 0; i < tiers.length; i++) {
        const [min, max] = tiers[i];
        if (weightGrams >= min && weightGrams < max)
            return i + 1;
    }
    if (weightGrams >= 2.001)
        return tiers.length + 1;
    return null;
}
