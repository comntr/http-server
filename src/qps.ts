const PREC = 100;

interface AggVal {
  push(value: number): void;
  reset(): void;
  value(): number;
}

class SumAgg implements AggVal {
  private sum = 0;

  push(value) {
    this.sum += value;
  }

  reset() {
    this.sum = 0;
  }

  value() {
    return this.sum;
  }
}

class AvgAgg implements AggVal {
  private sum = 0;
  private num = 0;

  push(value) {
    this.sum += value;
    this.num += 1;
  }

  reset() {
    this.sum = 0;
    this.num = 0;
  }

  value() {
    return this.sum / this.num | 0;
  }
}

class QpsAgg implements AggVal {
  private sum = 0;

  push(value) {
    this.sum += value;
  }

  reset() {
    this.sum = 0;
  }

  value() {
    return this.sum / 60;
  }
}

class QPSMeter {
  valpm: AggVal[] = [];
  tprev = 0;

  constructor(agg = 'sum', private wsize = 24 * 60) {
    let AV = aggregators[agg];
    if (!AV) throw new Error('Unknown aggregator: ' + agg);
    this.valpm = new Array(wsize);
    for (let i = 0; i < wsize; i++)
      this.valpm[i] = new AV;
  }

  add(delta = 1, stime = Date.now() / 1000 / 60 | 0) {
    let index = stime % this.wsize;

    if (this.tprev) {
      let n = stime - this.tprev;
      for (let i = 0; i < n && i < this.wsize; i++) {
        let vi = (index - i) % this.wsize;
        if (vi < 0) vi += this.wsize;
        this.valpm[vi].reset();
      }
    }

    this.valpm[index].push(delta);
    this.tprev = stime;
  }

  get json(): [number, number[]] {
    let values = this.valpm
      .map(av => (PREC * av.value() | 0) / PREC);
    return [this.tprev, values];
  }
}

export const aggregators = {
  sum: SumAgg,
  avg: AvgAgg,
  qps: QpsAgg,
};

export const counters = new Map<string, QPSMeter>();

export function register(name: string, agg: string): QPSMeter {
  if (counters.get(name))
    return counters.get(name);

  let counter = new QPSMeter(agg);
  counters.set(name, counter);
  return counter;
}
