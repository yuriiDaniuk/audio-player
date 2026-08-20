import Drawer from './Drawer';

class SoundDriver {
  private readonly audioFile: Blob;
  private drawer?: Drawer;
  
  // Core Web Audio API context
  private context: AudioContext;
  
  // Node responsible for volume control
  private gainNode?: GainNode = undefined;
  
  // Holds the decoded audio data in memory
  public audioBuffer?: AudioBuffer = undefined;
  
  // The actual audio player node. 
  // In Web Audio API, this node is single-use. It must be recreated for every play/seek action.
  private bufferSource?: AudioBufferSourceNode = undefined;
  
  // Timing state variables to track playback position across pauses and seeks
  private startedAt = 0;
  private pausedAt = 0;
  private isRunning = false;
  
  // Reference to the requestAnimationFrame loop for UI synchronization
  private animationFrameId: number = 0;

  // Callback to update the React UI with the current timestamp
  public onTimeUpdate?: (currentTime: number, duration: number) => void;

  constructor(audioFile: Blob) {
    this.audioFile = audioFile;
    
    // Initialize AudioContext with a fallback for older Safari versions
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new AudioCtx();
  }

  /**
   * Reads the file via FileReader and triggers the audio decoding process.
   * Initializes the D3 Drawer once the buffer is ready.
   */
  public init(parent: HTMLElement | null): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!parent) {
        reject(new Error('Parent element not found'));
        return;
      }

      const reader = new FileReader();
      
      // Read the file as an ArrayBuffer, which is required by AudioContext.decodeAudioData
      reader.readAsArrayBuffer(this.audioFile);

      reader.onload = async (event: ProgressEvent<FileReader>) => {
        try {
          const buffer = await this.loadSound(event);
          this.audioBuffer = buffer;
          
          // Pass the buffer to D3 for waveform calculation, and bind the seek callback
          this.drawer = new Drawer(buffer, parent, (percent: number) => this.seek(percent));
          resolve();
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = (err) => reject(err);
    });
  }

  /**
   * Decodes the raw ArrayBuffer into an AudioBuffer that can be played by the browser.
   */
  private async loadSound(readerEvent: ProgressEvent<FileReader>): Promise<AudioBuffer> {
    if (!readerEvent?.target?.result) {
      throw new Error('Can not read file');
    }

    return await this.context.decodeAudioData(
      readerEvent.target.result as ArrayBuffer
    );
  }

  /**
   * Starts audio playback. Handles the creation of the routing graph.
   */
  public async play(): Promise<void> {
    if (!this.audioBuffer) {
      throw new Error('Play error. Audio buffer does not exist. Call init before Play.');
    }

    if (this.isRunning) {
      return;
    }

    // Create a GainNode for volume control if it doesn't exist yet
    if (!this.gainNode) {
      this.gainNode = this.context.createGain();
      // Connect the gain node directly to the hardware speakers (destination)
      this.gainNode.connect(this.context.destination);
    }

    // Create a new source node. AudioBufferSourceNode instances cannot be restarted 
    // once stopped, so a new one is required every time play() is invoked.
    this.bufferSource = this.context.createBufferSource();
    this.bufferSource.buffer = this.audioBuffer;

    // Establish the audio routing graph: Source -> Gain (Volume) -> Destination
    this.bufferSource.connect(this.gainNode);

    // Browsers often suspend audio contexts by default (autoplay policy).
    // Ensure the context is running before attempting playback.
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    // Start playback from the saved pausedAt timestamp
    this.bufferSource.start(0, this.pausedAt);
    
    // Calculate the absolute start time to maintain synchronization
    this.startedAt = this.context.currentTime - this.pausedAt;
    this.pausedAt = 0;
    this.isRunning = true;

    // Kick off the UI animation loop
    this.animateCursor();

    // Handle natural playback completion (when the track finishes)
    this.bufferSource.onended = () => {
      // Ensure we only trigger stop if the track actually ended, 
      // not if onended fired due to a manual pause/seek
      if (this.context.currentTime - this.startedAt >= (this.audioBuffer?.duration || 0)) {
        this.pause(true);
      }
    };
  }

  /**
   * Pauses or stops the playback.
   * @param reset If true, acts as a "Stop" function, resetting time to 0.
   */
  public async pause(reset?: boolean): Promise<void> {
    if (!this.bufferSource) {
      // Handle edge case where stop is clicked before play was ever triggered
      if (reset) {
        this.pausedAt = 0;
        this.drawer?.updateProgress(0);

        if (this.onTimeUpdate && this.audioBuffer) {
          this.onTimeUpdate(0, this.audioBuffer.duration);
        }
      }
      return;
    }

    if (this.isRunning) {
      // Save the current position if we are just pausing
      this.pausedAt = reset ? 0 : this.context.currentTime - this.startedAt;
      
      this.bufferSource.stop();
      this.bufferSource.disconnect();
      this.bufferSource = undefined;
      this.isRunning = false;
      
      // Halt the UI animation loop to save CPU cycles
      cancelAnimationFrame(this.animationFrameId);

      if (reset) {
        if (this.onTimeUpdate && this.audioBuffer) {
          this.onTimeUpdate(0, this.audioBuffer.duration);
        }
        // Visually reset the D3 waveform progress
        this.drawer?.updateProgress(0); 
      }
    } else if (reset) {
      // Handle Stop click when already paused
      this.pausedAt = 0;
      this.drawer?.updateProgress(0);
      if (this.onTimeUpdate && this.audioBuffer) {
          this.onTimeUpdate(0, this.audioBuffer.duration);
        }
    }
  }

  /**
   * Rewinds or fast-forwards the audio to a specific percentage.
   */
  public async seek(percent: number): Promise<void> {
    if (!this.audioBuffer) return;

    // Calculate the target timestamp in seconds
    const duration = this.audioBuffer.duration;
    const newTime = (percent / 100) * duration;

    // Instantly update the D3 visualization for immediate visual feedback
    this.drawer?.updateProgress(percent);

    if (this.onTimeUpdate) {
      this.onTimeUpdate(newTime, duration);
    }

    if (this.isRunning) {
      // Web Audio API does not support dynamic seeking on an active source node.
      // We must tear down the current node...
      this.bufferSource?.stop();
      this.bufferSource?.disconnect();
      this.bufferSource = undefined;
      this.isRunning = false;
      cancelAnimationFrame(this.animationFrameId);

      // ...update the start marker, and boot up a new source node.
      this.pausedAt = newTime;
      await this.play(); 
    } else {
      // If currently paused, simply update the marker so the next play() starts here
      this.pausedAt = newTime;
    }
  }

  /**
   * Adjusts the volume using the GainNode.
   * @param volume Float value between 0.0 (muted) and 1.0 (max).
   */
  public changeVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = volume;
    }
  }

  /**
   * Animation loop synchronized with the browser's refresh rate.
   * Calculates current playback progress and dispatches updates to D3 and React.
   */
  private animateCursor = () => {
    if (!this.isRunning || !this.drawer || !this.audioBuffer) return;

    // Calculate real-time position based on hardware audio context time
    const currentTime = this.context.currentTime - this.startedAt;
    const duration = this.audioBuffer.duration;

    if (this.onTimeUpdate) {
      this.onTimeUpdate(currentTime, duration);
    }

    // Convert current time to a percentage for the D3 clip-path
    let percent = (currentTime / duration) * 100;
    if (percent > 100) percent = 100;
    if (percent < 0) percent = 0;

    // Dispatch update to the visualizer
    this.drawer.updateProgress(percent);

    // Recursively request the next frame (runs at roughly 60 FPS)
    this.animationFrameId = requestAnimationFrame(this.animateCursor);
  };

  /**
   * Trigger the D3 initialization to draw the initial waveform layout.
   */
  public drawChart(): void {
    this.drawer?.init();
  }
}

export default SoundDriver;