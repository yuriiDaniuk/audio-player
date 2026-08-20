import React, { useCallback, useState, useRef, useLayoutEffect } from "react";
import SoundDriver from "./SoundDriver";
import { formatTime } from "../../utils/formatTime";

export default function Player() {
  // References to maintain state across renders without triggering a re-render
  const soundController = useRef<SoundDriver | null>(null);
  
  // Reference to the DOM node where D3.js will inject the SVG waveform
  const waveContainerRef = useRef<HTMLDivElement | null>(null);

  // Component local state
  const [loading, setLoading] = useState<boolean>(false);
  const [hasFile, setHasFile] = useState<boolean>(false);
  
  // fileKey is used to force re-render and cleanup D3 container when a new file is loaded,
  // even if the new file has the exact same name as the previous one.
  const [fileKey, setFileKey] = useState<number>(0);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Tracks the depth of dragenter/dragleave events to prevent the overlay 
  // from flickering when the cursor hovers over child elements inside the dropzone.
  const dragCounter = useRef<number>(0);

  /**
   * Core handler for audio file initialization.
   * Responsible for cleaning up the previous instance, setting up the new SoundDriver,
   * and binding UI update callbacks.
   */
  const processAudioFile = useCallback(async (audioFile: File) => {
    // Validate type to ensure only audio files are processed
    if (!audioFile.type.includes("audio")) {
      alert("Please select a valid audio file");
      return;
    }

    // Gracefully terminate the active audio context and clear memory before loading a new track
    if (soundController.current) {
      soundController.current.pause(true);
      soundController.current = null;
    }

    // Reset UI state for the new file processing phase
    setLoading(true);
    setFileName(audioFile.name);
    setCurrentTime(0);
    setHasFile(false);

    const soundInstance = new SoundDriver(audioFile);

    // Bind time update callback.
    // Optimization: we only update the React state if the current integer second has changed,
    // or if it's a hard reset (current === 0).
    soundInstance.onTimeUpdate = (current: number, total: number) => {
      setCurrentTime((prev) => {
        if (current === 0) return 0;
        return Math.floor(current) !== Math.floor(prev) ? current : prev;
      });
      setDuration(total);
    };

    try {
      if (waveContainerRef.current) {
        // Initialize Web Audio API buffers and decode audio data
        await soundInstance.init(waveContainerRef.current);
        soundController.current = soundInstance;

        if (soundInstance.audioBuffer) {
          setDuration(soundInstance.audioBuffer.duration);
        }

        // Update the key to trigger the useLayoutEffect hook for D3 rendering
        setFileKey(Date.now()); 
        setHasFile(true);
      }
    } catch (err) {
      console.error("Audio loading error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Synchronously re-renders the D3 waveform after the DOM has been updated but 
   * before the browser paints the screen.
   */
  useLayoutEffect(() => {
    if (hasFile && waveContainerRef.current && soundController.current) {
      // Forcefully clear the container from the previous SVG waveform 
      waveContainerRef.current.innerHTML = "";
      
      // Delegate the rendering process to the SoundDriver's D3 implementation
      soundController.current.drawChart();
    }
  }, [hasFile, fileKey]); 

  /**
   * Handler for manual file selection via file input.
   */
  const handleInputUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        processAudioFile(files[0]);
      }
      // Reset input value to allow the user to select the exact same file sequentially if needed
      event.target.value = ""; 
    },
    [processAudioFile]
  );

  // --- Global Drag & Drop Event Handlers ---

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    // Only trigger drag state if actual files are being dragged (ignore text/links)
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    // Only remove the drag overlay when the cursor has completely left the main container
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Required to allow dropping. Without this, the browser will open the file in a new tab.
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Reset drag state upon successful drop
      setIsDragging(false);
      dragCounter.current = 0;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processAudioFile(files[0]);
      }
    },
    [processAudioFile]
  );

  // --- Playback Controls ---

  const togglePlayer = useCallback(
    (type: "play" | "pause" | "stop") => () => {
      if (!soundController.current) return;

      if (type === "play") {
        soundController.current.play();
      } else if (type === "stop") {
        // Passing 'true' indicates a hard reset (rewind to 0:00)
        soundController.current.pause(true);
      } else {
        soundController.current.pause();
      }
    },
    []
  );

  const onVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      soundController.current?.changeVolume(Number(event.target.value));
    },
    []
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-6 text-slate-100 overflow-hidden"
    >
      {/* Global drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-sm border-2 border-dashed border-sky-400 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-2xl font-bold">
            ⬇
          </div>
          <p className="text-lg font-semibold text-sky-200">
            Drop audio file to upload
          </p>
        </div>
      )}

      {/* Header panel */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex flex-col min-w-0">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            Audio Player
          </span>
          <span className="text-sm font-medium text-slate-200 truncate max-w-50 sm:max-w-md">
            {fileName || "No track selected"}
          </span>
        </div>

        {/* File selection button */}
        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg cursor-pointer transition border border-slate-700/60 shadow-sm shrink-0">
          <span>{hasFile ? "Change Track" : "Select Track"}</span>
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleInputUpload}
          />
        </label>
      </div>

      {/* Initial empty state block */}
      {!hasFile && !loading && (
        <div className="flex flex-col items-center justify-center w-full h-48 border border-dashed border-slate-700/60 rounded-xl bg-slate-950/40 text-center p-6">
          <p className="text-base text-slate-300 font-medium mb-1">
            Drag & drop an audio file here
          </p>
          <p className="text-xs text-slate-400">
            or use the "Select Track" button above
          </p>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="w-full h-48 flex items-center justify-center text-sky-400 font-medium animate-pulse bg-slate-950/40 rounded-xl border border-slate-800">
          Decoding and generating waveform...
        </div>
      )}

      {/* D3 waveform container */}
      <div
        ref={waveContainerRef}
        id="waveContainer"
        className={`w-full h-48 bg-slate-950/70 border border-slate-800/80 rounded-xl overflow-hidden ${
          !hasFile || loading ? "hidden" : "block"
        }`}
      />

      {/* Bottom control panel */}
      {!loading && hasFile && (
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={togglePlayer("play")}
              className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg transition active:scale-95 shadow-md shadow-sky-500/20"
            >
              Play
            </button>

            <button
              type="button"
              onClick={togglePlayer("pause")}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition active:scale-95"
            >
              Pause
            </button>

            <button
              type="button"
              onClick={togglePlayer("stop")}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition active:scale-95"
            >
              Stop
            </button>

            {/* Time indicator */}
            <span className="text-slate-400 text-sm font-medium tracking-wide ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Volume control */}
          <div className="flex items-center gap-3 bg-slate-800/50 px-4 py-2 rounded-lg border border-slate-700/40">
            <span className="text-xs font-medium text-slate-400">Volume</span>
            <input
              type="range"
              onChange={onVolumeChange}
              defaultValue={1}
              min={0}
              max={1}
              step={0.01}
              className="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}