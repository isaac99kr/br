import { queuePosition, type AudioQueue } from './audioQueue'

export type PlaybackState = { status: 'ready' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'; time: number; rate: number; error?: string }

/** One controller for both readers. Audio-node duration, never UI timers, ends a segment. */
export class ChapterPlayback {
  private context: AudioContext | null = null
  private source: AudioBufferSourceNode | null = null
  private cache = new Map<string, AudioBuffer>()
  private abort: AbortController | null = null
  private generation = 0
  private disposed = false
  private clockStart = 0
  private timeStart = 0
  private segmentEnd = 0
  private frame = 0
  state: PlaybackState = { status: 'ready', time: 0, rate: 1 }
  private queue: AudioQueue
  private changed: (state: PlaybackState) => void
  private contextFactory: () => AudioContext

  constructor(queue: AudioQueue, changed: (state: PlaybackState) => void,
    contextFactory = () => new AudioContext()) {
    this.queue = queue
    this.changed = changed
    this.contextFactory = contextFactory
  }

  private now() {
    return this.state.status === 'playing' && this.context
      ? Math.min(this.segmentEnd, this.timeStart + (this.context.currentTime - this.clockStart) * this.state.rate)
      : this.state.time
  }
  private emit(patch: Partial<PlaybackState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.changed(this.state)
  }
  private cancel() {
    this.generation++
    this.abort?.abort()
    this.abort = null
    cancelAnimationFrame(this.frame)
    if (this.source) {
      this.source.onended = null
      this.source.stop()
      this.source.disconnect()
      this.source = null
    }
  }
  private tick = () => {
    if (this.state.status !== 'playing' || this.disposed) return
    this.emit({ time: this.now() })
    this.frame = requestAnimationFrame(this.tick)
  }

  async play() {
    if (this.disposed || this.state.status === 'playing' || this.state.status === 'loading') return
    if (this.state.time >= this.queue.duration) this.emit({ time: 0 })
    this.cancel()
    const generation = this.generation
    const { index, item, sourceTime } = queuePosition(this.queue, this.state.time)
    this.emit({ status: 'loading', error: undefined })
    try {
      this.context ??= this.contextFactory()
      await this.context.resume()
      if (generation !== this.generation || this.disposed) return
      const url = item.chapter.asset.audioUrl
      let buffer = this.cache.get(url)
      if (!buffer) {
        const abort = new AbortController()
        this.abort = abort
        const response = await fetch(url, { signal: abort.signal })
        if (!response.ok) throw new Error('음원을 불러오지 못했습니다. 다시 시도해 주세요.')
        const bytes = await response.arrayBuffer()
        buffer = await this.context.decodeAudioData(bytes)
        if (generation !== this.generation || this.disposed) return
        const duration = item.chapter.timing.totalSamples / item.chapter.timing.sampleRate
        // MP3 decoders may expose encoder delay/final-frame padding slightly
        // differently, especially after low-bitrate re-encoding. The queue
        // still uses the exact JSON sample boundaries; this only tolerates
        // codec padding at the whole-buffer duration check.
        if (Math.abs(buffer.duration - duration) > 0.5) throw new Error('이 브라우저의 음원 길이가 시간 정보와 다릅니다.')
        this.cache.set(url, buffer)
      } else {
        this.cache.delete(url)
        this.cache.set(url, buffer)
      }
      // Keep at most two decoded chapters and evict older buffers above 192 MiB.
      const size = () => [...this.cache.values()].reduce((n, b) => n + b.length * b.numberOfChannels * 4, 0)
      while (this.cache.size > 2 || (this.cache.size > 1 && size() > 192 * 1024 ** 2)) this.cache.delete(this.cache.keys().next().value!)
      const source = this.context.createBufferSource()
      this.source = source
      source.buffer = buffer
      source.playbackRate.value = this.state.rate
      source.connect(this.context.destination)
      this.clockStart = this.context.currentTime
      this.timeStart = this.state.time
      this.segmentEnd = item.queueStart + item.end - item.start
      source.onended = () => {
        if (generation !== this.generation || this.disposed) return
        source.disconnect()
        this.source = null
        cancelAnimationFrame(this.frame)
        if (index + 1 === this.queue.items.length) {
          this.emit({ time: this.queue.duration, status: 'ended' })
        } else {
          this.emit({ time: this.queue.items[index + 1].queueStart, status: 'paused' })
          void this.play()
        }
      }
      // Offsets/duration are seconds of source audio, even at a different context sample rate.
      source.start(0, sourceTime, item.end - sourceTime)
      this.emit({ status: 'playing' })
      this.tick()
    } catch (error) {
      if (generation !== this.generation || this.disposed) return
      this.cancel()
      this.emit({ status: 'error', error: error instanceof Error ? error.message : '음원을 재생하지 못했습니다.' })
    }
  }

  pause() {
    const time = this.now()
    this.cancel()
    this.emit({ status: 'paused', time })
  }
  stop() {
    this.cancel()
    this.emit({ status: 'ready', time: 0, error: undefined })
  }
  seek(time: number) {
    const resume = this.state.status === 'playing' || this.state.status === 'loading'
    this.cancel()
    this.emit({ time: Math.max(0, Math.min(time, this.queue.duration)), status: 'paused' })
    if (resume && this.state.time < this.queue.duration) void this.play()
  }
  setRate(rate: number) {
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 3) return
    const time = this.now()
    const resume = this.state.status === 'playing' || this.state.status === 'loading'
    this.cancel()
    this.emit({ rate, time, status: 'paused' })
    if (resume) void this.play()
  }
  dispose() {
    this.disposed = true
    this.cancel()
    this.cache.clear()
    void this.context?.close()
  }
}
