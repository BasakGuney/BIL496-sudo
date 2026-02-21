export class EvidenceItemView {
  static fromEvidenceItem(item) {
    return {
      ref: item?.ref || "",
      claim: item?.claim || "",
      timestampSec: Number(item?.timestampSec || 0),
    };
  }
}
