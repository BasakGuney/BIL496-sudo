import { CreateSessionRequest } from "../../dto/requests/CreateSessionRequest.js";
import { SdpAnswerView } from "../../dto/responses/views/SdpAnswerView.js";

export class RealtimeController {
  constructor({ backendOrchestrator }) {
    this.backendOrchestrator = backendOrchestrator;
    this.createOfferAnswer = this.createOfferAnswer.bind(this);
  }

  async createOfferAnswer(req, res, next) {
    try {
      const request = CreateSessionRequest.fromExpress(req);
      const session = await this.backendOrchestrator.createSession(
        {
          firstName: request.firstName,
          lastName: request.lastName,
          gender: request.gender,
          interviewType: request.interviewType,
          role: request.role,
          domain: request.domain,
          companyOrIndustry: request.companyOrIndustry,
          difficulty: request.difficulty,
          mode: request.mode,
          cvFile: request.cvFile,
        },
        request.offerSdp,
        request.sessionId
      );

      const sdp = SdpAnswerView.fromSession(session);
      res.type("application/sdp").send(sdp.answerSdp);
    } catch (error) {
      next(error);
    }
  }
}
