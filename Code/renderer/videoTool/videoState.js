let _segId = 0;

const SEGMENT_COLORS = [
  '#4fc3f7', '#66bb6a', '#ffa726', '#ab47bc', '#ef5350',
  '#26c6da', '#9ccc65', '#ff7043', '#7e57c2', '#ec407a',
];

export default class VideoState {
  constructor() {
    this.inputPath     = null;
    this.inputMeta     = null;
    this.outputFolder  = null;
    this.selectedPreset = 'balanced';
    this.status        = 'idle';
    this.progress      = null;
    this.result        = null;
    this.error         = null;
    this.activeSection = 'timeline';

    this.segments          = [];
    this.selectedSegmentId = null;
    this.currentTime       = 0;
    this.exportMode        = 'mp4';
    this.suggestions       = [];
    this.compressStatus    = 'idle';
    this.compressProgress  = null;
    this.compressResult    = null;
    this.compressError     = null;

    this._undoStack = [];
    this._redoStack = [];
  }

  get selectedSegment() {
    return this.segments.find(s => s.id === this.selectedSegmentId) || null;
  }

  _snapshot() {
    this._undoStack.push(JSON.parse(JSON.stringify(this.segments)));
    this._redoStack = [];
  }

  undo() {
    if (this._undoStack.length === 0) return false;
    this._redoStack.push(JSON.parse(JSON.stringify(this.segments)));
    this.segments = this._undoStack.pop();
    if (!this.segments.some(s => s.id === this.selectedSegmentId)) {
      this.selectedSegmentId = this.segments.length > 0 ? this.segments[this.segments.length - 1].id : null;
    }
    return true;
  }

  redo() {
    if (this._redoStack.length === 0) return false;
    this._undoStack.push(JSON.parse(JSON.stringify(this.segments)));
    this.segments = this._redoStack.pop();
    if (!this.segments.some(s => s.id === this.selectedSegmentId)) {
      this.selectedSegmentId = this.segments.length > 0 ? this.segments[this.segments.length - 1].id : null;
    }
    return true;
  }

  reset() {
    this._undoStack = [];
    this._redoStack = [];
    this.inputPath = null;
    this.inputMeta = null;
    this.status = 'idle';
    this.progress = null;
    this.result = null;
    this.error = null;
    this.segments = [];
    this.selectedSegmentId = null;
    this.currentTime = 0;
    this.exportMode = 'mp4';
    this.suggestions = [];
    this.compressStatus = 'idle';
    this.compressProgress = null;
    this.compressResult = null;
    this.compressError = null;
  }

  addSegment(startTime, endTime, speed) {
    this._snapshot();
    const seg = {
      id: 'seg-' + (++_segId),
      startTime: Math.round(startTime * 10) / 10,
      endTime: Math.round(endTime * 10) / 10,
      speed: speed || 1,
      enabled: true,
    };
    this.segments.push(seg);
    this.selectedSegmentId = seg.id;
    return seg;
  }

  removeSegment(id) {
    this._snapshot();
    const seg = this.segments.find(s => s.id === id);
    if (seg) seg.enabled = false;
    if (this.selectedSegmentId === id) {
      const enabled = this.segments.filter(s => s.enabled);
      this.selectedSegmentId = enabled.length > 0 ? enabled[enabled.length - 1].id : null;
    }
  }

  updateSegment(id, props) {
    this._snapshot();
    const seg = this.segments.find(s => s.id === id);
    if (!seg) return;
    if (props.startTime !== undefined) seg.startTime = Math.round(parseFloat(props.startTime) * 10) / 10;
    if (props.endTime !== undefined) seg.endTime = Math.round(parseFloat(props.endTime) * 10) / 10;
    if (props.speed !== undefined) seg.speed = parseFloat(props.speed);
  }

  splitSegment(id, splitTime) {
    this._snapshot();
    const seg = this.segments.find(s => s.id === id);
    if (!seg) return null;
    if (splitTime <= seg.startTime || splitTime >= seg.endTime) return null;
    const newSeg = {
      id: 'seg-' + (++_segId),
      startTime: Math.round(splitTime * 10) / 10,
      endTime: seg.endTime,
      speed: seg.speed,
      enabled: true,
    };
    seg.endTime = Math.round(splitTime * 10) / 10;
    const idx = this.segments.indexOf(seg);
    this.segments.splice(idx + 1, 0, newSeg);
    this.selectedSegmentId = newSeg.id;
    return newSeg;
  }

  get activeSegments() {
    return this.segments.filter(s => s.enabled);
  }

  get totalDuration() {
    return this.activeSegments.reduce((sum, s) => {
      const dur = s.endTime - s.startTime;
      return sum + (dur > 0 ? dur / s.speed : 0);
    }, 0);
  }

  getOutputTime(sourceTime) {
    const active = this.activeSegments;
    let outputTime = 0;
    for (const seg of active) {
      if (sourceTime > seg.endTime) {
        outputTime += (seg.endTime - seg.startTime) / seg.speed;
      } else if (sourceTime >= seg.startTime) {
        const segOutput = (seg.endTime - seg.startTime) / seg.speed;
        const ratio = (sourceTime - seg.startTime) / (seg.endTime - seg.startTime);
        return outputTime + ratio * segOutput;
      } else {
        return outputTime;
      }
    }
    return outputTime;
  }

  getSourceTime(outputTime) {
    const active = this.activeSegments;
    let accumulated = 0;
    for (const seg of active) {
      const segOutput = (seg.endTime - seg.startTime) / seg.speed;
      if (outputTime < accumulated + segOutput) {
        const ratio = (outputTime - accumulated) / segOutput;
        return seg.startTime + ratio * (seg.endTime - seg.startTime);
      }
      accumulated += segOutput;
    }
    return active.length > 0 ? active[active.length - 1].endTime : 0;
  }

  getSegmentColor(index) {
    return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
  }
}
