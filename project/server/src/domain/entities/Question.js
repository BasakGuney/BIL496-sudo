export class Question {
  constructor({ id, text }) {
    this.id = id;
    this.text = String(text || "");
  }
}
