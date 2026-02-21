export class Question {
  constructor({ id, text, allocatedTimeSec = 120 }) {
    this.id = id;
    this.text = text;
    this.allocatedTimeSec = allocatedTimeSec;
  }
}
