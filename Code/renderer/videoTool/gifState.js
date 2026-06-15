let _segId = 0;

const SEGMENT_COLORS = [
  '#4fc3f7', '#66bb6a', '#ffa726', '#ab47bc', '#ef5350',
  '#26c6da', '#9ccc65', '#ff7043', '#7e57c2', '#ec407a',
];

export default class GifState {
  constructor() {
    this.inputPath    = null;
    this.inputMeta    = null;
    this.outputFolder = null;
    this.suggestions  = [];
    this.segments     = [];
    this.selectedSegmentId = null;
    this.preset       = 'balanced';
    this.status       = 'idle';
    this.progress     = null;
    this.result       = null;
    this.error        = null;
    this._currentTime = 0;
  }

  get currentTime() { return this._currentTime; }
  set currentTime(t) { this._currentTime = t; }

  get selectedSegment() {
    return this.segments.find(s => s.id === this.selectedSegmentId) || null;
  }

  reset() {
    this.inputPath    = null;
    this.inputMeta    = null;
    this.outputFolder = null;
    this.suggestions  = [];
    this.segments     = [];
    this.selectedSegmentId = null;
    this.preset       = 'balanced';
    this.status       = 'idle';
    this.progress     = null;
    this.result       = null;
    this.error        = null;
    this._currentTime = 0;
  }

  addSegment(startTime, endTime, speed) {
    const seg = {
      id: 'seg-' + (++_segId),
      startTime: Math.round(startTime * 10) / 10,
      endTime: Math.round(endTime * 10) / 10,
      speed: speed || 1,
    };
    this.segments.push(seg);
    this.selectedSegmentId = seg.id;
    return seg;
  }

  removeSegment(id) {
    this.segments = this.segments.filter(s => s.id !== id);
    if (this.selectedSegmentId === id) {
      this.selectedSegmentId = this.segments.length > 0 ? this.segments[this.segments.length - 1].id : null;
    }
  }

  updateSegment(id, props) {
    const seg = this.segments.find(s => s.id === id);
    if (!seg) return;
    if (props.startTime !== undefined) seg.startTime = Math.round(parseFloat(props.startTime) * 10) / 10;
    if (props.endTime !== undefined) seg.endTime = Math.round(parseFloat(props.endTime) * 10) / 10;
    if (props.speed !== undefined) seg.speed = parseFloat(props.speed);
  }

  splitSegment(id, splitTime) {
    const seg = this.segments.find(s => s.id === id);
    if (!seg) return null;
    if (splitTime <= seg.startTime || splitTime >= seg.endTime) return null;
    const newSeg = {
      id: 'seg-' + (++_segId),
      startTime: Math.round(splitTime * 10) / 10,
      endTime: seg.endTime,
      speed: seg.speed,
    };
    seg.endTime = Math.round(splitTime * 10) / 10;
    const idx = this.segments.indexOf(seg);
    this.segments.splice(idx + 1, 0, newSeg);
    this.selectedSegmentId = newSeg.id;
    return newSeg;
  }

  get totalDuration() {
    return this.segments.reduce((sum, s) => {
      const dur = s.endTime - s.startTime;
      return sum + (dur > 0 ? dur / s.speed : 0);
    }, 0);
  }

  getSourceTime(outputTime) {
    let accumulated = 0;
    for (const seg of this.segments) {
      const segOutput = (seg.endTime - seg.startTime) / seg.speed;
      if (outputTime < accumulated + segOutput) {
        const ratio = (outputTime - accumulated) / segOutput;
        return seg.startTime + ratio * (seg.endTime - seg.startTime);
      }
      accumulated += segOutput;
    }
    return this.segments.length > 0 ? this.segments[this.segments.length - 1].endTime : 0;
  }

  getSegmentColor(index) {
    return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
  }
}
