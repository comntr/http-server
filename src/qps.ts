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

class QPSMeter {
  values: AggVal[] = [];
  tprev = 0;

  constructor(agg = 'sum', private wsize = 3600) {
    let AV = aggregators[agg];
    if (!AV) throw new Error('Unknown aggregator: ' + agg);
    this.values = new Array(wsize);
    for (let i = 0; i < wsize; i++)
      this.values[i] = new AV;
  }

  add(delta = 1, stime = Date.now() / 1000 | 0) {
    let index = stime % this.wsize;

    if (this.tprev) {
      let n = stime - this.tprev;
      for (let i = 0; i < n && i < this.wsize; i++) {
        let vi = (index - i) % this.wsize;
        if (vi < 0) vi += this.wsize;
        this.values[vi].reset();
      }
    }

    this.values[index].push(delta);
    this.tprev = stime;
  }

  get json(): [number, number[]] {
    let values = this.values.map(av => av.value());
    return [this.tprev, values];
  }
}

export const aggregators = {
  sum: SumAgg,
  avg: AvgAgg,
};

export const counters = new Map<string, QPSMeter>();

export function register(name: string, agg = 'sum'): QPSMeter {
  if (counters.get(name))
    return counters.get(name);

  let counter = new QPSMeter(agg);
  counters.set(name, counter);
  return counter;
}
