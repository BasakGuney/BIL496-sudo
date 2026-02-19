export class RealtimeOfferRequest {
  constructor(payload = {}) {
    this.offerSdp = payload.offerSdp || "";
  }
}
