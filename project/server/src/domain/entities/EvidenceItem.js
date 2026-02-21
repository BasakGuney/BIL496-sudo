export class EvidenceItem {
  constructor({ ref, claim, timestampSec }) {
    this.ref = String(ref || "");
    this.claim = String(claim || "");
    this.timestampSec = Number(timestampSec || 0);
  }
}
