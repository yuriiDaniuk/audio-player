import React, { useCallback, useState, useRef, useLayoutEffect } from "react";
import SoundDriver from "./SoundDriver";
import { formatTime } from "../../utils/formatTime";

export default function Player() {
  const soundController = useRef<SoundDriver | null>(null);
  const waveContainerRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const [fileKey, setFileKey] = useState<number>(0);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Спеціальний лічильник для стабільної обробки drag & drop над дочірніми елементами
  const dragCounter = useRef(0);

  // 1. Універсальна функція обробки аудіофайлу
  const processAudioFile = useCallback(async (audioFile: File) => {
    if (!audioFile.type.includes("audio")) {
      alert("Будь ласка, оберіть коректний аудіофайл");
      return;
    }

    // 🔴 Очищення пам'яті: зупиняємо попередній трек перед стартом нового
    if (soundController.current) {
      soundController.current.pause(true);
      soundController.current = null;
    }

    setLoading(true);
    setFileName(audioFile.name);
    setCurrentTime(0);
    setHasFile(false);

    const soundInstance = new SoundDriver(audioFile);

    soundInstance.onTimeUpdate = (current, total) => {
      setCurrentTime((prev) => {
        if (current === 0) return 0;
        return Math.floor(current) !== Math.floor(prev) ? current : prev;
      });
      setDuration(total);
    };

    try {
      if (waveContainerRef.current) {
        await soundInstance.init(waveContainerRef.current);
        soundController.current = soundInstance;

        if (soundInstance.audioBuffer) {
          setDuration(soundInstance.audioBuffer.duration);
        }

        setFileKey(Date.now()); // 🔴 ДОДАЙ ЦЕ СЮДИ: Тепер ключ оновлюється ВЧАСНО
        setHasFile(true);
      }
    } catch (err) {
      console.error("Помилка завантаження аудіо:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useLayoutEffect(() => {
    if (hasFile && waveContainerRef.current && soundController.current) {
      // 🔴 1. Жорстко очищаємо контейнер від старого SVG-графіка
      waveContainerRef.current.innerHTML = "";
      
      // 🔴 2. Тільки після цього малюємо новий
      soundController.current.drawChart();
    }
  }, [hasFile, fileKey]); // Перемальовуємо при зміні файлу

  // Обробник вибору через клік по кнопці (Input)
  const handleInputUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        processAudioFile(files[0]);
      }
      event.target.value = ""; // Очищаємо інпут для можливості вибрати той самий файл повторно
    },
    [processAudioFile],
  );

  // Обробники глобального Drag & Drop
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processAudioFile(files[0]);
      }
    },
    [processAudioFile],
  );

  const togglePlayer = useCallback(
    (type: "play" | "pause" | "stop") => () => {
      if (type === "play") {
        soundController.current?.play();
      } else if (type === "stop") {
        soundController.current?.pause(true);
      } else {
        soundController.current?.pause();
      }
    },
    [],
  );

  const onVolumeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      soundController.current?.changeVolume(Number(event.target.value));
    },
    [],
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-6 text-slate-100 overflow-hidden"
    >
      {/* 🚀 Глобальний оверлей (Варіант А): показується при перетягуванні над плеєром */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-sm border-2 border-dashed border-sky-400 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-2xl font-bold">
            ⬇
          </div>
          <p className="text-lg font-semibold text-sky-200">
            Відпустіть аудіофайл, щоб завантажити
          </p>
        </div>
      )}

      {/* 📱 Верхня панель (Хедер): завжди доступна кнопка + назва треку */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex flex-col min-w-0">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            Аудіоплеєр
          </span>
          <span className="text-sm font-medium text-slate-200 truncate max-w-[200px] sm:max-w-md">
            {fileName || "Трек не обрано"}
          </span>
        </div>

        {/* Кнопка вибору файлу кліком (на мобільних — основний спосіб) */}
        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg cursor-pointer transition border border-slate-700/60 shadow-sm shrink-0">
          <span>{hasFile ? "Замінити трек" : "Обрати трек"}</span>
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleInputUpload}
          />
        </label>
      </div>

      {/* Стартовий блок, якщо файл ще не обрано взагалі */}
      {!hasFile && !loading && (
        <div className="flex flex-col items-center justify-center w-full h-48 border border-dashed border-slate-700/60 rounded-xl bg-slate-950/40 text-center p-6">
          <p className="text-base text-slate-300 font-medium mb-1">
            Перетягніть аудіофайл сюди
          </p>
          <p className="text-xs text-slate-400">
            або скористайтеся кнопкою «Обрати трек» зверху
          </p>
        </div>
      )}

      {/* Індикатор завантаження / декодування */}
      {loading && (
        <div className="w-full h-48 flex items-center justify-center text-sky-400 font-medium animate-pulse bg-slate-950/40 rounded-xl border border-slate-800">
          Декодування та побудова хвилі...
        </div>
      )}

      {/* Контейнер графіка D3 */}
      <div
        ref={waveContainerRef}
        id="waveContainer"
        className={`w-full h-48 bg-slate-950/70 border border-slate-800/80 rounded-xl overflow-hidden ${
          !hasFile || loading ? "hidden" : "block"
        }`}
      />

      {/* Нижня панель керування */}
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

            {/* Індикатор часу */}
            <span className="text-slate-400 text-sm font-medium tracking-wide ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Регулятор гучності */}
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