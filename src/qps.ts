class QPSMeter {
  nreqs: Uint32Array;
  tprev = 0;

  constructor(private wsize = 3600) {
    this.nreqs = new Uint32Array(this.wsize);
  }

  send(stime = Date.now() / 1000 | 0) {
    let index = stime % this.wsize;

    if (this.tprev) {
      let n = stime - this.tprev;
      for (let i = 0; i < n && i < this.wsize; i++)
        this.nreqs[(index - i) % this.wsize] = 0;
    }

    this.nreqs[index]++;
    this.tprev = stime;
  }

  get json(): [number, number[]] {
    return [this.tprev, [...this.nreqs]];
  }
}

export default QPSMeter;

export const http = new QPSMeter;
export const cget = new QPSMeter;
export const cadd = new QPSMeter;
export const nget = new QPSMeter;
