import Drawer from './Drawer';

class SoundDriver {
  private readonly audioFile: Blob;
  private drawer?: Drawer;
  private context: AudioContext;
  private gainNode?: GainNode = undefined;
  private audioBuffer?: AudioBuffer = undefined;
  private bufferSource?: AudioBufferSourceNode = undefined;
  private startedAt = 0;
  private pausedAt = 0;
  private isRunning = false;

  constructor(audioFile: Blob) {
    this.audioFile = audioFile;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new AudioCtx();
  }

  public init(parent: HTMLElement | null): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!parent) {
        reject(new Error('Parent element not found'));
        return;
      }

      const reader = new FileReader();
      reader.readAsArrayBuffer(this.audioFile);

      reader.onload = async (event: ProgressEvent<FileReader>) => {
        try {
          const buffer = await this.loadSound(event);
          this.audioBuffer = buffer;
          this.drawer = new Drawer(buffer, parent);
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = (err) => reject(err);
    });
  }

  private async loadSound(readerEvent: ProgressEvent<FileReader>): Promise<AudioBuffer> {
    if (!readerEvent?.target?.result) {
      throw new Error('Can not read file');
    }

    return await this.context.decodeAudioData(
      readerEvent.target.result as ArrayBuffer
    );
  }

  public async play(): Promise<void> {
    if (!this.audioBuffer) {
      throw new Error('Play error. Audio buffer does not exist. Call init before Play.');
    }

    if (this.isRunning) {
      return;
    }

    // Створюємо вузол регулювання гучності, якщо його ще немає
    if (!this.gainNode) {
      this.gainNode = this.context.createGain();
      this.gainNode.connect(this.context.destination);
    }

    // Створюємо нове джерело (AudioBufferSourceNode є одноразовим у Web Audio API)
    this.bufferSource = this.context.createBufferSource();
    this.bufferSource.buffer = this.audioBuffer;

    // Підключаємо ланцюг: bufferSource -> gainNode -> destination
    this.bufferSource.connect(this.gainNode);

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    this.bufferSource.start(0, this.pausedAt);
    this.startedAt = this.context.currentTime - this.pausedAt;
    this.pausedAt = 0;
    this.isRunning = true;

    // Автоскидання, коли трек дограв сам до кінця
    this.bufferSource.onended = () => {
      if (this.context.currentTime - this.startedAt >= (this.audioBuffer?.duration || 0)) {
        this.pause(true);
      }
    };
  }

  public async pause(reset?: boolean): Promise<void> {
    if (!this.bufferSource) {
      if (reset) {
        this.pausedAt = 0;
      }
      return;
    }

    if (this.isRunning) {
      this.pausedAt = reset ? 0 : this.context.currentTime - this.startedAt;
      this.bufferSource.stop();
      this.bufferSource.disconnect();
      this.bufferSource = undefined;
      this.isRunning = false;
    } else if (reset) {
      this.pausedAt = 0;
    }
  }

  public changeVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }

  public drawChart(): void {
    this.drawer?.init();
  }
}

export default SoundDriver;