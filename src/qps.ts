class QPSMeter {
  nreqs: Uint32Array;
  tprev = 0;

  constructor(private wsize = 3600) {
    this.nreqs = new Uint32Array(this.wsize);
  }

  add(delta = 1, stime = Date.now() / 1000 | 0) {
    let index = stime % this.wsize;

    if (this.tprev) {
      let n = stime - this.tprev;
      for (let i = 0; i < n && i < this.wsize; i++)
        this.nreqs[(index - i) % this.wsize] = 0;
    }

    this.nreqs[index] += delta;
    this.tprev = stime;
  }

  get json(): [number, number[]] {
    return [this.tprev, [...this.nreqs]];
  }
}

export const counters = new Map<string, QPSMeter>();

export function register(name: string): QPSMeter {
  if (counters.get(name))
    return counters.get(name);

  let counter = new QPSMeter;
  counters.set(name, counter);
  return counter;
}
